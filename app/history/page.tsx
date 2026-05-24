'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Trophy, Target, TrendingUp, TrendingDown, ChevronLeft } from 'lucide-react';

type MatchEntry = {
  id: string;
  created_at: string;
  opponent_name: string;
  opponent_elo: number;
  is_win: boolean;
  result: string;
  legs_won: number | null;
  legs_lost: number | null;
  my_average: number | null;
  highest_checkout: number | null;
  elo_change: number;
};

export default function MatchHistory() {
  const [matches, setMatches] = useState<MatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all');
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    const fetchHistory = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login');
        return;
      }

      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
      } else {
        setMatches((data || []) as MatchEntry[]);
      }
      setLoading(false);
    };

    fetchHistory();
  }, [supabase, router]);

  const filtered = matches.filter(m => {
    if (filter === 'wins') return m.is_win;
    if (filter === 'losses') return !m.is_win;
    return true;
  });

  const totalWins = matches.filter(m => m.is_win).length;
  const totalLosses = matches.filter(m => !m.is_win).length;
  const winrate = matches.length > 0 ? Math.round((totalWins / matches.length) * 100) : 0;
  const totalEloChange = matches.reduce((sum, m) => sum + (m.elo_change || 0), 0);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-6 text-lg font-bold text-emerald-200 backdrop-blur-xl">
          Match History wird geladen...
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.18),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(6,182,212,0.12),transparent_28%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_78%)]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      {/* Nav */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-xl font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-xl font-black tracking-[-0.04em] md:text-2xl">RANKEDDARTS</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Match History</div>
            </div>
          </Link>

          <div className="hidden items-center gap-7 text-sm font-medium text-zinc-300 lg:flex">
            <Link href="/matchmaking" className="transition hover:text-white">Matchmaking</Link>
            <Link href="/leaderboard" className="transition hover:text-white">Leaderboard</Link>
            <Link href="/updates" className="transition hover:text-white">Updates</Link>
            <Link href="/premium" className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 font-bold text-emerald-200 transition hover:bg-emerald-400/20">Premium</Link>
          </div>

          <button
            onClick={() => router.push('/profile')}
            className="flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10"
          >
            <ChevronLeft size={16} />
            Profil
          </button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-5xl px-5 pb-20 pt-32 md:px-8">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-5xl font-black tracking-[-0.06em] md:text-6xl">MATCH HISTORY</h1>
          <p className="mt-3 text-lg text-zinc-400">{matches.length} gespielte Matches insgesamt</p>
        </div>

        {/* Stats-Übersicht */}
        <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <div className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Siege</div>
            <div className="mt-3 text-4xl font-black tracking-[-0.06em] text-emerald-400">{totalWins}</div>
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <div className="text-xs font-black uppercase tracking-[0.24em] text-red-400">Niederlagen</div>
            <div className="mt-3 text-4xl font-black tracking-[-0.06em] text-red-400">{totalLosses}</div>
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Winrate</div>
            <div className="mt-3 text-4xl font-black tracking-[-0.06em] text-cyan-300">{winrate}%</div>
          </div>
          <div className={`rounded-[1.75rem] border p-6 backdrop-blur-xl ${totalEloChange >= 0 ? 'border-emerald-300/20 bg-emerald-400/[0.06]' : 'border-red-400/20 bg-red-400/[0.06]'}`}>
            <div className={`text-xs font-black uppercase tracking-[0.24em] ${totalEloChange >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>Elo Gesamt</div>
            <div className={`mt-3 text-4xl font-black tracking-[-0.06em] ${totalEloChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalEloChange >= 0 ? '+' : ''}{totalEloChange}
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="mb-8 flex gap-3">
          {(['all', 'wins', 'losses'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-5 py-2.5 text-sm font-bold transition ${
                filter === f
                  ? 'bg-emerald-400/20 border border-emerald-300/40 text-emerald-200'
                  : 'border border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white hover:border-white/20'
              }`}
            >
              {f === 'all' ? 'Alle' : f === 'wins' ? 'Siege' : 'Niederlagen'}
            </button>
          ))}
        </div>

        {/* Match-Liste */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[2.5rem] border border-white/10 bg-white/[0.03] py-24 backdrop-blur-xl">
            <div className="mb-5 grid h-20 w-20 place-items-center rounded-3xl border border-white/10 bg-white/[0.06] text-4xl">🎯</div>
            <h3 className="text-2xl font-black tracking-[-0.04em]">Noch keine Matches</h3>
            <p className="mt-3 text-zinc-400">Starte dein erstes Match über Matchmaking</p>
            <Link
              href="/matchmaking"
              className="mt-8 rounded-full bg-emerald-400 px-8 py-3 text-sm font-black text-black transition hover:bg-emerald-300"
            >
              Match suchen
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((match) => (
              <div
                key={match.id}
                className={`group relative overflow-hidden rounded-[2rem] border backdrop-blur-xl transition-all duration-300 hover:scale-[1.005] ${
                  match.is_win
                    ? 'border-emerald-300/15 bg-emerald-400/[0.04] hover:border-emerald-300/30'
                    : 'border-red-400/15 bg-red-400/[0.04] hover:border-red-400/30'
                }`}
              >
                {/* Farbiger Seitenstreifen */}
                <div className={`absolute left-0 top-0 h-full w-1 ${match.is_win ? 'bg-emerald-400' : 'bg-red-500'}`} />

                <div className="px-8 py-6 pl-10">
                  <div className="flex flex-wrap items-center justify-between gap-4">

                    {/* Linke Seite: Datum + Gegner */}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                        {new Date(match.created_at).toLocaleDateString('de-DE', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <span className="text-2xl font-black tracking-[-0.04em]">vs {match.opponent_name}</span>
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-bold text-zinc-400">
                          {match.opponent_elo} Elo
                        </span>
                      </div>
                    </div>

                    {/* Rechte Seite: Ergebnis + Badge */}
                    <div className="flex items-center gap-4">
                      <div className={`text-4xl font-black tracking-[-0.06em] ${match.is_win ? 'text-emerald-400' : 'text-red-400'}`}>
                        {match.result || (match.legs_won != null ? `${match.legs_won}:${match.legs_lost}` : '—')}
                      </div>
                      <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black ${
                        match.is_win
                          ? 'bg-emerald-400/15 text-emerald-300'
                          : 'bg-red-400/15 text-red-300'
                      }`}>
                        {match.is_win ? <Trophy size={15} /> : <span className="text-base">↓</span>}
                        {match.is_win ? 'Sieg' : 'Niederlage'}
                      </div>
                    </div>
                  </div>

                  {/* Stats-Zeile */}
                  <div className="mt-5 grid grid-cols-3 gap-4 border-t border-white/[0.06] pt-5">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500">Average</div>
                      <div className="mt-1.5 text-2xl font-black tracking-[-0.04em]">
                        {match.my_average != null ? Number(match.my_average).toFixed(1) : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500">Höchster Checkout</div>
                      <div className="mt-1.5 text-2xl font-black tracking-[-0.04em]">
                        {match.highest_checkout ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500">Elo-Änderung</div>
                      <div className={`mt-1.5 flex items-center gap-1.5 text-2xl font-black tracking-[-0.04em] ${
                        match.elo_change >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {match.elo_change >= 0
                          ? <TrendingUp size={18} />
                          : <TrendingDown size={18} />
                        }
                        {match.elo_change >= 0 ? '+' : ''}{match.elo_change}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}