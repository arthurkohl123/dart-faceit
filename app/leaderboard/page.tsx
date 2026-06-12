'use client';

import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Menu, X, Swords, Trophy, Users, Target, ShieldCheck, Zap, Star, Search, 
  ArrowRight, Shield, Crown, Medal, Activity, TrendingUp, Sparkles, Timer, 
  BarChart3, Coins, Award, User as UserIcon, LayoutDashboard, ChevronUp 
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import React from 'react';

// --- ADAPTIVE RANK ICON ---
const RankIcon = memo(({ type, size = "w-10 h-10" }: { type: string, size?: string }) => {
  const baseClass = `${size} flex items-center justify-center rounded-2xl border shadow-lg transition-all duration-500 group-hover:scale-110 group-hover:rotate-3`;
  
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
  const router = useRouter();

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
        
        // Batch-Abfrage für AVG Score
        const ids = playerList.map(p => p.supabaseId).filter(Boolean) as string[];
        if (ids.length > 0) {
          const { data: matchData } = await supabase
            .from('active_matches')
            .select('player1_id, player2_id, submitted_player1_average, submitted_player2_average')
            .eq('status', 'completed')
            .limit(500);

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
            Object.entries(sums).forEach(([id, { total, count }]) => {
              map[id] = total / count;
            });
            setAvgMap(map);
          }
        }
      }
    } catch (err) {
      console.error("Fehler:", err);
    } finally {
      setLoading(false);
    }
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
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden">
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-black/80 backdrop-blur-xl py-3' : 'bg-transparent py-8'}`}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-xl">R</div>
            <span className="text-xl font-black tracking-tighter uppercase">RankedDarts</span>
          </Link>
          <Link href={isLoggedIn ? '/profile' : '/auth/login'} className="px-8 py-3 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest">
            {isLoggedIn ? 'Dashboard' : 'Sign In'}
          </Link>
        </div>
      </nav>

      <section className="relative z-10 pt-48 pb-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-end justify-between mb-24 gap-8">
            <div className="space-y-6 text-center md:text-left">
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                <Trophy className="w-3.5 h-3.5" /> Monthly Season Rewards
              </div>
              <h1 className="text-6xl md:text-8xl font-black tracking-tighter italic uppercase leading-[0.8]">Leaderboard</h1>
              <p className="text-zinc-500 text-lg max-w-xl font-medium">Dominiere das Feld und sichere dir <span className="text-emerald-400 font-black italic">Gratis Premium</span>.</p>
            </div>
            <div className="w-full md:w-96 relative">
               <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
               <input type="text" placeholder="Spieler suchen..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl pl-16 pr-6 py-5 text-sm font-bold outline-none focus:border-emerald-500/50" />
            </div>
          </div>

          {!searchQuery && topPlayers.length >= 3 && (
            <div className="flex flex-col md:flex-row items-end justify-center gap-6 mb-40 max-w-5xl mx-auto">
              {[1, 0, 2].map((idx) => {
                const p = topPlayers[idx];
                const rank = getRank(p.elo);
                const isWinner = idx === 0;
                return (
                  <div key={idx} className={`relative flex flex-col items-center w-full md:w-1/3 ${isWinner ? 'order-1 md:order-2' : idx === 1 ? 'order-2 md:order-1' : 'order-3'}`}>
                    <div className="text-center mb-8">
                      <RankIcon type={rank.name} size={isWinner ? "w-24 h-24" : "w-16 h-16"} />
                      <div className={`mt-4 font-black tracking-tighter ${isWinner ? 'text-3xl' : 'text-xl'}`}>{p.username}</div>
                      <div className="text-4xl font-black italic text-emerald-500">{p.elo}</div>
                    </div>
                    <div className={`w-full ${isWinner ? 'h-48 bg-yellow-400/10' : idx === 1 ? 'h-36 bg-white/5' : 'h-28 bg-white/[0.02]'} border-t-2 border-white/5 rounded-t-[3rem] flex items-center justify-center`}>
                       <div className="px-6 py-3 rounded-full bg-black/40 border border-white/10 text-[10px] font-black uppercase tracking-widest text-emerald-400">{isWinner ? '3M Premium' : idx === 1 ? '2M Premium' : '1M Premium'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-zinc-900/20 border border-white/5 rounded-[3rem] overflow-hidden backdrop-blur-md">
            <div className="divide-y divide-white/5">
              {filteredPlayers.map((player, i) => {
                const rank = getRank(player.elo);
                const avg = avgMap[player.supabaseId || ''] || 0;
                return (
                  <Link href={`/players/${encodeURIComponent(player.username)}`} key={i} className="group flex items-center justify-between p-8 hover:bg-white/[0.02] transition-all">
                    <div className="flex items-center gap-8">
                      <div className="text-2xl font-black italic text-zinc-800 w-8">#{i + 1}</div>
                      <RankIcon type={rank.name} size="w-12 h-12" />
                      <div>
                        <div className="text-lg font-black tracking-tight group-hover:text-emerald-400 flex items-center gap-2">
                          {player.username}
                          {player.isPremium && <Sparkles className="w-3.5 h-3.5 text-yellow-400 fill-current" />}
                        </div>
                        <div className={`text-[10px] font-black uppercase tracking-widest ${rank.color}`}>{rank.name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-12 text-right">
                      <div className="hidden sm:block">
                        <div className="text-lg font-black italic text-zinc-200">{avg > 0 ? avg.toFixed(1) : '--'}</div>
                        <div className="text-[8px] font-black uppercase tracking-widest text-zinc-600">AVG Score</div>
                      </div>
                      <div>
                        <div className="text-3xl font-black italic text-emerald-500">{player.elo}</div>
                        <div className="text-[8px] font-black uppercase tracking-widest text-zinc-600">ELO Rating</div>
                      </div>
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