'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const rankTiers = [
  { name: "Eisen",   min: 0,    color: "text-zinc-400",   icon: "⚙️" },
  { name: "Bronze",  min: 1000, color: "text-amber-600",  icon: "🥉" },
  { name: "Silber",  min: 1250, color: "text-zinc-300",   icon: "🥈" },
  { name: "Gold",    min: 1500, color: "text-yellow-400", icon: "🥇" },
  { name: "Platin",  min: 1750, color: "text-cyan-400",   icon: "💎" },
  { name: "Diamant", min: 2000, color: "text-blue-400",   icon: "💠" },
  { name: "Legende", min: 2500, color: "text-purple-400", icon: "👑" },
];

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const loadProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/auth/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('supabaseId', session.user.id)
      .single();

    setUser({ ...session.user, ...profile });
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const elo = user?.elo || 1000;
  const currentRankIndex = rankTiers.findIndex(r => elo < r.min) - 1;
  const currentRank = rankTiers[Math.max(0, currentRankIndex)];
  const nextRank = rankTiers[currentRankIndex + 1] || rankTiers[rankTiers.length - 1];
  const eloToNext = nextRank.min - elo;

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Lade Profil...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-black text-white">
      <div className="max-w-6xl mx-auto px-8 py-10">
        
        {/* Navbar */}
        <div className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-4">
            <div className="text-4xl">🎯</div>
            <h1 className="text-4xl font-black tracking-tighter">RANKEDDARTS</h1>
          </div>

          <div className="relative">
            <button 
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-3 bg-zinc-900 hover:bg-zinc-800 px-6 py-3 rounded-2xl transition"
            >
              <span className="font-medium">{user?.username}</span>
              {user?.isPremium && <span className="text-yellow-400">⭐ Premium</span>}
              <span>▼</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-3 w-72 bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl py-2 z-50">
                <a href="/history" className="block px-6 py-3 hover:bg-zinc-800">📜 Match History</a>
                <a href="/leaderboard" className="block px-6 py-3 hover:bg-zinc-800">🏆 Leaderboard</a>
                <a href="/updates" className="block px-6 py-3 hover:bg-zinc-800">📢 Updates</a>
                <button onClick={() => router.push('/premium')} className="w-full text-left px-6 py-3 hover:bg-zinc-800 text-green-400">⭐ Premium</button>
                <div className="border-t border-zinc-700 my-2"></div>
                <button onClick={logout} className="w-full text-left px-6 py-3 hover:bg-red-900/30 text-red-500">Logout</button>
              </div>
            )}
          </div>
        </div>

        {/* Hero Rank Section */}
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-green-500/20 rounded-3xl p-16 text-center mb-12 relative overflow-hidden">
          <div className="text-9xl mb-6">{currentRank.icon}</div>
          <div className={`text-6xl font-bold ${currentRank.color}`}>{currentRank.name}</div>
          <div className="text-8xl font-black mt-6 mb-2 text-white">{elo}</div>
          <div className="text-2xl text-zinc-400">ELO</div>

          {/* Nächster Rang Fortschritt */}
          <div className="mt-12 max-w-md mx-auto">
            <div className="text-sm text-zinc-400 mb-3">Fortschritt zum nächsten Rang</div>
            <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-700"
                style={{ width: `${((elo - currentRank.min) / (nextRank.min - currentRank.min)) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-zinc-500 mt-2">
              <span>{currentRank.name}</span>
              <span>{nextRank.name}</span>
            </div>
          </div>
        </div>

        {/* Stats Grid - Modern */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-zinc-900/80 border border-zinc-700 rounded-3xl p-10 text-center hover:border-green-500/50 transition-all">
            <div className="text-7xl font-black text-white mb-4">{user?.gamesPlayed || 0}</div>
            <div className="text-xl text-zinc-400">Spiele insgesamt</div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-700 rounded-3xl p-10 text-center hover:border-green-500/50 transition-all">
            <div className="text-7xl font-black text-green-500 mb-4">{user?.wins || 0}</div>
            <div className="text-xl text-zinc-400">Siege</div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-700 rounded-3xl p-10 text-center hover:border-green-500/50 transition-all">
            <div className="text-7xl font-black text-red-500 mb-4">
              {(user?.gamesPlayed || 0) - (user?.wins || 0)}
            </div>
            <div className="text-xl text-zinc-400">Niederlagen</div>
          </div>
        </div>

        <button 
          onClick={() => router.push('/matchmaking')}
          className="w-full mt-12 py-9 bg-gradient-to-r from-green-500 to-emerald-600 text-3xl font-bold rounded-3xl hover:scale-105 transition-all shadow-2xl shadow-green-500/30"
        >
          🎯 MATCH SUCHEN
        </button>
      </div>
    </div>
  );
}