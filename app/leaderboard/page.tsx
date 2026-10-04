'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Medal, Menu, Search, ShieldCheck, Swords, Trophy, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { BrandLogo } from '@/components/BrandLogo';
import { getRankForElo } from '@/lib/ranks';
import { useAuth } from '@/app/providers';

type Player = { username: string; elo: number; gamesPlayed: number; wins: number; isPremium?: boolean; supabaseId?: string; };
type PlayerAvgMap = Record<string, number>;
const premiumNameStyle = 'inline-flex max-w-full items-center border border-emerald-300/45 bg-emerald-300/10 px-1.5 py-0.5 text-emerald-100';

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
      const canCalculatePersonalRank = Boolean(currentUserId && currentProfile && currentProfile.gamesPlayed > 0);
      setMyRank(null);
      setMyRankLoading(canCalculatePersonalRank);
      try {
        const [leaderboardResult, countResult] = await Promise.all([
          supabase.from('public_visible_profiles').select('username, elo, gamesPlayed, wins, isPremium, supabaseId').gte('gamesPlayed', 1).order('elo', { ascending: false }).limit(100),
          supabase.from('public_visible_profiles').select('supabaseId', { count: 'exact', head: true }).gte('gamesPlayed', 1),
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
              .gte('gamesPlayed', 1)
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

  const filteredPlayers = players.map((player, index) => ({ player, index })).filter(({ player }) => player.username.toLowerCase().includes(searchQuery.toLowerCase()));
  const medals = ['🥇', '🥈', '🥉'];

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#0a0d0d] text-zinc-300"><div className="border border-white/15 bg-[#0d1110] px-6 py-4 font-bold">Rangliste wird geladen…</div></main>;

  return (
    <main className="arena-page text-[#f5f3ee]">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 sport-grid opacity-30" />
      <nav className="arena-nav border-b border-white/10 bg-[#0a0d0d]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3"><BrandLogo className="h-10 w-10 rounded-lg" /><span><span className="block text-lg font-black tracking-[-.05em]">RANKEDDARTS</span><span className="block text-[9px] font-bold uppercase tracking-[.25em] text-emerald-300">Rangliste</span></span></Link>
          <div className="hidden items-center gap-5 text-[13px] font-semibold text-zinc-300 lg:flex"><Link href="/matchmaking" className="hover:text-white">Matchmaking</Link><Link href="/showdown" className="text-violet-200 hover:text-violet-100">Showdown</Link><Link href="/tournaments" className="hover:text-white">Turniere</Link><Link href="/history" className="hover:text-white">History</Link><Link href="/premium" className="border border-emerald-300/35 px-3 py-1.5 text-emerald-200 hover:bg-emerald-300/10">Premium</Link></div>
          <button onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-9 w-9 place-items-center border border-white/15 lg:hidden" aria-label="Menü öffnen">{mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
        {mobileMenuOpen && <div className="border-t border-white/10 px-5 py-3 lg:hidden"><div className="grid gap-1 text-sm font-bold text-zinc-300">{[['Matchmaking', '/matchmaking'], ['Mittwoch Showdown', '/showdown'], ['Turniere', '/tournaments'], ['History', '/history'], ['Premium', '/premium']].map(([label, href]) => <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="border-b border-white/5 py-3 hover:text-emerald-200">{label}</Link>)}</div></div>}
      </nav>

      <section className="arena-content mx-auto px-5 py-12 md:px-8 md:py-16">
        <header className="arena-hero grid gap-8 py-8 lg:grid-cols-[1fr_25rem] lg:items-end md:py-10">
          <div><p className="border-l-2 border-emerald-300 pl-3 text-[11px] font-black uppercase tracking-[.2em] text-emerald-200">Season 01 · bis 01.11.2026</p><h1 className="mt-5 text-5xl font-black leading-[.88] tracking-[-.075em] md:text-7xl">Globale<br /><span className="text-emerald-300">Rangliste.</span></h1><p className="mt-5 max-w-xl leading-7 text-zinc-400">Top 100 nach Elo. Gewertet werden ausschließlich bestätigte Ranked-Matches.</p></div>
          <div className="border border-white/15 bg-[#0d1110] p-4"><label htmlFor="player-search" className="text-[10px] font-black uppercase tracking-[.16em] text-zinc-500">Spieler finden</label><div className="relative mt-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input id="player-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Name eingeben" className="w-full border border-white/10 bg-black/30 py-3 pl-10 pr-9 text-sm font-bold outline-none placeholder:text-zinc-600 focus:border-emerald-300" />{searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white" aria-label="Suche löschen"><X size={15} /></button>}</div><Link href="/matchmaking" className="mt-3 flex items-center justify-between border border-emerald-300 bg-emerald-300 px-4 py-3 text-xs font-black uppercase tracking-[.1em] text-[#07100b] hover:bg-emerald-200">Match suchen <ArrowUpRight className="h-4 w-4" /></Link></div>
        </header>

        <div className="mt-5 grid grid-cols-2 border border-white/10 bg-[#0d1110] md:grid-cols-4"><div className="border-b border-r border-white/10 px-5 py-4 md:border-b-0"><Users className="h-4 w-4 text-emerald-300" /><p className="mt-2 text-2xl font-black">{rankedPlayerCount}</p><p className="text-[10px] font-black uppercase tracking-[.13em] text-zinc-500">Ranked-Spieler</p></div><div className="border-b border-white/10 px-5 py-4 md:border-b-0 md:border-r"><ShieldCheck className="h-4 w-4 text-emerald-300" /><p className="mt-2 text-sm font-black">Nur bestätigt</p><p className="mt-1 text-[10px] font-black uppercase tracking-[.13em] text-zinc-500">Wertung</p></div><div className="border-r border-white/10 px-5 py-4"><Trophy className="h-4 w-4 text-amber-200" /><p className="mt-2 text-sm font-black">430 €</p><p className="mt-1 text-[10px] font-black uppercase tracking-[.13em] text-zinc-500">Saison-Preisgeld</p></div><div className="px-5 py-4"><Swords className="h-4 w-4 text-emerald-300" /><p className="mt-2 text-sm font-black">1v1</p><p className="mt-1 text-[10px] font-black uppercase tracking-[.13em] text-zinc-500">Ranked-Duelle</p></div></div>

        {currentUserId && (
          <section className="mt-8 border border-emerald-300/30 bg-emerald-300/[.055]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-300/15 px-5 py-4">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.18em] text-emerald-200"><ShieldCheck className="h-4 w-4" /> Deine Ranglisten-Übersicht</div>
              <span className="border border-emerald-300/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-[.12em] text-emerald-200/70">Nur für dich sichtbar</span>
            </div>
            <div className="grid gap-5 px-5 py-5 md:grid-cols-[9rem_minmax(0,1fr)_auto] md:items-center md:px-6">
              <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-200/70">Dein Platz</p><p className="mt-1 text-4xl font-black tracking-[-.06em] text-emerald-200">{myRankLoading ? '…' : myRank ? `#${myRank}` : currentProfile?.gamesPlayed ? '—' : '—'}</p></div>
              <div><p className="text-lg font-black text-zinc-100">{currentProfile?.username ?? user?.user_metadata?.username ?? 'Dein Profil'}</p><p className="mt-1 text-sm text-zinc-400">{currentProfile?.gamesPlayed ? `${currentProfile.gamesPlayed} bestätigte Ranked-Spiele · ${currentProfile.elo} Elo` : 'Spiele dein erstes bestätigtes Ranked-Match, um in der Rangliste zu erscheinen.'}</p><p className="mt-3 text-xs leading-5 text-zinc-500">{myRank && myRank > 100 ? 'Du liegst aktuell außerhalb der sichtbaren Top 100. Deine persönliche Platzierung wird trotzdem hier angezeigt.' : myRank ? 'Du bist in den Top 100. Dein Eintrag ist in der Liste zusätzlich markiert.' : 'Deine Platzierung wird nach dem ersten gewerteten Spiel berechnet.'}</p></div>
              {myRank && myRank > 100 && <span className="w-fit border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs font-black text-amber-100">Außerhalb Top 100</span>}
            </div>
          </section>
        )}

        <section className="mt-10 md:hidden">
          <div className="mb-3 flex items-end justify-between border-b border-white/10 pb-3">
            <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-300">Globale Rangliste</p><p className="mt-1 text-xs text-zinc-500">{searchQuery ? `${filteredPlayers.length} Treffer` : 'Top 100 · Ranked-Matches'}</p></div>
            <Link href="/matchmaking" className="text-xs font-black text-emerald-200">Match suchen →</Link>
          </div>
          <div className="arena-ledger">
            {filteredPlayers.map(({ player, index }) => {
              const rank = getRankForElo(player.elo);
              const winrate = player.gamesPlayed ? Math.round((player.wins / player.gamesPlayed) * 100) : 0;
              const prize = [175, 100, 75, 50, 30][index];
              const isCurrentUser = currentUserId === player.supabaseId;
              return <Link key={`${player.username}-${index}`} href={`/players/${encodeURIComponent(player.username)}`} className={`arena-ledger-row grid grid-cols-[2.4rem_minmax(0,1fr)_auto] items-center gap-3 border-l-emerald-300 px-4 py-4 transition hover:bg-emerald-300/[.045] ${isCurrentUser ? 'border-l-2 border-emerald-200 bg-emerald-300/[.08]' : ''}`}><span className={`grid h-8 w-8 place-items-center text-xs font-black ${index < 3 ? 'bg-amber-300 text-black' : 'border border-white/10 text-zinc-400'}`}>{index < 3 ? medals[index] : `#${index + 1}`}</span><span className="min-w-0"><span className="flex min-w-0 items-center gap-2"><span className={`block truncate text-sm font-black ${player.isPremium ? premiumNameStyle : ''}`}>{player.username}</span>{isCurrentUser && <span className="shrink-0 border border-emerald-200/35 bg-emerald-200/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[.12em] text-emerald-100">Du</span>}</span><span className={`mt-1 block text-[11px] font-bold ${rank.color}`}>L{rank.level} · {rank.name} · {player.gamesPlayed} Spiele · {winrate}%</span></span><span className="text-right"><span className="block text-lg font-black text-emerald-300">{player.elo}</span><span className="block text-[10px] font-black text-zinc-500">{player.supabaseId && avgMap[player.supabaseId] != null ? `Ø ${avgMap[player.supabaseId].toFixed(1)}` : 'Ø —'}{prize ? ` · ${prize} €` : ''}</span></span></Link>;
            })}
            {filteredPlayers.length === 0 && <div className="px-5 py-14 text-center"><Search className="mx-auto h-6 w-6 text-zinc-600" /><p className="mt-3 font-black">Kein Spieler gefunden</p><p className="mt-1 text-sm text-zinc-500">Versuche es mit einem anderen Namen.</p></div>}
          </div>
        </section>

        <div className="hidden md:block">

        <section className="mt-12 overflow-x-auto border border-white/15 bg-[#0d1110]"><div className="flex min-w-[760px] items-center justify-between border-b border-white/15 px-6 py-5"><div><p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.18em] text-emerald-300"><Medal className="h-4 w-4" /> Globale Rangliste</p><p className="mt-1 text-sm text-zinc-500">{searchQuery ? `${filteredPlayers.length} Treffer für „${searchQuery}“` : 'Top 100 · Nur bestätigte Ranked-Matches'}</p></div><Link href="/matchmaking" className="border border-emerald-300/35 px-4 py-2 text-xs font-black text-emerald-200 hover:bg-emerald-300/10">Match suchen</Link></div><div className="hidden min-w-[760px] grid-cols-[3.5rem_minmax(12rem,1fr)_4.5rem_5rem_6rem_5rem_4.5rem] items-center gap-4 border-b border-white/10 px-6 py-3 text-[10px] font-black uppercase tracking-[.13em] text-zinc-500 md:grid"><span>Platz</span><span>Spieler</span><span className="text-right">Spiele</span><span className="text-right">Winrate</span><span className="text-right">Ø Average</span><span className="text-right">Elo</span><span className="text-right">Preis</span></div><div className="divide-y divide-white/10">{filteredPlayers.map(({ player, index }) => { const rank = getRankForElo(player.elo); const winrate = player.gamesPlayed ? Math.round((player.wins / player.gamesPlayed) * 100) : 0; const prize = [175, 100, 75, 50, 30][index]; const isCurrentUser = currentUserId === player.supabaseId; return <Link key={`${player.username}-${index}`} href={`/players/${encodeURIComponent(player.username)}`} className={`grid min-w-[760px] grid-cols-[3.5rem_minmax(12rem,1fr)_4.5rem_5rem_6rem_5rem_4.5rem] items-center gap-4 px-6 py-4 transition hover:bg-emerald-300/[.045] ${isCurrentUser ? 'border-l-2 border-emerald-200 bg-emerald-300/[.08]' : ''}`}><span className={`grid h-8 w-8 place-items-center text-xs font-black ${index < 3 ? 'bg-amber-300 text-black' : 'border border-white/10 text-zinc-400'}`}>{index < 3 ? medals[index] : `#${index + 1}`}</span><span className="min-w-0"><span className="flex min-w-0 items-center gap-2"><span className={`block truncate text-sm font-black ${player.isPremium ? premiumNameStyle : ''}`}>{player.username}</span>{isCurrentUser && <span className="shrink-0 border border-emerald-200/35 bg-emerald-200/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[.12em] text-emerald-100">Du</span>}</span><span className={`mt-1 block text-xs font-bold ${rank.color}`}>L{rank.level} · {rank.name}</span></span><span className="text-right text-sm font-black">{player.gamesPlayed}</span><span className="text-right text-sm font-black text-zinc-200">{winrate}%</span><span className="text-right text-sm font-black text-zinc-200">{player.supabaseId && avgMap[player.supabaseId] != null ? avgMap[player.supabaseId].toFixed(1) : '—'}</span><span className="text-right text-lg font-black text-emerald-300">{player.elo}</span><span className="text-right text-xs font-black text-amber-100">{prize ? `${prize} €` : '—'}</span></Link>; })}</div>{filteredPlayers.length === 0 && <div className="min-w-[760px] px-6 py-16 text-center"><Search className="mx-auto h-7 w-7 text-zinc-600" /><p className="mt-3 font-black">Kein Spieler gefunden</p><p className="mt-1 text-sm text-zinc-500">Versuche es mit einem anderen Namen.</p></div>}</section>

        </div>

        {players.length === 0 && <div className="border border-dashed border-white/15 py-20 text-center"><Trophy className="mx-auto h-9 w-9 text-zinc-600" /><h2 className="mt-4 text-xl font-black">Noch keine Ranked-Spieler</h2><p className="mt-2 text-sm text-zinc-500">Sei der Erste in der Rangliste.</p></div>}
      </section>
    </main>
  );
}
