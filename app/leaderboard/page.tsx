'use client';

import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Menu, Swords, Trophy, Users, Target, ShieldCheck, Star, Search, 
  Activity, Shield, Crown, Sparkles, User as UserIcon, ChevronUp 
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

// --- LIGHTWEIGHT RANK ICONS ---
// Reduzierte Komplexität für besseres Mobile-Rendering
const RankIcon = memo(({ type, size = "w-10 h-10" }: { type: string, size?: string }) => {
  const baseClass = `${size} flex items-center justify-center rounded-xl border shadow-md transition-transform duration-300`;
  
  const configs: Record<string, string> = {
    'Eisen': 'bg-zinc-800 border-zinc-700 text-zinc-400',
    'Bronze': 'bg-orange-900/50 border-orange-800 text-orange-300',
    'Silber': 'bg-slate-700 border-slate-600 text-slate-200',
    'Gold': 'bg-yellow-700/50 border-yellow-600 text-yellow-300',
    'Platin': 'bg-cyan-800/50 border-cyan-700 text-cyan-200',
    'Diamant': 'bg-blue-800/50 border-blue-700 text-blue-200',
    'Legende': 'bg-emerald-800/50 border-emerald-700 text-emerald-300',
  };

  const config = configs[type] || configs['Eisen'];
  
  return (
    <div className={`${baseClass} ${config}`}>
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
      // Top 100 laden, aber UI rendert nur was nötig ist
      const { data, error } = await supabase
        .from('public_profiles')
        .select('username, elo, gamesPlayed, wins, isPremium, supabaseId')
        .gte('gamesPlayed', 1)
        .order('elo', { ascending: false })
        .limit(100);

      if (!error && data) {
        const playerList = data as Player[];
        setPlayers(playerList);
        
        const ids = playerList.slice(0, 50).map(p => p.supabaseId).filter(Boolean) as string[];
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
  const filteredPlayers = useMemo(() => 
    players.filter(p => p.username.toLowerCase().includes(searchQuery.toLowerCase())), 
    [players, searchQuery]
  );

  if (loading && players.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020304]">
        <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 font-sans">
      {/* --- NAVIGATION (Lightweight) --- */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${scrolled ? 'bg-black/80 backdrop-blur-md border-b border-white/5' : 'bg-transparent'} py-4`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center text-black font-black text-xl">R</div>
            <span className="text-lg font-black tracking-tighter uppercase">RankedDarts</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            <Link href="/" className="hover:text-white">Home</Link>
            <Link href="/matchmaking" className="hover:text-white">Matchmaking</Link>
            <Link href="/premium" className="text-emerald-500">Premium</Link>
          </div>
          <Link href={isLoggedIn ? '/profile' : '/auth/login'} className="px-6 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold uppercase">
            {isLoggedIn ? 'Dashboard' : 'Sign In'}
          </Link>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
          <div className="space-y-4">
            <div className="inline-block px-4 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-widest text-emerald-400">Season 1</div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase italic">Leaderboard</h1>
          </div>
          <div className="w-full md:w-80 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Suchen..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900/50 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm focus:border-emerald-500/50 outline-none transition-colors"
            />
          </div>
        </div>

        {/* Podium (Optimiert für Mobile) */}
        {!searchQuery && topPlayers.length >= 3 && (
          <div className="flex flex-col md:flex-row items-end justify-center gap-4 mb-20">
            {[1, 0, 2].map((idx) => {
              const p = topPlayers[idx];
              if (!p) return null;
              const rank = getRank(p.elo);
              const isWinner = idx === 0;
              return (
                <div key={idx} className={`w-full md:w-1/3 flex flex-col items-center ${isWinner ? 'order-1 md:order-2' : idx === 1 ? 'order-2 md:order-1' : 'order-3'}`}>
                  <div className="text-center mb-4">
                    <RankIcon type={rank.name} size={isWinner ? "w-20 h-20" : "w-14 h-14"} />
                    <div className={`mt-2 font-black tracking-tight ${isWinner ? 'text-2xl' : 'text-lg'}`}>{p.username}</div>
                    <div className="text-emerald-500 font-bold">{p.elo}</div>
                  </div>
                  <div className={`w-full ${isWinner ? 'h-32 bg-yellow-500/10' : idx === 1 ? 'h-24 bg-zinc-800/30' : 'h-20 bg-zinc-800/20'} border-t-2 border-white/5 rounded-t-2xl flex items-center justify-center`}>
                    <span className="text-4xl font-black text-white/5 italic">{idx + 1}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tabelle */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl overflow-hidden backdrop-blur-sm">
          <div className="divide-y divide-white/5">
            {filteredPlayers.map((player, i) => {
              const rank = getRank(player.elo);
              const avg = avgMap[player.supabaseId || ''] || 0;
              return (
                <Link href={`/players/${encodeURIComponent(player.username)}`} key={i} className="flex items-center justify-between p-6 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-6">
                    <span className="text-xl font-black italic text-zinc-800 w-8">#{i + 1}</span>
                    <RankIcon type={rank.name} size="w-10 h-10" />
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        {player.username}
                        {player.isPremium && <Sparkles className="w-3 h-3 text-yellow-400 fill-current" />}
                      </div>
                      <div className={`text-[9px] font-bold uppercase tracking-widest ${rank.color}`}>{rank.name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-8 text-right">
                    <div className="hidden sm:block">
                      <div className="text-sm font-bold">{avg > 0 ? avg.toFixed(1) : '--'}</div>
                      <div className="text-[8px] text-zinc-600 uppercase font-bold">AVG</div>
                    </div>
                    <div>
                      <div className="text-xl font-black text-emerald-500">{player.elo}</div>
                      <div className="text-[8px] text-zinc-600 uppercase font-bold">ELO</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}