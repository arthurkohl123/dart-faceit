'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, Crown, Gauge, KeyRound, ListOrdered, Lock, Sparkles, Swords, Trophy, Users, Zap } from 'lucide-react';
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

  if (tournament.status === 'live') return { label: 'Turnier läuft', detail: tournament.tournament_format === 'group_stage' ? 'Die Gruppentabelle wird live aktualisiert.' : 'Der Turnierbaum ist geöffnet.', tone: 'border-red-300/25 bg-red-400/10 text-red-100' };
  if (tournament.status !== 'registration') return { label: statusMeta[tournament.status][0], detail: formatDate(tournament.starts_at), tone: 'border-white/10 bg-white/[0.04] text-zinc-300' };
  if (now < registrationCloses) return { label: 'Anmeldung offen', detail: `Noch ${formatCountdown(registrationCloses - now)} bis Anmeldeschluss`, tone: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' };
  if (now < checkInOpens) return { label: 'Anmeldung geschlossen', detail: `Check-in startet in ${formatCountdown(checkInOpens - now)}`, tone: 'border-amber-300/25 bg-amber-300/10 text-amber-100' };
  if (now <= checkInCloses) return { label: 'Check-in läuft', detail: `Noch ${formatCountdown(checkInCloses - now)} zum Einchecken`, tone: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100' };
  if (now < starts) return { label: 'Auslosung läuft', detail: `Start in ${formatCountdown(starts - now)}`, tone: 'border-violet-300/25 bg-violet-400/10 text-violet-100' };
  return { label: 'Start wird vorbereitet', detail: 'Der Turnierplan wird automatisch geöffnet.', tone: 'border-amber-300/25 bg-amber-300/10 text-amber-100' };
}

export default function TournamentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [view, setView] = useState<'upcoming' | 'completed'>('upcoming');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const loadTournaments = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_tournaments');
    if (error) { setNotice({ kind: 'error', text: error.message }); return; }
    setTournaments((data ?? []) as Tournament[]);
    setCurrentTime(Date.now());
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }
      const [{ data: profile }] = await Promise.all([
        supabase.from('profiles').select('"isPremium"').eq('"supabaseId"', user.id).maybeSingle(),
        loadTournaments(),
      ]);
      setIsPremium(Boolean(profile?.isPremium));
      setLoading(false);
    })();
  }, [loadTournaments, router, supabase]);

  useEffect(() => {
    const tick = () => setCurrentTime(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);

  async function runAction(tournament: Tournament, action: 'join' | 'checkin' | 'leave') {
    setPending(`${action}:${tournament.id}`);
    setNotice(null);
    const result = action === 'join'
      ? await supabase.rpc('join_tournament', { p_tournament_id: tournament.id, p_access_code: codes[tournament.id] || null })
      : action === 'checkin'
        ? await supabase.rpc('check_in_tournament', { p_tournament_id: tournament.id })
        : await supabase.rpc('leave_tournament', { p_tournament_id: tournament.id });
    setPending(null);
    if (result.error) { setNotice({ kind: 'error', text: result.error.message }); return; }
    const text = action === 'join' && result.data === 'waitlisted'
      ? 'Du stehst auf der Warteliste und rückst automatisch nach.'
      : action === 'join'
        ? 'Startplatz reserviert. Den Check-in nicht vergessen.'
        : action === 'checkin'
          ? 'Check-in bestätigt – dein Platz ist sicher.'
          : 'Du wurdest abgemeldet.';
    setNotice({ kind: 'success', text });
    await loadTournaments();
  }

  const upcoming = tournaments.filter(tournament => ['registration', 'live'].includes(tournament.status));
  const completed = tournaments.filter(tournament => ['completed', 'cancelled'].includes(tournament.status));
  const visible = view === 'upcoming' ? upcoming : completed;

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#07080c] text-zinc-400">Turnierzentrum wird geladen …</main>;

  return <main className="sport-grid min-h-screen overflow-x-hidden bg-[#0a0d0d] text-white">
    <nav className="mx-auto flex max-w-7xl items-center justify-between border-b border-white/10 px-5 py-5 md:px-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-white"><ArrowLeft size={16} /> Startseite</Link>
      <div className="flex items-center gap-3"><NotificationBell /><Link href="/premium" className="border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-black text-amber-200"><Crown size={14} className="mr-1 inline" /> PREMIUM</Link></div>
    </nav>
    <section className="mx-auto max-w-7xl px-5 pb-10 pt-12 md:px-8 md:pt-16">
      <div className="grid items-end gap-8 lg:grid-cols-[1.2fr_.8fr]"><div><div className="mb-5 inline-flex items-center gap-2 border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black tracking-[.22em] text-amber-200"><Sparkles size={13} /> RANKEDDARTS CUP SERIES</div><h1 className="text-5xl font-black leading-[.9] tracking-[-.06em] sm:text-7xl">SPIELPLAN.<br /><span className="text-amber-300">HOL DIR DEN POKAL.</span></h1><p className="mt-6 max-w-xl leading-7 text-zinc-400">Check-in, Warteliste und dein Turnierplan – alles an einem Ort, ohne Umwege.</p></div><div className="grid grid-cols-3 gap-px border border-white/10 bg-white/10"><Stat icon={<Trophy />} value={upcoming.length} label="Kommend" /><Stat icon={<Zap />} value={tournaments.filter(tournament => tournament.status === 'live').length} label="Live" /><Stat icon={<Users />} value={tournaments.reduce((count, tournament) => count + Number(tournament.participant_count), 0)} label="Starter" /></div></div>
    </section>
    <section className="mx-auto max-w-7xl px-5 pb-16 md:px-8">
      {notice && <div className={`mb-5 flex items-center justify-between border px-5 py-4 text-sm ${notice.kind === 'success' ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-red-300/25 bg-red-400/10 text-red-100'}`}><span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Hinweis schließen">×</button></div>}
      <div className="flex flex-col justify-between gap-5 border-b border-white/10 pb-5 sm:flex-row sm:items-end"><div><p className="text-[11px] font-black tracking-[.2em] text-amber-300">TURNIER-ÜBERSICHT</p><h2 className="mt-1 text-3xl font-black">Dein nächster Run.</h2></div><div className="inline-flex border border-white/10 bg-black/25 p-1"><Tab active={view === 'upcoming'} onClick={() => setView('upcoming')}>KOMMEND {upcoming.length}</Tab><Tab active={view === 'completed'} onClick={() => setView('completed')}>HISTORIE {completed.length}</Tab></div></div>
      {visible.length === 0 ? <div className="mt-6 border border-dashed border-white/15 p-14 text-center text-zinc-500">Aktuell gibt es hier noch keine Turniere.</div> : <div className="mt-6 grid gap-4 lg:grid-cols-3">{visible.map(tournament => {
        const full = Number(tournament.participant_count) >= tournament.max_players;
        const checkInOpen = currentTime >= new Date(tournament.check_in_opens_at).getTime() && currentTime <= new Date(tournament.check_in_closes_at).getTime();
        const locked = tournament.premium_only && !isPremium;
        const canJoin = tournament.status === 'registration' && !tournament.joined && !locked;
        const phase = tournamentPhase(tournament, currentTime);
        return <article key={tournament.id} className="group border border-white/10 border-t-2 border-t-amber-300/60 bg-[#0d1110] p-5 transition hover:border-white/20"><div className="flex justify-between"><span className={`border px-2.5 py-1 text-[9px] font-black tracking-[.14em] ${statusMeta[tournament.status][1]}`}>{statusMeta[tournament.status][0]}</span><div className="flex gap-2">{tournament.requires_access_code && <KeyRound size={15} className="text-violet-300" />}{tournament.premium_only && <Crown size={15} className="text-amber-300" />}</div></div><h3 className="mt-6 text-xl font-black">{tournament.title}</h3><p className="mt-2 min-h-10 text-sm leading-5 text-zinc-400">{tournament.description || 'Zeig, was du am Oche kannst.'}</p><div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black"><Pill>{platformMeta[tournament.scoring_platform]}</Pill><Pill>{formatMeta[tournament.tournament_format]}</Pill>{tournament.prize_title && <Pill>{tournament.prize_title}</Pill>}{tournament.winner_username && <Pill>Champion: {tournament.winner_username}</Pill>}</div><div className="mt-5 grid grid-cols-2 gap-2 text-xs text-zinc-400"><Meta icon={<CalendarDays />} text={formatDate(tournament.starts_at)} /><Meta icon={<Users />} text={`${tournament.participant_count}/${tournament.max_players}${tournament.waitlist_count ? ` +${tournament.waitlist_count}` : ''}`} /><Meta icon={<Swords />} text={`Best of ${tournament.best_of}`} /><Meta icon={<Gauge />} text={tournament.max_average ? `Bis ${tournament.max_average} AVG` : 'Alle AVG'} /></div><div className={`mt-4 border px-3 py-2.5 ${phase.tone}`}><p className="text-[10px] font-black uppercase tracking-[.14em]">{phase.label}</p><p className="mt-1 text-xs font-semibold opacity-85">{phase.detail}</p></div>
          {tournament.requires_access_code && canJoin && <input value={codes[tournament.id] ?? ''} onChange={event => setCodes(current => ({ ...current, [tournament.id]: event.target.value.toUpperCase() }))} placeholder="Community-Code" className="mt-4 w-full border border-violet-300/20 bg-black/25 px-3 py-2.5 text-xs font-bold uppercase outline-none" />}
          <div className="mt-5 flex flex-wrap gap-2"><Link href={`/tournaments/${tournament.id}`} className="flex flex-1 items-center justify-center gap-1 border border-white/10 px-3 py-2.5 text-xs font-bold hover:bg-white/10">Details <ChevronRight size={14} /></Link>{canJoin && <button disabled={pending === `join:${tournament.id}`} onClick={() => void runAction(tournament, 'join')} className="flex-1 border border-amber-200 bg-amber-300 px-3 py-2.5 text-xs font-black text-black disabled:opacity-60">{full ? 'Warteliste' : 'Teilnehmen'}</button>}{tournament.participant_status === 'waitlisted' && <span className="flex-1 border border-violet-300/20 bg-violet-400/10 px-3 py-2.5 text-center text-xs font-black text-violet-200"><ListOrdered size={14} className="mr-1 inline" /> Warteliste</span>}{tournament.participant_status === 'registered' && checkInOpen && <button disabled={pending === `checkin:${tournament.id}`} onClick={() => void runAction(tournament, 'checkin')} className="flex-1 border border-emerald-200 bg-emerald-300 px-3 py-2.5 text-xs font-black text-black disabled:opacity-60">JETZT CHECK-IN</button>}{tournament.checked_in && <span className="flex-1 border border-emerald-300/20 bg-emerald-400/10 px-3 py-2.5 text-center text-xs font-black text-emerald-200"><CheckCircle2 size={14} className="mr-1 inline" /> Eingecheckt</span>}{locked && <span className="flex-1 border border-white/10 bg-white/5 px-3 py-2.5 text-center text-xs text-zinc-400"><Lock size={13} className="mr-1 inline" /> Premium</span>}</div>
          {tournament.joined && tournament.status === 'registration' && <button onClick={() => void runAction(tournament, 'leave')} className="mt-3 w-full text-[10px] font-bold text-zinc-600 hover:text-red-300">Teilnahme zurückziehen</button>}
        </article>;
      })}</div>}
    </section>
  </main>;
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) { return <div className="bg-[#0d1110] p-4"><span className="text-amber-300 [&>svg]:h-5 [&>svg]:w-5">{icon}</span><b className="mt-5 block text-2xl">{value}</b><span className="text-[10px] font-bold uppercase text-zinc-500">{label}</span></div>; }
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button onClick={onClick} className={`px-4 py-2.5 text-xs font-black ${active ? 'bg-amber-300 text-black' : 'text-zinc-400'}`}>{children}</button>; }
function Pill({ children }: { children: ReactNode }) { return <span className="border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-200">{children}</span>; }
function Meta({ icon, text }: { icon: ReactNode; text: string }) { return <div className="flex items-center gap-2"><span className="text-amber-300 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>{text}</div>; }
