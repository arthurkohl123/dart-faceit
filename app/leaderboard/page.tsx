'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Flame, Star, Trophy } from 'lucide-react';

type Player = {
  username: string;
  elo: number;
  gamesPlayed: number;
  wins: number;
  isPremium?: boolean;
};

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function fetchLeaderboard() {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, elo, gamesPlayed, wins, isPremium')
        .order('elo', { ascending: false })
        .limit(100);

      if (error) console.error(error);
      else if (isMounted) setPlayers((data || []) as Player[]);

      if (isMounted) setLoading(false);
    }

    void fetchLeaderboard();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const topPlayers = players.slice(0, 3);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-6 text-lg font-bold text-emerald-200 backdrop-blur-xl">Rangliste wird geladen...</div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_34%),radial-gradient(circle_at_82%_8%,rgba(6,182,212,0.14),transparent_28%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_78%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <nav className="relative z-10 border-b border-white/10 bg-black/45 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-xl font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-xl font-black tracking-[-0.04em] md:text-2xl">RANKEDDARTS</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Leaderboard</div>
            </div>
          </Link>

          <button
            onClick={() => router.push('/profile')}
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10"
          >
            Zurück zum Profil
          </button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-14 md:px-8">
        <div className="mb-10 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]" />
              Live Ranking
            </div>
            <h1 className="mt-6 text-6xl font-black leading-[0.9] tracking-[-0.07em] md:text-8xl">Leaderboard</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300">Die stärksten RankedDarts-Spieler, sortiert nach Elo. Oben stehen die Spieler, die konstante Ergebnisse gegen starke Gegner liefern.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {topPlayers.map((player, index) => {
              const rankStyle = index === 0 ? 'border-emerald-300/35 bg-emerald-400/[0.08]' : 'border-white/10 bg-white/[0.04]';
              return (
                <div key={`${player.username}-${index}`} className={`rounded-[2rem] border ${rankStyle} p-5 backdrop-blur-xl`}>
                  <div className="flex items-center justify-between">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-black/35 text-sm font-black text-emerald-200">#{index + 1}</div>
                    {index === 0 ? <Trophy className="h-6 w-6 text-emerald-300" /> : <Flame className="h-5 w-5 text-cyan-300" />}
                  </div>
                  <div className="mt-5 truncate text-xl font-black">{player.username}</div>
                  <div className="mt-1 text-3xl font-black tracking-[-0.05em] text-white">{player.elo}</div>
                  <div className="text-sm text-zinc-500">Elo</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-[2.5rem] border border-white/10 bg-zinc-950/85 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <div className="border-b border-white/10 bg-white/[0.03] px-6 py-5 md:px-8">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Top 100</div>
                <div className="mt-1 text-zinc-400">Monatliche Preisgelder für die besten Platzierungen</div>
              </div>
              <Link href="/matchmaking" className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-5 py-2.5 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/20">Match suchen</Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-white/10 bg-black/30 text-xs uppercase tracking-[0.22em] text-zinc-500">
                  <th className="px-6 py-5 text-left md:px-8">Rang</th>
                  <th className="px-6 py-5 text-left md:px-8">Spieler</th>
                  <th className="px-6 py-5 text-center md:px-8">Elo</th>
                  <th className="px-6 py-5 text-center md:px-8">Spiele</th>
                  <th className="px-6 py-5 text-center md:px-8">Siege</th>
                  <th className="px-6 py-5 text-center md:px-8">Winrate</th>
                  <th className="px-6 py-5 text-right md:px-8">Preisgeld</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {players.map((player, index) => {
                  const prize = index === 0 ? '100€' : index === 1 ? '50€' : index === 2 ? '25€' : null;
                  const isTop3 = index < 3;
                  const winrate = player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0;

                  return (
                    <tr key={`${player.username}-${index}`} className={`group transition hover:bg-emerald-400/[0.06] ${isTop3 ? 'bg-white/[0.03]' : ''}`}>
                      <td className="px-6 py-6 md:px-8">
                        <div className={`inline-flex h-12 min-w-12 items-center justify-center rounded-2xl px-3 text-lg font-black transition group-hover:scale-105 ${index === 0 ? 'bg-emerald-300 text-black' : index === 1 ? 'bg-cyan-200 text-black' : index === 2 ? 'bg-lime-200 text-black' : 'bg-white/[0.06] text-zinc-400'}`}>#{index + 1}</div>
                      </td>
                      <td className="px-6 py-6 md:px-8">
                        <div className="flex items-center gap-3 text-lg font-black">
                          {player.isPremium && <Star className="h-5 w-5 text-emerald-300" />}
                          <span>{player.username}</span>
                          {isTop3 && <Flame className="h-5 w-5 text-cyan-300" />}
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center md:px-8">
                        <div className="text-3xl font-black tracking-[-0.05em] transition group-hover:text-emerald-300">{player.elo}</div>
                      </td>
                      <td className="px-6 py-6 text-center text-zinc-400 md:px-8">{player.gamesPlayed}</td>
                      <td className="px-6 py-6 text-center font-bold text-emerald-300 md:px-8">{player.wins}</td>
                      <td className="px-6 py-6 text-center text-zinc-300 md:px-8">{winrate}%</td>
                      <td className="px-6 py-6 text-right md:px-8">
                        {prize ? (
                          <span className="inline-flex rounded-full border border-emerald-300/25 bg-emerald-400/10 px-5 py-2 font-black text-emerald-200">{prize}</span>
                        ) : (
                          <span className="text-zinc-600">–</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-zinc-500">Aktualisiert beim Laden der Seite • Monatliche Preisgelder für die Top 3</p>
      </section>
    </main>
  );
}
