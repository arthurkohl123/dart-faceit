'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Crown, Medal, Menu, Search, ShieldCheck, Swords, Trophy, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { BrandLogo } from '@/components/BrandLogo';
import { RankBadge } from '@/components/RankBadge';
import { StreamerBadge } from '@/components/StreamerBadge';
import { getRankForElo } from '@/lib/ranks';
import { useAuth } from '@/app/providers';

type PremiumCosmetic = 'emerald' | 'violet' | 'gold' | 'cyan';
type Player = {
  username: string;
  elo: number;
  gamesPlayed: number;
  wins: number;
  isPremium?: boolean;
  premium_cosmetic?: PremiumCosmetic | null;
  is_streamer?: boolean;
  supabaseId?: string;
};
type PlayerAvgMap = Record<string, number>;

const premiumNameStyles: Record<PremiumCosmetic, string> = {
  emerald: 'inline-flex max-w-full items-center border border-emerald-300/45 bg-emerald-300/10 px-1.5 py-0.5 text-emerald-100',
  violet: 'inline-flex max-w-full items-center border border-violet-300/45 bg-violet-400/10 px-1.5 py-0.5 text-violet-100',
  gold: 'inline-flex max-w-full items-center border border-amber-300/45 bg-amber-300/10 px-1.5 py-0.5 text-amber-100',
  cyan: 'inline-flex max-w-full items-center border border-cyan-300/45 bg-cyan-400/10 px-1.5 py-0.5 text-cyan-100',
};

const podiumPositions = ['01', '02', '03'];
const podiumMedals = ['🥇', '🥈', '🥉'];
const prizeMoney = [175, 100, 75, 50, 30];
const MIN_LEADERBOARD_GAMES = 10;
const MIN_RANKED_GAMES_FOR_COUNT = 1;

function premiumNameStyle(player: Player) {
  if (!player.isPremium) return '';
  const cosmetic: PremiumCosmetic = player.premium_cosmetic === 'violet' || player.premium_cosmetic === 'gold' || player.premium_cosmetic === 'cyan'
    ? player.premium_cosmetic
    : 'emerald';
  return premiumNameStyles[cosmetic];
}

function getWinrate(player: Player) {
  return player.gamesPlayed ? Math.round((player.wins / player.gamesPlayed) * 100) : 0;
}

function getPlayerAverage(player: Player, averages: PlayerAvgMap) {
  return player.supabaseId && averages[player.supabaseId] != null ? averages[player.supabaseId].toFixed(1) : '—';
}

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [rankedPlayerCount, setRankedPlayerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [avgMap, setAvgMap] = useState<PlayerAvgMap>({});
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myRankLoading, setMyRankLoading] = useState(false);
  const { user, profile: currentProfile, loading: authLoading } = useAuth();
  const currentUserId = user?.id ?? null;
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let isMounted = true;
    if (authLoading) return () => { isMounted = false; };

    async function fetchLeaderboard() {
      const canCalculatePersonalRank = Boolean(currentUserId && currentProfile && currentProfile.gamesPlayed >= MIN_LEADERBOARD_GAMES);
      setMyRank(null);
      setMyRankLoading(canCalculatePersonalRank);
      try {
        const [leaderboardResult, countResult] = await Promise.all([
          supabase.from('public_visible_profiles').select('username, elo, gamesPlayed, wins, isPremium, premium_cosmetic, is_streamer, supabaseId').gte('gamesPlayed', MIN_LEADERBOARD_GAMES).order('elo', { ascending: false }).limit(100),
          supabase.from('public_visible_profiles').select('supabaseId', { count: 'exact', head: true }).gte('gamesPlayed', MIN_RANKED_GAMES_FOR_COUNT),
        ]);
        if (leaderboardResult.error) throw leaderboardResult.error;
        const rankedPlayers = (leaderboardResult.data || []) as Player[];
        if (!isMounted) return;
        setPlayers(rankedPlayers);
        setRankedPlayerCount(countResult.error ? rankedPlayers.length : Math.max(countResult.count ?? 0, rankedPlayers.length));
        if (countResult.error) console.warn('Anzahl der Ranked-Spieler konnte nicht geladen werden:', countResult.error);

        if (canCalculatePersonalRank && currentUserId && currentProfile) {
          const listedIndex = rankedPlayers.findIndex((player) => player.supabaseId === currentUserId);
          if (listedIndex >= 0) {
            setMyRank(listedIndex + 1);
          } else {
            const { count: playersAhead, error: rankError } = await supabase
              .from('public_visible_profiles')
              .select('supabaseId', { count: 'exact', head: true })
              .gte('gamesPlayed', MIN_LEADERBOARD_GAMES)
              .gt('elo', currentProfile.elo);
            if (rankError) {
              console.warn('Eigene Ranglistenplatzierung konnte nicht geladen werden:', rankError);
            } else {
              setMyRank((playersAhead ?? 0) + 1);
            }
          }
        }

        const ids = rankedPlayers.map((player) => player.supabaseId).filter(Boolean) as string[];
        if (ids.length) {
          const { data: statistics } = await supabase.rpc('get_public_player_statistics', { p_user_ids: ids });
          const averages: PlayerAvgMap = {};
          for (const stat of (statistics ?? []) as { user_id: string; average: number | null }[]) {
            if (stat.average !== null && Number.isFinite(stat.average)) averages[stat.user_id] = stat.average;
          }
          if (isMounted) setAvgMap(averages);
        }
      } catch (error) {
        console.error('Rangliste konnte nicht geladen werden:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
          setMyRankLoading(false);
        }
      }
    }

    void fetchLeaderboard();
    return () => { isMounted = false; };
  }, [authLoading, currentProfile, currentUserId, supabase]);

  const filteredPlayers = players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player.username.toLowerCase().includes(searchQuery.toLowerCase()));
  const podiumPlayers = [players[1], players[0], players[2]]
    .map((player, podiumIndex) => ({ player, place: [1, 0, 2][podiumIndex] }))
    .filter((entry): entry is { player: Player; place: number } => Boolean(entry.player));

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#080b0a] text-zinc-300"><div className="border border-white/15 bg-[#0d1110] px-6 py-4 font-bold">Rangliste wird geladen…</div></main>;
  }

  return (
    <main className="leaderboard-page text-[#f7f5ef]">
      <nav className="leaderboard-nav border-b backdrop-blur-xl">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4 px-5 py-4 md:px-8 lg:px-10">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-10 w-10 shrink-0 rounded-lg" />
            <span className="min-w-0"><span className="block text-lg font-black tracking-[-.05em]">RANKEDDARTS</span><span className="block text-[9px] font-black uppercase tracking-[.25em] text-emerald-300">Competitive darts</span></span>
          </Link>
          <div className="hidden items-center gap-7 text-[13px] font-bold text-zinc-300 lg:flex">
            <Link href="/leaderboard" className="text-emerald-200">Rangliste</Link>
            <Link href="/matchmaking" className="transition hover:text-white">Matchmaking</Link>
            <Link href="/tournaments" className="transition hover:text-white">Turniere</Link>
            <Link href="/streamers" className="transition hover:text-white">Streamer</Link>
            <Link href="/history" className="transition hover:text-white">Match-Verlauf</Link>
            <Link href="/premium" className="border border-emerald-300/35 px-3 py-1.5 text-emerald-200 transition hover:bg-emerald-300/10">Premium</Link>
          </div>
          <button onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-10 w-10 shrink-0 place-items-center border border-white/15 text-zinc-200 lg:hidden" aria-label="Menü öffnen">{mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
        {mobileMenuOpen && <div className="border-t border-white/10 bg-[#080b0a]/95 px-5 py-3 lg:hidden"><div className="grid gap-1 text-sm font-bold text-zinc-300">{[['Rangliste', '/leaderboard'], ['Matchmaking', '/matchmaking'], ['Turniere', '/tournaments'], ['Streamer', '/streamers'], ['Match-Verlauf', '/history'], ['Premium', '/premium']].map(([label, href]) => <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="border-b border-white/5 py-3 transition hover:text-emerald-200">{label}</Link>)}</div></div>}
      </nav>

      <section className="leaderboard-shell mx-auto px-5 pb-16 pt-12 md:px-8 md:pb-24 md:pt-16 lg:px-10">
        <header className="leaderboard-hero">
          <div className="leaderboard-hero-copy">
            <p className="leaderboard-kicker">Season 01 · bis 01.11.2026</p>
            <h1 className="leaderboard-title mt-6">Wer steht<br /><span className="text-emerald-300">oben?</span></h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8">Die Rangliste zeigt die Spieler, die sich ihre Elo im direkten Duell erspielen. Jeder Platz ist das Ergebnis bestätigter Matches.</p>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-l border-emerald-300/55 pl-4 text-xs font-bold text-zinc-400">
              <span className="inline-flex items-center gap-2 text-emerald-100"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Nur bestätigte Ergebnisse</span>
              <span>Ab {MIN_LEADERBOARD_GAMES} Ranked-Matches</span>
            </div>
          </div>

          <div className="leaderboard-podium">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
              <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-amber-100"><Crown className="h-4 w-4 text-amber-200" /> Spitze der Saison</span>
              <span className="text-[10px] font-black uppercase tracking-[.14em] text-zinc-500">Top 3</span>
            </div>
            {podiumPlayers.length ? (
              <div className="grid grid-cols-3 divide-x divide-white/[.08]">
                {podiumPlayers.map(({ player, place }) => {
                  const tier = getRankForElo(player.elo);
                  const orderClass = place === 0 ? 'leaderboard-podium-winner' : '';
                  return (
                    <Link key={player.username + '-podium'} href={'/players/' + encodeURIComponent(player.username)} className={'leaderboard-podium-player group min-w-0 px-3 py-5 text-center sm:px-5 sm:py-6 ' + orderClass}>
                      <span className={'mx-auto grid h-7 w-7 place-items-center text-[10px] font-black ' + (place === 0 ? 'bg-amber-300 text-[#171108]' : 'border border-white/15 text-zinc-300')}>{podiumPositions[place]}</span>
                      <RankBadge level={tier.level} size="md" priority={place === 0} className="mx-auto mt-3 h-12 w-12 sm:h-16 sm:w-16" />
                      <span className={'mt-3 block truncate text-sm font-black ' + (player.isPremium ? 'text-amber-100' : 'text-[#f7f5ef]')}>{player.username}</span>
                      <span className={'mt-1 block text-[10px] font-black uppercase tracking-[.13em] ' + tier.color}>L{tier.level} · {tier.name}</span>
                      <span className="mt-3 block text-xl font-black tracking-[-.06em] text-emerald-200">{player.elo}</span>
                      <span className="mt-1 block text-[9px] font-black uppercase tracking-[.13em] text-zinc-500">Elo · {prizeMoney[place]} €</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="px-6 py-12 text-center text-sm text-zinc-500">Die Spitze wird geladen.</div>
            )}
          </div>
        </header>

        <section className="leaderboard-stat-rail mt-5 grid grid-cols-2 md:grid-cols-4">
          <div className="px-5 py-5"><Users className="h-4 w-4 text-emerald-300" /><p className="mt-3 text-3xl font-black tracking-[-.06em]">{rankedPlayerCount}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[.15em] text-zinc-500">Ranked-Spieler</p></div>
          <div className="px-5 py-5"><ShieldCheck className="h-4 w-4 text-emerald-300" /><p className="mt-3 text-sm font-black">Nur bestätigt</p><p className="mt-1 text-[9px] font-black uppercase tracking-[.15em] text-zinc-500">Gewertet</p></div>
          <div className="px-5 py-5"><Trophy className="h-4 w-4 text-amber-200" /><p className="mt-3 text-sm font-black">430 €</p><p className="mt-1 text-[9px] font-black uppercase tracking-[.15em] text-zinc-500">Saison-Preisgeld</p></div>
          <div className="px-5 py-5"><Swords className="h-4 w-4 text-emerald-300" /><p className="mt-3 text-sm font-black">1 gegen 1</p><p className="mt-1 text-[9px] font-black uppercase tracking-[.15em] text-zinc-500">Ranked-Duelle</p></div>
        </section>

        {currentUserId && (
          <section className="leaderboard-personal mt-7">
            <div className="leaderboard-personal-rank">
              <p className="text-[10px] font-black uppercase tracking-[.17em] text-emerald-200/70">Dein Platz</p>
              <p className="mt-2 text-5xl font-black tracking-[-.08em] text-emerald-200">{myRankLoading ? '…' : myRank ? '#' + myRank : '—'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[.17em] text-emerald-200/70">Deine Ranglisten-Übersicht</p>
              <p className="mt-2 truncate text-xl font-black">{currentProfile?.username ?? user?.user_metadata?.username ?? 'Dein Profil'}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{currentProfile?.gamesPlayed ? currentProfile.gamesPlayed + ' bestätigte Ranked-Spiele · ' + currentProfile.elo + ' Elo' : 'Spiele mindestens ' + MIN_LEADERBOARD_GAMES + ' bestätigte Ranked-Matches, um in der Rangliste zu erscheinen.'}</p>
            </div>
            <p className="max-w-sm text-xs leading-5 text-zinc-500">{myRank && myRank > 100 ? 'Dein Platz liegt außerhalb der sichtbaren Top 100, wird aber weiterhin für dich berechnet.' : myRank ? 'Du bist in der Top 100 und in der Liste markiert.' : 'Deine Platzierung wird ab ' + MIN_LEADERBOARD_GAMES + ' bestätigten Ranked-Matches berechnet.'}</p>
          </section>
        )}

        <section className="leaderboard-command mt-10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-300">Die gesamte Leiter</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-.06em] sm:text-4xl">Globale Rangliste.</h2>
            <p className="mt-2 text-sm text-zinc-500">{searchQuery ? filteredPlayers.length + ' Treffer für „' + searchQuery + '“' : 'Top 100 · Nur bestätigte Ranked-Matches'}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="player-search" className="leaderboard-search">
              <Search className="h-4 w-4 text-zinc-500" />
              <input id="player-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Spieler finden" className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-zinc-600" />
              {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="text-zinc-500 transition hover:text-white" aria-label="Suche löschen"><X size={15} /></button>}
            </label>
            <Link href="/matchmaking" className="inline-flex shrink-0 items-center justify-center gap-2 bg-emerald-300 px-5 py-3 text-xs font-black uppercase tracking-[.12em] text-[#07100b] transition hover:bg-emerald-200">Match suchen <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </section>

        <section className="mt-6 md:hidden">
          <div className="leaderboard-mobile-list">
            {filteredPlayers.map(({ player, index }) => {
              const tier = getRankForElo(player.elo);
              const isCurrentUser = currentUserId === player.supabaseId;
              const prize = prizeMoney[index];
              return (
                <Link key={player.username + '-' + index} href={'/players/' + encodeURIComponent(player.username)} className={'leaderboard-mobile-row grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition hover:bg-emerald-300/[.045] ' + (index < 3 ? 'leaderboard-top-row' : '') + (isCurrentUser ? ' leaderboard-current-row' : '')}>
                  <span className={'grid h-8 w-8 place-items-center text-xs font-black ' + (index < 3 ? 'bg-amber-300 text-[#171108]' : 'border border-white/10 text-zinc-400')}>{index < 3 ? podiumMedals[index] : '#' + (index + 1)}</span>
                  <span className="flex min-w-0 items-center gap-2"><RankBadge level={tier.level} size="xs" /><span className="min-w-0"><span className="flex min-w-0 items-center gap-2"><span className={'block truncate text-sm font-black ' + premiumNameStyle(player)}>{player.username}</span>{player.is_streamer && <StreamerBadge compact />}{isCurrentUser && <span className="shrink-0 border border-emerald-200/35 bg-emerald-200/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[.12em] text-emerald-100">Du</span>}</span><span className={'mt-1 block text-[10px] font-bold ' + tier.color}>L{tier.level} · {tier.name} · {getWinrate(player)}%</span></span></span>
                  <span className="text-right"><span className="block text-lg font-black text-emerald-300">{player.elo}</span><span className="block text-[10px] font-black text-zinc-500">Ø {getPlayerAverage(player, avgMap)}{prize ? ' · ' + prize + ' €' : ''}</span></span>
                </Link>
              );
            })}
            {filteredPlayers.length === 0 && <div className="px-5 py-14 text-center"><Search className="mx-auto h-6 w-6 text-zinc-600" /><p className="mt-3 font-black">Kein Spieler gefunden</p><p className="mt-1 text-sm text-zinc-500">Versuche es mit einem anderen Namen.</p></div>}
          </div>
        </section>

        <section className="leaderboard-table mt-6 hidden overflow-x-auto md:block">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[3.5rem_minmax(12rem,1fr)_4.5rem_5rem_6rem_5rem_4.5rem] items-center gap-4 border-b border-white/10 px-6 py-3 text-[10px] font-black uppercase tracking-[.13em] text-zinc-500"><span>Platz</span><span>Spieler</span><span className="text-right">Spiele</span><span className="text-right">Winrate</span><span className="text-right">Ø Average</span><span className="text-right">Elo</span><span className="text-right">Preis</span></div>
            <div className="divide-y divide-white/[.08]">
              {filteredPlayers.map(({ player, index }) => {
                const tier = getRankForElo(player.elo);
                const isCurrentUser = currentUserId === player.supabaseId;
                const prize = prizeMoney[index];
                return (
                  <Link key={player.username + '-table-' + index} href={'/players/' + encodeURIComponent(player.username)} className={'leaderboard-table-row grid grid-cols-[3.5rem_minmax(0,1fr)_4.5rem_5rem_6rem_5rem_4.5rem] items-center gap-4 px-6 py-4 transition ' + (index < 3 ? 'leaderboard-top-row' : '') + (isCurrentUser ? ' leaderboard-current-row' : '')}>
                    <span className={'grid h-8 w-8 place-items-center text-xs font-black ' + (index < 3 ? 'bg-amber-300 text-[#171108]' : 'border border-white/10 text-zinc-400')}>{index < 3 ? podiumMedals[index] : '#' + (index + 1)}</span>
                    <span className="flex min-w-0 items-center gap-3"><RankBadge level={tier.level} size="xs" /><span className="min-w-0"><span className="flex min-w-0 items-center gap-2"><span className={'block truncate text-sm font-black ' + premiumNameStyle(player)}>{player.username}</span>{player.is_streamer && <StreamerBadge compact />}{isCurrentUser && <span className="shrink-0 border border-emerald-200/35 bg-emerald-200/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[.12em] text-emerald-100">Du</span>}</span><span className={'mt-1 block text-xs font-bold ' + tier.color}>L{tier.level} · {tier.name}</span></span></span>
                    <span className="text-right text-sm font-black">{player.gamesPlayed}</span>
                    <span className="text-right text-sm font-black text-zinc-200">{getWinrate(player)}%</span>
                    <span className="text-right text-sm font-black text-zinc-200">{getPlayerAverage(player, avgMap)}</span>
                    <span className="text-right text-lg font-black text-emerald-300">{player.elo}</span>
                    <span className="text-right text-xs font-black text-amber-100">{prize ? prize + ' €' : '—'}</span>
                  </Link>
                );
              })}
              {filteredPlayers.length === 0 && <div className="px-6 py-16 text-center"><Search className="mx-auto h-7 w-7 text-zinc-600" /><p className="mt-3 font-black">Kein Spieler gefunden</p><p className="mt-1 text-sm text-zinc-500">Versuche es mit einem anderen Namen.</p></div>}
            </div>
          </div>
        </section>

        {players.length === 0 && <div className="mt-6 border border-dashed border-white/15 py-20 text-center"><Trophy className="mx-auto h-9 w-9 text-zinc-600" /><h2 className="mt-4 text-xl font-black">Noch keine Ranked-Spieler</h2><p className="mt-2 text-sm text-zinc-500">Sei der Erste in der Rangliste.</p></div>}
      </section>
    </main>
  );
}
