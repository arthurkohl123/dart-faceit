'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, Clock3, Crown, Gauge, KeyRound, ListOrdered, Lock, ShieldAlert, Sparkles, Swords, TicketCheck, Trophy, Users, X, Zap } from 'lucide-react';
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
type BracketMatch = { id: string; round_number: number; match_number: number; player1_id: string | null; player2_id: string | null; player1_username: string | null; player2_username: string | null; winner_id: string | null; status: string; active_match_id: string | null; player1_legs: number | null; player2_legs: number | null; player1_average: number | null; player2_average: number | null; };

const statusMeta = {
  registration: ['ANMELDUNG', 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'],
  live: ['LIVE', 'border-red-300/20 bg-red-400/10 text-red-200'],
  completed: ['ABGESCHLOSSEN', 'border-white/10 bg-zinc-500/15 text-zinc-300'],
  cancelled: ['ABGESAGT', 'border-red-300/15 bg-red-500/10 text-red-300'],
} as const;
const formatMeta: Record<TournamentFormat, string> = { single_elimination: 'Single Elimination', double_elimination: 'Double Elimination', group_stage: 'Gruppenphase' };
const platformMeta = { scolia: 'Scolia', dartcounter: 'DartCounter' } as const;
const formatDate = (value: string) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

function formatCountdown(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} Std. ${minutes.toString().padStart(2, '0')} Min.` : `${minutes} Min.`;
}

function tournamentPhase(tournament: Tournament, now: number) {
  const registrationCloses = new Date(tournament.registration_closes_at).getTime();
  const checkInOpens = new Date(tournament.check_in_opens_at).getTime();
  const checkInCloses = new Date(tournament.check_in_closes_at).getTime();
  const starts = new Date(tournament.starts_at).getTime();

  if (tournament.status === 'live') return { label: 'Turnier läuft', detail: 'Der Turnierbaum ist geöffnet.', tone: 'border-red-300/25 bg-red-400/10 text-red-100' };
  if (tournament.status !== 'registration') return { label: statusMeta[tournament.status][0], detail: formatDate(tournament.starts_at), tone: 'border-white/10 bg-white/[0.04] text-zinc-300' };
  if (now < registrationCloses) return { label: 'Anmeldung offen', detail: `Noch ${formatCountdown(registrationCloses - now)} bis Anmeldeschluss`, tone: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' };
  if (now < checkInOpens) return { label: 'Anmeldung geschlossen', detail: `Check-in startet in ${formatCountdown(checkInOpens - now)}`, tone: 'border-amber-300/25 bg-amber-300/10 text-amber-100' };
  if (now <= checkInCloses) return { label: 'Check-in läuft', detail: `Noch ${formatCountdown(checkInCloses - now)} zum Einchecken`, tone: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100' };
  if (now < starts) return { label: 'Auslosung läuft', detail: `Start in ${formatCountdown(starts - now)}`, tone: 'border-violet-300/25 bg-violet-400/10 text-violet-100' };
  return { label: 'Start wird vorbereitet', detail: 'Der Turnierbaum wird automatisch geöffnet.', tone: 'border-amber-300/25 bg-amber-300/10 text-amber-100' };
}

export default function TournamentsPage() {
  const supabase = useMemo(() => createClient(), []); const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]); const [selected, setSelected] = useState<Tournament | null>(null); const [bracket, setBracket] = useState<BracketMatch[]>([]);
  const [isPremium, setIsPremium] = useState(false); const [userId, setUserId] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [pending, setPending] = useState<string | null>(null);
  const [view, setView] = useState<'upcoming' | 'completed'>('upcoming'); const [codes, setCodes] = useState<Record<string, string>>({}); const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const loadTournaments = useCallback(async () => { const { data, error } = await supabase.rpc('list_tournaments'); if (error) { setNotice({ kind: 'error', text: error.message }); return; } const next = (data ?? []) as Tournament[]; setTournaments(next); setCurrentTime(new Date().getTime()); setSelected(current => current ? next.find(item => item.id === current.id) ?? null : null); }, [supabase]);
  useEffect(() => { void (async () => { const { data: { user } } = await supabase.auth.getUser(); if (!user) { router.push('/auth/login'); return; } setUserId(user.id); const [{ data: profile }] = await Promise.all([supabase.from('profiles').select('"isPremium"').eq('"supabaseId"', user.id).maybeSingle(), loadTournaments()]); setIsPremium(Boolean(profile?.isPremium)); setLoading(false); })(); }, [loadTournaments, router, supabase]);
  useEffect(() => { const tick = () => setCurrentTime(Date.now()); tick(); const timer = window.setInterval(tick, 30_000); return () => clearInterval(timer); }, []);

  // Ein Bracket entwickelt sich durch Ergebnisbestätigungen im Matchroom weiter.
  // Der Abgleich hält die offene Detailansicht auch dann aktuell, wenn Realtime
  // beim Gerät eines Spielers nicht verfügbar ist.
  useEffect(() => {
    if (!selected?.id) return;
    let active = true;
    let refreshes = 0;
    const refreshSelectedTournament = async () => {
      if (document.visibilityState !== 'visible') return;
      if (selected.status !== 'live') {
        // Vor Start genügt ein ruhiger Phasenabgleich. Sobald der Server das
        // Turnier auf live stellt, aktualisiert loadTournaments auch selected
        // und der schnellere Bracket-Pfad übernimmt automatisch.
        await loadTournaments();
        return;
      }
      const { data, error } = await supabase.rpc('get_tournament_bracket', { p_tournament_id: selected.id });
      if (!active || error) return;
      setBracket((data ?? []) as BracketMatch[]);
      // Die Turnierliste ändert sich deutlich seltener als der offene
      // Spielbaum. Deshalb nur jeder zweite Bracket-Abruf statt doppelt.
      refreshes += 1;
      if (refreshes % 2 === 0) void loadTournaments();
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void refreshSelectedTournament(); };
    const interval = window.setInterval(() => void refreshSelectedTournament(), selected.status === 'live' ? 12_000 : 30_000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => { active = false; clearInterval(interval); document.removeEventListener('visibilitychange', onVisibilityChange); };
  }, [loadTournaments, selected?.id, selected?.status, supabase]);

  async function openTournament(t: Tournament) { setSelected(t); setBracket([]); const { data, error } = await supabase.rpc('get_tournament_bracket', { p_tournament_id: t.id }); if (error) setNotice({ kind: 'error', text: 'Der Turnierplan konnte nicht geladen werden.' }); else setBracket((data ?? []) as BracketMatch[]); }
  async function runAction(t: Tournament, action: 'join' | 'checkin' | 'leave') {
    setPending(`${action}:${t.id}`); setNotice(null);
    const result = action === 'join' ? await supabase.rpc('join_tournament', { p_tournament_id: t.id, p_access_code: codes[t.id] || null }) : action === 'checkin' ? await supabase.rpc('check_in_tournament', { p_tournament_id: t.id }) : await supabase.rpc('leave_tournament', { p_tournament_id: t.id });
    setPending(null); if (result.error) { setNotice({ kind: 'error', text: result.error.message }); return; }
    const text = action === 'join' && result.data === 'waitlisted' ? 'Du stehst auf der Warteliste und rückst automatisch nach.' : action === 'join' ? 'Startplatz reserviert. Den Check-in nicht vergessen.' : action === 'checkin' ? 'Check-in bestätigt – dein Platz ist sicher.' : 'Du wurdest abgemeldet.';
    setNotice({ kind: 'success', text }); await loadTournaments();
  }

  const upcoming = tournaments.filter(t => ['registration', 'live'].includes(t.status)); const completed = tournaments.filter(t => ['completed', 'cancelled'].includes(t.status)); const visible = view === 'upcoming' ? upcoming : completed;
  const playerMatches = selected && userId
    ? bracket.filter(m => m.active_match_id && m.status !== 'completed' && (m.player1_id === userId || m.player2_id === userId))
    : [];
  if (loading) return <main className="grid min-h-screen place-items-center bg-[#07080c] text-zinc-400">Turnierzentrum wird geladen …</main>;

  return <main className="sport-grid min-h-screen overflow-x-hidden bg-[#0a0d0d] text-white">
    <nav className="mx-auto flex max-w-7xl items-center justify-between border-b border-white/10 px-5 py-5 md:px-8"><Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-white"><ArrowLeft size={16} /> Startseite</Link><div className="flex items-center gap-3"><NotificationBell /><Link href="/premium" className="border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-black text-amber-200"><Crown size={14} className="mr-1 inline" /> PREMIUM</Link></div></nav>
    <section className="mx-auto max-w-7xl px-5 pb-10 pt-12 md:px-8 md:pt-16"><div className="grid items-end gap-8 lg:grid-cols-[1.2fr_.8fr]"><div><div className="mb-5 inline-flex items-center gap-2 border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black tracking-[.22em] text-amber-200"><Sparkles size={13} /> RANKEDDARTS CUP SERIES</div><h1 className="text-5xl font-black leading-[.9] tracking-[-.06em] sm:text-7xl">SPIELPLAN.<br /><span className="text-amber-300">HOL DIR DEN POKAL.</span></h1><p className="mt-6 max-w-xl leading-7 text-zinc-400">Check-in, Warteliste und Matchrooms – alles an einem Ort, ohne Umwege.</p></div><div className="grid grid-cols-3 gap-px border border-white/10 bg-white/10"><Stat icon={<Trophy />} value={upcoming.length} label="Kommend" /><Stat icon={<Zap />} value={tournaments.filter(t => t.status === 'live').length} label="Live" /><Stat icon={<Users />} value={tournaments.reduce((n, t) => n + Number(t.participant_count), 0)} label="Starter" /></div></div></section>
    <section className="mx-auto max-w-7xl px-5 pb-16 md:px-8">{notice && <div className={`mb-5 flex items-center justify-between border px-5 py-4 text-sm ${notice.kind === 'success' ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-red-300/25 bg-red-400/10 text-red-100'}`}><span>{notice.text}</span><button onClick={() => setNotice(null)}>×</button></div>}
      <div className="flex flex-col justify-between gap-5 border-b border-white/10 pb-5 sm:flex-row sm:items-end"><div><p className="text-[11px] font-black tracking-[.2em] text-amber-300">TURNIER-ÜBERSICHT</p><h2 className="mt-1 text-3xl font-black">Dein nächster Run.</h2></div><div className="inline-flex border border-white/10 bg-black/25 p-1"><Tab active={view === 'upcoming'} onClick={() => setView('upcoming')}>KOMMEND {upcoming.length}</Tab><Tab active={view === 'completed'} onClick={() => setView('completed')}>HISTORIE {completed.length}</Tab></div></div>
      {visible.length === 0 ? <div className="mt-6 border border-dashed border-white/15 p-14 text-center text-zinc-500">Aktuell gibt es hier noch keine Turniere.</div> : <div className="mt-6 grid gap-4 lg:grid-cols-3">{visible.map(t => {
        const full = Number(t.participant_count) >= t.max_players; const checkInOpen = currentTime >= new Date(t.check_in_opens_at).getTime() && currentTime <= new Date(t.check_in_closes_at).getTime(); const locked = t.premium_only && !isPremium; const canJoin = t.status === 'registration' && !t.joined && !locked; const phase = tournamentPhase(t, currentTime);
        return <article key={t.id} className="group border border-white/10 border-t-2 border-t-amber-300/60 bg-[#0d1110] p-5 transition hover:border-white/20"><div className="flex justify-between"><span className={`border px-2.5 py-1 text-[9px] font-black tracking-[.14em] ${statusMeta[t.status][1]}`}>{statusMeta[t.status][0]}</span><div className="flex gap-2">{t.requires_access_code && <KeyRound size={15} className="text-violet-300" />}{t.premium_only && <Crown size={15} className="text-amber-300" />}</div></div><h3 className="mt-6 text-xl font-black">{t.title}</h3><p className="mt-2 min-h-10 text-sm leading-5 text-zinc-400">{t.description || 'Zeig, was du am Oche kannst.'}</p><div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black"><Pill>{platformMeta[t.scoring_platform]}</Pill><Pill>{formatMeta[t.tournament_format]}</Pill>{t.prize_title && <Pill>{t.prize_title}</Pill>}{t.winner_username && <Pill>Champion: {t.winner_username}</Pill>}</div><div className="mt-5 grid grid-cols-2 gap-2 text-xs text-zinc-400"><Meta icon={<CalendarDays />} text={formatDate(t.starts_at)} /><Meta icon={<Users />} text={`${t.participant_count}/${t.max_players}${t.waitlist_count ? ` +${t.waitlist_count}` : ''}`} /><Meta icon={<Swords />} text={`Best of ${t.best_of}`} /><Meta icon={<Gauge />} text={t.max_average ? `Bis ${t.max_average} AVG` : 'Alle AVG'} /></div><div className={`mt-4 border px-3 py-2.5 ${phase.tone}`}><p className="text-[10px] font-black uppercase tracking-[.14em]">{phase.label}</p><p className="mt-1 text-xs font-semibold opacity-85">{phase.detail}</p></div>
          {t.requires_access_code && canJoin && <input value={codes[t.id] ?? ''} onChange={e => setCodes(c => ({ ...c, [t.id]: e.target.value.toUpperCase() }))} placeholder="Community-Code" className="mt-4 w-full border border-violet-300/20 bg-black/25 px-3 py-2.5 text-xs font-bold uppercase outline-none" />}
          <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void openTournament(t)} className="flex-1 border border-white/10 px-3 py-2.5 text-xs font-bold hover:bg-white/10">Details <ChevronRight size={14} className="inline" /></button>{canJoin && <button disabled={pending === `join:${t.id}`} onClick={() => void runAction(t, 'join')} className="flex-1 border border-amber-200 bg-amber-300 px-3 py-2.5 text-xs font-black text-black">{full ? 'Warteliste' : 'Teilnehmen'}</button>}{t.participant_status === 'waitlisted' && <span className="flex-1 border border-violet-300/20 bg-violet-400/10 px-3 py-2.5 text-center text-xs font-black text-violet-200"><ListOrdered size={14} className="mr-1 inline" /> Warteliste</span>}{t.participant_status === 'registered' && checkInOpen && <button disabled={pending === `checkin:${t.id}`} onClick={() => void runAction(t, 'checkin')} className="flex-1 border border-emerald-200 bg-emerald-300 px-3 py-2.5 text-xs font-black text-black">JETZT CHECK-IN</button>}{t.checked_in && <span className="flex-1 border border-emerald-300/20 bg-emerald-400/10 px-3 py-2.5 text-center text-xs font-black text-emerald-200"><CheckCircle2 size={14} className="mr-1 inline" /> Eingecheckt</span>}{locked && <span className="flex-1 border border-white/10 bg-white/5 px-3 py-2.5 text-center text-xs text-zinc-400"><Lock size={13} className="mr-1 inline" /> Premium</span>}</div>
          {t.joined && t.status === 'registration' && <button onClick={() => void runAction(t, 'leave')} className="mt-3 w-full text-[10px] font-bold text-zinc-600 hover:text-red-300">Teilnahme zurückziehen</button>}
        </article>;
      })}</div>}
    </section>
    {selected && <div className="fixed inset-0 z-50 overflow-y-auto bg-[#030405]/85 p-3 backdrop-blur-xl"><section className="mx-auto my-5 max-w-7xl overflow-hidden rounded-[2rem] border border-white/15 bg-[#0a0d12]"><header className="flex items-start justify-between border-b border-white/10 p-5 sm:p-7"><div><p className="text-[10px] font-black tracking-[.18em] text-amber-300">{formatMeta[selected.tournament_format]} · {platformMeta[selected.scoring_platform]}</p><h2 className="mt-3 text-3xl font-black">{selected.title}</h2><p className="mt-2 max-w-2xl text-sm text-zinc-400">{selected.description}</p></div><button onClick={() => setSelected(null)} className="rounded-xl border border-white/10 p-2.5"><X size={18} /></button></header><TournamentTimeline tournament={selected} now={currentTime} /><div className="grid gap-4 border-b border-white/10 p-5 md:grid-cols-3 sm:p-7"><InfoCard icon={<TicketCheck />} title="Check-in" body={`${formatDate(selected.check_in_opens_at)} bis ${formatDate(selected.check_in_closes_at)}`} /><InfoCard icon={<Trophy />} title="Preis" body={selected.prize_title ? `${selected.prize_title}${selected.prize_details ? ` · ${selected.prize_details}` : ''}` : 'Noch kein Preis hinterlegt'} /><InfoCard icon={<ShieldAlert />} title="Streitfälle & Verbindung" body={selected.dispute_policy} /></div>{selected.status === 'cancelled' && <div className="m-5 rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100"><b>Turnier abgesagt:</b> {selected.cancellation_reason}</div>}
      <div className="p-5 sm:p-7">
        <div className="mb-5 flex items-end justify-between"><div><p className="text-[10px] font-black tracking-[.18em] text-amber-300">TURNIERPLAN</p><h3 className="mt-1 text-2xl font-black">{selected.tournament_format === 'group_stage' ? 'Gruppenmatches' : 'Der Weg zum Pokal'}</h3></div>{selected.winner_username && <span className="rounded-full bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-100">Champion: {selected.winner_username}</span>}</div>
        {bracket.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-zinc-500"><Clock3 className="mx-auto mb-3" />Wird nach dem verpflichtenden Check-in ausgelost.</div> : <TournamentBracket matches={bracket} tournamentFormat={selected.tournament_format} />}
      </div>
      {playerMatches.length > 0 && <footer className="border-t border-white/10 bg-amber-300/[.06] p-5 sm:px-7"><div><p className="font-black">Deine offenen Turnier-Matches</p><p className="mt-1 text-xs text-zinc-400">Wähle den Matchroom, den du jetzt spielen möchtest. Bei Problemen gilt der oben angezeigte Streitfall-Ablauf.</p></div><div className="mt-4 flex flex-wrap gap-2">{playerMatches.map(m => { const opponent = m.player1_id === userId ? m.player2_username : m.player1_username; return <Link key={m.id} href={`/result?matchId=${m.active_match_id}&bestOf=${selected.best_of}`} className="rounded-xl bg-amber-300 px-4 py-3 text-xs font-black text-black">vs. {opponent || 'Gegner'} <ChevronRight size={14} className="ml-1 inline" /></Link>; })}</div></footer>}</section></div>}
  </main>;
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) { return <div className="bg-[#0d1110] p-4"><span className="text-amber-300 [&>svg]:h-5 [&>svg]:w-5">{icon}</span><b className="mt-5 block text-2xl">{value}</b><span className="text-[10px] font-bold uppercase text-zinc-500">{label}</span></div>; }
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button onClick={onClick} className={`px-4 py-2.5 text-xs font-black ${active ? 'bg-amber-300 text-black' : 'text-zinc-400'}`}>{children}</button>; }
function Pill({ children }: { children: ReactNode }) { return <span className="border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-200">{children}</span>; }
function Meta({ icon, text }: { icon: ReactNode; text: string }) { return <div className="flex items-center gap-2"><span className="text-amber-300 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>{text}</div>; }
function TournamentTimeline({ tournament, now }: { tournament: Tournament; now: number }) {
  const phases = [
    { label: 'Anmeldung', time: tournament.registration_closes_at, note: 'endet' },
    { label: 'Check-in', time: tournament.check_in_opens_at, note: 'öffnet' },
    { label: 'Check-in', time: tournament.check_in_closes_at, note: 'endet' },
    { label: 'Turnier', time: tournament.starts_at, note: 'startet' },
  ];
  const activeIndex = phases.findIndex((phase) => now < new Date(phase.time).getTime());
  return <section className="border-b border-white/10 bg-[linear-gradient(90deg,rgba(245,158,11,0.09),transparent)] p-5 sm:px-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black tracking-[.16em] text-amber-300">DEIN TURNIER-FAHRPLAN</p><p className="mt-1 text-sm text-zinc-400">Alle wichtigen Zeitpunkte auf einen Blick.</p></div><span className="w-fit border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.12em] text-amber-100">{tournamentPhase(tournament, now).label}</span></div><ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{phases.map((phase, index) => { const done = now >= new Date(phase.time).getTime(); const next = activeIndex === index; return <li key={`${phase.label}-${phase.note}`} className={`border p-3 ${next ? 'border-amber-300/40 bg-amber-300/[0.09]' : done ? 'border-emerald-300/15 bg-emerald-400/[0.05]' : 'border-white/10 bg-black/15'}`}><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-[.12em] text-zinc-300">{phase.label}</span>{done ? <CheckCircle2 size={14} className="text-emerald-300" /> : next ? <Clock3 size={14} className="text-amber-200" /> : <span className="h-2 w-2 rounded-full bg-zinc-700" />}</div><p className="mt-2 text-sm font-black text-white">{formatDate(phase.time)}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.1em] text-zinc-500">{phase.note}</p></li>; })}</ol></section>;
}
function InfoCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) { return <div className="border border-white/10 bg-white/[.03] p-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300"><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>{title}</div><p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p></div>; }
function roundLabel(roundNumber: number, totalRounds: number) {
  const roundsToFinal = totalRounds - roundNumber;
  if (roundsToFinal === 0) return 'Finale';
  if (roundsToFinal === 1) return 'Halbfinale';
  if (roundsToFinal === 2) return 'Viertelfinale';
  if (roundsToFinal === 3) return 'Achtelfinale';
  return `Runde ${roundNumber}`;
}

function TournamentBracket({ matches, tournamentFormat }: { matches: BracketMatch[]; tournamentFormat: TournamentFormat }) {
  const rounds = matches.reduce<Record<number, BracketMatch[]>>((map, match) => { (map[match.round_number] ??= []).push(match); return map; }, {});
  const orderedActualRounds = Object.entries(rounds).sort(([left], [right]) => Number(left) - Number(right));
  const isKnockout = tournamentFormat === 'single_elimination';
  const firstRoundCount = orderedActualRounds[0]?.[1].length ?? 1;
  const expectedRounds = isKnockout ? Math.ceil(Math.log2(Math.max(2, firstRoundCount * 2))) : orderedActualRounds.length;
  const orderedRounds: Array<[string, Array<BracketMatch | null>]> = isKnockout
    ? Array.from({ length: expectedRounds }, (_, roundIndex) => {
      const roundNumber = roundIndex + 1;
      const expectedMatches = Math.max(1, Math.ceil(firstRoundCount / (2 ** roundIndex)));
      const actualMatches = rounds[roundNumber] ?? [];
      return [String(roundNumber), Array.from({ length: expectedMatches }, (_, matchIndex) => actualMatches.find(match => match.match_number === matchIndex + 1) ?? null)];
    })
    : orderedActualRounds;

  return <div className="overflow-x-auto pb-3"><div className={`min-w-max ${isKnockout ? 'flex items-start gap-12 pr-8' : 'grid gap-4'}`} style={isKnockout ? undefined : { gridTemplateColumns: `repeat(${orderedRounds.length}, minmax(224px, 1fr))` }}>{orderedRounds.map(([round, roundMatches], roundIndex) => {
    const totalRounds = orderedRounds.length;
    const rowHeight = 112;
    const roundOffset = isKnockout ? ((2 ** roundIndex) - 1) * rowHeight / 2 : 0;
    const rowGap = isKnockout ? Math.max(16, (2 ** roundIndex) * rowHeight - 96) : 12;
    return <section key={round} className="w-60 shrink-0"><header className="mb-3 flex items-center gap-2"><span className="h-px flex-1 bg-white/10" /><p className="text-center text-[10px] font-black uppercase tracking-[.16em] text-amber-200">{isKnockout ? roundLabel(Number(round), totalRounds) : `Runde ${round}`}</p><span className="h-px flex-1 bg-white/10" /></header><div className="flex flex-col" style={{ paddingTop: `${roundOffset}px`, gap: `${rowGap}px` }}>{roundMatches.map((match, matchIndex) => <BracketMatchCard key={match?.id ?? `placeholder-${round}-${matchIndex}`} match={match} hasPreviousRound={isKnockout && roundIndex > 0} hasNextRound={isKnockout && roundIndex < totalRounds - 1} connectsDown={isKnockout && roundIndex < totalRounds - 1 && matchIndex % 2 === 0 && matchIndex + 1 < roundMatches.length} connectorHeight={rowHeight + rowGap} />)}</div></section>;
  })}</div></div>;
}

function BracketMatchCard({ match, hasPreviousRound, hasNextRound, connectsDown, connectorHeight }: { match: BracketMatch | null; hasPreviousRound: boolean; hasNextRound: boolean; connectsDown: boolean; connectorHeight: number }) {
  if (!match) return <article className={`relative min-h-24 border border-dashed border-white/10 bg-white/[.015] ${hasPreviousRound ? 'before:absolute before:right-full before:top-1/2 before:h-px before:w-6 before:bg-white/15' : ''} ${hasNextRound ? 'after:absolute after:left-full after:top-1/2 after:h-px after:w-6 after:bg-white/15' : ''}`}>{connectsDown && <span aria-hidden className="absolute left-[calc(100%+1.5rem)] top-1/2 w-px bg-white/15" style={{ height: `${connectorHeight}px` }} />}<Player name={null} won={false} legs={null} average={null} /><Player name={null} won={false} legs={null} average={null} /></article>;
  const hasBye = Boolean(match.player1_id && !match.player2_id && match.status === 'completed');
  return <article className={`relative min-h-24 overflow-visible border bg-[#101311] shadow-[0_12px_26px_rgba(0,0,0,.18)] ${match.status === 'completed' ? 'border-emerald-300/30' : 'border-white/15'} ${hasPreviousRound ? 'before:absolute before:right-full before:top-1/2 before:h-px before:w-6 before:bg-amber-300/45' : ''} ${hasNextRound ? 'after:absolute after:left-full after:top-1/2 after:h-px after:w-6 after:bg-amber-300/45' : ''}`}>{connectsDown && <span aria-hidden className="absolute left-[calc(100%+1.5rem)] top-1/2 w-px bg-amber-300/45" style={{ height: `${connectorHeight}px` }} />}<div className="overflow-hidden"><Player name={match.player1_username} won={match.winner_id === match.player1_id} legs={match.player1_legs} average={match.player1_average} /><Player name={match.player2_username} won={match.winner_id === match.player2_id} legs={match.player2_legs} average={match.player2_average} placeholder={hasBye ? 'Freilos' : undefined} /></div>{match.active_match_id && match.status !== 'completed' && <p className="border-t border-white/10 bg-cyan-300/[.05] px-3 py-2 text-[9px] font-black tracking-[.12em] text-cyan-200">MATCHROOM BEREIT</p>}</article>;
}

function Player({ name, won, legs, average, placeholder }: { name: string | null; won: boolean; legs: number | null; average: number | null; placeholder?: string }) { return <div className={`flex min-h-12 items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 text-sm last:border-0 ${won ? 'bg-emerald-400/10 text-emerald-100' : 'text-zinc-300'}`}><span className="min-w-0 truncate font-semibold">{name || placeholder || 'Wird ermittelt'}{average !== null && <span className="ml-1.5 text-[10px] font-bold text-zinc-500">Ø {Number(average).toFixed(1)}</span>}</span>{legs !== null && <strong className={`shrink-0 text-base ${won ? 'text-emerald-200' : 'text-zinc-100'}`}>{legs}</strong>}</div>; }
