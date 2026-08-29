'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, Clock3, Crown, Gauge, KeyRound, ListOrdered, Lock, ShieldAlert, ShieldCheck, Sparkles, Swords, TicketCheck, Trophy, Users, X, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { NotificationBell } from '@/components/notification-bell';

type ScoringPlatform = 'scolia' | 'dartcounter';
type TournamentFormat = 'single_elimination' | 'double_elimination' | 'group_stage';
type Tournament = {
  id: string; title: string; description: string; starts_at: string; registration_closes_at: string;
  max_players: number; best_of: number; premium_only: boolean; max_average: number | null; min_average: number | null;
  status: 'registration' | 'live' | 'completed' | 'cancelled'; winner_id: string | null; participant_count: number;
  joined: boolean; winner_username: string | null; scoring_platform: ScoringPlatform; requires_access_code: boolean;
  tournament_format: TournamentFormat; check_in_opens_at: string; check_in_closes_at: string; prize_title: string | null;
  prize_details: string | null; dispute_policy: string; cancellation_reason: string | null; waitlist_count: number;
  participant_status: string | null; checked_in: boolean; checked_in_count: number;
};
type BracketMatch = { id: string; round_number: number; match_number: number; player1_id: string | null; player2_id: string | null; player1_username: string | null; player2_username: string | null; winner_id: string | null; status: string; active_match_id: string | null; };

const statusMeta = {
  registration: ['ANMELDUNG', 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'],
  live: ['LIVE', 'border-red-300/20 bg-red-400/10 text-red-200'],
  completed: ['ABGESCHLOSSEN', 'border-white/10 bg-zinc-500/15 text-zinc-300'],
  cancelled: ['ABGESAGT', 'border-red-300/15 bg-red-500/10 text-red-300'],
} as const;
const formatMeta: Record<TournamentFormat, string> = { single_elimination: 'Single Elimination', double_elimination: 'Double Elimination', group_stage: 'Gruppenphase' };
const platformMeta = { scolia: 'Scolia', dartcounter: 'DartCounter' } as const;
const formatDate = (value: string) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export default function TournamentsPage() {
  const supabase = useMemo(() => createClient(), []); const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]); const [selected, setSelected] = useState<Tournament | null>(null); const [bracket, setBracket] = useState<BracketMatch[]>([]);
  const [isPremium, setIsPremium] = useState(false); const [userId, setUserId] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [pending, setPending] = useState<string | null>(null);
  const [view, setView] = useState<'upcoming' | 'completed'>('upcoming'); const [codes, setCodes] = useState<Record<string, string>>({}); const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const loadTournaments = useCallback(async () => { const { data, error } = await supabase.rpc('list_tournaments'); if (error) { setNotice({ kind: 'error', text: error.message }); return; } const next = (data ?? []) as Tournament[]; setTournaments(next); setCurrentTime(new Date().getTime()); setSelected(current => current ? next.find(item => item.id === current.id) ?? null : null); }, [supabase]);
  useEffect(() => { void (async () => { const { data: { user } } = await supabase.auth.getUser(); if (!user) { router.push('/auth/login'); return; } setUserId(user.id); const [{ data: profile }] = await Promise.all([supabase.from('profiles').select('"isPremium"').eq('"supabaseId"', user.id).maybeSingle(), loadTournaments()]); setIsPremium(Boolean(profile?.isPremium)); setLoading(false); })(); }, [loadTournaments, router, supabase]);

  // Ein Bracket entwickelt sich durch Ergebnisbestätigungen im Matchroom weiter.
  // Der Abgleich hält die offene Detailansicht auch dann aktuell, wenn Realtime
  // beim Gerät eines Spielers nicht verfügbar ist.
  useEffect(() => {
    if (!selected?.id) return;
    let active = true;
    const refreshBracket = async () => {
      const { data, error } = await supabase.rpc('get_tournament_bracket', { p_tournament_id: selected.id });
      if (!active || error) return;
      setBracket((data ?? []) as BracketMatch[]);
      void loadTournaments();
    };
    const interval = window.setInterval(() => void refreshBracket(), 8_000);
    return () => { active = false; clearInterval(interval); };
  }, [loadTournaments, selected?.id, supabase]);

  async function openTournament(t: Tournament) { setSelected(t); setBracket([]); const { data, error } = await supabase.rpc('get_tournament_bracket', { p_tournament_id: t.id }); if (error) setNotice({ kind: 'error', text: 'Der Turnierplan konnte nicht geladen werden.' }); else setBracket((data ?? []) as BracketMatch[]); }
  async function runAction(t: Tournament, action: 'join' | 'checkin' | 'leave') {
    setPending(`${action}:${t.id}`); setNotice(null);
    const result = action === 'join' ? await supabase.rpc('join_tournament', { p_tournament_id: t.id, p_access_code: codes[t.id] || null }) : action === 'checkin' ? await supabase.rpc('check_in_tournament', { p_tournament_id: t.id }) : await supabase.rpc('leave_tournament', { p_tournament_id: t.id });
    setPending(null); if (result.error) { setNotice({ kind: 'error', text: result.error.message }); return; }
    const text = action === 'join' && result.data === 'waitlisted' ? 'Du stehst auf der Warteliste und rückst automatisch nach.' : action === 'join' ? 'Startplatz reserviert. Den Check-in nicht vergessen.' : action === 'checkin' ? 'Check-in bestätigt – dein Platz ist sicher.' : 'Du wurdest abgemeldet.';
    setNotice({ kind: 'success', text }); await loadTournaments();
  }

  const upcoming = tournaments.filter(t => ['registration', 'live'].includes(t.status)); const completed = tournaments.filter(t => ['completed', 'cancelled'].includes(t.status)); const visible = view === 'upcoming' ? upcoming : completed;
  const rounds = bracket.reduce<Record<number, BracketMatch[]>>((map, match) => { (map[match.round_number] ??= []).push(match); return map; }, {});
  const playerMatches = selected && userId
    ? bracket.filter(m => m.active_match_id && m.status !== 'completed' && (m.player1_id === userId || m.player2_id === userId))
    : [];
  if (loading) return <main className="grid min-h-screen place-items-center bg-[#07080c] text-zinc-400">Turnierzentrum wird geladen …</main>;

  return <main className="min-h-screen overflow-x-hidden bg-[#07080c] text-white"><div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_70%_48%_at_50%_-8%,rgba(245,158,11,.18),transparent_70%),radial-gradient(ellipse_50%_35%_at_100%_45%,rgba(6,182,212,.1),transparent_70%)]" />
    <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 md:px-8"><Link href="/profile" className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-white"><ArrowLeft size={16} /> Zentrale</Link><div className="flex items-center gap-3"><NotificationBell /><Link href="/premium" className="rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-black text-amber-200"><Crown size={14} className="mr-1 inline" /> PREMIUM</Link></div></nav>
    <section className="mx-auto max-w-7xl px-5 pb-10 pt-8 md:px-8 md:pt-14"><div className="grid items-end gap-8 lg:grid-cols-[1.2fr_.8fr]"><div><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black tracking-[.22em] text-amber-200"><Sparkles size={13} /> RANKEDDARTS CUP SERIES</div><h1 className="text-5xl font-black leading-[.9] tracking-[-.06em] sm:text-7xl">CHECK IN.<br /><span className="bg-gradient-to-r from-amber-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent">TAKE THE TROPHY.</span></h1><p className="mt-6 max-w-xl leading-7 text-zinc-400">Fester Check-in, automatische Warteliste und klare Matchroom-Abläufe – vom ersten Slot bis zur Siegerehrung.</p></div><div className="grid grid-cols-3 gap-3 rounded-[1.8rem] border border-white/10 bg-white/[.035] p-4"><Stat icon={<Trophy />} value={upcoming.length} label="Kommend" /><Stat icon={<Zap />} value={tournaments.filter(t => t.status === 'live').length} label="Live" /><Stat icon={<Users />} value={tournaments.reduce((n, t) => n + Number(t.participant_count), 0)} label="Starter" /></div></div></section>
    <section className="mx-auto max-w-7xl px-5 pb-16 md:px-8">{notice && <div className={`mb-5 flex items-center justify-between rounded-2xl border px-5 py-4 text-sm ${notice.kind === 'success' ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-red-300/25 bg-red-400/10 text-red-100'}`}><span>{notice.text}</span><button onClick={() => setNotice(null)}>×</button></div>}
      <div className="flex flex-col justify-between gap-5 border-b border-white/10 pb-5 sm:flex-row sm:items-end"><div><p className="text-[11px] font-black tracking-[.2em] text-amber-300">TURNIER-ÜBERSICHT</p><h2 className="mt-1 text-3xl font-black">Dein nächster Run.</h2></div><div className="inline-flex rounded-2xl border border-white/10 bg-black/25 p-1.5"><Tab active={view === 'upcoming'} onClick={() => setView('upcoming')}>KOMMEND {upcoming.length}</Tab><Tab active={view === 'completed'} onClick={() => setView('completed')}>HISTORIE {completed.length}</Tab></div></div>
      {visible.length === 0 ? <div className="mt-6 rounded-[2rem] border border-dashed border-white/15 p-14 text-center text-zinc-500">Aktuell gibt es hier noch keine Turniere.</div> : <div className="mt-6 grid gap-4 lg:grid-cols-3">{visible.map(t => {
        const full = Number(t.participant_count) >= t.max_players; const checkInOpen = currentTime >= new Date(t.check_in_opens_at).getTime() && currentTime <= new Date(t.check_in_closes_at).getTime(); const locked = t.premium_only && !isPremium; const canJoin = t.status === 'registration' && !t.joined && !locked;
        return <article key={t.id} className="group relative overflow-hidden rounded-[1.8rem] border border-white/10 bg-white/[.035] p-5 transition hover:-translate-y-1 hover:border-white/20"><div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-amber-300/10 blur-3xl" /><div className="relative flex justify-between"><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black tracking-[.14em] ${statusMeta[t.status][1]}`}>{statusMeta[t.status][0]}</span><div className="flex gap-2">{t.requires_access_code && <KeyRound size={15} className="text-violet-300" />}{t.premium_only && <Crown size={15} className="text-amber-300" />}</div></div><h3 className="relative mt-6 text-xl font-black">{t.title}</h3><p className="relative mt-2 min-h-10 text-sm leading-5 text-zinc-400">{t.description || 'Zeig, was du am Oche kannst.'}</p><div className="relative mt-4 flex flex-wrap gap-2 text-[10px] font-black"><Pill>{platformMeta[t.scoring_platform]}</Pill><Pill>{formatMeta[t.tournament_format]}</Pill>{t.prize_title && <Pill>{t.prize_title}</Pill>}</div><div className="relative mt-5 grid grid-cols-2 gap-2 text-xs text-zinc-400"><Meta icon={<CalendarDays />} text={formatDate(t.starts_at)} /><Meta icon={<Users />} text={`${t.participant_count}/${t.max_players}${t.waitlist_count ? ` +${t.waitlist_count}` : ''}`} /><Meta icon={<Swords />} text={`Best of ${t.best_of}`} /><Meta icon={<Gauge />} text={t.max_average ? `Bis ${t.max_average} AVG` : 'Alle AVG'} /></div>
          {t.requires_access_code && canJoin && <input value={codes[t.id] ?? ''} onChange={e => setCodes(c => ({ ...c, [t.id]: e.target.value.toUpperCase() }))} placeholder="Community-Code" className="relative mt-4 w-full rounded-xl border border-violet-300/20 bg-black/25 px-3 py-2.5 text-xs font-bold uppercase outline-none" />}
          <div className="relative mt-5 flex flex-wrap gap-2"><button onClick={() => void openTournament(t)} className="flex-1 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold hover:bg-white/10">Details <ChevronRight size={14} className="inline" /></button>{canJoin && <button disabled={pending === `join:${t.id}`} onClick={() => void runAction(t, 'join')} className="flex-1 rounded-xl bg-amber-300 px-3 py-2.5 text-xs font-black text-black">{full ? 'Warteliste' : 'Teilnehmen'}</button>}{t.participant_status === 'waitlisted' && <span className="flex-1 rounded-xl bg-violet-400/10 px-3 py-2.5 text-center text-xs font-black text-violet-200"><ListOrdered size={14} className="mr-1 inline" /> Warteliste</span>}{t.participant_status === 'registered' && checkInOpen && <button disabled={pending === `checkin:${t.id}`} onClick={() => void runAction(t, 'checkin')} className="flex-1 rounded-xl bg-emerald-300 px-3 py-2.5 text-xs font-black text-black">JETZT CHECK-IN</button>}{t.checked_in && <span className="flex-1 rounded-xl bg-emerald-400/10 px-3 py-2.5 text-center text-xs font-black text-emerald-200"><CheckCircle2 size={14} className="mr-1 inline" /> Eingecheckt</span>}{locked && <span className="flex-1 rounded-xl bg-white/5 px-3 py-2.5 text-center text-xs text-zinc-400"><Lock size={13} className="mr-1 inline" /> Premium</span>}</div>
          {t.joined && t.status === 'registration' && <button onClick={() => void runAction(t, 'leave')} className="relative mt-3 w-full text-[10px] font-bold text-zinc-600 hover:text-red-300">Teilnahme zurückziehen</button>}
        </article>;
      })}</div>}
    </section>
    {selected && <div className="fixed inset-0 z-50 overflow-y-auto bg-[#030405]/85 p-3 backdrop-blur-xl"><section className="mx-auto my-5 max-w-7xl overflow-hidden rounded-[2rem] border border-white/15 bg-[#0a0d12]"><header className="flex items-start justify-between border-b border-white/10 p-5 sm:p-7"><div><p className="text-[10px] font-black tracking-[.18em] text-amber-300">{formatMeta[selected.tournament_format]} · {platformMeta[selected.scoring_platform]}</p><h2 className="mt-3 text-3xl font-black">{selected.title}</h2><p className="mt-2 max-w-2xl text-sm text-zinc-400">{selected.description}</p></div><button onClick={() => setSelected(null)} className="rounded-xl border border-white/10 p-2.5"><X size={18} /></button></header><div className="grid gap-4 border-b border-white/10 p-5 md:grid-cols-3 sm:p-7"><InfoCard icon={<TicketCheck />} title="Check-in" body={`${formatDate(selected.check_in_opens_at)} bis ${formatDate(selected.check_in_closes_at)}`} /><InfoCard icon={<Trophy />} title="Preis" body={selected.prize_title ? `${selected.prize_title}${selected.prize_details ? ` · ${selected.prize_details}` : ''}` : 'Noch kein Preis hinterlegt'} /><InfoCard icon={<ShieldAlert />} title="Streitfälle & Verbindung" body={selected.dispute_policy} /></div>{selected.status === 'cancelled' && <div className="m-5 rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100"><b>Turnier abgesagt:</b> {selected.cancellation_reason}</div>}
      <div className="p-5 sm:p-7"><div className="mb-5 flex items-end justify-between"><div><p className="text-[10px] font-black tracking-[.18em] text-amber-300">TURNIERPLAN</p><h3 className="mt-1 text-2xl font-black">{selected.tournament_format === 'group_stage' ? 'Gruppenmatches' : 'Der Weg zum Pokal'}</h3></div>{selected.winner_username && <span className="rounded-full bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-100">Champion: {selected.winner_username}</span>}</div>{bracket.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-zinc-500"><Clock3 className="mx-auto mb-3" />Wird nach dem verpflichtenden Check-in ausgelost.</div> : <div className="overflow-x-auto"><div className="grid min-w-[700px] gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, Object.keys(rounds).length)},minmax(220px,1fr))` }}>{Object.entries(rounds).map(([round, matches]) => <div key={round}><p className="mb-3 text-[10px] font-black tracking-widest text-zinc-500">RUNDE {round}</p><div className="space-y-3">{matches.map(m => <div key={m.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[.03]"><Player name={m.player1_username} won={m.winner_id === m.player1_id} /><Player name={m.player2_username} won={m.winner_id === m.player2_id} />{m.active_match_id && m.status !== 'completed' && <p className="border-t border-white/10 px-3 py-2 text-[10px] font-black text-cyan-200">MATCHROOM BEREIT</p>}</div>)}</div></div>)}</div></div>}</div>{playerMatches.length > 0 && <footer className="border-t border-white/10 bg-amber-300/[.06] p-5 sm:px-7"><div><p className="font-black">Deine offenen Turnier-Matches</p><p className="mt-1 text-xs text-zinc-400">Wähle den Matchroom, den du jetzt spielen möchtest. Bei Problemen gilt der oben angezeigte Streitfall-Ablauf.</p></div><div className="mt-4 flex flex-wrap gap-2">{playerMatches.map(m => { const opponent = m.player1_id === userId ? m.player2_username : m.player1_username; return <Link key={m.id} href={`/result?matchId=${m.active_match_id}&bestOf=${selected.best_of}`} className="rounded-xl bg-amber-300 px-4 py-3 text-xs font-black text-black">vs. {opponent || 'Gegner'} <ChevronRight size={14} className="ml-1 inline" /></Link>; })}</div></footer>}</section></div>}
  </main>;
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) { return <div className="rounded-2xl bg-black/25 p-4"><span className="text-amber-300 [&>svg]:h-5 [&>svg]:w-5">{icon}</span><b className="mt-5 block text-2xl">{value}</b><span className="text-[10px] font-bold uppercase text-zinc-500">{label}</span></div>; }
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button onClick={onClick} className={`rounded-xl px-4 py-2.5 text-xs font-black ${active ? 'bg-amber-300 text-black' : 'text-zinc-400'}`}>{children}</button>; }
function Pill({ children }: { children: ReactNode }) { return <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-200">{children}</span>; }
function Meta({ icon, text }: { icon: ReactNode; text: string }) { return <div className="flex items-center gap-2"><span className="text-amber-300 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>{text}</div>; }
function InfoCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300"><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>{title}</div><p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p></div>; }
function Player({ name, won }: { name: string | null; won: boolean }) { return <div className={`flex items-center justify-between border-b border-white/10 px-3 py-2.5 text-sm last:border-0 ${won ? 'bg-emerald-400/10 text-emerald-100' : 'text-zinc-300'}`}><span>{name || 'Wird ermittelt'}</span>{won && <ShieldCheck size={13} />}</div>; }
