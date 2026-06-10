'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Menu, Star, Target, Trophy, X, Zap } from 'lucide-react';

const rankTiers = [
  { name: 'Eisen',   min: 0,    color: 'text-zinc-300',   accent: 'from-zinc-400/20 to-zinc-950',    badge: 'EI', glowColor: 'rgba(161,161,170,0.18)' },
  { name: 'Bronze',  min: 1000, color: 'text-amber-300',  accent: 'from-amber-500/20 to-zinc-950',   badge: 'BR', glowColor: 'rgba(251,191,36,0.18)' },
  { name: 'Silber',  min: 1250, color: 'text-slate-200',  accent: 'from-slate-300/20 to-zinc-950',   badge: 'SI', glowColor: 'rgba(203,213,225,0.18)' },
  { name: 'Gold',    min: 1500, color: 'text-yellow-200', accent: 'from-yellow-300/20 to-zinc-950',  badge: 'GO', glowColor: 'rgba(253,224,71,0.18)' },
  { name: 'Platin',  min: 1750, color: 'text-cyan-200',   accent: 'from-cyan-300/20 to-zinc-950',    badge: 'PL', glowColor: 'rgba(103,232,249,0.18)' },
  { name: 'Diamant', min: 2000, color: 'text-blue-200',   accent: 'from-blue-300/20 to-zinc-950',    badge: 'DI', glowColor: 'rgba(147,197,253,0.18)' },
  { name: 'Legende', min: 2500, color: 'text-emerald-200',accent: 'from-emerald-300/25 to-zinc-950', badge: 'LG', glowColor: 'rgba(110,231,183,0.22)' },
];

type PublicProfile = {
  username: string;
  elo: number;
  gamesPlayed: number;
  wins: number;
  isPremium: boolean;
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

export default function PlayerProfile() {
  const params = useParams();
  const username = decodeURIComponent(params.username as string);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [matches, setMatches] = useState<MatchHistory[]>([]);
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
      const { data: profileData } = await supabase
        .from('profiles')
        .select('username, elo, gamesPlayed, wins, isPremium, supabaseId')
        .eq('username', username)
        .maybeSingle();

      if (!isMounted) return;
      if (!profileData) { setNotFound(true); setLoading(false); return; }

      const p: PublicProfile = {
        username: profileData.username,
        elo: profileData.elo ?? 1000,
        gamesPlayed: profileData.gamesPlayed ?? 0,
        wins: profileData.wins ?? 0,
        isPremium: Boolean(profileData.isPremium),
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

  const currentRankIndex = rankTiers.reduce((cur, r, i) => (elo >= r.min ? i : cur), 0);
  const currentRank = rankTiers[currentRankIndex];
  const nextRank = rankTiers[currentRankIndex + 1] || currentRank;
  const eloToNext = Math.max(nextRank.min - elo, 0);
  const rankRange = nextRank.min - currentRank.min;
  const progress = nextRank === currentRank ? 100 : Math.min(Math.max(((elo - currentRank.min) / rankRange) * 100, 0), 100);

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

      <section className="relative z-10 mx-auto max-w-3xl px-4 pb-16 pt-28 sm:px-5 md:px-8 md:pt-32">

        {/* Profil-Header */}
        <div className={`relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br ${currentRank.accent} backdrop-blur-xl`}>
          <div
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl opacity-25"
            style={{ background: `radial-gradient(circle, ${currentRank.glowColor}, transparent 70%)` }}
          />
          <div className="relative flex flex-col items-center gap-4 px-8 py-10 text-center sm:flex-row sm:text-left">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[1.5rem] border border-white/15 bg-white/[0.06] text-2xl font-black">
              {currentRank.badge}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {profile!.isPremium && <Star className="h-4 w-4 text-emerald-300" />}
                <h1 className="text-3xl font-black tracking-[-0.05em] sm:text-4xl">{profile!.username}</h1>
              </div>
              <div className={`mt-1 text-sm font-bold ${currentRank.color}`}>{currentRank.name}</div>
              <div className="mt-2 text-xs text-zinc-500">{gamesPlayed} Matches gespielt</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-black text-emerald-300 sm:text-5xl">{elo}</div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Elo</div>
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

        {/* Performance-Stats */}
        <div className="mt-3 grid grid-cols-3 gap-3 sm:gap-4">
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
        <div className="mt-3 rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-6 backdrop-blur-xl sm:p-7">
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
        </div>

        {/* Match-Verlauf */}
        <div className="mt-3 rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-6 backdrop-blur-xl sm:p-7">
          <div className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Verlauf</div>
          <h2 className="mt-1.5 text-2xl font-black tracking-[-0.04em]">Letzte Matches</h2>
          {matches.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-zinc-500">Noch keine Matches gespielt.</div>
          ) : (
            <div className="mt-5 space-y-2">
              {matches.map((m) => {
                const isPlayer1 = m.player1_id === profile!.supabaseId;
                const isWin = m.submitted_winner_id === profile!.supabaseId;
                const opponentName = isPlayer1 ? m.player2_username : m.player1_username;
                const myAvg = isPlayer1 ? m.submitted_player1_average : m.submitted_player2_average;
                const myLegs = isPlayer1 ? m.submitted_player1_legs : m.submitted_player2_legs;
                const oppLegs = isPlayer1 ? m.submitted_player2_legs : m.submitted_player1_legs;
                const my180s = isPlayer1 ? m.submitted_player1_180s : m.submitted_player2_180s;
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
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
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </section>
    </main>
  );
}