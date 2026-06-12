'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Menu, 
  X, 
  Swords, 
  Trophy, 
  Users, 
  Target, 
  ShieldCheck, 
  Zap, 
  Star, 
  Search, 
  ArrowRight, 
  Shield, 
  Crown, 
  Medal, 
  Activity, 
  TrendingUp, 
  Sparkles, 
  Timer,
  ChevronUp, 
  BarChart3, 
  Coins, 
  Award, 
  User as UserIcon,
  LayoutDashboard
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

// --- PROFESSIONELLE RANK ICONS ---
// Diese Komponente sorgt für das hochwertige visuelle Feedback der Ränge
const RankIcon = ({ type, size = "w-10 h-10" }: { type: string, size?: string }) => {
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
};

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

  // --- INITIALISIERUNG & DATEN-FETCH ---
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    
    // Auth-Status prüfen
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsLoggedIn(true);
      }
    });

    async function fetchLeaderboard() {
      try {
        const { data, error } = await supabase
          .from('public_profiles')
          .select('username, elo, gamesPlayed, wins, isPremium, supabaseId')
          .gte('gamesPlayed', 1)
          .order('elo', { ascending: false })
          .limit(100);

        if (!error && data) {
          const playerList = data as Player[];
          setPlayers(playerList);

          // Averages für alle Spieler abrufen
          const ids = playerList.map(p => p.supabaseId).filter(Boolean) as string[];
          if (ids.length > 0) {
            const { data: matchData } = await supabase
              .from('active_matches')
              .select('player1_id, player2_id, submitted_player1_average, submitted_player2_average')
              .eq('status', 'completed')
              .or(ids.map(id => `player1_id.eq.${id},player2_id.eq.${id}`).join(','));

            if (matchData) {
              const sums: Record<string, { total: number; count: number }> = {};
              matchData.forEach(m => {
                const addValue = (id: string, avg: number | null) => {
                  if (!avg) return;
                  if (!sums[id]) sums[id] = { total: 0, count: 0 };
                  sums[id].total += avg;
                  sums[id].count += 1;
                };
                addValue(m.player1_id, m.submitted_player1_average);
                addValue(m.player2_id, m.submitted_player2_average);
              });
              
              const finalMap: Record<string, number> = {};
              Object.entries(sums).forEach(([id, { total, count }]) => {
                finalMap[id] = total / count;
              });
              setAvgMap(finalMap);
            }
          }
        }
      } catch (err) {
        console.error("Fehler beim Laden des Leaderboards:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchLeaderboard();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [supabase]);

  // --- LOADING STATE ---
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020304] text-white">
        <div className="flex flex-col items-center gap-8">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Trophy className="w-8 h-8 text-emerald-500 animate-pulse" />
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-sm font-black uppercase tracking-[0.5em] text-emerald-500">Loading Rankings</div>
            <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-2 italic">Fetching global data...</div>
          </div>
        </div>
      </main>
    );
  }

  const topPlayers = players.slice(0, 3);
  const filteredPlayers = players.filter(p => p.username.toLowerCase().includes(searchQuery.toLowerCase()));

  // Podium Konfiguration (Platz 2, Platz 1, Platz 3)
  const podiumConfig = [
    { 
      index: 1, 
      prize: '2 Monate Premium', 
      height: 'h-[280px]', 
      color: 'bg-slate-400/10 border-slate-400/30', 
      label: '2nd Place',
      glow: 'shadow-[0_0_40px_rgba(148,163,184,0.1)]'
    },
    { 
      index: 0, 
      prize: '3 Monate Premium', 
      height: 'h-[360px]', 
      color: 'bg-yellow-400/15 border-yellow-400/40', 
      label: 'CHAMPION', 
      isWinner: true,
      glow: 'shadow-[0_0_80px_rgba(250,204,21,0.15)]'
    },
    { 
      index: 2, 
      prize: '1 Monat Premium', 
      height: 'h-[240px]', 
      color: 'bg-orange-700/10 border-orange-700/30', 
      label: '3rd Place',
      glow: 'shadow-[0_0_40px_rgba(194,65,12,0.1)]'
    }
  ];

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden">
      
      {/* --- VISUAL BACKGROUND LAYERS --- */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-emerald-500/5 blur-[180px] rounded-full opacity-60" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-cyan-500/5 blur-[180px] rounded-full opacity-60" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png' )] opacity-[0.03]" />
        <div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,#888_1px,transparent_1px),linear-gradient(to_bottom,#888_1px,transparent_1px)] [background-size:120px_120px]" />
      </div>

      {/* --- PREMIUM NAVIGATION BAR --- */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-700 ${scrolled ? 'bg-black/90 backdrop-blur-3xl border-b border-white/5 py-4' : 'bg-transparent py-10'}`}>
        <div className="max-w-7xl mx-auto px-8 md:px-12 flex items-center justify-between">
          
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-5 group">
            <div className="relative">
              <div className="absolute -inset-3 bg-emerald-500/20 blur-2xl rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              <div className="relative w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-black font-black text-2xl shadow-2xl transition-all duration-500 group-hover:rotate-12 group-hover:scale-110">R</div>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tighter uppercase leading-none italic">RankedDarts</span>
              <span className="text-[10px] font-black text-emerald-500 tracking-[0.5em] uppercase mt-1.5">Pro Leaderboard</span>
            </div>
          </Link>

          {/* Desktop Links */}
          <div className="hidden lg:flex items-center gap-14 text-[11px] font-black uppercase tracking-[0.4em] text-zinc-400">
            <Link href="/" className="hover:text-white transition-all duration-300 relative group">
              Home
              <span className="absolute -bottom-2 left-0 w-0 h-px bg-emerald-500 transition-all duration-300 group-hover:w-full" />
            </Link>
            <Link href="/matchmaking" className="hover:text-white transition-all duration-300 relative group">
              Matchmaking
              <span className="absolute -bottom-2 left-0 w-0 h-px bg-emerald-500 transition-all duration-300 group-hover:w-full" />
            </Link>
            <Link href="/profile" className="hover:text-white transition-all duration-300 flex items-center gap-2.5 relative group">
              <UserIcon className="w-3.5 h-3.5" /> Profile
              <span className="absolute -bottom-2 left-0 w-0 h-px bg-emerald-500 transition-all duration-300 group-hover:w-full" />
            </Link>
            <Link href="/premium" className="text-emerald-500 hover:text-emerald-400 transition-all duration-300 flex items-center gap-2.5 relative group">
              <Star className="w-3.5 h-3.5 fill-current" /> Premium
              <span className="absolute -bottom-2 left-0 w-0 h-px bg-emerald-500 transition-all duration-300 group-hover:w-full" />
            </Link>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-8">
            <button 
              onClick={() => router.push(isLoggedIn ? '/profile' : '/auth/login')} 
              className="hidden sm:flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-black uppercase tracking-widest transition-all duration-500 hover:scale-105 active:scale-95"
            >
              {isLoggedIn ? (
                <>
                  <LayoutDashboard className="w-4 h-4 text-emerald-500" />
                  Dashboard
                </>
              ) : (
                'Sign In'
              )}
            </button>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden p-2 text-zinc-400 hover:text-white transition-colors">
              <Menu className="w-7 h-7" />
            </button>
          </div>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <section className="relative z-10 pt-56 pb-32 px-8">
        <div className="max-w-7xl mx-auto">
          
          {/* Header & Search */}
          <div className="flex flex-col md:flex-row items-end justify-between mb-40 gap-12">
            <div className="space-y-8 text-center md:text-left">
              <div className="inline-flex items-center gap-4 px-6 py-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-black uppercase tracking-[0.6em] text-emerald-400 backdrop-blur-xl shadow-lg">
                <Trophy className="w-4 h-4" /> Monthly Season Rewards
              </div>
              <h1 className="text-7xl md:text-[10rem] font-black tracking-tighter italic uppercase leading-[0.75] drop-shadow-2xl">
                Leader  
board
              </h1>
              <p className="text-zinc-500 text-2xl max-w-2xl font-medium leading-relaxed">
                Dominiere das Feld und sichere dir <span className="text-emerald-400 font-black italic">Gratis Premium-Mitgliedschaften</span> als Belohnung für deine Spitzenleistung.
              </p>
            </div>
            
            <div className="w-full md:w-[450px] relative group">
              <div className="absolute -inset-1.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-[2rem] blur-lg opacity-20 group-focus-within:opacity-50 transition-opacity duration-700" />
              <div className="relative bg-zinc-900/60 border border-white/10 rounded-[2rem] flex items-center px-8 py-6 backdrop-blur-3xl">
                <Search className="w-6 h-6 text-zinc-500 mr-5" />
                <input 
                  type="text" 
                  placeholder="Spieler suchen..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-base font-bold w-full placeholder:text-zinc-700 text-white"
                />
              </div>
            </div>
          </div>

          {/* --- 3D PODIUM (Visual Highlight) --- */}
          {!searchQuery && topPlayers.length >= 3 && (
            <div className="flex flex-col md:flex-row items-end justify-center gap-8 mb-64 max-w-6xl mx-auto">
              {podiumConfig.map((item) => {
                const player = topPlayers[item.index];
                const rank = getRank(player.elo);
                return (
                  <div 
                    key={item.index} 
                    className={`relative flex flex-col items-center w-full md:w-1/3 ${item.index === 0 ? 'order-1 md:order-2' : item.index === 1 ? 'order-2 md:order-1' : 'order-3'}`}
                  >
                    {/* Player Profile Info */}
                    <Link 
                      href={`/players/${encodeURIComponent(player.username)}`} 
                      className="mb-12 text-center group cursor-pointer transition-all duration-500 hover:scale-110"
                    >
                      <div className="relative mb-10 flex justify-center">
                        <div className={`absolute -inset-8 rounded-full blur-[40px] opacity-30 ${item.isWinner ? 'bg-yellow-400 animate-pulse' : 'bg-white/20'}`} />
                        <RankIcon type={item.isWinner ? 'Legende' : rank.name} size={item.isWinner ? "w-32 h-32" : "w-24 h-24"} />
                        {item.isWinner && (
                          <div className="absolute -top-6 -right-6 bg-yellow-400 text-black w-12 h-12 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(250,204,21,0.5)] rotate-12">
                            <Crown className="w-7 h-7" />
                          </div>
                        )}
                      </div>
                      <div className={`text-[12px] font-black uppercase tracking-[0.6em] mb-4 ${item.isWinner ? 'text-yellow-400' : 'text-zinc-500'}`}>
                        {item.label}
                      </div>
                      <div className={`${item.isWinner ? 'text-5xl' : 'text-3xl'} font-black tracking-tighter group-hover:text-emerald-400 transition-colors duration-500 mb-2`}>
                        {player.username}
                      </div>
                      <div className={`${item.isWinner ? 'text-7xl' : 'text-5xl'} font-black italic text-white drop-shadow-[0_0_40px_rgba(255,255,255,0.15)]`}>
                        {player.elo}
                      </div>
                    </Link>

                    {/* The Pillar (Stufe) */}
                    <div className={`relative w-full ${item.height} ${item.color} ${item.glow} border-t-4 rounded-t-[4rem] flex flex-col items-center justify-start pt-16 overflow-hidden group/pillar transition-all duration-1000 hover:bg-white/[0.1]`}>
                      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.12] to-transparent" />
                      <div className="text-[15rem] font-black text-white/[0.03] italic absolute -bottom-16 -right-12 select-none group-hover/pillar:text-white/[0.06] transition-all duration-700">
                        {item.index + 1}
                      </div>
                      
                      {/* Reward Badge */}
                      <div className="relative px-10 py-5 rounded-[2.5rem] bg-black/50 border border-white/10 flex items-center gap-5 group-hover/pillar:border-emerald-500/60 group-hover/pillar:bg-emerald-500 group-hover/pillar:text-black transition-all duration-500 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                        <Sparkles className={`w-6 h-6 ${item.isWinner ? 'text-yellow-400' : 'text-emerald-400'} group-hover/pillar:text-black animate-pulse`} />
                        <span className="text-[13px] font-black uppercase tracking-[0.3em] whitespace-nowrap">
                          {item.prize}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* --- MAIN TABLE (Full Ranking) --- */}
          <div className="relative overflow-hidden rounded-[5rem] border border-white/10 bg-zinc-950/50 backdrop-blur-3xl shadow-[0_60px_120px_rgba(0,0,0,0.6)]">
            
            {/* Table Toolbar */}
            <div className="px-16 py-12 border-b border-white/5 bg-white/[0.02] flex flex-col lg:flex-row items-center justify-between gap-10">
              <div className="flex items-center gap-6">
                <div className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_25px_rgba(16,185,129,0.6)]" />
                <div className="flex flex-col">
                  <div className="text-[14px] font-black uppercase tracking-[0.6em] text-emerald-500 leading-none mb-2">Global Standings</div>
                  <div className="text-[11px] font-bold text-zinc-600 uppercase tracking-widest">Active Season: June 2026 · Week 2</div>
                </div>
              </div>
              
              <div className="flex flex-wrap justify-center items-center gap-12">
                <div className="flex items-center gap-4 text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
                  <Users className="w-5 h-5 text-emerald-500/50" />
                  <span className="text-white font-black">{filteredPlayers.length}</span> Registered Players
                </div>
                <div className="px-8 py-3 rounded-full bg-white/5 border border-white/10 text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em] italic flex items-center gap-4 shadow-inner">
                  <Timer className="w-5 h-5 text-emerald-500" />
                  Next Rank Reset in <span className="text-white">18 Days</span>
                </div>
              </div>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.01]">
                    <th className="px-16 py-10 text-[12px] font-black uppercase tracking-[0.5em] text-zinc-600">Rank</th>
                    <th className="px-16 py-10 text-[12px] font-black uppercase tracking-[0.5em] text-zinc-600">Player</th>
                    <th className="px-16 py-10 text-[12px] font-black uppercase tracking-[0.5em] text-zinc-600">Tier</th>
                    <th className="px-16 py-10 text-[12px] font-black uppercase tracking-[0.5em] text-zinc-600">
                      <div className="flex items-center gap-3">
                        <BarChart3 className="w-5 h-5 text-emerald-500/50" /> AVG
                      </div>
                    </th>
                    <th className="px-16 py-10 text-[12px] font-black uppercase tracking-[0.5em] text-zinc-600">Matches</th>
                    <th className="px-16 py-10 text-[12px] font-black uppercase tracking-[0.5em] text-zinc-600">
                      <div className="flex items-center gap-3">
                        <Coins className="w-5 h-5 text-emerald-500/50" /> Reward
                      </div>
                    </th>
                    <th className="px-16 py-10 text-[12px] font-black uppercase tracking-[0.5em] text-zinc-600 text-right">Elo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredPlayers.map((player, i) => {
                    const rank = getRank(player.elo);
                    const avg = avgMap[player.supabaseId || ''] || 0;
                    const prize = i === 0 ? '3M Premium' : i === 1 ? '2M Premium' : i === 2 ? '1M Premium' : '---';
                    
                    return (
                      <tr 
                        key={player.username} 
                        onClick={() => router.push(`/players/${encodeURIComponent(player.username)}`)} 
                        className="group hover:bg-white/[0.05] transition-all duration-500 cursor-pointer"
                      >
                        <td className="px-16 py-12">
                          <span className={`text-3xl font-black italic transition-all duration-500 ${i < 3 ? 'text-emerald-500 scale-125 inline-block drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'text-zinc-800 group-hover:text-zinc-600'}`}>
                            #{i + 1}
                          </span>
                        </td>
                        <td className="px-16 py-12">
                          <div className="flex flex-col">
                            <span className="font-black tracking-tighter text-2xl group-hover:text-emerald-400 transition-colors duration-500">
                              {player.username}
                            </span>
                            {player.isPremium && (
                              <span className="text-[11px] font-black uppercase tracking-[0.3em] text-emerald-500 flex items-center gap-2.5 mt-2">
                                <Award className="w-4 h-4 fill-current" /> Premium Pro
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-16 py-12">
                          <div className="flex items-center gap-5">
                            <RankIcon type={rank.name} size="w-12 h-12" />
                            <span className={`text-[13px] font-black uppercase tracking-[0.3em] ${rank.color}`}>
                              {rank.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-16 py-12">
                          <span className={`text-xl font-black tracking-tight ${avg > 0 ? 'text-zinc-200' : 'text-zinc-700'}`}>
                            {avg > 0 ? avg.toFixed(2) : '--'}
                          </span>
                        </td>
                        <td className="px-16 py-12">
                          <div className="flex flex-col">
                            <span className="text-xl font-black tracking-tight text-zinc-200">{player.gamesPlayed}</span>
                            <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-widest mt-1">
                              {Math.round((player.wins / player.gamesPlayed) * 100)}% Winrate
                            </span>
                          </div>
                        </td>
                        <td className="px-16 py-12">
                          <div className={`inline-flex items-center gap-3 px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-500 ${i < 3 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-500 group-hover:text-black' : 'text-zinc-700'}`}>
                            {i < 3 && <Sparkles className="w-4 h-4" />} {prize}
                          </div>
                        </td>
                        <td className="px-16 py-12 text-right">
                          <span className="text-5xl font-black tracking-tighter italic text-emerald-400 group-hover:scale-110 inline-block transition-transform duration-700 drop-shadow-[0_0_30px_rgba(16,185,129,0.25)]">
                            {player.elo}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* --- FOOTER SECTION --- */}
      <footer className="relative z-10 py-32 px-16 border-t border-white/5 bg-black/70 backdrop-blur-3xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-20">
          
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-zinc-900 rounded-3xl flex items-center justify-center text-white font-black text-4xl border border-white/10 shadow-2xl transition-transform hover:rotate-6">R</div>
            <div className="flex flex-col">
              <span className="font-black uppercase tracking-widest text-3xl italic">RankedDarts</span>
              <span className="text-[12px] font-bold text-zinc-600 uppercase tracking-[0.8em] mt-1">The Pro Standard</span>
            </div>
          </div>

          <div className="flex gap-20 text-[13px] font-black uppercase tracking-[0.5em] text-zinc-500">
            <Link href="/" className="hover:text-white transition-all duration-300">Home</Link>
            <Link href="/terms" className="hover:text-white transition-all duration-300">Terms</Link>
            <Link href="/support" className="hover:text-white transition-all duration-300">Support</Link>
          </div>

          <div className="text-[12px] font-bold text-zinc-800 uppercase tracking-[1em]">
            © 2026 RankedDarts.
          </div>
        </div>
      </footer>
    </main>
  );
}
