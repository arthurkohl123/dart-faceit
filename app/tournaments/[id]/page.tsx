'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, ChevronRight, Clock3, Crown, ShieldAlert, Sparkles, Swords, TicketCheck, Trophy, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { NotificationBell } from '@/components/notification-bell';

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
};
type Standing = { rank: number; group_number: number; user_id: string; username: string; wins: number; losses: number; points: number; average: number | null };

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTournament = useCallback(async () => {
    const [tournamentResult, bracketResult, standingsResult] = await Promise.all([
      supabase.rpc('list_tournaments'),
      supabase.rpc('get_tournament_bracket', { p_tournament_id: params.id }),
      supabase.rpc('get_tournament_standings', { p_tournament_id: params.id }),
    ]);
    if (tournamentResult.error || bracketResult.error || standingsResult.error) {
      setError('Der Turnierplan konnte gerade nicht geladen werden. Bitte versuche es gleich noch einmal.');
      return;
    }
    const nextTournament = ((tournamentResult.data ?? []) as Tournament[]).find(item => item.id === params.id) ?? null;
    setTournament(nextTournament);
    setMatches((bracketResult.data ?? []) as TournamentMatch[]);
    setStandings((standingsResult.data ?? []) as Standing[]);
  }, [params.id, supabase]);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/auth/login'); return; }
      setUserId(user.id);
      await loadTournament();
      setLoading(false);
    })();
  }, [loadTournament, router, supabase]);

  useEffect(() => {
    if (!tournament) return;
    const interval = window.setInterval(() => void loadTournament(), tournament.status === 'live' ? 12_000 : 30_000);
    const refreshOnFocus = () => { if (document.visibilityState === 'visible') void loadTournament(); };
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', refreshOnFocus); };
  }, [loadTournament, tournament]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#07080c] text-zinc-400">Turnierplan wird geladen …</main>;
  if (!tournament) return <main className="grid min-h-screen place-items-center bg-[#07080c] px-5 text-center text-zinc-400"><div><p>{error || 'Dieses Turnier wurde nicht gefunden.'}</p><Link href="/tournaments" className="mt-5 inline-flex items-center gap-2 border border-white/15 px-4 py-3 text-sm font-bold text-white"><ArrowLeft size={16} /> Zur Turnierübersicht</Link></div></main>;

  return <main className="sport-grid min-h-screen bg-[#0a0d0d] text-white">
    <nav className="mx-auto flex max-w-7xl items-center justify-between border-b border-white/10 px-5 py-5 md:px-8"><Link href="/tournaments" className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-white"><ArrowLeft size={16} /> Turnierübersicht</Link><div className="flex items-center gap-3"><NotificationBell /><Link href="/premium" className="border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-black text-amber-200"><Crown size={14} className="mr-1 inline" /> PREMIUM</Link></div></nav>
    <section className="mx-auto max-w-7xl px-5 pb-10 pt-12 md:px-8 md:pt-16"><div className="grid gap-8 lg:grid-cols-[1fr_auto]"><div><div className="inline-flex items-center gap-2 border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black tracking-[.18em] text-amber-200"><Sparkles size={13} /> {formatMeta[tournament.tournament_format].toUpperCase()}</div><h1 className="mt-5 text-4xl font-black tracking-[-.05em] sm:text-6xl">{tournament.title}</h1><p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">{tournament.description || 'Alle Paarungen, Ergebnisse und der aktuelle Stand auf einen Blick.'}</p></div><div className="grid grid-cols-2 gap-px self-start border border-white/10 bg-white/10 sm:grid-cols-4"><Metric icon={<Users size={17} />} value={`${tournament.checked_in_count}/${tournament.max_players}`} label="Eingecheckt" /><Metric icon={<Swords size={17} />} value={`Bo ${tournament.best_of}`} label="Format" /><Metric icon={<CalendarDays size={17} />} value={formatDate(tournament.starts_at).split(',')[0]} label="Start" /><Metric icon={<Trophy size={17} />} value={tournament.winner_username || '—'} label="Champion" /></div></div></section>
    <section className="mx-auto max-w-7xl px-5 pb-16 md:px-8"><div className="grid gap-4 border-y border-white/10 py-5 md:grid-cols-3"><InfoCard icon={<TicketCheck size={18} />} title="Check-in" body={`${formatDate(tournament.check_in_opens_at)} bis ${formatDate(tournament.check_in_closes_at)}`} /><InfoCard icon={<Trophy size={18} />} title="Preis" body={tournament.prize_title ? `${tournament.prize_title}${tournament.prize_details ? ` · ${tournament.prize_details}` : ''}` : 'Noch kein Preis hinterlegt'} /><InfoCard icon={<ShieldAlert size={18} />} title="Streitfälle & Verbindung" body={tournament.dispute_policy} /></div>
      {tournament.status === 'cancelled' && <div className="mt-6 border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100"><b>Turnier abgesagt:</b> {tournament.cancellation_reason}</div>}
      <div className="mt-8">{tournament.tournament_format === 'group_stage' ? <GroupStage tournament={tournament} matches={matches} standings={standings} userId={userId} /> : <KnockoutBracket tournament={tournament} matches={matches} userId={userId} />}</div>
    </section>
  </main>;
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

function GroupMatchCard({ match, userId, bestOf, featured = false, scheduled = false }: { match: TournamentMatch; userId: string | null; bestOf: number; featured?: boolean; scheduled?: boolean }) {
  const isMyMatch = Boolean(userId && (match.player1_id === userId || match.player2_id === userId));
  const isBye = match.status === 'completed' && Boolean(match.player1_id) && !match.player2_id;
  const statusLabel = isBye ? 'FREILOS' : match.status === 'completed' ? 'BEENDET' : match.status === 'ready' ? 'MATCHROOM BEREIT' : 'GEPLANT';
  const isReady = match.status === 'ready' && Boolean(match.active_match_id);
  return <article className={`border ${featured ? 'mt-4 border-cyan-300/30 bg-cyan-400/[.06] p-5' : 'border-white/10 bg-black/20 p-4'} ${scheduled ? 'opacity-75' : ''}`}><div className="mb-4 flex items-center justify-between gap-3"><span className={`text-[9px] font-black tracking-[.14em] ${isReady ? 'text-cyan-200' : isBye ? 'text-amber-200' : match.status === 'completed' ? 'text-emerald-200' : 'text-zinc-500'}`}>{statusLabel}</span><span className="text-[10px] font-bold text-zinc-600">MATCH {match.match_number}</span></div><MatchPlayer name={match.player1_username} legs={match.player1_legs} average={match.player1_average} won={match.winner_id === match.player1_id} /><MatchPlayer name={match.player2_username} emptyLabel={isBye ? 'Freilos' : undefined} legs={match.player2_legs} average={match.player2_average} won={match.winner_id === match.player2_id} />{isReady && isMyMatch && <Link href={`/result?matchId=${match.active_match_id}&bestOf=${bestOf}`} className="mt-4 flex items-center justify-center gap-1 bg-amber-300 px-4 py-3 text-xs font-black text-black">MATCHROOM ÖFFNEN <ChevronRight size={14} /></Link>}{isReady && !isMyMatch && <p className="mt-4 text-xs text-zinc-500">Dieses Gruppenmatch läuft gerade.</p>}{scheduled && <p className="mt-4 text-xs text-zinc-500">Wird nach dem aktuellen Ergebnis freigeschaltet.</p>}</article>;
}

function KnockoutBracket({ tournament, matches, userId }: { tournament: Tournament; matches: TournamentMatch[]; userId: string | null }) {
  const rounds = matches.reduce<Record<number, TournamentMatch[]>>((all, match) => { (all[match.round_number] ??= []).push(match); return all; }, {});
  const sortedRounds = Object.entries(rounds).sort(([left], [right]) => Number(left) - Number(right));
  const firstRoundMatchCount = sortedRounds[0]?.[1].length ?? 1;
  const bracketRows = Math.max(1, firstRoundMatchCount * 2 - 1);
  const isClassicBracket = tournament.tournament_format === 'single_elimination';
  return <section className="border border-white/10 bg-[#0d1110]"><header className="flex flex-col justify-between gap-2 border-b border-white/10 p-5 sm:flex-row sm:items-end"><div><p className="text-[10px] font-black tracking-[.16em] text-amber-300">TURNIERPLAN</p><h2 className="mt-1 text-2xl font-black">Der Weg zum Pokal</h2><p className="mt-2 text-sm text-zinc-500">Freilose werden über den Baum verteilt, damit sie möglichst gegen Sieger der ersten Runde spielen.</p></div>{tournament.winner_username && <span className="w-fit bg-amber-300/10 px-3 py-2 text-sm font-black text-amber-100">Champion: {tournament.winner_username}</span>}</header>{matches.length === 0 ? <EmptyPlan /> : isClassicBracket ? <div className="overflow-x-auto"><div className="flex min-w-max gap-8 p-5">{sortedRounds.map(([round, roundMatches], roundIndex) => <section key={round} className="w-72 shrink-0"><p className="mb-4 text-[10px] font-black tracking-[.15em] text-zinc-400">RUNDE {round}</p><div className="grid" style={{ height: `${bracketRows * 76}px`, gridTemplateRows: `repeat(${bracketRows}, minmax(0, 1fr))` }}>{[...roundMatches].sort((left, right) => left.match_number - right.match_number).map(match => <div key={match.id} className="self-center" style={{ gridRowStart: Math.min(bracketRows, (2 ** roundIndex) + (match.match_number - 1) * (2 ** (roundIndex + 1))) }}><GroupMatchCard match={match} userId={userId} bestOf={tournament.best_of} /></div>)}</div></section>)}</div></div> : <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-3">{sortedRounds.map(([round, roundMatches]) => <section key={round}><p className="mb-3 text-[10px] font-black tracking-[.15em] text-zinc-400">RUNDE {round}</p><div className="space-y-3">{roundMatches.map(match => <GroupMatchCard key={match.id} match={match} userId={userId} bestOf={tournament.best_of} />)}</div></section>)}</div>}</section>;
}

function EmptyPlan() { return <div className="grid min-h-48 place-items-center p-8 text-center text-sm text-zinc-500"><div><Clock3 className="mx-auto mb-3 text-zinc-600" /><p>Der Turnierplan wird nach dem verpflichtenden Check-in ausgelost.</p></div></div>; }
function MatchPlayer({ name, legs, average, won, emptyLabel = 'Wird ermittelt' }: { name: string | null; legs: number | null; average: number | null; won: boolean; emptyLabel?: string }) { return <div className={`flex items-center justify-between gap-3 border-b border-white/10 py-2.5 last:border-b-0 ${won ? 'text-emerald-100' : 'text-zinc-300'}`}><span className="min-w-0 truncate font-semibold">{name || emptyLabel}{average !== null && <span className="ml-1.5 text-[10px] text-zinc-500">Ø {Number(average).toFixed(1)}</span>}</span>{legs !== null && <strong className={won ? 'text-emerald-200' : 'text-white'}>{legs}</strong>}</div>; }
function Metric({ icon, value, label }: { icon: ReactNode; value: string; label: string }) { return <div className="min-w-28 bg-[#0d1110] p-4"><span className="text-amber-300">{icon}</span><b className="mt-4 block truncate text-lg">{value}</b><span className="text-[9px] font-black tracking-[.1em] text-zinc-500">{label}</span></div>; }
function SmallMetric({ value, label }: { value: number; label: string }) { return <div className="bg-[#0d1110] p-3 text-center"><b className="block text-lg text-white">{value}</b><span className="text-[9px] font-black tracking-[.11em] text-zinc-500">{label}</span></div>; }
function InfoCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) { return <div className="flex gap-3 bg-white/[.025] p-4"><span className="mt-0.5 text-amber-300">{icon}</span><div><p className="text-[10px] font-black tracking-[.12em] text-zinc-300">{title.toUpperCase()}</p><p className="mt-1 text-sm leading-6 text-zinc-400">{body}</p></div></div>; }
