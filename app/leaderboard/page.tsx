'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { BrandLogo } from '@/components/BrandLogo';
import { getRankForElo } from '@/lib/ranks';
import { ArrowUpRight, Crown, Crosshair, Flame, Medal, Radar, Search, ShieldCheck, Swords, Trophy, Users, Menu, X } from 'lucide-react';

type Player = {
  username: string;
  elo: number;
  gamesPlayed: number;
  wins: number;
  isPremium?: boolean;
  supabaseId?: string;
};

type PlayerAvgMap = Record<string, number>;
const premiumNameStyle = 'bg-gradient-to-r from-cyan-100 via-emerald-200 to-violet-200 bg-[length:180%_100%] bg-clip-text text-transparent drop-shadow-[0_0_9px_rgba(103,232,249,0.38)]';

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [avgMap, setAvgMap] = useState<PlayerAvgMap>({});
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let isMounted = true;

    async function fetchLeaderboard() {
      try {
        const { data, error } = await supabase
          .from('public_profiles')
          .select('username, elo, gamesPlayed, wins, isPremium, supabaseId')
          .gte('gamesPlayed', 1)
          .order('elo', { ascending: false })
          .limit(100);

        if (error) { console.error(error); }
        else if (isMounted) {
          const players = (data || []) as Player[];
          setPlayers(players);

          const ids = players.map((p) => p.supabaseId).filter(Boolean) as string[];
          if (ids.length > 0) {
            const { data: statisticRows, error: statisticsError } = await supabase.rpc('get_public_player_statistics', { p_user_ids: ids });
            if (!statisticsError) {
              const map: PlayerAvgMap = {};
              for (const stat of (statisticRows ?? []) as { user_id: string; average: number | null }[]) {
                if (stat.average !== null && Number.isFinite(stat.average)) map[stat.user_id] = stat.average;
              }
              if (isMounted) setAvgMap(map);
            } else {
              console.error('Leaderboard-Statistiken konnten nicht geladen werden:', statisticsError);
            }
          }
        }
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
  const filteredPlayers = players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => !searchQuery || player.username.toLowerCase().includes(searchQuery.toLowerCase()));

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
            <BrandLogo className="h-10 w-10" />
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

      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-5 md:px-8 md:pt-32">

        <div className="relative mb-8 overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-zinc-950 via-[#09100e] to-zinc-950 p-7 shadow-2xl shadow-black/50 sm:p-10 md:mb-10 md:p-12">
          <div className="pointer-events-none absolute -left-20 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -right-16 -top-16 hidden h-72 w-72 items-center justify-center lg:flex">
            <div className="absolute inset-0 rounded-full border border-emerald-300/15" />
            <div className="absolute inset-10 rounded-full border border-cyan-300/15" />
            <div className="absolute inset-20 rounded-full border border-emerald-300/20" />
            <div className="ranked-orbit absolute left-1/2 top-1/2 h-3 w-3 rounded-full bg-lime-200 shadow-[0_0_22px_rgba(190,242,100,0.95)]" />
            <Crosshair className="h-12 w-12 text-emerald-100/70" />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/80 to-transparent ranked-shine" />

          <div className="relative grid gap-8 lg:grid-cols-[1fr_0.62fr] lg:items-end">
            <div>
              <div className="mb-5 inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100">
                <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" /></span>
                Global Ranking · Season 01 · bis 01.11.2026
              </div>
              <h1 className="max-w-4xl text-5xl font-black leading-[0.86] tracking-[-0.08em] sm:text-6xl md:text-7xl lg:text-8xl">Werfen.<br /><span className="bg-gradient-to-r from-emerald-300 via-lime-200 to-cyan-300 bg-clip-text text-transparent">Gewinnen. Aufsteigen.</span></h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">Jeder Platz ist verdient: bestätigte Matches, sichtbares Elo und eine Rangliste, die zeigt, wer die Arena gerade beherrscht.</p>
              <div className="mt-7 flex flex-wrap gap-3 text-xs font-bold text-zinc-300">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3.5 py-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Nur bestätigte Matches</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3.5 py-2"><Users className="h-3.5 w-3.5 text-cyan-300" /> {players.length} Ranked Spieler</span>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-black/35 p-5 backdrop-blur-xl sm:p-6">
              <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">Spieler finden</span><Radar className="h-5 w-5 text-emerald-300" /></div>
              <div className="relative mt-5">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Name eingeben..."
                  className="w-full rounded-2xl border border-white/10 bg-black/30 py-4 pl-11 pr-11 text-sm font-bold text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/40 focus:bg-white/[0.06]"
                />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 transition hover:text-white"><X size={16} /></button>}
              </div>
              <Link href="/matchmaking" className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3.5 text-sm font-black text-emerald-100 transition hover:bg-emerald-400/20"><span className="inline-flex items-center gap-2"><Swords className="h-4 w-4" /> Deinen Platz erspielen</span><ArrowUpRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </div>

        {/* Top-3 Podium — nur auf sm+ sichtbar */}
        {topPlayers.length >= 3 && (
          <div className="mb-8 hidden grid-cols-3 items-end gap-4 sm:grid md:mb-10">
            {podiumOrder.map((idx) => {
              const player = topPlayers[idx];
              if (!player) return null;
              const rank = getRankForElo(player.elo);
              const isGold = idx === 0;
              const winrate = player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0;
              return (
                <Link
                  key={player.username}
                  href={`/players/${encodeURIComponent(player.username)}`}
                  className={`group relative overflow-hidden rounded-[2rem] border p-5 text-center backdrop-blur-xl transition hover:-translate-y-2 ${
                    isGold
                      ? 'border-yellow-300/35 bg-gradient-to-b from-yellow-300/[0.14] via-yellow-400/[0.06] to-zinc-950 sm:scale-105 sm:pb-8'
                      : idx === 1 ? 'border-slate-200/20 bg-gradient-to-b from-slate-200/[0.09] to-zinc-950' : 'border-amber-500/20 bg-gradient-to-b from-amber-500/[0.08] to-zinc-950'
                  }`}
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-60" />
                  {isGold && <div className="absolute -right-5 -top-5 h-24 w-24 rounded-full bg-yellow-200/15 blur-2xl" />}
                  <div className={`relative mx-auto grid h-14 w-14 place-items-center rounded-2xl border text-2xl shadow-xl ${isGold ? 'border-yellow-200/40 bg-yellow-300 text-black shadow-yellow-300/20' : 'border-white/15 bg-black/30'}`}>{isGold ? <Crown className="h-7 w-7" /> : medals[idx]}</div>
                  <div className="relative mt-4 text-[10px] font-black uppercase tracking-[0.26em] text-zinc-500">Platz {idx + 1}</div>
                  <div className="relative mt-1 flex items-center justify-center">
                    <span className={`truncate text-xl font-black tracking-[-0.05em] ${player.isPremium ? premiumNameStyle : ''}`}>
                      {player.isPremium && <span className="sr-only">Premium </span>}
                      {player.username}
                    </span>
                  </div>
                  <div className={`relative mt-1 text-xs font-black uppercase tracking-[0.18em] ${rank.color}`}>L{rank.level} · {rank.name}</div>
                  <div className="relative mt-4 text-4xl font-black tracking-[-0.07em] text-emerald-300">{player.elo}</div>
                  <div className="relative mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Elo Rating</div>
                  <div className="relative mt-5 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 text-xs"><div><span className="block font-black text-white">{player.gamesPlayed}</span><span className="text-zinc-500">Matches</span></div><div><span className="block font-black text-cyan-300">{winrate}%</span><span className="text-zinc-500">Winrate</span></div></div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Spielerliste als Karten */}
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/85 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <div className="relative flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-white/[0.06] via-white/[0.03] to-transparent px-5 py-5 sm:px-7 sm:py-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/60 to-transparent" />
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-emerald-300"><Medal className="h-4 w-4" /> Globale Rangliste</div>
              <div className="mt-1 text-sm text-zinc-400">{searchQuery ? `${filteredPlayers.length} Treffer für „${searchQuery}“` : 'Top 100 · Nur bestätigte Ranked-Matches'}</div>
            </div>
            <Link
              href="/matchmaking"
              className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-400/20 sm:px-5 sm:text-sm"
            >
              Match suchen
            </Link>
          </div>

          <div className="divide-y divide-white/[0.07]">
            {filteredPlayers.map(({ player, index }) => {
              const rank = getRankForElo(player.elo);
              const winrate = player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0;
              const isTop3 = index < 3;
              const prize = [175, 100, 75, 50, 30][index];

              return (
                <Link
                  key={`${player.username}-${index}`}
                  href={`/players/${encodeURIComponent(player.username)}`}
                  className={`group flex items-center gap-3 px-5 py-4 transition hover:bg-emerald-400/[0.06] sm:gap-4 sm:px-6 sm:py-5 ${isTop3 ? 'bg-white/[0.02]' : ''}`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black sm:h-12 sm:w-12 sm:text-base ${
                    index === 0 ? 'bg-yellow-300 text-black' :
                    index === 1 ? 'bg-slate-300 text-black' :
                    index === 2 ? 'bg-amber-600 text-black' :
                    'border border-white/10 bg-white/[0.04] text-zinc-400 transition group-hover:border-emerald-300/30 group-hover:text-emerald-200'
                  }`}>
                    {isTop3 ? medals[index] : `#${index + 1}`}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`truncate text-sm font-black sm:text-base ${player.isPremium ? premiumNameStyle : ''}`}>
                        {player.isPremium && <span className="sr-only">Premium </span>}
                        {player.username}
                      </span>
                      {isTop3 && <Flame className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
                    </div>
                    <div className={`text-xs font-bold ${rank.color}`}>L{rank.level} · {rank.name}</div>
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
                    <div className="hidden text-center sm:block">
                      <div className="text-[11px] text-zinc-500">Ø Average</div>
                      <div className="text-sm font-black text-violet-300">
                        {player.supabaseId && avgMap[player.supabaseId] != null
                          ? avgMap[player.supabaseId].toFixed(1)
                          : '—'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-[11px] text-zinc-500">Elo</div>
                      <div className="text-lg font-black text-emerald-300 sm:text-xl">{player.elo}</div>
                    </div>
                    <ArrowUpRight className="hidden h-4 w-4 text-emerald-300/0 transition group-hover:text-emerald-300 md:block" />
                    {prize && (
                      <div className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black text-amber-100 sm:px-3 sm:text-xs">
                        {prize} €
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
          {filteredPlayers.length === 0 && (
            <div className="px-6 py-16 text-center"><Search className="mx-auto h-8 w-8 text-zinc-600" /><p className="mt-4 font-black text-zinc-200">Kein Spieler gefunden</p><p className="mt-1 text-sm text-zinc-500">Versuche es mit einem anderen Namen.</p></div>
          )}
        </div>

        {players.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-[2.5rem] border border-white/10 bg-white/[0.03] py-24 text-center backdrop-blur-xl">
            <Trophy size={48} className="mb-5 text-zinc-600" />
            <h3 className="text-2xl font-black">Noch keine Spieler</h3>
            <p className="mt-3 text-zinc-400">Sei der Erste im Leaderboard!</p>
          </div>
        )}

        <p className="mt-8 text-center text-sm text-zinc-500">
          Rangliste aktualisiert sich beim Laden · Season 01 bis 01.11.2026 · Saison-Preisgeld für die Top 5: 430 €
        </p>
      </section>
    </main>
  );
}

