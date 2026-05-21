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
      {/* Premium Banner */}
      <div className="h-[380px] bg-gradient-to-br from-emerald-700 via-green-700 to-teal-800 relative">
        <div className="absolute inset-0 bg-black/40"></div>
        
        <div className="max-w-6xl mx-auto px-8 pt-12 relative z-10">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-6">
              <div className="text-8xl drop-shadow-2xl">{currentRank.icon}</div>
              <div>
                <h1 className="text-5xl font-black tracking-tighter drop-shadow-lg">{user?.username}</h1>
                <p className={`text-4xl font-bold ${currentRank.color} drop-shadow-md`}>{currentRank.name}</p>
                <p className="text-6xl font-black text-white mt-1 tracking-tighter">{elo} <span className="text-3xl text-white/70">ELO</span></p>
              </div>
            </div>

            <button 
              onClick={() => setMenuOpen(!menuOpen)}
              className="bg-black/60 hover:bg-black px-8 py-4 rounded-2xl text-lg flex items-center gap-3 transition"
            >
              Optionen <span>▼</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 -mt-20 relative z-20">
        <div className="grid grid-cols-12 gap-8">
          
          {/* Linke Spalte */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <div className="bg-zinc-900 rounded-3xl p-10 border border-zinc-700">
              <h3 className="text-emerald-400 uppercase tracking-widest text-sm mb-8">STATISTIKEN</h3>
              <div className="space-y-10">
                <div className="flex justify-between items-end">
                  <span className="text-zinc-400">Spiele</span>
                  <span className="text-5xl font-black">{user?.gamesPlayed || 0}</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-zinc-400">Siege</span>
                  <span className="text-5xl font-black text-green-500">{user?.wins || 0}</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-zinc-400">Winrate</span>
                  <span className="text-5xl font-black">
                    {user?.gamesPlayed > 0 ? Math.round((user.wins / user.gamesPlayed) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Mittlere Spalte - Großer Rank */}
          <div className="col-span-12 lg:col-span-5">
            <div className="bg-zinc-900 rounded-3xl p-16 text-center border border-zinc-700 shadow-2xl">
              <div className="text-[120px] leading-none mb-4">{currentRank.icon}</div>
              <div className={`text-6xl font-black ${currentRank.color}`}>{currentRank.name}</div>
              <div className="text-[92px] font-black text-white tracking-[-4px] mt-4">{elo}</div>
              <div className="text-2xl text-zinc-400 -mt-3">CURRENT ELO</div>

              <div className="mt-12 max-w-md mx-auto">
                <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-400 via-emerald-400 to-cyan-400 transition-all duration-1000"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm text-zinc-500 mt-3">
                  <span>{currentRank.name}</span>
                  <span>{nextRank.name}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Rechte Spalte - Actions */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            <button 
              onClick={() => router.push('/matchmaking')}
              className="w-full py-10 bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl text-3xl font-bold hover:scale-[1.03] transition-all shadow-xl"
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