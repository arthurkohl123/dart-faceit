'use client';

import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Trophy, Star, Search, Shield, Crown, Activity, Sparkles, User as UserIcon 
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import React from 'react';

// --- ADAPTIVE RANK ICON ---
const RankIcon = memo(({ type, size = "w-10 h-10 md:w-12 md:h-12" }: { type: string, size?: string }) => {
  const baseClass = `${size} flex items-center justify-center rounded-xl md:rounded-2xl border shadow-lg transition-all duration-500`;
  const styles: Record<string, string> = {
    'Eisen': 'bg-zinc-800 border-zinc-700 text-zinc-400',
    'Bronze': 'bg-orange-900/40 border-orange-800 text-orange-200',
    'Silber': 'bg-slate-700 border-slate-600 text-slate-100',
    'Gold': 'bg-yellow-700/40 border-yellow-600 text-yellow-100',
    'Platin': 'bg-cyan-800/40 border-cyan-700 text-cyan-100',
    'Diamant': 'bg-blue-800/40 border-blue-700 text-blue-100',
    'Legende': 'bg-emerald-700/40 border-emerald-600 text-white',
  };
  return (
    <div className={`${baseClass} ${styles[type] || styles['Eisen']}`}>
      {type === 'Legende' ? <Crown className="w-1/2 h-1/2" /> : <Shield className="w-1/2 h-1/2" />}
    </div>
  );
});
RankIcon.displayName = 'RankIcon';

type Player = {
  username: string;
  elo: number;
  gamesPlayed: number;
  wins: number;
  isPremium?: boolean;
  supabaseId?: string;
};

const rankTiers = [
  { name: 'Eisen',   min: 0,    color: 'text-zinc-400' },
  { name: 'Bronze',  min: 1000, color: 'text-orange-400' },
  { name: 'Silber',  min: 1250, color: 'text-slate-300' },
  { name: 'Gold',    min: 1500, color: 'text-yellow-400' },
  { name: 'Platin',  min: 1750, color: 'text-cyan-400' },
  { name: 'Diamant', min: 2000, color: 'text-blue-400' },
  { name: 'Legende', min: 2500, color: 'text-emerald-400' },
];

function getRank(elo: number) {
  return rankTiers.reduce((cur, r) => (elo >= r.min ? r : cur), rankTiers[0]);
}

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [avgMap, setAvgMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  const supabase = useMemo(() => createClient(), []);

  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('public_profiles')
        .select('username, elo, gamesPlayed, wins, isPremium, supabaseId')
        .gte('gamesPlayed', 1)
        .order('elo', { ascending: false })
        .limit(100);

      if (!error && data) {
        const playerList = data as Player[];
        setPlayers(playerList);
        const ids = playerList.map(p => p.supabaseId).filter(Boolean) as string[];
        if (ids.length > 0) {
          const { data: matchData } = await supabase
            .from('active_matches')
            .select('player1_id, player2_id, submitted_player1_average, submitted_player2_average')
            .eq('status', 'completed')
            .limit(1000);

          if (matchData) {
            const sums: Record<string, { total: number; count: number }> = {};
            matchData.forEach(m => {
              const add = (id: string, avg: number | null) => {
                if (!avg || !ids.includes(id)) return;
                if (!sums[id]) sums[id] = { total: 0, count: 0 };
                sums[id].total += avg;
                sums[id].count += 1;
              };
              add(m.player1_id, m.submitted_player1_average);
              add(m.player2_id, m.submitted_player2_average);
            });
            const map: Record<string, number> = {};
            Object.entries(sums).forEach(([id, { total, count }]) => { map[id] = total / count; });
            setAvgMap(map);
          }
        }
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    supabase.auth.getSession().then(({ data: { session } }) => setIsLoggedIn(!!session));
    fetchLeaderboard();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [supabase, fetchLeaderboard]);

  const topPlayers = useMemo(() => players.slice(0, 3), [players]);
  const filteredPlayers = useMemo(() => players.filter(p => p.username.toLowerCase().includes(searchQuery.toLowerCase())), [players, searchQuery]);

  if (loading && players.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020304]">
        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden">
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-black/80 backdrop-blur-xl py-4 border-b border-white/5' : 'bg-transparent py-6 md:py-8'}`}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 md:gap-4 group">
            <div className="w-9 h-9 md:w-11 md:h-11 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-xl md:text-2xl shadow-2xl transition-all group-hover:rotate-6">R</div>
            <div className="flex flex-col">
              <span className="text-lg md:text-xl font-black tracking-tighter uppercase leading-none">RankedDarts</span>
              <span className="text-[8px] md:text-[9px] font-black text-emerald-500 tracking-[0.4em] uppercase mt-1">Leaderboard</span>
            </div>
          </Link>
          <Link href={isLoggedIn ? '/profile' : '/auth/login'} className="px-5 md:px-8 py-2 md:py-3 rounded-xl md:rounded-2xl bg-white/5 border border-white/10 text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all">{isLoggedIn ? 'Dashboard' : 'Sign In'}</Link>
        </div>
      </nav>

      <section className="relative z-10 pt-32 md:pt-48 pb-24 md:pb-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center md:items-end justify-between mb-16 md:mb-24 gap-8 text-center md:text-left">
            <div className="space-y-4 md:space-y-6">
              <div className="inline-flex items-center gap-2 md:gap-3 px-4 md:px-5 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-emerald-400"><Trophy className="w-3 md:w-3.5 h-3 md:h-3.5" /> Season Rewards</div>
              <h1 className="text-5xl md:text-8xl font-black tracking-tighter italic uppercase leading-[0.8]">Leaderboard</h1>
              <p className="text-zinc-500 text-base md:text-lg max-w-xl font-medium px-4 md:px-0">Dominiere das Feld und sichere dir <span className="text-emerald-400 font-black italic">Gratis Premium</span>.</p>
            </div>
            <div className="w-full md:w-96 relative px-4 md:px-0">
               <Search className="absolute left-10 md:left-6 top-1/2 -translate-y-1/2 w-4 md:w-5 h-4 md:h-5 text-zinc-500" />
               <input type="text" placeholder="Spieler suchen..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl pl-14 md:pl-16 pr-6 py-4 md:py-5 text-sm font-bold outline-none focus:border-emerald-500/50" />
            </div>
          </div>

          {!searchQuery && topPlayers.length >= 3 && (
            <div className="flex flex-col md:flex-row items-center md:items-end justify-center gap-8 md:gap-6 mb-32 md:mb-40 max-w-5xl mx-auto px-4">
              {[1, 0, 2].map((idx) => {
                const p = topPlayers[idx];
                const rank = getRank(p.elo);
                const isWinner = idx === 0;
                return (
                  <div key={idx} className={`relative flex flex-col items-center w-full md:w-1/3 ${isWinner ? 'order-1 md:order-2 scale-105 md:scale-110 z-10' : idx === 1 ? 'order-2 md:order-1' : 'order-3'}`}>
                    <div className="text-center mb-6 md:mb-8 group cursor-pointer">
                      <div className="relative mb-4 md:mb-6 flex justify-center">
                        <RankIcon type={isWinner ? 'Legende' : rank.name} size={isWinner ? "w-20 h-20 md:w-24 md:h-24" : "w-14 h-14 md:w-16 md:h-16"} />
                        {isWinner && <div className="absolute -top-3 -right-3 bg-yellow-400 text-black w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center rotate-12 shadow-xl"><Crown className="w-5 md:w-6 h-5 md:h-6" /></div>}
                      </div>
                      <div className={`text-[9px] md:text-[11px] font-black uppercase tracking-[0.4em] mb-2 md:mb-3 ${isWinner ? 'text-yellow-400' : 'text-zinc-500'}`}>{isWinner ? 'CHAMPION' : idx === 1 ? '2nd Place' : '3rd Place'}</div>
                      <div className={`${isWinner ? 'text-2xl md:text-3xl' : 'text-lg md:text-xl'} font-black tracking-tighter mb-1`}>{p.username}</div>
                      <div className={`${isWinner ? 'text-4xl md:text-5xl' : 'text-2xl md:text-3xl'} font-black italic text-white`}>{p.elo}</div>
                    </div>
                    <div className={`relative w-full ${isWinner ? 'h-32 md:h-48 bg-yellow-400/10 border-yellow-400/30' : idx === 1 ? 'h-24 md:h-36 bg-white/5 border-white/10' : 'h-20 md:h-28 bg-white/[0.02] border-white/5'} border-t-2 rounded-t-[2.5rem] md:rounded-t-[3rem] flex items-center justify-center overflow-hidden`}>
                       <div className="text-7xl md:text-[12rem] font-black text-white/[0.02] italic absolute -bottom-4 md:-bottom-12 -right-4 md:-right-8 select-none">{idx + 1}</div>
                       <div className="relative px-4 md:px-6 py-2 md:py-3 rounded-full bg-black/40 border border-white/10 text-[8px] md:text-[10px] font-black uppercase tracking-widest text-emerald-400 shadow-xl">{isWinner ? '3M Premium' : idx === 1 ? '2M Premium' : '1M Premium'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-zinc-900/20 border border-white/5 rounded-[2rem] md:rounded-[3rem] overflow-hidden backdrop-blur-md mx-2 md:mx-0">
            <div className="p-6 md:p-10 border-b border-white/5 hidden md:flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-zinc-600">
               <div className="w-1/3">Player</div>
               <div className="flex justify-between w-2/3"><span className="w-24 text-center">AVG Score</span><span className="w-24 text-center">Matches</span><span className="w-24 text-center">Win Rate</span><span className="w-32 text-right">ELO Rating</span></div>
            </div>
            <div className="divide-y divide-white/5">
              {filteredPlayers.map((player, i) => {
                const rank = getRank(player.elo);
                const avg = avgMap[player.supabaseId || ''] || 0;
                return (
                  <Link href={`/players/${encodeURIComponent(player.username)}`} key={i} className="group flex items-center justify-between p-5 md:p-8 hover:bg-white/[0.02] transition-all">
                    <div className="flex items-center gap-4 md:gap-8 w-full md:w-1/3">
                      <div className="text-lg md:text-2xl font-black italic text-zinc-800 group-hover:text-emerald-500/20 w-6 md:w-8">#{i + 1}</div>
                      <RankIcon type={rank.name} />
                      <div className="min-w-0">
                        <div className="text-base md:text-lg font-black tracking-tight group-hover:text-emerald-400 transition-colors flex items-center gap-2 truncate">
                          {player.username}
                          {player.isPremium && <Sparkles className="w-3 md:w-3.5 h-3 md:h-3.5 text-yellow-400 fill-current flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2">
                           <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-widest ${rank.color}`}>{rank.name}</span>
                           <span className="md:hidden text-[8px] font-black uppercase tracking-widest text-zinc-600">• AVG: {avg > 0 ? avg.toFixed(1) : '--'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="hidden md:flex items-center justify-between w-2/3">
                      <div className="text-center w-24"><div className={`text-lg font-black italic ${avg > 0 ? 'text-zinc-200' : 'text-zinc-700'}`}>{avg > 0 ? avg.toFixed(1) : '--'}</div><div className="text-[8px] font-black uppercase tracking-widest text-zinc-600">AVG Score</div></div>
                      <div className="text-center w-24"><div className="text-lg font-black italic text-zinc-200">{player.gamesPlayed}</div><div className="text-[8px] font-black uppercase tracking-widest text-zinc-600">Matches</div></div>
                      <div className="text-center w-24"><div className="text-lg font-black italic text-zinc-200">{player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0}%</div><div className="text-[8px] font-black uppercase tracking-widest text-zinc-600">Win Rate</div></div>
                      <div className="text-right w-32"><div className="text-3xl font-black italic text-emerald-500 group-hover:scale-110 transition-transform">{player.elo}</div><div className="text-[8px] font-black uppercase tracking-widest text-zinc-600">ELO Rating</div></div>
                    </div>
                    <div className="md:hidden text-right flex-shrink-0 ml-4">
                       <div className="text-2xl font-black italic text-emerald-500 leading-none">{player.elo}</div>
                       <div className="text-[7px] font-black uppercase tracking-widest text-zinc-600 mt-1">ELO</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}