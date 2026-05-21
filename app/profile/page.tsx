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
  const eloToNext = nextRank.min - elo;                    // ← Das fehlte
  const progress = Math.min(((elo - currentRank.min) / (nextRank.min - currentRank.min)) * 100, 100);

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white text-2xl">Lade Profil...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-black text-white">
      {/* Header mit Banner */}
      <div className="h-80 bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 relative">
        <div className="absolute inset-0 bg-black/40"></div>
        
        <div className="max-w-6xl mx-auto px-8 pt-8 relative">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-4">
                <div className="text-7xl">{currentRank.icon}</div>
                <div>
                  <h1 className="text-5xl font-black">{user?.username}</h1>
                  <p className={`text-3xl font-bold ${currentRank.color}`}>{currentRank.name} • {elo} Elo</p>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setMenuOpen(!menuOpen)}
              className="bg-black/50 hover:bg-black/70 px-6 py-3 rounded-2xl flex items-center gap-2"
            >
              Menü <span>▼</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 -mt-12 relative z-10">
        <div className="grid grid-cols-12 gap-8">
          
          {/* Linke Spalte */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-700">
              <h3 className="text-zinc-400 mb-6">STATISTIKEN</h3>
              <div className="space-y-8">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Spiele</span>
                  <span className="text-3xl font-bold">{user?.gamesPlayed || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Siege</span>
                  <span className="text-3xl font-bold text-green-500">{user?.wins || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Winrate</span>
                  <span className="text-3xl font-bold">
                    {user?.gamesPlayed > 0 ? Math.round((user.wins / user.gamesPlayed) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-700">
              <h3 className="text-zinc-400 mb-4">NÄCHSTER RANG</h3>
              <div className="flex items-center gap-4">
                <div className="text-5xl">{nextRank.icon}</div>
                <div>
                  <div className={`text-2xl font-bold ${nextRank.color}`}>{nextRank.name}</div>
                  <div className="text-green-400">{eloToNext} Elo</div>
                </div>
              </div>
            </div>
          </div>

          {/* Mittlere Spalte - Hauptinfo */}
          <div className="col-span-12 lg:col-span-5">
            <div className="bg-zinc-900 rounded-3xl p-12 text-center border border-zinc-700">
              <div className="text-8xl mb-6">{currentRank.icon}</div>
              <div className={`text-6xl font-black ${currentRank.color}`}>{currentRank.name}</div>
              <div className="text-7xl font-black mt-6">{elo}</div>
              <div className="text-zinc-400 text-2xl">ELO</div>

              <div className="mt-10">
                <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-green-400 to-cyan-400" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Rechte Spalte - Quick Actions */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            <button 
              onClick={() => router.push('/matchmaking')}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 py-8 rounded-3xl text-2xl font-bold hover:scale-105 transition-all"
            >
              🎯 MATCH SUCHEN
            </button>

            <button 
              onClick={() => router.push('/history')}
              className="w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 py-8 rounded-3xl text-xl font-medium transition-all"
            >
              📜 Match History
            </button>

            <button 
              onClick={() => router.push('/leaderboard')}
              className="w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 py-8 rounded-3xl text-xl font-medium transition-all"
            >
              🏆 Leaderboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}