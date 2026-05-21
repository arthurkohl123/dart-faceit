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

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white text-xl">Lade Profil...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-8 py-10">
        
        {/* Premium Navbar */}
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
              <span>{user?.username}</span>
              {user?.isPremium && <span className="text-yellow-400">⭐</span>}
              <span>▼</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-3 w-72 bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl py-2 z-50">
                <div className="px-6 py-4 border-b border-zinc-700">
                  <p className="font-semibold text-lg">{user?.username}</p>
                  <p className="text-sm text-zinc-400">{user?.email}</p>
                  {user?.isPremium && <p className="text-green-400 text-sm mt-1">Premium Mitglied</p>}
                </div>

                <a href="/history" className="block px-6 py-3 hover:bg-zinc-800">📜 Match History</a>
                <a href="/leaderboard" className="block px-6 py-3 hover:bg-zinc-800">🏆 Leaderboard</a>
                <a href="/updates" className="block px-6 py-3 hover:bg-zinc-800">📢 Updates</a>
                
                <button 
                  onClick={() => router.push('/premium')}
                  className="w-full text-left px-6 py-3 hover:bg-zinc-800 text-green-400 font-medium"
                >
                  ⭐ Premium Abonnement
                </button>

                <div className="border-t border-zinc-700 my-2"></div>
                
                <button 
                  onClick={logout}
                  className="w-full text-left px-6 py-3 hover:bg-red-900/30 text-red-500"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Nächster Rang */}
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-700 rounded-3xl p-10 mb-12">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="text-6xl">{nextRank.icon}</div>
              <div>
                <div className="text-emerald-400 uppercase tracking-widest text-sm">NÄCHSTER RANG</div>
                <div className={`text-4xl font-bold ${nextRank.color}`}>{nextRank.name}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-6xl font-bold text-white">{eloToNext}</div>
              <div className="text-zinc-400">Elo bis {nextRank.name}</div>
            </div>
          </div>
        </div>

        {/* Aktueller Rang - Hero Style */}
        <div className="bg-zinc-900 rounded-3xl p-16 text-center mb-12 border border-zinc-700 shadow-xl">
          <div className="text-8xl mb-6">{currentRank.icon}</div>
          <div className={`text-6xl font-bold ${currentRank.color}`}>{currentRank.name}</div>
          <div className="text-8xl font-black mt-8 mb-2">{elo}</div>
          <div className="text-2xl text-zinc-400">ELO</div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 mb-12">
          <div className="bg-zinc-900 p-10 rounded-3xl text-center border border-zinc-700">
            <div className="text-6xl font-bold">{user?.gamesPlayed || 0}</div>
            <div className="text-zinc-400 mt-2">Spiele</div>
          </div>
          <div className="bg-zinc-900 p-10 rounded-3xl text-center border border-zinc-700">
            <div className="text-6xl font-bold text-green-500">{user?.wins || 0}</div>
            <div className="text-zinc-400 mt-2">Siege</div>
          </div>
          <div className="bg-zinc-900 p-10 rounded-3xl text-center border border-zinc-700">
            <div className="text-6xl font-bold text-red-500">
              {(user?.gamesPlayed || 0) - (user?.wins || 0)}
            </div>
            <div className="text-zinc-400 mt-2">Niederlagen</div>
          </div>
        </div>

        <button 
          onClick={() => router.push('/matchmaking')}
          className="w-full py-8 bg-gradient-to-r from-green-500 to-emerald-600 text-3xl font-bold rounded-3xl hover:scale-105 transition-all shadow-xl shadow-green-500/30"
        >
          🎯 MATCH SUCHEN
        </button>
      </div>
    </div>
  );
}