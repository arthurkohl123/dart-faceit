'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Trophy, Flame, Search, Star, Menu, X } from 'lucide-react';

type Player = {
  username: string;
  elo: number;
  gamesPlayed: number;
  wins: number;
  isPremium?: boolean;
};

const rankTiers = [
  { name: 'Eisen',   min: 0,    color: 'text-zinc-400' },
  { name: 'Bronze',  min: 1000, color: 'text-amber-400' },
  { name: 'Silber',  min: 1250, color: 'text-slate-300' },
  { name: 'Gold',    min: 1500, color: 'text-yellow-300' },
  { name: 'Platin',  min: 1750, color: 'text-cyan-300' },
  { name: 'Diamant', min: 2000, color: 'text-blue-300' },
  { name: 'Legende', min: 2500, color: 'text-emerald-300' },
];

function getRank(elo: number) {
  return rankTiers.reduce((cur, r) => (elo >= r.min ? r : cur), rankTiers[0]);
}

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function fetchLeaderboard() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username, elo, gamesPlayed, wins, isPremium')
          .order('elo', { ascending: false })
          .limit(100);

        if (error) console.error(error);
        else if (isMounted) setPlayers((data || []) as Player[]);
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchLeaderboard();
    return () => { isMounted = false; };
  }, [supabase]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-6 text-lg font-bold text-emerald-200 backdrop-blur-xl">
          Rangliste wird geladen...
        </div>
      </main>
    );
  }

  const topPlayers = players.slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  const podiumOrder = [1, 0, 2];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_34%),radial-gradient(circle_at_82%_8%,rgba(6,182,212,0.14),transparent_28%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_78%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      {/* Navbar */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-lg font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-base font-black tracking-[-0.04em] md:text-xl">RANKEDDARTS</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Leaderboard</div>
            </div>
          </Link>

          <div className="hidden items-center gap-7 text-sm font-medium text-zinc-300 lg:flex">
            <Link href="/matchmaking" className="transition hover:text-white">Matchmaking</Link>
            <Link href="/profile" className="transition hover:text-white">Profil</Link>
            <Link href="/history" className="transition hover:text-white">History</Link>
            <Link href="/updates" className="transition hover:text-white">Updates</Link>
            <Link href="/premium" className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 font-bold text-emerald-200 transition hover:bg-emerald-400/20">Premium</Link>
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
              <Link href="/matchmaking" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Matchmaking</Link>
              <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Profil</Link>
              <Link href="/history" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Match History</Link>
              <Link href="/updates" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Updates</Link>
              <Link href="/premium" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/10">Premium</Link>
            </div>
          </div>
        )}
      </nav>

      <section className="relative z-10 mx-auto max-w-5xl px-4 pb-20 pt-28 sm:px-5 md:px-8 md:pt-32">

        {/* Suchfeld */}
        <div className="mb-6 relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Spieler suchen..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-3.5 pl-11 pr-5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/40 focus:bg-white/[0.07]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="mb-8 md:mb-10">
          <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]" />
            Live Ranking
          </div>
          <h1 className="text-4xl font-black leading-[0.9] tracking-[-0.07em] sm:text-5xl md:text-6xl lg:text-7xl">Leaderboard</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">Die stärksten RankedDarts-Spieler, sortiert nach Elo.</p>
        </div>

        {/* Top-3 Podium — nur auf sm+ sichtbar */}
        {topPlayers.length >= 3 && (
          <div className="mb-8 hidden grid-cols-3 gap-4 sm:grid">
            {podiumOrder.map((idx) => {
              const player = topPlayers[idx];
              if (!player) return null;
              const rank = getRank(player.elo);
              const isGold = idx === 0;
              return (
                <Link
                  key={player.username}
                  href={`/players/${encodeURIComponent(player.username)}`}
                  className={`rounded-[2rem] border p-5 text-center backdrop-blur-xl transition hover:-translate-y-1 ${
                    isGold
                      ? 'border-yellow-300/30 bg-yellow-400/[0.07] sm:scale-105'
                      : 'border-white/10 bg-white/[0.04]'
                  }`}
                >
                  <div className="text-3xl">{medals[idx]}</div>
                  <div className="mt-3 truncate text-lg font-black">{player.username}</div>
                  <div className={`text-sm font-bold ${rank.color}`}>{rank.name}</div>
                  <div className="mt-2 text-3xl font-black tracking-[-0.05em] text-emerald-300">{player.elo}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0}% WR
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Spielerliste als Karten */}
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/85 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6 sm:py-5">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Top 100</div>
              <div className="mt-0.5 text-sm text-zinc-400">Monatliche Preisgelder für die Top 3</div>
            </div>
            <Link
              href="/matchmaking"
              className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-400/20 sm:px-5 sm:text-sm"
            >
              Match suchen
            </Link>
          </div>

          <div className="divide-y divide-white/[0.07]">
            {players
              .filter((p) => !searchQuery || p.username.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((player, index) => {
              const rank = getRank(player.elo);
              const winrate = player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0;
              const isTop3 = index < 3;
              const prize = index === 0 ? '100€' : index === 1 ? '50€' : index === 2 ? '25€' : null;

              return (
                <Link
                  key={`${player.username}-${index}`}
                  href={`/players/${encodeURIComponent(player.username)}`}
                  className={`flex items-center gap-3 px-5 py-4 transition hover:bg-emerald-400/[0.04] sm:gap-4 sm:px-6 sm:py-5 ${isTop3 ? 'bg-white/[0.02]' : ''}`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black sm:h-12 sm:w-12 sm:text-base ${
                    index === 0 ? 'bg-yellow-300 text-black' :
                    index === 1 ? 'bg-slate-300 text-black' :
                    index === 2 ? 'bg-amber-600 text-black' :
                    'bg-white/[0.06] text-zinc-400'
                  }`}>
                    {isTop3 ? medals[index] : `#${index + 1}`}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {player.isPremium && <Star className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
                      <span className="truncate text-sm font-black sm:text-base">{player.username}</span>
                      {isTop3 && <Flame className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
                    </div>
                    <div className={`text-xs font-bold ${rank.color}`}>{rank.name}</div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3 sm:gap-5">
                    <div className="hidden text-center sm:block">
                      <div className="text-[11px] text-zinc-500">Spiele</div>
                      <div className="text-sm font-black">{player.gamesPlayed}</div>
                    </div>
                    <div className="hidden text-center sm:block">
                      <div className="text-[11px] text-zinc-500">Winrate</div>
                      <div className="text-sm font-black text-cyan-300">{winrate}%</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[11px] text-zinc-500">Elo</div>
                      <div className="text-lg font-black text-emerald-300 sm:text-xl">{player.elo}</div>
                    </div>
                    {prize && (
                      <div className="hidden rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-200 sm:block">
                        {prize}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {players.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-[2.5rem] border border-white/10 bg-white/[0.03] py-24 text-center backdrop-blur-xl">
            <Trophy size={48} className="mb-5 text-zinc-600" />
            <h3 className="text-2xl font-black">Noch keine Spieler</h3>
            <p className="mt-3 text-zinc-400">Sei der Erste im Leaderboard!</p>
          </div>
        )}

        <p className="mt-8 text-center text-sm text-zinc-500">
          Aktualisiert beim Laden der Seite · Monatliche Preisgelder für die Top 3
        </p>
      </section>
    </main>
  );
}
