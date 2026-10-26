'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, CircleAlert, Clock3, Crown, Gauge, KeyRound, ListOrdered, Lock, Radio, Swords, Trophy, Users } from 'lucide-react';
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
  participant_status: string | null; checked_in: boolean; checked_in_count: number; payout_deadline_days: number;
  payout_terms_version: string; payout_terms_snapshot: string;
};
type PlayerHub = {
  tournament_id: string; title: string; tournament_status: 'registration' | 'live'; tournament_format: TournamentFormat;
  starts_at: string; participant_status: 'registered' | 'checked_in' | 'waitlisted'; checked_in: boolean;
  next_match_id: string | null; active_match_id: string | null; round_number: number | null; match_number: number | null;
  opponent_username: string | null; match_status: 'ready' | 'scheduled' | null; open_incident_count: number;
};
type Notice = { kind: 'success' | 'error'; text: string };

const statusMeta = {
  registration: ['ANMELDUNG', 'border-emerald-300/20 bg-emerald-300/[.09] text-emerald-100'],
  live: ['LIVE', 'border-rose-300/25 bg-rose-300/[.10] text-rose-100'],
  completed: ['BEENDET', 'border-white/10 bg-white/[.04] text-zinc-300'],
  cancelled: ['ABGESAGT', 'border-rose-300/20 bg-rose-300/[.08] text-rose-200'],
} as const;
const formatMeta: Record<TournamentFormat, string> = { single_elimination: 'Single Elimination', double_elimination: 'Double Elimination', group_stage: 'Gruppenphase' };
const platformMeta = { scolia: 'Scolia', dartcounter: 'DartCounter' } as const;
const formatDate = (value: string) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const formatDay = (value: string) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short' }).format(new Date(value));

function formatCountdown(milliseconds: number) {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} Std. ${String(minutes % 60).padStart(2, '0')} Min.` : `${minutes} Min.`;
}

function tournamentPhase(tournament: Tournament, now: number) {
  const registrationCloses = new Date(tournament.registration_closes_at).getTime();
  const checkInOpens = new Date(tournament.check_in_opens_at).getTime();
  const checkInCloses = new Date(tournament.check_in_closes_at).getTime();
  const starts = new Date(tournament.starts_at).getTime();
  if (tournament.status === 'live') return { label: 'Turnier läuft', detail: tournament.tournament_format === 'group_stage' ? 'Tabelle und laufendes Gruppenmatch sind live.' : 'Der Turnierbaum ist geöffnet.', tone: 'text-rose-100 border-rose-300/25 bg-rose-300/[.08]' };
  if (tournament.status !== 'registration') return { label: statusMeta[tournament.status][0], detail: formatDate(tournament.starts_at), tone: 'text-zinc-300 border-white/10 bg-white/[.035]' };
  if (now < registrationCloses) return { label: 'Anmeldung offen', detail: `Noch ${formatCountdown(registrationCloses - now)} bis Anmeldeschluss`, tone: 'text-emerald-100 border-emerald-300/25 bg-emerald-300/[.08]' };
  if (now < checkInOpens) return { label: 'Anmeldung geschlossen', detail: `Check-in startet in ${formatCountdown(checkInOpens - now)}`, tone: 'text-amber-100 border-amber-300/25 bg-amber-300/[.08]' };
  if (now <= checkInCloses) return { label: 'Check-in läuft', detail: `Noch ${formatCountdown(checkInCloses - now)} zum Einchecken`, tone: 'text-cyan-100 border-cyan-300/25 bg-cyan-300/[.08]' };
  if (now < starts) return { label: 'Auslosung läuft', detail: `Start in ${formatCountdown(starts - now)}`, tone: 'text-violet-100 border-violet-300/25 bg-violet-300/[.08]' };
  return { label: 'Start wird vorbereitet', detail: 'Der Turnierplan öffnet automatisch.', tone: 'text-amber-100 border-amber-300/25 bg-amber-300/[.08]' };
}

export default function TournamentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [myTournaments, setMyTournaments] = useState<PlayerHub[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [view, setView] = useState<'upcoming' | 'completed'>('upcoming');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const loadTournaments = useCallback(async () => {
    const [tournamentResult, hubResult] = await Promise.all([
      supabase.rpc('list_tournaments'),
      supabase.rpc('get_my_tournament_hub'),
    ]);
    if (tournamentResult.error) {
      setNotice({ kind: 'error', text: 'Die Turniere konnten gerade nicht geladen werden. Bitte versuche es erneut.' });
      return;
    }
    setTournaments((tournamentResult.data ?? []) as Tournament[]);
    setMyTournaments(hubResult.error ? [] : (hubResult.data ?? []) as PlayerHub[]);
    setCurrentTime(Date.now());
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }
      const [premiumResult] = await Promise.all([
        fetch('/api/premium-status', { cache: 'no-store' })
          .then(async response => response.ok ? await response.json() as { premium?: { isPremium?: boolean | null } | null } : null)
          .catch(() => null),
        loadTournaments(),
      ]);
      setIsPremium(Boolean(premiumResult?.premium?.isPremium));
      setLoading(false);
    })();
  }, [loadTournaments, router, supabase]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function runAction(tournament: Tournament, action: 'join' | 'checkin' | 'leave') {
    setPending(`${action}:${tournament.id}`);
    setNotice(null);
    const result = action === 'join'
      ? await supabase.rpc('join_tournament', { p_tournament_id: tournament.id, p_access_code: codes[tournament.id] || null, p_accept_payout_terms: !tournament.prize_title })
      : action === 'checkin'
        ? await supabase.rpc('check_in_tournament', { p_tournament_id: tournament.id })
        : await supabase.rpc('leave_tournament', { p_tournament_id: tournament.id });
    setPending(null);
    if (result.error) { setNotice({ kind: 'error', text: result.error.message }); return; }
    const text = action === 'join' && result.data === 'waitlisted'
      ? 'Du stehst auf der Warteliste und rückst automatisch nach.'
      : action === 'join' ? 'Startplatz reserviert. Den Check-in nicht vergessen.'
        : action === 'checkin' ? 'Check-in bestätigt – dein Platz ist sicher.' : 'Du wurdest abgemeldet.';
    setNotice({ kind: 'success', text });
    await loadTournaments();
  }

  const upcoming = tournaments.filter(tournament => ['registration', 'live'].includes(tournament.status));
  const completed = tournaments.filter(tournament => ['completed', 'cancelled'].includes(tournament.status));
  const visible = view === 'upcoming' ? upcoming : completed;
  const liveCount = tournaments.filter(tournament => tournament.status === 'live').length;

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#06110e] text-zinc-400">Turnierhub wird geladen …</main>;

  return <main className="relative min-h-screen overflow-x-hidden bg-[#06110e] text-white selection:bg-amber-300 selection:text-black">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[42rem] bg-[radial-gradient(circle_at_10%_10%,rgba(17,152,117,.17),transparent_25%),radial-gradient(circle_at_85%_20%,rgba(250,204,21,.13),transparent_23%),linear-gradient(180deg,#0b1a15_0%,#06110e_68%)]" />
    <nav className="relative mx-auto flex max-w-[88rem] items-center justify-between px-5 py-5 md:px-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-white"><ArrowLeft size={16} /> Startseite</Link>
      <div className="flex items-center gap-2"><NotificationBell /><Link href="/premium" className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-3.5 py-2 text-[10px] font-black tracking-[.12em] text-amber-100 transition hover:bg-amber-300/20"><Crown size={13} /> PREMIUM</Link></div>
    </nav>

    <section className="relative mx-auto max-w-[88rem] px-5 pb-9 pt-5 md:px-8 md:pt-10">
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#0c1c17]/85 shadow-[0_28px_100px_rgba(0,0,0,.28)] backdrop-blur-sm">
        <div className="grid gap-8 px-6 py-8 md:px-10 md:py-11 xl:grid-cols-[minmax(0,1fr)_25rem] xl:items-end">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[.09] px-3 py-1.5 text-[10px] font-black tracking-[.18em] text-emerald-100"><Radio size={12} className={liveCount ? 'animate-pulse' : ''} /> SPIELPLAN & TURNIERE</p>
            <h1 className="mt-6 max-w-3xl text-5xl font-black leading-[.88] tracking-[-.065em] sm:text-7xl">Dein nächstes<br /><span className="text-amber-300">großes Spiel.</span></h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-zinc-300/75">Anmelden, einchecken, spielen: Dein Turnierplan zeigt immer genau die nächste Aktion – ohne Suchen im Baum.</p>
          </div>
          <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-white/10 bg-[#07140f]">
            <HeroStat icon={<Trophy />} value={upcoming.length} label="Offen" />
            <HeroStat icon={<Radio />} value={liveCount} label="Live" accent="rose" />
            <HeroStat icon={<Users />} value={tournaments.reduce((count, tournament) => count + Number(tournament.participant_count), 0)} label="Starter" />
          </div>
        </div>
        <div className="grid border-t border-white/10 bg-black/15 px-6 py-3 text-[11px] text-zinc-400 md:grid-cols-3 md:px-10">
          <span className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-300" /> Check-in schützt deinen Startplatz</span>
          <span className="mt-2 flex items-center gap-2 md:mt-0"><Swords size={14} className="text-amber-300" /> Matchrooms öffnen sich zum richtigen Zeitpunkt</span>
          <span className="mt-2 flex items-center gap-2 md:mt-0"><CircleAlert size={14} className="text-cyan-300" /> Hilfe direkt am aktiven Turniermatch</span>
        </div>
      </div>
    </section>

    <section className="relative mx-auto max-w-[88rem] px-5 pb-7 md:px-8">
      {notice && <div aria-live="polite" className={`mb-5 flex items-start justify-between gap-3 rounded-2xl border px-5 py-4 text-sm ${notice.kind === 'success' ? 'border-emerald-300/25 bg-emerald-300/[.09] text-emerald-50' : 'border-rose-300/25 bg-rose-300/[.09] text-rose-100'}`}><span>{notice.text}</span><button type="button" onClick={() => setNotice(null)} aria-label="Hinweis schließen" className="text-lg leading-none opacity-70 hover:opacity-100">×</button></div>}
      <MyTournamentDeck items={myTournaments} />
    </section>

    <section className="relative mx-auto max-w-[88rem] px-5 pb-16 md:px-8">
      <div className="flex flex-col justify-between gap-5 border-b border-white/10 pb-5 sm:flex-row sm:items-end">
        <div><p className="text-[10px] font-black tracking-[.2em] text-emerald-300">TURNIERKALENDER</p><h2 className="mt-2 text-3xl font-black tracking-[-.04em]">Finde deine nächste Bühne.</h2></div>
        <div className="inline-flex self-start rounded-xl border border-white/10 bg-black/20 p-1 sm:self-auto"><Tab active={view === 'upcoming'} onClick={() => setView('upcoming')}>KOMMEND <span>{upcoming.length}</span></Tab><Tab active={view === 'completed'} onClick={() => setView('completed')}>HISTORIE <span>{completed.length}</span></Tab></div>
      </div>
      {visible.length === 0 ? <div className="mt-6 grid min-h-64 place-items-center rounded-3xl border border-dashed border-white/15 bg-white/[.02] px-6 text-center"><div><Trophy className="mx-auto text-zinc-600" /><p className="mt-4 font-bold text-zinc-300">Noch kein Turnier in dieser Ansicht.</p><p className="mt-2 text-sm text-zinc-500">Sobald ein Turnier angesetzt ist, erscheint es hier.</p></div></div> : <div className="mt-6 grid gap-4 xl:grid-cols-2">{visible.map(tournament => <TournamentCard key={tournament.id} tournament={tournament} isPremium={isPremium} currentTime={currentTime} pending={pending} code={codes[tournament.id] ?? ''} onCodeChange={value => setCodes(current => ({ ...current, [tournament.id]: value.toUpperCase() }))} onAction={runAction} />)}</div>}
    </section>
  </main>;
}

function MyTournamentDeck({ items }: { items: PlayerHub[] }) {
  if (items.length === 0) return <section className="rounded-3xl border border-dashed border-white/15 bg-white/[.018] px-6 py-5 text-sm text-zinc-400"><span className="font-bold text-zinc-200">Dein Spielplan ist frei.</span> Sobald du dich für ein Turnier anmeldest, stehen Check-in, nächster Gegner und Matchroom hier oben.</section>;
  return <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b1914] shadow-[0_20px_64px_rgba(0,0,0,.16)]"><header className="flex flex-col gap-3 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black tracking-[.2em] text-amber-300">DEINE TURNIERE</p><h2 className="mt-1 text-xl font-black">Nächste Aktion</h2></div><span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[.08] px-3 py-1.5 text-[10px] font-black tracking-[.1em] text-emerald-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> IM SPIELPLAN</span></header><div className="grid divide-y divide-white/10 xl:grid-cols-2 xl:divide-x xl:divide-y-0">{items.map(item => <MyTournamentRow key={item.tournament_id} item={item} />)}</div></section>;
}

function MyTournamentRow({ item }: { item: PlayerHub }) {
  const hasOpenIncident = Number(item.open_incident_count) > 0;
  const ready = item.match_status === 'ready' && item.active_match_id;
  const scheduled = item.match_status === 'scheduled';
  const detailHref = `/tournaments/${item.tournament_id}`;
  const summary = ready ? `Match ${item.round_number}.${item.match_number} gegen ${item.opponent_username || 'deinen Gegner'} ist bereit.`
    : scheduled ? `Dein nächstes Match gegen ${item.opponent_username || 'deinen Gegner'} folgt nach dem aktuellen Spiel.`
      : item.participant_status === 'waitlisted' ? 'Du bist auf der Warteliste und rückst automatisch nach.'
        : item.checked_in ? 'Du bist eingecheckt. Der Turnierplan meldet sich, sobald dein Match bereit ist.'
          : 'Du bist angemeldet. Check-in und Zeitplan findest du im Turnier.';
  return <article className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 gap-4"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border ${ready ? 'border-rose-300/30 bg-rose-300/[.1] text-rose-100' : 'border-amber-300/25 bg-amber-300/[.09] text-amber-200'}`}>{ready ? <Swords size={19} /> : <Trophy size={19} />}</div><div className="min-w-0"><p className="truncate font-black text-white">{item.title}</p><p className="mt-1 text-sm leading-5 text-zinc-400">{summary}</p>{hasOpenIncident && <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-black tracking-[.1em] text-cyan-200"><CircleAlert size={12} /> HILFE-TICKET OFFEN</p>}</div></div><Link href={ready ? `/result?matchId=${item.active_match_id}` : detailHref} className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-[11px] font-black tracking-[.08em] transition ${ready ? 'bg-amber-300 text-[#192018] hover:bg-amber-200' : 'border border-white/12 bg-white/[.035] text-zinc-100 hover:border-amber-300/35 hover:bg-amber-300/[.08]'}`}>{ready ? 'MATCHROOM' : 'ÖFFNEN'} <ChevronRight size={14} /></Link></article>;
}

function TournamentCard({ tournament, isPremium, currentTime, pending, code, onCodeChange, onAction }: { tournament: Tournament; isPremium: boolean; currentTime: number; pending: string | null; code: string; onCodeChange: (value: string) => void; onAction: (tournament: Tournament, action: 'join' | 'checkin' | 'leave') => Promise<void>; }) {
  const full = Number(tournament.participant_count) >= tournament.max_players;
  const checkInOpen = currentTime >= new Date(tournament.check_in_opens_at).getTime() && currentTime <= new Date(tournament.check_in_closes_at).getTime();
  const locked = tournament.premium_only && !isPremium;
  const canJoin = tournament.status === 'registration' && !tournament.joined && !locked;
  const hasPrize = Boolean(tournament.prize_title);
  const phase = tournamentPhase(tournament, currentTime);
  return <article className="group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0c1915] p-5 transition duration-300 hover:-translate-y-0.5 hover:border-emerald-300/25 hover:shadow-[0_18px_50px_rgba(0,0,0,.2)] sm:p-6"><div aria-hidden="true" className="absolute -right-16 -top-20 h-44 w-44 rounded-full bg-emerald-300/[.04] blur-2xl transition group-hover:bg-amber-300/[.08]" />
    <div className="relative flex gap-5"><div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#07120e] text-center"><span className="text-[9px] font-black uppercase tracking-[.12em] text-zinc-500">Start</span><strong className="mt-1 text-sm text-amber-200">{formatDay(tournament.starts_at)}</strong></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black tracking-[.14em] ${statusMeta[tournament.status][1]}`}>{statusMeta[tournament.status][0]}</span><div className="flex items-center gap-2 text-zinc-500">{tournament.requires_access_code && <KeyRound size={15} className="text-violet-300" />}{tournament.premium_only && <Crown size={15} className="text-amber-300" />}</div></div><h3 className="mt-4 truncate text-2xl font-black tracking-[-.04em] text-white">{tournament.title}</h3><p className="mt-2 min-h-10 text-sm leading-5 text-zinc-400">{tournament.description || 'Alle Informationen zum Spielplan folgen im Turnierbereich.'}</p></div></div>
    <div className="relative mt-5 flex flex-wrap gap-2"><Pill>{platformMeta[tournament.scoring_platform]}</Pill><Pill>{formatMeta[tournament.tournament_format]}</Pill>{tournament.prize_title && <Pill accent>{tournament.prize_title}</Pill>}</div>
    <div className="relative mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-white/10 py-4 text-xs text-zinc-400 sm:grid-cols-4"><Meta icon={<CalendarDays />} text={formatDate(tournament.starts_at)} /><Meta icon={<Users />} text={`${tournament.participant_count}/${tournament.max_players}${tournament.waitlist_count ? ` · +${tournament.waitlist_count}` : ''}`} /><Meta icon={<Swords />} text={`Best of ${tournament.best_of}`} /><Meta icon={<Gauge />} text={tournament.max_average ? `Bis ${tournament.max_average} AVG` : 'Offen für alle'} /></div>
    <div className={`relative mt-4 flex gap-3 rounded-2xl border px-4 py-3 ${phase.tone}`}><Clock3 size={16} className="mt-0.5 shrink-0" /><div><p className="text-[10px] font-black uppercase tracking-[.14em]">{phase.label}</p><p className="mt-1 text-xs font-semibold opacity-85">{phase.detail}</p></div></div>
    {tournament.requires_access_code && canJoin && !hasPrize && <input value={code} onChange={event => onCodeChange(event.target.value)} placeholder="Community-Code" className="relative mt-4 w-full rounded-xl border border-violet-300/20 bg-black/20 px-3 py-3 text-xs font-bold uppercase tracking-[.1em] text-white outline-none placeholder:text-zinc-600 focus:border-violet-200" />}
    <div className="relative mt-5 flex flex-wrap gap-2"><Link href={`/tournaments/${tournament.id}`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/[.035] px-3 py-3 text-xs font-bold text-zinc-100 transition hover:border-white/25 hover:bg-white/[.07]">Details <ChevronRight size={14} /></Link>{canJoin && (hasPrize ? <Link href={`/tournaments/${tournament.id}`} className="inline-flex flex-1 items-center justify-center rounded-xl bg-amber-300 px-3 py-3 text-xs font-black text-[#18211c] transition hover:bg-amber-200">Details &amp; anmelden</Link> : <button type="button" disabled={pending === `join:${tournament.id}`} onClick={() => void onAction(tournament, 'join')} className="flex-1 rounded-xl bg-amber-300 px-3 py-3 text-xs font-black text-[#18211c] transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60">{full ? 'Warteliste' : 'Teilnehmen'}</button>)}{tournament.participant_status === 'waitlisted' && <span className="flex-1 rounded-xl border border-violet-300/20 bg-violet-300/[.08] px-3 py-3 text-center text-xs font-black text-violet-100"><ListOrdered size={14} className="mr-1 inline" /> Warteliste</span>}{tournament.participant_status === 'registered' && checkInOpen && <button type="button" disabled={pending === `checkin:${tournament.id}`} onClick={() => void onAction(tournament, 'checkin')} className="flex-1 rounded-xl bg-emerald-300 px-3 py-3 text-xs font-black text-[#112019] transition hover:bg-emerald-200 disabled:opacity-60">JETZT CHECK-IN</button>}{tournament.checked_in && <span className="flex-1 rounded-xl border border-emerald-300/20 bg-emerald-300/[.08] px-3 py-3 text-center text-xs font-black text-emerald-100"><CheckCircle2 size={14} className="mr-1 inline" /> Eingecheckt</span>}{locked && <Link href="/premium" className="flex-1 rounded-xl border border-amber-300/25 bg-amber-300/[.08] px-3 py-3 text-center text-xs font-black text-amber-100 transition hover:bg-amber-300/[.14]"><Lock size={13} className="mr-1 inline" /> Premium holen</Link>}</div>
    {tournament.joined && tournament.status === 'registration' && !tournament.checked_in && <button type="button" onClick={() => void onAction(tournament, 'leave')} className="relative mt-3 text-[10px] font-bold text-zinc-600 transition hover:text-rose-200">Teilnahme zurückziehen</button>}
  </article>;
}

function HeroStat({ icon, value, label, accent = 'emerald' }: { icon: ReactNode; value: number; label: string; accent?: 'emerald' | 'rose' }) { return <div className="min-w-0 border-r border-white/10 px-4 py-5 last:border-r-0"><span className={accent === 'rose' ? 'text-rose-200 [&>svg]:h-4 [&>svg]:w-4' : 'text-emerald-200 [&>svg]:h-4 [&>svg]:w-4'}>{icon}</span><b className="mt-4 block truncate text-2xl tracking-[-.05em]">{value}</b><span className="mt-1 block text-[9px] font-black uppercase tracking-[.12em] text-zinc-500">{label}</span></div>; }
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button type="button" onClick={onClick} className={`rounded-lg px-3 py-2 text-[10px] font-black tracking-[.08em] transition ${active ? 'bg-amber-300 text-[#18211c]' : 'text-zinc-400 hover:text-white'}`}>{children}</button>; }
function Pill({ children, accent = false }: { children: ReactNode; accent?: boolean }) { return <span className={`rounded-full border px-3 py-1.5 text-[10px] font-bold ${accent ? 'border-amber-300/25 bg-amber-300/[.08] text-amber-100' : 'border-white/10 bg-white/[.035] text-zinc-300'}`}>{children}</span>; }
function Meta({ icon, text }: { icon: ReactNode; text: string }) { return <div className="flex min-w-0 items-start gap-2 leading-4"><span className="mt-0.5 shrink-0 text-emerald-300 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span><span className="min-w-0">{text}</span></div>; }
