'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Menu, X, Swords, Trophy, Users, Target, 
  ShieldCheck, Zap, Star, Search, ArrowRight, 
  Shield, Crown, Medal, Activity, TrendingUp, Coins
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

// --- PROFESSIONELLE RANK ICONS ---
const RankIcon = ({ type, size = "w-10 h-10" }: { type: string, size?: string }) => {
  const baseClass = `${size} flex items-center justify-center rounded-xl border shadow-lg transition-transform group-hover:scale-110 duration-500`;
  
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
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);

    async function fetchLeaderboard() {
      try {
        const { data, error } = await supabase
          .from('public_profiles')
          .select('username, elo, gamesPlayed, wins, isPremium, supabaseId')
          .gte('gamesPlayed', 1)
          .order('elo', { ascending: false })
          .limit(100);

        if (!error && data) setPlayers(data as Player[]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchLeaderboard();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [supabase]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020304] text-white">
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <div className="text-xs font-black uppercase tracking-[0.4em] text-emerald-500 animate-pulse">Loading Rankings</div>
        </div>
      </main>
    );
  }

  const topPlayers = players.slice(0, 3);
  const filteredPlayers = players.filter(p => p.username.toLowerCase().includes(searchQuery.toLowerCase()));

  // Podium Konfiguration (Platz 2, Platz 1, Platz 3)
  const podiumConfig = [
    { index: 1, prize: '150€', color: 'border-slate-400/30 bg-slate-400/5', label: '2nd Place', icon: '🥈' },
    { index: 0, prize: '250€', color: 'border-yellow-400/40 bg-yellow-400/10 shadow-[0_0_50px_rgba(250,204,21,0.15)]', label: 'CHAMPION', icon: '🏆', isWinner: true },
    { index: 2, prize: '100€', color: 'border-orange-600/30 bg-orange-600/5', label: '3rd Place', icon: '🥉' }
  ];

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden">
      {/* --- BACKGROUND LAYER --- */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-5%] left-[-5%] w-[50%] h-[50%] bg-emerald-500/5 blur-[150px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png' )] opacity-[0.02]" />
        <div className="absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,#888_1px,transparent_1px),linear-gradient(to_bottom,#888_1px,transparent_1px)] [background-size:100px_100px]" />
      </div>

      {/* --- NAVIGATION --- */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-black/90 backdrop-blur-2xl border-b border-white/5 py-3' : 'bg-transparent py-8'}`}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-4 group">
            <div className="w-11 h-11 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-2xl shadow-2xl transition-all group-hover:rotate-6">R</div>
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tighter uppercase leading-none">RankedDarts</span>
              <span className="text-[9px] font-black text-emerald-500 tracking-[0.4em] uppercase mt-1">Leaderboard</span>
            </div>
          </Link>

          <div className="hidden lg:flex items-center gap-12 text-[11px] font-black uppercase tracking-[0.3em] text-zinc-400">
            <Link href="/" className="hover:text-white transition-all">Home</Link>
            <Link href="/matchmaking" className="hover:text-white transition-all">Matchmaking</Link>
            <Link href="/premium" className="text-emerald-500 hover:text-emerald-400 transition-all">Premium</Link>
          </div>

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden p-2 text-zinc-400"><Menu /></button>
        </div>
      </nav>

      {/* --- CONTENT --- */}
      <section className="relative z-10 pt-48 pb-32 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-end justify-between mb-24 gap-8">
            <div className="space-y-4 text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400">
                <TrendingUp className="w-3 h-3" /> Monthly Season
              </div>
              <h1 className="text-5xl md:text-7xl font-black tracking-tighter italic uppercase">Leaderboard</h1>
              <p className="text-zinc-500 text-lg max-w-md font-medium">Gewinne monatliche Preisgelder in Höhe von <span className="text-white font-black italic">500€</span>.</p>
            </div>
            
            <div className="w-full md:w-80 relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition-opacity" />
              <div className="relative bg-zinc-900/50 border border-white/10 rounded-2xl flex items-center px-5 py-4 backdrop-blur-xl">
                <Search className="w-4 h-4 text-zinc-500 mr-4" />
                <input 
                  type="text" 
                  placeholder="Spieler suchen..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-sm font-bold w-full placeholder:text-zinc-600"
                />
              </div>
            </div>
          </div>

          {/* --- PODIUM (2-1-3 Layout) --- */}
          {!searchQuery && topPlayers.length >= 3 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-24 items-end max-w-5xl mx-auto">
              {podiumConfig.map((item) => {
                const player = topPlayers[item.index];
                const rank = getRank(player.elo);
                return (
                  <div key={item.index} className={`order-${item.index === 0 ? '1 md:order-2' : item.index === 1 ? '2 md:order-1' : '3'}`}>
                    <Link 
                      href={`/players/${encodeURIComponent(player.username)}`} 
                      className={`group relative block rounded-[3rem] border p-8 text-center transition-all hover:-translate-y-2 backdrop-blur-md ${item.color} ${item.isWinner ? 'pb-16 pt-20 md:scale-110 z-10' : 'pb-12 pt-14'}`}
                    >
                      {/* Rank Icon */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <RankIcon type={item.isWinner ? 'Legende' : rank.name} size={item.isWinner ? "w-24 h-24" : "w-16 h-16"} />
                      </div>

                      {/* Prize Badge */}
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs font-black tracking-widest text-white group-hover:bg-emerald-500 group-hover:text-black transition-all">
                        <Coins className="w-3 h-3" /> {item.prize}
                      </div>

                      <div className="space-y-3">
                        <div className={`text-[10px] font-black uppercase tracking-[0.4em] ${item.isWinner ? 'text-yellow-400' : 'text-zinc-500'}`}>
                          {item.label}
                        </div>
                        <div className={`${item.isWinner ? 'text-3xl' : 'text-xl'} font-black tracking-tighter truncate group-hover:text-emerald-400 transition-colors`}>
                          {player.username}
                        </div>
                        <div className={`${item.isWinner ? 'text-6xl' : 'text-4xl'} font-black italic text-white`}>
                          {player.elo}
                        </div>
                        <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                          {player.gamesPlayed} Matches · {Math.round((player.wins / player.gamesPlayed) * 100)}% WR
                        </div>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          {/* --- TABLE --- */}
          <div className="relative overflow-hidden rounded-[3rem] border border-white/10 bg-zinc-950/50 backdrop-blur-2xl">
            <div className="px-8 py-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
              <div className="text-[11px] font-black uppercase tracking-[0.4em] text-emerald-500">Full Ranking List</div>
              <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest italic">Updated every 5 minutes</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Rank</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Player</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Tier</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Matches</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 text-right">Elo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredPlayers.map((player, i) => {
                    const rank = getRank(player.elo);
                    return (
                      <tr 
                        key={player.username} 
                        onClick={() => router.push(`/players/${encodeURIComponent(player.username)}`)}
                        className="group hover:bg-white/[0.03] transition-colors cursor-pointer"
                      >
                        <td className="px-8 py-6">
                          <span className="text-lg font-black italic text-zinc-600 group-hover:text-zinc-400 transition-colors">#{i + 1}</span>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-black text-xs uppercase text-zinc-400">
                              {player.username.slice(0, 2)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-black tracking-tight text-lg group-hover:text-emerald-400 transition-colors">{player.username}</span>
                              {player.isPremium && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1">
                                  <Star className="w-2 h-2 fill-current" /> Premium
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-3">
                            <RankIcon type={rank.name} size="w-8 h-8" />
                            <span className={`text-[11px] font-black uppercase tracking-widest ${rank.color}`}>{rank.name}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col">
                            <span className="text-sm font-black tracking-tight">{player.gamesPlayed} Matches</span>
                            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                              {player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0}% Winrate
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <span className="text-2xl font-black tracking-tighter italic text-emerald-400 group-hover:scale-110 inline-block transition-transform">{player.elo}</span>
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

      {/* Footer */}
      <footer className="relative z-10 py-24 px-10 border-t border-white/5 bg-black/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center text-white font-black text-2xl border border-white/5">R</div>
            <div className="flex flex-col">
              <span className="font-black uppercase tracking-widest text-xl">RankedDarts</span>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.5em]">The Pro Standard</span>
            </div>
          </div>
          <div className="flex gap-12 text-[11px] font-black uppercase tracking-[0.3em] text-zinc-500">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/support" className="hover:text-white transition-colors">Support</Link>
          </div>
          <div className="text-[10px] font-bold text-zinc-700 uppercase tracking-[0.6em]">
            © 2026 RankedDarts.
          </div>
        </div>
      </footer>
    </main>
  );
}
