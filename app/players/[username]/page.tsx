'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { AdminBadge } from '@/components/AdminBadge';
import { getRankProgress } from '@/lib/ranks';
import { ArrowUpRight, Crosshair, Medal, Menu, ShieldCheck, Sparkles, Star, Target, Trophy, X, Zap } from 'lucide-react';

type PublicProfile = {
  username: string;
  elo: number;
  gamesPlayed: number;
  wins: number;
  isPremium: boolean;
  isAdmin: boolean;
  supabaseId: string;
};

type MatchHistory = {
  id: string;
  created_at: string;
  player1_username: string;
  player2_username: string;
  player1_id: string;
  player2_id: string;
  submitted_winner_id: string | null;
  submitted_player1_average: number | null;
  submitted_player2_average: number | null;
  submitted_player1_180s: number | null;
  submitted_player2_180s: number | null;
  submitted_player1_legs: number | null;
  submitted_player2_legs: number | null;
};

type TournamentHistory = {
  tournament_id: string; title: string; starts_at: string; status: string; tournament_format: string;
  scoring_platform: string; participant_status: string; wins: number; losses: number; points: number;
  placement: number | null; is_winner: boolean; prize_title: string | null;
};

export default function PlayerProfile() {
  const params = useParams();
  const username = decodeURIComponent(params.username as string);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [matches, setMatches] = useState<MatchHistory[]>([]);
  const [tournamentHistory, setTournamentHistory] = useState<TournamentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Berechnete Stats
  const [avgAverage, setAvgAverage] = useState<number | null>(null);
  const [total180s, setTotal180s] = useState<number>(0);
  const [bestAverage, setBestAverage] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      const [{ data: profileData }, { data: adminRows, error: adminError }] = await Promise.all([
        supabase
          .from('public_profiles')
          .select('username, elo, gamesPlayed, wins, isPremium, supabaseId')
          .eq('username', username)
          .maybeSingle(),
        supabase.rpc('get_public_admin_profile_ids'),
      ]);

      if (!isMounted) return;
      if (!profileData) { setNotFound(true); setLoading(false); return; }
      if (adminError) console.error('Admin-Badge konnte nicht geladen werden:', adminError);
      const isAdmin = (adminRows || []).some(
        (row: { profile_id: string }) => row.profile_id === profileData.supabaseId
      );

      const p: PublicProfile = {
        username: profileData.username,
        elo: profileData.elo ?? 1000,
        gamesPlayed: profileData.gamesPlayed ?? 0,
        wins: profileData.wins ?? 0,
        isPremium: Boolean(profileData.isPremium),
        isAdmin,
        supabaseId: profileData.supabaseId,
      };
      setProfile(p);

      // Letzte 20 Matches aus active_matches laden
      const { data: matchData } = await supabase
        .from('active_matches')
        .select('id, created_at, player1_id, player2_id, player1_username, player2_username, submitted_winner_id, submitted_player1_average, submitted_player2_average, submitted_player1_180s, submitted_player2_180s, submitted_player1_legs, submitted_player2_legs')
        .eq('status', 'completed')
        .or(`player1_id.eq.${p.supabaseId},player2_id.eq.${p.supabaseId}`)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!isMounted) return;

      const history = (matchData || []) as MatchHistory[];
      setMatches(history);
      const { data: tournamentRows } = await supabase.rpc('list_player_tournament_history', { p_user_id: p.supabaseId });
      if (isMounted) setTournamentHistory((tournamentRows || []) as TournamentHistory[]);

      // Stats berechnen
      const avgs = history
        .map((m) => m.player1_id === p.supabaseId ? m.submitted_player1_average : m.submitted_player2_average)
        .filter((v): v is number => v !== null && v > 0);
      if (avgs.length > 0) {
        setAvgAverage(avgs.reduce((a, b) => a + b, 0) / avgs.length);
        setBestAverage(Math.max(...avgs));
      }

      const s180s = history.reduce((sum, m) => {
        const v = m.player1_id === p.supabaseId ? m.submitted_player1_180s : m.submitted_player2_180s;
        return sum + (v ?? 0);
      }, 0);
      setTotal180s(s180s);

      setLoading(false);
    }
    void load();
    return () => { isMounted = false; };
  }, [supabase, username]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-6 text-lg font-bold text-emerald-200 backdrop-blur-xl">
          Profil wird geladen...
        </div>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#050607] text-white">
        <div className="rounded-[2rem] border border-white/10 bg-zinc-950/85 px-10 py-10 text-center backdrop-blur-xl">
          <Trophy className="mx-auto h-12 w-12 text-zinc-600" />
          <h1 className="mt-5 text-3xl font-black">Spieler nicht gefunden</h1>
          <p className="mt-3 text-zinc-400">Der Spieler <strong className="text-white">{username}</strong> existiert nicht.</p>
          <button
            onClick={() => router.back()}
            className="mt-7 rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-7 py-3.5 font-black uppercase tracking-[0.14em] text-black"
          >
            Zurück
          </button>
        </div>
      </main>
    );
  }

  const elo = profile!.elo;
  const gamesPlayed = profile!.gamesPlayed;
  const wins = profile!.wins;
  const losses = Math.max(gamesPlayed - wins, 0);
  const winrate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

  const { current: currentRank, upcoming, eloToNext, progress } = getRankProgress(elo);
  const nextRank = upcoming ?? currentRank;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.18),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(6,182,212,0.12),transparent_28%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_78%)]" />
        <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      {/* Nav */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-lg font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-base font-black tracking-[-0.04em] md:text-xl">RANKEDDARTS</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Spielerprofil</div>
            </div>
          </Link>
          <div className="hidden items-center gap-7 text-sm font-medium text-zinc-300 lg:flex">
            <Link href="/leaderboard" className="transition hover:text-white">Leaderboard</Link>
            <Link href="/matchmaking" className="transition hover:text-white">Matchmaking</Link>
            <Link href="/profile" className="transition hover:text-white">Mein Profil</Link>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/[0.04] text-zinc-200 transition hover:bg-white/10 lg:hidden"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-white/10 bg-black/80 px-5 py-4 backdrop-blur-2xl lg:hidden">
            <div className="flex flex-col gap-1">
              <Link href="/leaderboard" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Leaderboard</Link>
              <Link href="/matchmaking" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Matchmaking</Link>
              <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Mein Profil</Link>
            </div>
          </div>
        )}
      </nav>

      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-5 md:px-8 md:pt-32">

        {/* Profil-Header */}
        <div className={`relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br ${currentRank.accent} p-7 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-10 md:p-12`}>
          <div
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl opacity-25"
            style={{ background: `radial-gradient(circle, ${currentRank.glowColor}, transparent 70%)` }}
          />
          <div className="pointer-events-none absolute -right-20 top-1/2 hidden h-72 w-72 -translate-y-1/2 items-center justify-center opacity-55 lg:flex">
            <div className="absolute inset-0 rounded-full border border-white/10" />
            <div className="absolute inset-10 rounded-full border border-white/15" />
            <div className="absolute inset-20 rounded-full border border-emerald-300/20" />
            <div className="ranked-orbit absolute left-1/2 top-1/2 h-3 w-3 rounded-full bg-lime-200 shadow-[0_0_22px_rgba(190,242,100,0.95)]" />
            <Crosshair className={`h-14 w-14 ${currentRank.color} opacity-70`} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent ranked-shine" />
          <div className="relative z-10 flex flex-col items-center gap-5 text-center sm:flex-row sm:gap-7 sm:text-left">
            <div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-[1.75rem] border border-white/20 bg-black/35 text-2xl font-black shadow-xl sm:h-28 sm:w-28 sm:text-3xl">
              {currentRank.badge}
              <span className="absolute -bottom-2 -right-2 grid h-8 w-8 place-items-center rounded-full border border-emerald-200/40 bg-emerald-400 text-black shadow-[0_0_20px_rgba(74,222,128,0.7)]"><Zap className="h-4 w-4 fill-current" /></span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="mb-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-emerald-200/80 sm:justify-start"><Sparkles className="h-3.5 w-3.5" /> Verified player card · Season 01 · bis 01.11.2026</div>
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {profile!.isPremium && <Star className="h-5 w-5 fill-current text-emerald-300" />}
                <h1 className="text-4xl font-black tracking-[-0.07em] sm:text-5xl md:text-6xl">{profile!.username}</h1>
                {profile!.isAdmin && <AdminBadge />}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start"><span className={`rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] ${currentRank.color}`}>Level {currentRank.level} · {currentRank.name}</span>{profile!.isPremium && <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-100">PREMIUM</span>}</div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-zinc-400 sm:justify-start"><span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Bestätigte Ranked-Stats</span><span className="hidden h-3 w-px bg-white/15 sm:block" /><span>{gamesPlayed} Matches gespielt</span></div>
            </div>
            <div className="relative shrink-0 overflow-hidden rounded-[1.75rem] border border-emerald-300/25 bg-[#07120e]/95 px-7 py-5 text-center shadow-[0_0_35px_rgba(34,197,94,0.15)]">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/80 to-transparent" />
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">Elo Rating</div>
              <div className="mt-1 text-5xl font-black tracking-[-0.07em] text-emerald-300 sm:text-6xl">{elo}</div>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Season 01 · bis 01.11.2026</div>
            </div>
          </div>
        </div>

        {/* Kern-Stats: 4er Grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-5 text-center backdrop-blur-xl">
            <div className="text-2xl font-black text-emerald-300 sm:text-3xl">{wins}</div>
            <div className="mt-1 text-xs text-zinc-500">Siege</div>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-5 text-center backdrop-blur-xl">
            <div className="text-2xl font-black text-red-300 sm:text-3xl">{losses}</div>
            <div className="mt-1 text-xs text-zinc-500">Niederlagen</div>
          </div>
          <div className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-400/[0.04] p-5 text-center backdrop-blur-xl">
            <div className="text-2xl font-black text-cyan-300 sm:text-3xl">{winrate}%</div>
            <div className="mt-1 text-xs text-zinc-500">Winrate</div>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-5 text-center backdrop-blur-xl">
            <div className="text-2xl font-black text-white sm:text-3xl">{gamesPlayed}</div>
            <div className="mt-1 text-xs text-zinc-500">Spiele</div>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="space-y-5">
        {/* Performance-Stats */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-[1.5rem] border border-violet-300/15 bg-violet-400/[0.04] p-5 text-center backdrop-blur-xl">
            <Target className="mx-auto h-5 w-5 text-violet-300 mb-2" />
            <div className="text-2xl font-black text-violet-300 sm:text-3xl">
              {avgAverage !== null ? avgAverage.toFixed(1) : '—'}
            </div>
            <div className="mt-1 text-xs text-zinc-500">Ø Average</div>
          </div>
          <div className="rounded-[1.5rem] border border-emerald-300/15 bg-emerald-400/[0.04] p-5 text-center backdrop-blur-xl">
            <Zap className="mx-auto h-5 w-5 text-emerald-300 mb-2" />
            <div className="text-2xl font-black text-emerald-300 sm:text-3xl">
              {bestAverage !== null ? bestAverage.toFixed(1) : '—'}
            </div>
            <div className="mt-1 text-xs text-zinc-500">Best Average</div>
          </div>
          <div className="rounded-[1.5rem] border border-amber-300/15 bg-amber-400/[0.04] p-5 text-center backdrop-blur-xl">
            <div className="mx-auto mb-2 text-lg font-black text-amber-300">180</div>
            <div className="text-2xl font-black text-amber-300 sm:text-3xl">{total180s}</div>
            <div className="mt-1 text-xs text-zinc-500">180er gesamt</div>
          </div>
        </div>

        {/* Rang-Fortschritt */}
        <div className="rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-6 backdrop-blur-xl sm:p-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Nächster Rang</div>
              <div className={`mt-1.5 text-2xl font-black tracking-[-0.04em] sm:text-3xl ${nextRank.color}`}>{nextRank.name}</div>
              <div className="mt-1 text-sm text-zinc-400">{eloToNext > 0 ? `${eloToNext} Elo bis zum nächsten Rang` : 'Maximaler Rang erreicht'}</div>
            </div>
            <div className="text-right text-2xl font-black text-emerald-300">{Math.round(progress)}%</div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-zinc-400"><span className="inline-flex items-center gap-2"><Medal className="h-4 w-4 text-emerald-300" /> Level {currentRank.level} · {currentRank.name}</span><span className="font-black text-white">{elo} Elo</span></div>
        </div>
          </div>

        {/* Match-Verlauf */}
        <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-6 backdrop-blur-xl sm:p-7">
          <div className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex items-end justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Match history</div><h2 className="mt-1.5 text-2xl font-black tracking-[-0.04em]">Letzte Matches</h2></div><span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black text-zinc-300">{matches.length} gespielt</span></div>
          {matches.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-zinc-500">Noch keine Matches gespielt.</div>
          ) : (
            <div className="relative mt-5 space-y-2">
              {matches.map((m) => {
                const isPlayer1 = m.player1_id === profile!.supabaseId;
                const isWin = m.submitted_winner_id === profile!.supabaseId;
                const opponentName = isPlayer1 ? m.player2_username : m.player1_username;
                const myAvg = isPlayer1 ? m.submitted_player1_average : m.submitted_player2_average;
                const myLegs = isPlayer1 ? m.submitted_player1_legs : m.submitted_player2_legs;
                const oppLegs = isPlayer1 ? m.submitted_player2_legs : m.submitted_player1_legs;
                const my180s = isPlayer1 ? m.submitted_player1_180s : m.submitted_player2_180s;
                return (
                  <div key={m.id} className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 transition hover:border-emerald-300/25 hover:bg-emerald-400/[0.04]">
                    <div className={`shrink-0 rounded-xl px-2.5 py-1 text-xs font-black uppercase tracking-[0.1em] ${isWin ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>
                      {isWin ? 'SIEG' : 'NL'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-zinc-200">vs {opponentName}</div>
                      {(myLegs !== null && oppLegs !== null) && (
                        <div className="text-xs text-zinc-500">{myLegs} : {oppLegs} Legs</div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {myAvg !== null && (
                        <div className="text-sm font-black text-violet-300">Ø {myAvg.toFixed(1)}</div>
                      )}
                      {(my180s !== null && my180s > 0) && (
                        <div className="text-xs font-bold text-amber-300">{my180s}× 180</div>
                      )}
                    </div>
                    <ArrowUpRight className="hidden h-4 w-4 text-emerald-300/0 transition group-hover:text-emerald-300 sm:block" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>

        <div className="mt-5 rounded-[1.75rem] border border-amber-300/15 bg-amber-300/[0.035] p-6 backdrop-blur-xl sm:p-7">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><div className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Tournament record</div><h2 className="mt-1.5 text-2xl font-black tracking-[-0.04em]">Öffentliche Turnier-Historie</h2></div><span className="rounded-full border border-amber-300/15 bg-amber-300/10 px-3 py-1.5 text-xs font-black text-amber-100">{tournamentHistory.length} Events</span></div>
          {tournamentHistory.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">Noch keine öffentlichen Turnierergebnisse.</div> : <div className="mt-5 grid gap-3 md:grid-cols-2">{tournamentHistory.map(event => <Link href="/tournaments" key={event.tournament_id} className="group rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:border-amber-300/25 hover:bg-amber-300/[0.05]"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-zinc-100">{event.title}</p><p className="mt-1 text-xs text-zinc-500">{new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(event.starts_at))} · {event.tournament_format.replaceAll('_', ' ')}</p></div>{event.is_winner && <span className="rounded-full bg-amber-300 px-2.5 py-1 text-[10px] font-black text-black"><Trophy className="mr-1 inline h-3 w-3" />CHAMPION</span>}</div><div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider"><span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-emerald-200">{event.wins} Siege</span><span className="rounded-full bg-red-400/10 px-2.5 py-1 text-red-200">{event.losses} Niederlagen</span><span className="rounded-full bg-white/5 px-2.5 py-1 text-zinc-400">{event.scoring_platform}</span>{event.prize_title && <span className="rounded-full bg-amber-300/10 px-2.5 py-1 text-amber-200">{event.prize_title}</span>}</div></Link>)}</div>}
        </div>

      </section>
    </main>
  );
}


