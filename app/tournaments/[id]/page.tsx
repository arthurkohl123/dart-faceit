'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3, Crown, ShieldAlert, Sparkles, Swords, TicketCheck, Trophy, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { NotificationBell } from '@/components/notification-bell';
import { RankBadge } from '@/components/RankBadge';

type TournamentFormat = 'single_elimination' | 'double_elimination' | 'group_stage';
type ScoringPlatform = 'scolia' | 'dartcounter';
type Tournament = {
  id: string; title: string; description: string; starts_at: string; registration_closes_at: string;
  max_players: number; best_of: number; premium_only: boolean; max_average: number | null; min_average: number | null;
  status: 'registration' | 'live' | 'completed' | 'cancelled'; winner_id: string | null; participant_count: number;
  joined: boolean; winner_username: string | null; scoring_platform: ScoringPlatform; requires_access_code: boolean;
  tournament_format: TournamentFormat; check_in_opens_at: string; check_in_closes_at: string; prize_title: string | null;
  prize_details: string | null; dispute_policy: string; cancellation_reason: string | null; waitlist_count: number;
  participant_status: string | null; checked_in: boolean; checked_in_count: number;
};
type TournamentMatch = {
  id: string; round_number: number; match_number: number; player1_id: string | null; player2_id: string | null;
  player1_username: string | null; player2_username: string | null; winner_id: string | null; winner_username: string | null;
  status: 'scheduled' | 'ready' | 'completed'; bracket_stage: string; active_match_id: string | null;
  player1_legs: number | null; player2_legs: number | null; player1_average: number | null; player2_average: number | null;
  player1_losses?: number; player2_losses?: number;
};
type Standing = { rank: number; group_number: number; user_id: string; username: string; wins: number; losses: number; points: number; average: number | null };
type TournamentParticipantLoss = { user_id: string; losses: number | null };
type Notice = { kind: 'success' | 'error'; text: string };

const formatMeta: Record<TournamentFormat, string> = { single_elimination: 'Single Elimination', double_elimination: 'Double Elimination', group_stage: 'Gruppenphase' };
const formatDate = (value: string) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export default function TournamentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'join' | 'checkin' | 'leave' | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const loadTournament = useCallback(async () => {
    setError(null);
    const [tournamentResult, bracketResult, standingsResult, participantResult] = await Promise.all([
      supabase.rpc('list_tournaments'),
      supabase.rpc('get_tournament_bracket', { p_tournament_id: params.id }),
      supabase.rpc('get_tournament_standings', { p_tournament_id: params.id }),
      supabase.from('tournament_participants').select('user_id, losses').eq('tournament_id', params.id),
    ]);
    if (tournamentResult.error || bracketResult.error || standingsResult.error) {
      setError('Der Turnierplan konnte gerade nicht geladen werden. Bitte versuche es gleich noch einmal.');
      return;
    }
    const nextTournament = ((tournamentResult.data ?? []) as Tournament[]).find(item => item.id === params.id) ?? null;
    const lossesByUser = new Map(((participantResult.data ?? []) as TournamentParticipantLoss[]).map(participant => [participant.user_id, Number(participant.losses ?? 0)]));
    const nextMatches = ((bracketResult.data ?? []) as TournamentMatch[]).map(match => ({
      ...match,
      bracket_stage: match.bracket_stage || 'double',
      player1_losses: match.player1_id ? lossesByUser.get(match.player1_id) ?? 0 : 0,
      player2_losses: match.player2_id ? lossesByUser.get(match.player2_id) ?? 0 : 0,
    }));
    setTournament(nextTournament);
    setMatches(nextMatches);
    setStandings((standingsResult.data ?? []) as Standing[]);
  }, [params.id, supabase]);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace(`/auth/login?redirectTo=${encodeURIComponent(`/tournaments/${params.id}`)}`); return; }
      setUserId(user.id);
      const [premiumResult] = await Promise.all([
        fetch('/api/premium-status', { cache: 'no-store' })
          .then(async (response) => response.ok ? await response.json() as { premium?: { isPremium?: boolean | null } | null } : null)
          .catch(() => null),
        loadTournament(),
      ]);
      setIsPremium(Boolean(premiumResult?.premium?.isPremium));
      setLoading(false);
    })();
  }, [loadTournament, params.id, router, supabase]);

  useEffect(() => {
    const tick = () => setCurrentTime(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!tournament) return;
    const interval = window.setInterval(() => void loadTournament(), tournament.status === 'live' ? 12_000 : 30_000);
    const refreshOnFocus = () => { if (document.visibilityState === 'visible') void loadTournament(); };
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', refreshOnFocus); };
  }, [loadTournament, tournament]);

  async function runRegistrationAction(action: 'join' | 'checkin' | 'leave') {
    if (!tournament) return;
    setPendingAction(action);
    setNotice(null);
    const result = action === 'join'
      ? await supabase.rpc('join_tournament', { p_tournament_id: tournament.id, p_access_code: accessCode.trim().toUpperCase() || null })
      : action === 'checkin'
        ? await supabase.rpc('check_in_tournament', { p_tournament_id: tournament.id })
        : await supabase.rpc('leave_tournament', { p_tournament_id: tournament.id });
    setPendingAction(null);
    if (result.error) {
      setNotice({ kind: 'error', text: result.error.message });
      return;
    }
    const text = action === 'join' && result.data === 'waitlisted'
      ? 'Du stehst auf der Warteliste und rückst automatisch nach.'
      : action === 'join'
        ? 'Startplatz reserviert. Den Check-in nicht vergessen.'
        : action === 'checkin'
          ? 'Check-in bestätigt – dein Platz ist sicher.'
          : 'Du wurdest vom Turnier abgemeldet.';
    setNotice({ kind: 'success', text });
    await loadTournament();
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#07080c] text-zinc-400">Turnierplan wird geladen …</main>;
  if (!tournament) return <main className="grid min-h-screen place-items-center bg-[#07080c] px-5 text-center text-zinc-400"><div><p>{error || 'Dieses Turnier wurde nicht gefunden.'}</p><Link href="/tournaments" className="mt-5 inline-flex items-center gap-2 border border-white/15 px-4 py-3 text-sm font-bold text-white"><ArrowLeft size={16} /> Zur Turnierübersicht</Link></div></main>;

  return <main className="sport-grid min-h-screen bg-[#0a0d0d] text-white">
    <nav className="mx-auto flex max-w-7xl items-center justify-between border-b border-white/10 px-5 py-5 md:px-8"><Link href="/tournaments" className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-white"><ArrowLeft size={16} /> Turnierübersicht</Link><div className="flex items-center gap-3"><NotificationBell /><Link href="/premium" className="border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-black text-amber-200"><Crown size={14} className="mr-1 inline" /> PREMIUM</Link></div></nav>
    <section className="mx-auto max-w-7xl px-5 pb-10 pt-12 md:px-8 md:pt-16"><div className="grid gap-8 lg:grid-cols-[1fr_auto]"><div><div className="inline-flex items-center gap-2 border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black tracking-[.18em] text-amber-200"><Sparkles size={13} /> {formatMeta[tournament.tournament_format].toUpperCase()}</div><h1 className="mt-5 text-4xl font-black tracking-[-.05em] sm:text-6xl">{tournament.title}</h1><p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">{tournament.description || 'Alle Paarungen, Ergebnisse und der aktuelle Stand auf einen Blick.'}</p><TournamentAction tournament={tournament} isPremium={isPremium} currentTime={currentTime} pendingAction={pendingAction} accessCode={accessCode} notice={notice} setAccessCode={setAccessCode} setNotice={setNotice} onAction={runRegistrationAction} /></div><div className="grid grid-cols-2 gap-px self-start border border-white/10 bg-white/10 sm:grid-cols-4"><Metric icon={<Users size={17} />} value={`${tournament.checked_in_count}/${tournament.max_players}`} label="Eingecheckt" /><Metric icon={<Swords size={17} />} value={`Bo ${tournament.best_of}`} label="Format" /><Metric icon={<CalendarDays size={17} />} value={formatDate(tournament.starts_at).split(',')[0]} label="Start" /><Metric icon={<Trophy size={17} />} value={tournament.winner_username || '—'} label="Champion" /></div></div></section>
    <section className="mx-auto max-w-7xl px-5 pb-16 md:px-8"><div className="grid gap-4 border-y border-white/10 py-5 md:grid-cols-3"><InfoCard icon={<TicketCheck size={18} />} title="Check-in" body={`${formatDate(tournament.check_in_opens_at)} bis ${formatDate(tournament.check_in_closes_at)}`} /><InfoCard icon={<Trophy size={18} />} title="Preis" body={tournament.prize_title ? `${tournament.prize_title}${tournament.prize_details ? ` · ${tournament.prize_details}` : ''}` : 'Noch kein Preis hinterlegt'} /><InfoCard icon={<ShieldAlert size={18} />} title="Streitfälle & Verbindung" body={tournament.dispute_policy} /></div>
      {tournament.status === 'cancelled' && <div className="mt-6 border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100"><b>Turnier abgesagt:</b> {tournament.cancellation_reason}</div>}
      <div className="mt-8">{tournament.tournament_format === 'group_stage' ? <GroupStage tournament={tournament} matches={matches} standings={standings} userId={userId} /> : <KnockoutBracket tournament={tournament} matches={matches} userId={userId} />}</div>
    </section>
  </main>;
}

function TournamentAction({
  tournament,
  isPremium,
  currentTime,
  pendingAction,
  accessCode,
  notice,
  setAccessCode,
  setNotice,
  onAction,
}: {
  tournament: Tournament;
  isPremium: boolean;
  currentTime: number;
  pendingAction: 'join' | 'checkin' | 'leave' | null;
  accessCode: string;
  notice: Notice | null;
  setAccessCode: (value: string) => void;
  setNotice: (value: Notice | null) => void;
  onAction: (action: 'join' | 'checkin' | 'leave') => void;
}) {
  const registrationOpen = tournament.status === 'registration' && currentTime > 0 && currentTime <= new Date(tournament.registration_closes_at).getTime();
  const checkInOpen = tournament.status === 'registration' && currentTime > 0 && currentTime >= new Date(tournament.check_in_opens_at).getTime() && currentTime <= new Date(tournament.check_in_closes_at).getTime();
  const lockedPremium = tournament.premium_only && !isPremium;
  const canJoin = registrationOpen && !tournament.joined && !lockedPremium;
  const isWaitlisted = tournament.participant_status === 'waitlisted';
  const isRegistered = tournament.participant_status === 'registered';
  const isCheckedIn = tournament.checked_in || tournament.participant_status === 'checked_in';
  const isFull = Number(tournament.participant_count) >= tournament.max_players;
  const actionLabel = isFull ? 'Auf Warteliste' : 'Jetzt anmelden';

  return <div className="mt-7 max-w-2xl border border-amber-300/25 bg-amber-300/[.06] p-4 sm:p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[10px] font-black tracking-[.18em] text-amber-200">DEIN TURNIER-STATUS</p>
        <p className="mt-1 text-sm font-semibold text-zinc-200">
          {isCheckedIn ? 'Du bist eingecheckt – dein Platz ist sicher.' : isWaitlisted ? 'Du stehst auf der Warteliste.' : isRegistered ? 'Du bist angemeldet. Den Check-in nicht vergessen.' : lockedPremium ? 'Dieses Turnier ist exklusiv für Premium-Mitglieder.' : tournament.status === 'registration' ? 'Melde dich direkt hier für das Turnier an.' : 'Die Anmeldung ist geschlossen.'}
        </p>
      </div>
      {canJoin && <button type="button" disabled={pendingAction === 'join'} onClick={() => onAction('join')} className="inline-flex shrink-0 items-center justify-center border border-amber-200 bg-amber-300 px-5 py-3 text-xs font-black text-black transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60">{pendingAction === 'join' ? 'WIRD ANGEMELDET …' : actionLabel}</button>}
      {lockedPremium && <Link href="/premium" className="inline-flex shrink-0 items-center justify-center border border-amber-300/30 bg-amber-300/10 px-5 py-3 text-xs font-black text-amber-100 transition hover:bg-amber-300/20">PREMIUM FREISCHALTEN</Link>}
      {isRegistered && checkInOpen && <button type="button" disabled={pendingAction === 'checkin'} onClick={() => onAction('checkin')} className="inline-flex shrink-0 items-center justify-center border border-emerald-200 bg-emerald-300 px-5 py-3 text-xs font-black text-black transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60">{pendingAction === 'checkin' ? 'WIRD BESTÄTIGT …' : 'JETZT CHECK-IN'}</button>}
      {isCheckedIn && <span className="inline-flex shrink-0 items-center justify-center border border-emerald-300/30 bg-emerald-400/10 px-5 py-3 text-xs font-black text-emerald-100">EINGECHECKT</span>}
    </div>
    {canJoin && tournament.requires_access_code && <label className="mt-4 block"><span className="mb-2 block text-[10px] font-black tracking-[.14em] text-violet-200">COMMUNITY-CODE</span><input value={accessCode} onChange={event => setAccessCode(event.target.value.toUpperCase())} placeholder="Code eingeben" autoComplete="off" className="w-full border border-violet-300/25 bg-black/25 px-3 py-3 text-xs font-bold uppercase tracking-[.12em] text-white outline-none placeholder:text-zinc-600 focus:border-violet-200" /></label>}
    {tournament.premium_only && canJoin && <p className="mt-3 text-xs text-amber-100/70">Dieses Turnier ist exklusiv für Premium-Mitglieder.</p>}
    {tournament.joined && tournament.status === 'registration' && !isCheckedIn && <button type="button" disabled={pendingAction === 'leave'} onClick={() => onAction('leave')} className="mt-3 text-[10px] font-bold text-zinc-500 transition hover:text-red-300 disabled:opacity-60">{pendingAction === 'leave' ? 'WIRD ABGEMELDET …' : 'Teilnahme zurückziehen'}</button>}
    {notice && <div aria-live="polite" className={`mt-4 flex items-start justify-between gap-3 border px-3 py-3 text-xs ${notice.kind === 'success' ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-red-300/25 bg-red-500/10 text-red-100'}`}><span>{notice.text}</span><button type="button" onClick={() => setNotice(null)} aria-label="Hinweis schließen" className="text-base leading-none opacity-70 hover:opacity-100">×</button></div>}
  </div>;
}

function GroupStage({ tournament, matches, standings, userId }: { tournament: Tournament; matches: TournamentMatch[]; standings: Standing[]; userId: string | null }) {
  const currentMatch = matches.find(match => match.status === 'ready') ?? null;
  const completedMatches = matches.filter(match => match.status === 'completed');
  const scheduledMatches = matches.filter(match => match.status === 'scheduled');
  const groups = standings.reduce<Record<number, Standing[]>>((all, standing) => { (all[standing.group_number] ??= []).push(standing); return all; }, {});

  return <div className="space-y-8">
    <section className="overflow-hidden border border-amber-300/25 bg-[#0d1110]"><div className="flex flex-col justify-between gap-4 border-b border-white/10 bg-amber-300/[.06] p-5 sm:flex-row sm:items-center"><div><p className="text-[10px] font-black tracking-[.18em] text-amber-200">GRUPPENPHASE</p><h2 className="mt-1 text-2xl font-black">Tabelle & Spielplan</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Alle Paarungen sind ausgelost. Es ist immer nur ein Gruppenmatch gleichzeitig aktiv – das nächste Match wird erst nach dem bestätigten Ergebnis freigegeben.</p></div><div className="inline-flex w-fit items-center gap-2 border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-[10px] font-black tracking-[.12em] text-cyan-100"><Clock3 size={14} /> {currentMatch ? '1 MATCH AKTIV' : scheduledMatches.length ? 'NÄCHSTES MATCH WIRD VORBEREITET' : 'GRUPPENPHASE BEENDET'}</div></div>
      {standings.length === 0 ? <EmptyPlan /> : <div className="grid divide-y divide-white/10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,.9fr)] lg:divide-x lg:divide-y-0"><div className="p-5 sm:p-7"><p className="text-[10px] font-black tracking-[.16em] text-amber-300">AKTUELLE TABELLE</p>{Object.entries(groups).map(([groupNumber, members]) => <GroupTable key={groupNumber} groupNumber={Number(groupNumber)} members={members} />)}</div><div className="p-5 sm:p-7"><p className="text-[10px] font-black tracking-[.16em] text-amber-300">JETZT AN DER REIHE</p>{currentMatch ? <GroupMatchCard match={currentMatch} userId={userId} bestOf={tournament.best_of} featured /> : <div className="mt-4 border border-dashed border-white/15 p-6 text-sm leading-6 text-zinc-500">{scheduledMatches.length ? 'Das nächste Match wird nach der Ergebnisfreigabe automatisch geöffnet.' : 'Alle Gruppenmatches sind abgeschlossen.'}</div>}<div className="mt-5 grid grid-cols-3 gap-px border border-white/10 bg-white/10"><SmallMetric value={completedMatches.length} label="Beendet" /><SmallMetric value={scheduledMatches.length} label="Geplant" /><SmallMetric value={matches.length} label="Gesamt" /></div></div></div>}
    </section>
    <section className="grid gap-5 xl:grid-cols-2"><MatchList title="Beendete Matches" detail="Ergebnisse der Gruppenphase" matches={completedMatches} userId={userId} bestOf={tournament.best_of} /><MatchList title="Weitere Paarungen" detail="Diese Matchrooms werden nacheinander freigeschaltet" matches={scheduledMatches} userId={userId} bestOf={tournament.best_of} scheduled /></section>
  </div>;
}

function GroupTable({ groupNumber, members }: { groupNumber: number; members: Standing[] }) {
  return <div className="mt-5 overflow-x-auto border border-white/10"><table className="min-w-full text-left text-sm"><caption className="border-b border-white/10 bg-white/[.03] px-4 py-3 text-left text-[10px] font-black tracking-[.14em] text-zinc-300">{groupNumber === 1 ? 'GRUPPE' : `GRUPPE ${groupNumber}`}</caption><thead className="bg-black/20 text-[10px] font-black tracking-[.12em] text-zinc-500"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">SPIELER</th><th className="px-3 py-3 text-center">S</th><th className="px-3 py-3 text-center">N</th><th className="px-3 py-3 text-center">Ø</th><th className="px-4 py-3 text-right">PKT</th></tr></thead><tbody>{members.map(member => <tr key={member.user_id} className="border-t border-white/10 text-zinc-300"><td className="px-4 py-3 font-black text-amber-200">{member.rank}</td><td className="px-4 py-3 font-bold text-white">{member.username}</td><td className="px-3 py-3 text-center">{member.wins}</td><td className="px-3 py-3 text-center">{member.losses}</td><td className="px-3 py-3 text-center text-zinc-500">{member.average === null ? '—' : Number(member.average).toFixed(1)}</td><td className="px-4 py-3 text-right font-black text-amber-200">{member.points}</td></tr>)}</tbody></table></div>;
}

function MatchList({ title, detail, matches, userId, bestOf, scheduled = false }: { title: string; detail: string; matches: TournamentMatch[]; userId: string | null; bestOf: number; scheduled?: boolean }) {
  return <section className="border border-white/10 bg-[#0d1110]"><header className="flex items-center justify-between border-b border-white/10 p-5"><div><p className="text-[10px] font-black tracking-[.16em] text-amber-300">{title.toUpperCase()}</p><p className="mt-1 text-sm text-zinc-500">{detail}</p></div><span className="border border-white/10 px-2.5 py-1 text-xs font-black text-zinc-400">{matches.length}</span></header>{matches.length === 0 ? <div className="p-6 text-sm text-zinc-500">{scheduled ? 'Keine weiteren Paarungen offen.' : 'Noch kein Ergebnis vorhanden.'}</div> : <div className="grid gap-3 p-4 sm:grid-cols-2">{matches.map(match => <GroupMatchCard key={match.id} match={match} userId={userId} bestOf={bestOf} scheduled={scheduled} />)}</div>}</section>;
}

function GroupMatchCard({ match, userId, bestOf, featured = false, scheduled = false, mode = 'group' }: { match: TournamentMatch; userId: string | null; bestOf: number; featured?: boolean; scheduled?: boolean; mode?: 'group' | 'double' }) {
  const isMyMatch = Boolean(userId && (match.player1_id === userId || match.player2_id === userId));
  const isBye = match.status === 'completed' && Boolean(match.player1_id) && !match.player2_id;
  const statusLabel = isBye ? 'FREILOS' : match.status === 'completed' ? 'BEENDET' : match.status === 'ready' ? 'MATCHROOM BEREIT' : 'GEPLANT';
  const isReady = match.status === 'ready' && Boolean(match.active_match_id);
  return <article className={`border ${featured ? 'mt-4 border-cyan-300/30 bg-cyan-400/[.06] p-5' : 'border-white/10 bg-black/20 p-4'} ${scheduled ? 'opacity-75' : ''}`}><div className="mb-4 flex items-center justify-between gap-3"><span className={`text-[9px] font-black tracking-[.14em] ${isReady ? 'text-cyan-200' : isBye ? 'text-amber-200' : match.status === 'completed' ? 'text-emerald-200' : 'text-zinc-500'}`}>{statusLabel}</span><span className="text-[10px] font-bold text-zinc-600">MATCH {match.match_number}</span></div><MatchPlayer name={match.player1_username} legs={match.player1_legs} average={match.player1_average} won={match.winner_id === match.player1_id} /><MatchPlayer name={match.player2_username} emptyLabel={isBye ? 'Freilos' : undefined} legs={match.player2_legs} average={match.player2_average} won={match.winner_id === match.player2_id} />{isReady && isMyMatch && <Link href={`/result?matchId=${match.active_match_id}&bestOf=${bestOf}`} className="mt-4 flex items-center justify-center gap-1 bg-amber-300 px-4 py-3 text-xs font-black text-black">MATCHROOM ÖFFNEN <ChevronRight size={14} /></Link>}{isReady && !isMyMatch && <p className="mt-4 text-xs text-zinc-500">{mode === 'double' ? 'Diese Paarung ist aktuell aktiv.' : 'Dieses Gruppenmatch läuft gerade.'}</p>}{scheduled && <p className="mt-4 text-xs text-zinc-500">{mode === 'double' ? 'Wird nach Abschluss der aktuellen Matchwelle freigeschaltet.' : 'Wird nach dem aktuellen Ergebnis freigeschaltet.'}</p>}</article>;
}

function BracketMatchCard({ match, userId, bestOf, isFinal, showConnector, tree = false }: { match: TournamentMatch; userId: string | null; bestOf: number; isFinal: boolean; showConnector: boolean; tree?: boolean }) {
  const isMyMatch = Boolean(userId && (match.player1_id === userId || match.player2_id === userId));
  const isBye = match.status === 'completed' && Boolean(match.player1_id) && !match.player2_id;
  const isReady = match.status === 'ready' && Boolean(match.active_match_id);
  const statusLabel = isBye ? 'FREILOS' : match.status === 'completed' ? 'ENDE' : isReady ? 'LIVE' : 'OFFEN';

  return <article className={`relative min-w-0 overflow-visible border w-full ${tree ? '' : 'sm:w-[90%] landscape:w-[90%] lg:w-[82%]'} ${isFinal ? 'border-amber-300/35 bg-amber-300/[.06] shadow-[0_0_24px_rgba(252,211,77,.06)]' : isMyMatch ? 'border-cyan-300/40 bg-cyan-300/[.07]' : 'border-white/10 bg-[#121816]'}`}>
    <div className="flex min-w-0 items-center justify-between gap-1 border-b border-white/10 px-2 py-1"><span className={`truncate text-[8px] font-black tracking-[.12em] ${isBye ? 'text-amber-200' : match.status === 'completed' ? 'text-emerald-200' : isReady ? 'text-cyan-200' : 'text-zinc-500'}`}>{statusLabel}</span><span className="shrink-0 text-[8px] font-bold text-zinc-600">#{match.match_number}</span></div>
    <div className="px-2 py-1">
      <BracketPlayer name={match.player1_username} emptyLabel={isBye ? 'Freilos' : undefined} legs={match.player1_legs} average={match.player1_average} won={match.winner_id === match.player1_id} />
      <BracketPlayer name={match.player2_username} emptyLabel={isBye ? '—' : undefined} legs={match.player2_legs} average={match.player2_average} won={match.winner_id === match.player2_id} />
    </div>
    {isReady && isMyMatch && <Link href={`/result?matchId=${match.active_match_id}&bestOf=${bestOf}`} className="mx-1.5 mb-1.5 flex items-center justify-center gap-1 bg-amber-300 px-1 py-1 text-[8px] font-black text-black">ÖFFNEN <ChevronRight size={10} /></Link>}
    {showConnector && <span aria-hidden="true" className="pointer-events-none absolute -right-1 top-1/2 hidden h-px w-1 bg-white/20 sm:block landscape:block" />}
  </article>;
}

function BracketPlayer({ name, emptyLabel = 'Wird ermittelt', legs, average, won }: { name: string | null; emptyLabel?: string; legs: number | null; average: number | null; won: boolean }) {
  return <div className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 py-1.5 ${won ? 'text-emerald-100' : 'text-zinc-300'}`} title={name || emptyLabel}>
    <div className="min-w-0"><p className="truncate whitespace-nowrap text-[11px] font-semibold leading-tight sm:text-[12px]" title={name || emptyLabel}>{name || emptyLabel}</p>{average !== null && <p className="mt-0.5 text-[9px] font-normal leading-none text-zinc-500 sm:text-[10px]">Ø {Number(average).toFixed(1)}</p>}</div>
    <span className={`shrink-0 text-[12px] font-black sm:text-[13px] ${won ? 'text-emerald-200' : legs !== null ? 'text-white' : 'text-zinc-600'}`}>{legs ?? '—'}</span>
  </div>;
}

function KnockoutBracket({ tournament, matches, userId }: { tournament: Tournament; matches: TournamentMatch[]; userId: string | null }) {
  const rounds = matches.reduce<Record<number, TournamentMatch[]>>((all, match) => { (all[match.round_number] ??= []).push(match); return all; }, {});
  const sortedRounds = Object.entries(rounds).sort(([left], [right]) => Number(left) - Number(right));
  const firstRoundMatchCount = sortedRounds[0]?.[1].length ?? 1;
  const bracketRows = Math.max(1, firstRoundMatchCount * 2 - 1);
  const isClassicBracket = tournament.tournament_format === 'single_elimination';
  const bracketHeight = Math.max(232, bracketRows * 62 + 16);
  const bracketColumns = `repeat(${Math.max(1, sortedRounds.length)}, minmax(0, 1fr))`;
  const [mobileRoundIndex, setMobileRoundIndex] = useState(0);
  const activeMobileRoundIndex = Math.min(mobileRoundIndex, Math.max(0, sortedRounds.length - 1));
  const activeMobileRound = sortedRounds[activeMobileRoundIndex] ?? ['', [] as TournamentMatch[]];
  const activeMobileMatches = [...activeMobileRound[1]].sort((left, right) => left.match_number - right.match_number);

  return <section className="border border-white/10 bg-[#0d1110]">
    <header className="flex flex-col justify-between gap-3 border-b border-white/10 bg-white/[.02] p-5 sm:flex-row sm:items-end"><div><p className="text-[10px] font-black tracking-[.16em] text-amber-300">TURNIERPLAN</p><h2 className="mt-1 text-2xl font-black">Turnierbaum</h2><p className="mt-2 text-sm text-zinc-500">Alle Runden auf einen Blick – Ergebnisse und Averages stehen direkt am Match.</p></div><div className="flex flex-wrap items-center gap-2">{tournament.winner_username && <span className="bg-amber-300/10 px-3 py-2 text-sm font-black text-amber-100">Sieger: {tournament.winner_username}</span>}{isClassicBracket && <span className="border border-white/10 px-3 py-2 text-[10px] font-black tracking-[.12em] text-zinc-400">{sortedRounds.length} RUNDEN</span>}<span className="inline-flex items-center gap-1.5 border border-emerald-300/20 bg-emerald-300/[.06] px-2 py-1.5"><RankBadge level={1} size="xs" /><RankBadge level={5} size="xs" /><RankBadge level={10} size="xs" /><span className="hidden text-[9px] font-black tracking-[.12em] text-emerald-100 sm:inline">RANGSYSTEM</span></span></div></header>
    {matches.length === 0 ? <EmptyPlan /> : isClassicBracket ? <div className="p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3"><p className="text-[9px] font-black tracking-[.16em] text-zinc-500">KOMPAKTE ANSICHT</p><p className="text-[9px] text-zinc-600">Sieger werden farblich hervorgehoben</p></div>
      <div className="hidden gap-1 sm:grid sm:gap-2 landscape:grid landscape:gap-1" style={{ '--bracket-columns': bracketColumns, gridTemplateColumns: 'var(--bracket-columns)' } as CSSProperties}>{sortedRounds.map(([round, roundMatches], roundIndex) => <section key={round} className="min-w-0"><div className="mb-2 flex min-w-0 items-center justify-between gap-1"><p className="truncate text-[9px] font-black tracking-[.12em] text-zinc-400">RUNDE {round}</p><span className="shrink-0 text-[8px] font-bold text-zinc-600">{roundMatches.length}</span></div><div className="grid" style={{ height: `${bracketHeight}px`, gridTemplateRows: `repeat(${bracketRows}, minmax(0, 1fr))` }}>{[...roundMatches].sort((left, right) => left.match_number - right.match_number).map(match => <div key={match.id} className="relative min-w-0 self-center" style={{ gridRowStart: Math.min(bracketRows, (2 ** roundIndex) + (match.match_number - 1) * (2 ** (roundIndex + 1))) }}><BracketMatchCard match={match} userId={userId} bestOf={tournament.best_of} isFinal={roundIndex === sortedRounds.length - 1} showConnector={roundIndex < sortedRounds.length - 1} /></div>)}</div></section>)}</div>
      <div className="grid gap-3 landscape:hidden sm:hidden">
        <div className="flex items-center justify-between gap-2 border border-white/10 bg-white/[.025] p-2"><button type="button" aria-label="Vorherige Runde" disabled={activeMobileRoundIndex === 0} onClick={() => setMobileRoundIndex(index => Math.max(0, index - 1))} className="grid h-9 w-9 place-items-center border border-white/10 text-zinc-300 transition hover:border-amber-300/40 hover:text-amber-200 disabled:pointer-events-none disabled:opacity-25"><ChevronLeft size={16} /></button><div className="text-center"><p className="text-[10px] font-black tracking-[.14em] text-amber-200">RUNDE {activeMobileRound[0] || '—'}</p><p className="mt-0.5 text-[9px] text-zinc-600">{activeMobileMatches.length} MATCHES</p></div><button type="button" aria-label="Nächste Runde" disabled={activeMobileRoundIndex >= sortedRounds.length - 1} onClick={() => setMobileRoundIndex(index => Math.min(sortedRounds.length - 1, index + 1))} className="grid h-9 w-9 place-items-center border border-white/10 text-zinc-300 transition hover:border-amber-300/40 hover:text-amber-200 disabled:pointer-events-none disabled:opacity-25"><ChevronRight size={16} /></button></div>
        <div className="space-y-2">{activeMobileMatches.map(match => <BracketMatchCard key={match.id} match={match} userId={userId} bestOf={tournament.best_of} isFinal={activeMobileRoundIndex === sortedRounds.length - 1} showConnector={false} />)}</div>
      </div>
    </div> : tournament.tournament_format === 'double_elimination' ? <DoubleEliminationView tournament={tournament} matches={matches} userId={userId} /> : <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-3">{sortedRounds.map(([round, roundMatches]) => <section key={round}><p className="mb-3 text-[10px] font-black tracking-[.15em] text-zinc-400">RUNDE {round}</p><div className="space-y-3">{roundMatches.map(match => <GroupMatchCard key={match.id} match={match} userId={userId} bestOf={tournament.best_of} />)}</div></section>)}</div>}
  </section>;
}

function DoubleEliminationView({ tournament, matches, userId }: { tournament: Tournament; matches: TournamentMatch[]; userId: string | null }) {
  const rounds = matches.reduce<Record<number, TournamentMatch[]>>((all, match) => { (all[match.round_number] ??= []).push(match); return all; }, {});
  const sortedRounds = Object.entries(rounds).sort(([left], [right]) => Number(left) - Number(right));
  const pendingRoundEntry = sortedRounds.find(([, roundMatches]) => roundMatches.some(match => match.status !== 'completed'));
  const displayRoundEntry = pendingRoundEntry ?? sortedRounds[sortedRounds.length - 1];
  const activeRound = displayRoundEntry?.[0] ?? '—';
  const currentMatches = [...(pendingRoundEntry?.[1] ?? [])].sort((left, right) => left.match_number - right.match_number);
  const pendingMatches = matches.filter(match => match.status !== 'completed');
  const hasExplicitSplit = matches.some(match => match.bracket_stage === 'upper' || match.bracket_stage === 'lower');
  const upperMatches = hasExplicitSplit ? matches.filter(match => match.bracket_stage === 'upper' || match.bracket_stage === 'main') : [];
  const lowerMatches = hasExplicitSplit ? matches.filter(match => match.bracket_stage === 'lower') : [];
  const [selectedBracket, setSelectedBracket] = useState<'combined' | 'upper' | 'lower'>('combined');
  const completedMatches = matches.filter(match => match.status === 'completed');
  const scheduledMatches = matches.filter(match => match.status === 'scheduled' && String(match.round_number) !== activeRound);
  const liveMatches = currentMatches.filter(match => match.status === 'ready');

  return <div className="space-y-5 p-4 sm:p-6">
    <div className="grid gap-px border border-white/10 bg-white/10 sm:grid-cols-3">
      <DoubleMetric value={`Runde ${activeRound}`} label="Aktuelle Runde" />
      <DoubleMetric value={String(liveMatches.length)} label="Aktive Matchrooms" />
      <DoubleMetric value={`${completedMatches.length}/${matches.length}`} label="Matches verarbeitet" />
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,.7fr)]">
      <section className="overflow-hidden border border-cyan-300/20 bg-cyan-300/[.035]">
        <header className="flex flex-col justify-between gap-3 border-b border-cyan-300/15 p-5 sm:flex-row sm:items-end">
          <div><p className="text-[10px] font-black tracking-[.18em] text-cyan-200">TURNIERBAUM</p><h3 className="mt-1 text-xl font-black">Runde {activeRound}</h3><p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">{hasExplicitSplit ? 'Wähle den Upper- oder Lower-Bracket-Weg. Beide Bäume zeigen abgeschlossene und offene Matches an ihrer jeweiligen Position.' : 'Dieses Turnier wurde noch mit dem früheren gemeinsamen Double-Elimination-Baum erstellt. Alle Matches bleiben deshalb in einem vollständigen, chronologischen Baum sichtbar.'}</p></div>
          <span className="inline-flex w-fit items-center gap-2 border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-[10px] font-black tracking-[.12em] text-cyan-100"><Swords size={14} /> {pendingMatches.length} OFFENE MATCHES</span>
        </header>
        <div className="flex flex-wrap gap-2 border-b border-white/10 p-4">
          <BracketTab active={selectedBracket === 'combined'} onClick={() => setSelectedBracket('combined')} label="GESAMTER BAUM" count={matches.length} tone="combined" />
          {hasExplicitSplit && <><BracketTab active={selectedBracket === 'upper'} onClick={() => setSelectedBracket('upper')} label="UPPER BRACKET" count={upperMatches.length} tone="upper" /><BracketTab active={selectedBracket === 'lower'} onClick={() => setSelectedBracket('lower')} label="LOWER BRACKET" count={lowerMatches.length} tone="lower" /></>}
        </div>
        <DoubleBracketPane matches={matches} userId={userId} bestOf={tournament.best_of} bracket={selectedBracket} />
      </section>
      <aside className="border border-amber-300/20 bg-amber-300/[.045] p-5">
        <p className="text-[10px] font-black tracking-[.18em] text-amber-200">DOUBLE ELIMINATION</p>
        <h3 className="mt-2 text-xl font-black">Zwei Chancen. Ein Ziel.</h3>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Eine Niederlage beendet dein Turnier noch nicht. Erst nach der zweiten Niederlage scheidest du aus. {hasExplicitSplit ? 'Die neue Turnierstruktur trennt Upper und Lower sauber.' : 'Der vollständige Baum dieses älteren Turniers bleibt in einer Ansicht zusammengefasst.'}</p>
        <div className="mt-5 border-t border-white/10 pt-4"><div className="flex items-center justify-between text-xs"><span className="text-zinc-500">Ergebnisse</span><strong className="text-emerald-200">{completedMatches.length} beendet</strong></div><div className="mt-3 flex items-center justify-between text-xs"><span className="text-zinc-500">Nächste Welle</span><strong className="text-zinc-300">{scheduledMatches.length ? `${scheduledMatches.length} geplant` : 'wird vorbereitet'}</strong></div></div>
      </aside>
    </div>
  </div>;
}

function BracketTab({ active, onClick, label, count, tone }: { active: boolean; onClick: () => void; label: string; count: number; tone: 'combined' | 'upper' | 'lower' }) {
  const activeClass = tone === 'lower' ? 'border-amber-200/50 bg-amber-300/15 text-amber-100' : tone === 'upper' ? 'border-cyan-200/50 bg-cyan-300/15 text-cyan-100' : 'border-white/35 bg-white/10 text-white';
  return <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 border px-4 py-2.5 text-[10px] font-black tracking-[.14em] transition ${active ? activeClass : 'border-white/10 bg-black/15 text-zinc-500 hover:border-white/25 hover:text-zinc-300'}`}>{label}<span className="text-[9px] opacity-70">{count}</span></button>;
}

type DoubleBracketKind = 'upper' | 'lower' | 'final';
type ClassifiedDoubleMatch = { match: TournamentMatch; kind: DoubleBracketKind };
type DoubleBracketColumn = { key: string; label: string; matches: TournamentMatch[] };

function classifyDoubleEliminationMatches(matches: TournamentMatch[]): ClassifiedDoubleMatch[] {
  const losses = new Map<string, number>();
  const finalPairs = new Set<string>();
  const ordered = [...matches].sort((left, right) => left.round_number - right.round_number || left.match_number - right.match_number);

  return ordered.map(match => {
    const player1Losses = match.player1_id ? losses.get(match.player1_id) ?? 0 : 0;
    const player2Losses = match.player2_id ? losses.get(match.player2_id) ?? 0 : 0;
    const pairKey = match.player1_id && match.player2_id ? [match.player1_id, match.player2_id].sort().join(':') : '';
    const explicitStage = match.bracket_stage?.toLowerCase();
    const isGrandFinal = Boolean(pairKey && finalPairs.has(pairKey)) || ['final', 'grand_final', 'grand-final', 'reset'].includes(explicitStage ?? '') || (player1Losses === 0 && player2Losses === 1) || (player1Losses === 1 && player2Losses === 0);
    const kind: DoubleBracketKind = isGrandFinal ? 'final' : explicitStage === 'lower' || player1Losses > 0 || player2Losses > 0 ? 'lower' : 'upper';

    if (kind === 'final' && pairKey) finalPairs.add(pairKey);
    if (match.status === 'completed' && match.winner_id && match.player1_id && match.player2_id) {
      const loserId = match.winner_id === match.player1_id ? match.player2_id : match.player1_id;
      losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
    }
    return { match, kind };
  });
}

function buildDoubleBracketColumns(items: ClassifiedDoubleMatch[], kind: DoubleBracketKind): DoubleBracketColumn[] {
  if (kind === 'final') return items.map((item, index) => ({ key: item.match.id, label: index === 0 ? 'FINALE' : `FINALE ${index + 1}`, matches: [item.match] }));
  const grouped = new Map<number, TournamentMatch[]>();
  items.filter(item => item.kind === kind).forEach(item => { const matches = grouped.get(item.match.round_number) ?? []; matches.push(item.match); grouped.set(item.match.round_number, matches); });
  return [...grouped.entries()].sort(([left], [right]) => left - right).map(([round, roundMatches], index) => ({ key: `${kind}-${round}`, label: kind === 'upper' ? index === grouped.size - 1 ? 'UPPER-FINALE' : `UPPER RUNDE ${index + 1}` : `LOWER RUNDE ${index + 1}`, matches: roundMatches.sort((left, right) => left.match_number - right.match_number) }));
}

function DoubleBracketLane({ title, description, tone, columns, userId, bestOf }: { title: string; description: string; tone: 'upper' | 'lower'; columns: DoubleBracketColumn[]; userId: string | null; bestOf: number }) {
  const accent = tone === 'upper' ? 'border-cyan-300/25 bg-cyan-300/[.035]' : 'border-amber-300/25 bg-amber-300/[.035]';
  const label = tone === 'upper' ? 'text-cyan-200' : 'text-amber-200';
  return <section className={`overflow-hidden border ${accent}`}><header className="border-b border-white/10 px-4 py-3 sm:px-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><div><p className={`text-[10px] font-black tracking-[.18em] ${label}`}>{title}</p><p className="mt-1 text-xs text-zinc-500">{description}</p></div><span className="text-[9px] font-black tracking-[.12em] text-zinc-600">{columns.reduce((count, column) => count + column.matches.length, 0)} MATCHES</span></div></header><div className="overflow-x-auto"><div className="flex min-w-max items-stretch gap-3 p-4 sm:gap-5 sm:p-5">{columns.map((column, columnIndex) => <div key={column.key} className="contents"><div className="flex w-[224px] shrink-0 flex-col"><div className={`mb-2 flex min-h-8 items-center justify-between border-b border-white/10 pb-2 text-[9px] font-black tracking-[.12em] ${label}`}><span>{column.label}</span><span className="text-zinc-600">{column.matches.length}</span></div><div className="flex min-h-[230px] flex-1 flex-col justify-around gap-3">{column.matches.map(match => <BracketMatchCard key={match.id} match={match} userId={userId} bestOf={bestOf} isFinal={false} showConnector={false} tree />)}</div></div>{columnIndex < columns.length - 1 && <div aria-hidden="true" className={`mt-[8.5rem] shrink-0 text-xl ${label}`}>›</div>}</div>)}{columns.length === 0 && <p className="py-8 text-sm text-zinc-500">Noch keine Matches in diesem Bereich.</p>}</div></div></section>;
}

function DoubleBracketFinale({ columns, userId, bestOf }: { columns: DoubleBracketColumn[]; userId: string | null; bestOf: number }) {
  const finalMatch = columns.flatMap(column => column.matches).at(-1) ?? null;
  return <section className="border border-violet-300/30 bg-violet-300/[.045] p-4 sm:p-5"><header><p className="text-[10px] font-black tracking-[.18em] text-violet-200">FINALE</p><p className="mt-1 text-xs leading-5 text-zinc-500">Upper-Bracket-Finalist gegen Lower-Bracket-Finalist.</p></header><div className="mt-4">{finalMatch ? <BracketMatchCard match={finalMatch} userId={userId} bestOf={bestOf} isFinal showConnector={false} tree /> : <div className="space-y-2 border border-dashed border-violet-300/25 p-4 text-xs text-zinc-500"><p><span className="text-cyan-200">Upper-Bracket-Finalist</span> wartet</p><p><span className="text-amber-200">Lower-Bracket-Finalist</span> wartet</p></div>}</div></section>;
}

function DoubleBracketPane({ matches, userId, bestOf, bracket }: { matches: TournamentMatch[]; userId: string | null; bestOf: number; bracket: 'combined' | 'upper' | 'lower' }) {
  if (matches.length === 0) return <div className="p-8 text-center"><p className="text-sm font-bold text-zinc-300">Noch keine Paarungen vorhanden</p><p className="mt-2 text-xs leading-5 text-zinc-500">Sobald eine Paarung freigeschaltet wird, erscheint sie hier in der passenden Runde.</p></div>;
  const classified = classifyDoubleEliminationMatches(matches);
  const upperColumns = buildDoubleBracketColumns(classified, 'upper');
  const lowerColumns = buildDoubleBracketColumns(classified, 'lower');
  const finalColumns = buildDoubleBracketColumns(classified, 'final');
  const showUpper = bracket === 'combined' || bracket === 'upper';
  const showLower = bracket === 'combined' || bracket === 'lower';
  const showFinal = bracket === 'combined' || bracket === 'lower';
  if (bracket === 'combined') return <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_290px]"><div className="space-y-4"><DoubleBracketLane title="UPPER BRACKET" description="Alle Spieler starten hier. Eine Niederlage führt ins Lower Bracket." tone="upper" columns={upperColumns} userId={userId} bestOf={bestOf} /><div className="flex items-center justify-center gap-3 py-1 text-[9px] font-black tracking-[.15em] text-zinc-600"><span className="h-px w-16 bg-white/10" />NIEDERLAGE → LOWER BRACKET<span className="h-px w-16 bg-white/10" /></div><DoubleBracketLane title="LOWER BRACKET" description="Hier kämpfen sich Spieler mit einer Niederlage zurück ins Turnier." tone="lower" columns={lowerColumns} userId={userId} bestOf={bestOf} /></div><DoubleBracketFinale columns={finalColumns} userId={userId} bestOf={bestOf} /></div>;
  return <div className="space-y-4 p-4 sm:space-y-5 sm:p-5">{showUpper && <DoubleBracketLane title="UPPER BRACKET" description="Alle Spieler starten hier. Eine Niederlage führt ins Lower Bracket." tone="upper" columns={upperColumns} userId={userId} bestOf={bestOf} />}{showLower && <DoubleBracketLane title="LOWER BRACKET" description="Hier kämpfen sich Spieler mit einer Niederlage zurück ins Turnier." tone="lower" columns={lowerColumns} userId={userId} bestOf={bestOf} />}{showFinal && <DoubleBracketFinale columns={finalColumns} userId={userId} bestOf={bestOf} />}</div>;
}

function DoubleMetric({ value, label }: { value: string; label: string }) {
  return <div className="bg-[#0d1110] p-4"><b className="block truncate text-lg text-white">{value}</b><span className="mt-1 block text-[9px] font-black tracking-[.1em] text-zinc-500">{label}</span></div>;
}

function EmptyPlan() { return <div className="grid min-h-48 place-items-center p-8 text-center text-sm text-zinc-500"><div><Clock3 className="mx-auto mb-3 text-zinc-600" /><p>Der Turnierplan wird nach dem verpflichtenden Check-in ausgelost.</p></div></div>; }
function MatchPlayer({ name, legs, average, won, emptyLabel = 'Wird ermittelt' }: { name: string | null; legs: number | null; average: number | null; won: boolean; emptyLabel?: string }) { return <div className={`flex items-center justify-between gap-3 border-b border-white/10 py-2.5 last:border-b-0 ${won ? 'text-emerald-100' : 'text-zinc-300'}`}><span className="min-w-0 truncate font-semibold">{name || emptyLabel}{average !== null && <span className="ml-1.5 text-[10px] text-zinc-500">Ø {Number(average).toFixed(1)}</span>}</span>{legs !== null && <strong className={won ? 'text-emerald-200' : 'text-white'}>{legs}</strong>}</div>; }
function Metric({ icon, value, label }: { icon: ReactNode; value: string; label: string }) { return <div className="min-w-28 bg-[#0d1110] p-4"><span className="text-amber-300">{icon}</span><b className="mt-4 block truncate text-lg">{value}</b><span className="text-[9px] font-black tracking-[.1em] text-zinc-500">{label}</span></div>; }
function SmallMetric({ value, label }: { value: number; label: string }) { return <div className="bg-[#0d1110] p-3 text-center"><b className="block text-lg text-white">{value}</b><span className="text-[9px] font-black tracking-[.11em] text-zinc-500">{label}</span></div>; }
function InfoCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) { return <div className="flex gap-3 bg-white/[.025] p-4"><span className="mt-0.5 text-amber-300">{icon}</span><div><p className="text-[10px] font-black tracking-[.12em] text-zinc-300">{title.toUpperCase()}</p><p className="mt-1 text-sm leading-6 text-zinc-400">{body}</p></div></div>; }
