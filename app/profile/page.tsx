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
  const progress = Math.min(((elo - currentRank.min) / (nextRank.min - currentRank.min)) * 100, 100);

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Lade Profil...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Hero Banner - Faceit Style */}
      <div className="relative h-[460px] bg-gradient-to-br from-emerald-800 via-green-700 to-teal-900">
        <div className="absolute inset-0 bg-black/50"></div>
        
        <div className="max-w-6xl mx-auto px-8 pt-16 relative z-10">
          <div className="flex items-end gap-8">
            <div className="text-[160px] leading-none drop-shadow-2xl">{currentRank.icon}</div>
            
            <div className="pb-8">
              <h1 className="text-6xl font-black tracking-tighter">{user?.username}</h1>
              <div className={`text-5xl font-bold ${currentRank.color}`}>{currentRank.name}</div>
              <div className="flex items-baseline gap-4 mt-4">
                <span className="text-7xl font-black text-white">{elo}</span>
                <span className="text-3xl text-white/60">ELO</span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar im Banner */}
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/30">
          <div 
            className="h-full bg-gradient-to-r from-green-400 to-cyan-400"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 -mt-8 relative z-20">
        <div className="grid grid-cols-12 gap-8">
          
          {/* Linke Spalte */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <div className="bg-zinc-900 rounded-3xl p-10 border border-zinc-700">
              <h3 className="uppercase text-emerald-400 text-sm tracking-widest mb-8">STATISTIKEN</h3>
              <div className="space-y-10">
                <div className="flex justify-between">
                  <span className="text-zinc-400 text-lg">Spiele</span>
                  <span className="text-5xl font-black">{user?.gamesPlayed || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400 text-lg">Siege</span>
                  <span className="text-5xl font-black text-green-500">{user?.wins || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400 text-lg">Winrate</span>
                  <span className="text-5xl font-black text-white">
                    {user?.gamesPlayed > 0 ? Math.round((user.wins / user.gamesPlayed) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Mittlere Spalte - Nächster Rang + Info */}
          <div className="col-span-12 lg:col-span-5">
            <div className="bg-zinc-900 rounded-3xl p-12 border border-zinc-700">
              <h3 className="text-emerald-400 uppercase tracking-widest text-sm mb-6">NÄCHSTER RANG</h3>
              <div className="flex items-center gap-8">
                <div className="text-8xl">{nextRank.icon}</div>
                <div>
                  <div className={`text-5xl font-bold ${nextRank.color}`}>{nextRank.name}</div>
                  <div className="text-6xl font-black text-white mt-2">{eloToNext}</div>
                  <div className="text-zinc-400">Elo bis zum nächsten Rang</div>
                </div>
              </div>
            </div>
          </div>

          {/* Rechte Spalte */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            <button 
              onClick={() => router.push('/matchmaking')}
              className="w-full py-10 bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl text-3xl font-bold hover:scale-105 transition-all shadow-2xl shadow-green-500/30"
            >
              🎯 MATCH SUCHEN
            </button>

            <button 
              onClick={() => router.push('/history')}
              className="w-full py-8 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-3xl text-xl font-medium transition-all"
            >
              📜 Match History
            </button>

            <button 
              onClick={() => router.push('/leaderboard')}
              className="w-full py-8 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-3xl text-xl font-medium transition-all"
            >
              🏆 Leaderboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}