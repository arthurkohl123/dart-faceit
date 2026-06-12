'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Menu, X, Swords, Trophy, Users, Target, ShieldCheck, Zap, Star, Search, 
  ArrowRight, Shield, Crown, Medal, Activity, TrendingUp, Sparkles, Timer, 
  BarChart3, Coins, Award, User as UserIcon, LayoutDashboard, ChevronUp 
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import React from 'react';

/**
 * PROFESSIONELLE RANK ICONS - Memoized für flüssiges Scrollen auf Mobilgeräten
 */
const RankIcon = React.memo(({ type, size = "w-10 h-10" }: { type: string, size?: string }) => {
  const baseClass = `${size} flex items-center justify-center rounded-2xl border shadow-lg transition-all duration-500 group-hover:scale-110 group-hover:rotate-3`;
  
  switch (type) {
    case 'Eisen':
      return (
        <div className={`${baseClass} bg-gradient-to-br from-zinc-600 to-zinc-800 border-zinc-500/30 shadow-zinc-900/40`}>
          <Shield className="w-1/2 h-1/2 text-zinc-400" />
        </div>
      );
    case 'Bronze':
      return (
        <div className={`${baseClass} bg-gradient-to-br from-orange-700 to-orange-900 border-orange-500/30 shadow-orange-900/40`}>
          <Shield className="w-1/2 h-1/2 text-orange-200" />
        </div>
      );
    case 'Silber':
      return (
        <div className={`${baseClass} bg-gradient-to-br from-slate-400 to-slate-600 border-slate-300/30 shadow-slate-500/40`}>
          <Shield className="w-1/2 h-1/2 text-slate-100" />
        </div>
      );
    case 'Gold':
      return (
        <div className={`${baseClass} bg-gradient-to-br from-yellow-500 to-yellow-700 border-yellow-400/30 shadow-yellow-600/40`}>
          <Shield className="w-1/2 h-1/2 text-yellow-100" />
        </div>
      );
    case 'Platin':
      return (
        <div className={`${baseClass} bg-gradient-to-br from-cyan-400 to-cyan-700 border-cyan-300/30 shadow-cyan-500/40`}>
          <Shield className="w-1/2 h-1/2 text-cyan-100" />
        </div>
      );
    case 'Diamant':
      return (
        <div className={`${baseClass} bg-gradient-to-br from-blue-500 to-blue-800 border-blue-400/30 shadow-blue-600/40`}>
          <Shield className="w-1/2 h-1/2 text-blue-100" />
        </div>
      );
    case 'Legende':
      return (
        <div className={`${baseClass} bg-gradient-to-br from-emerald-400 to-emerald-700 border-emerald-300/30 shadow-emerald-500/40 relative overflow-hidden`}>
          <div className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent,rgba(255,255,255,0.2),transparent)] animate-[spin_4s_linear_infinite]" />
          <Crown className="w-1/2 h-1/2 text-white relative z-10" />
        </div>
      );
    default:
      return null;
  }
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      // Optimierung: Nur Top 50 initial laden
      const { data, error } = await supabase
        .from('public_profiles')
        .select('username, elo, gamesPlayed, wins, isPremium, supabaseId')
        .gte('gamesPlayed', 1)
        .order('elo', { ascending: false })
        .limit(50);

      if (!error && data) {
        const playerList = data as Player[];
        setPlayers(playerList);
        const ids = playerList.map(p => p.supabaseId).filter(Boolean) as string[];
        
        if (ids.length > 0) {
          // Optimierung: Effiziente Abfrage für Durchschnittswerte
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
    fetchLeaderboard();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [supabase, fetchLeaderboard]);

  const topPlayers = useMemo(() => players.slice(0, 3), [players]);
  const filteredPlayers = useMemo(() => players.filter(p => p.username.toLowerCase().includes(searchQuery.toLowerCase())), [players, searchQuery]);

  if (loading && players.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020304] text-white">
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <div className="text-xs font-black uppercase tracking-[0.4em] text-emerald-500 animate-pulse">Loading Rankings</div>
        </div>
      </main>
    );
  }

  const podiumConfig = [
    { index: 1, prize: '2M Premium', height: 'h-[180px]', color: 'bg-slate-400/10 border-slate-400/30', label: '2nd Place' },
    { index: 0, prize: '3M Premium', height: 'h-[240px]', color: 'bg-yellow-400/15 border-yellow-400/40 shadow-[0_0_50px_rgba(250,204,21,0.1)]', label: 'CHAMPION', isWinner: true },
    { index: 2, prize: '1M Premium', height: 'h-[140px]', color: 'bg-orange-700/10 border-orange-700/30', label: '3rd Place' }
  ];

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-5%] left-[-5%] w-[50%] h-[50%] bg-emerald-500/5 blur-[150px] rounded-full opacity-50" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.02]" />
        <div className="absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,#888_1px,transparent_1px),linear-gradient(to_bottom,#888_1px,transparent_1px)] [background-size:100px_100px]" />
      </div>

      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-black/90 backdrop-blur-2xl border-b border-white/5 py-3' : 'bg-transparent py-8'}`}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-4 group">
            <div className="relative w-11 h-11 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-2xl shadow-2xl transition-all group-hover:rotate-6">R</div>
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tighter uppercase leading-none">RankedDarts</span>
              <span className="text-[9px] font-black text-emerald-500 tracking-[0.4em] uppercase mt-1">Leaderboard</span>
            </div>
          </Link>
          <div className="hidden lg:flex items-center gap-12 text-[11px] font-black uppercase tracking-[0.3em] text-zinc-400">
            <Link href="/" className="hover:text-white transition-all">Home</Link>
            <Link href="/matchmaking" className="hover:text-white transition-all">Matchmaking</Link>
            <Link href="/profile" className="hover:text-white transition-all flex items-center gap-2"><UserIcon className="w-3.5 h-3.5" /> Profile</Link>
            <Link href="/premium" className="text-emerald-500 hover:text-emerald-400 transition-all flex items-center gap-2"><Star className="w-3.5 h-3.5 fill-current" /> Premium</Link>
          </div>
          <div className="flex items-center gap-6">
            <Link href={isLoggedIn ? '/profile' : '/auth/login'} className="hidden sm:block px-8 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest transition-all">
              {isLoggedIn ? 'Dashboard' : 'Sign In'}
            </Link>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden p-2 text-zinc-400"><Menu className="w-6 h-6" /></button>
          </div>
        </div>
      </nav>

      <section className="relative z-10 pt-48 pb-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-end justify-between mb-24 gap-8">
            <div className="space-y-6 text-center md:text-left">
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-[0.5em] text-emerald-400 backdrop-blur-md">
                <Trophy className="w-3.5 h-3.5" /> Monthly Season Rewards
              </div>
              <h1 className="text-6xl md:text-8xl font-black tracking-tighter italic uppercase leading-[0.8]">Leaderboard</h1>
              <p className="text-zinc-500 text-lg max-w-xl font-medium leading-relaxed">Dominiere das Feld und sichere dir <span className="text-emerald-400 font-black italic">Gratis Premium-Mitgliedschaften</span>.</p>
            </div>
            <div className="w-full md:w-96 relative group">
              <div className="relative bg-zinc-900/50 border border-white/10 rounded-2xl flex items-center px-6 py-5 backdrop-blur-2xl">
                <Search className="w-5 h-5 text-zinc-500 mr-4" />
                <input type="text" placeholder="Spieler suchen..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-sm font-bold w-full placeholder:text-zinc-700 text-white" />
              </div>
            </div>
          </div>

          {!searchQuery && topPlayers.length >= 3 && (
            <div className="flex flex-col md:flex-row items-end justify-center gap-6 mb-40 max-w-5xl mx-auto">
              {podiumConfig.map((item) => {
                const player = topPlayers[item.index];
                const rank = getRank(player.elo);
                return (
                  <div key={item.index} className={`relative flex flex-col items-center w-full md:w-1/3 ${item.index === 0 ? 'order-1 md:order-2' : item.index === 1 ? 'order-2 md:order-1' : 'order-3'}`}>
                    <Link href={`/players/${encodeURIComponent(player.username)}`} className="mb-8 text-center group cursor-pointer transition-all hover:scale-105">
                      <div className="relative mb-6 flex justify-center">
                        <RankIcon type={item.isWinner ? 'Legende' : rank.name} size={item.isWinner ? "w-24 h-24" : "w-16 h-16"} />
                        {item.isWinner && <div className="absolute -top-4 -right-4 bg-yellow-400 text-black w-10 h-10 rounded-full flex items-center justify-center rotate-12"><Crown className="w-6 h-6" /></div>}
                      </div>
                      <div className={`text-[11px] font-black uppercase tracking-[0.5em] mb-3 ${item.isWinner ? 'text-yellow-400' : 'text-zinc-500'}`}>{item.label}</div>
                      <div className={`${item.isWinner ? 'text-3xl' : 'text-xl'} font-black tracking-tighter group-hover:text-emerald-400 transition-colors mb-1`}>{player.username}</div>
                      <div className={`${item.isWinner ? 'text-5xl' : 'text-3xl'} font-black italic text-white`}>{player.elo}</div>
                    </Link>
                    <div className={`relative w-full ${item.height} ${item.color} border-t-2 rounded-t-[3rem] flex flex-col items-center justify-start pt-10 overflow-hidden`}>
                      <div className="relative px-8 py-4 rounded-[2rem] bg-black/40 border border-white/10 text-[10px] font-black uppercase tracking-widest text-emerald-400">{item.prize}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-zinc-900/20 border border-white/5 rounded-[3rem] overflow-hidden backdrop-blur-md">
            <div className="p-10 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500"><Activity className="w-6 h-6" /></div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Live Standings</div>
                  <div className="text-xl font-black tracking-tight italic uppercase">Season 1: June 2026</div>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-8 text-[10px] font-black uppercase tracking-widest text-zinc-600">
                <span>Rank</span><span>Player</span><span>Tier</span><span>AVG</span><span>Matches</span><span>Reward</span><span>Elo</span>
              </div>
            </div>

            <div className="divide-y divide-white/5">
              {filteredPlayers.map((player, i) => {
                const rank = getRank(player.elo);
                const avg = avgMap[player.supabaseId || ''] || 0;
                return (
                  <Link href={`/players/${encodeURIComponent(player.username)}`} key={i} className="group flex items-center justify-between p-8 hover:bg-white/[0.02] transition-all">
                    <div className="flex items-center gap-8 w-1/3">
                      <div className="text-2xl font-black italic text-zinc-800 group-hover:text-emerald-500/20 transition-colors w-8">#{i + 1}</div>
                      <div className="flex items-center gap-6">
                        <RankIcon type={rank.name} size="w-12 h-12" />
                        <div>
                          <div className="text-lg font-black tracking-tight group-hover:text-emerald-400 transition-colors flex items-center gap-2">
                            {player.username}
                            {player.isPremium && <Sparkles className="w-3.5 h-3.5 text-yellow-400 fill-current" />}
                          </div>
                          <div className={`text-[10px] font-black uppercase tracking-widest ${rank.color}`}>{rank.name}</div>
                        </div>
                      </div>
                    </div>
                    <div className="hidden md:flex items-center justify-between w-2/3">
                      <div className="text-center w-24"><div className="text-lg font-black italic text-zinc-200">{avg > 0 ? avg.toFixed(1) : '--'}</div><div className="text-[8px] font-black uppercase tracking-widest text-zinc-600">AVG</div></div>
                      <div className="text-center w-24"><div className="text-lg font-black italic text-zinc-200">{player.gamesPlayed}</div><div className="text-[8px] font-black uppercase tracking-widest text-zinc-600">Matches</div></div>
                      <div className="text-center w-24"><div className="text-lg font-black italic text-zinc-200">{Math.round((player.wins / player.gamesPlayed) * 100)}%</div><div className="text-[8px] font-black uppercase tracking-widest text-zinc-600">WR</div></div>
                      <div className="text-right w-32"><div className="text-3xl font-black italic text-emerald-500">{player.elo}</div><div className="text-[8px] font-black uppercase tracking-widest text-zinc-600">ELO</div></div>
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