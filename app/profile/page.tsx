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
    <div className="min-h-screen bg-zinc-950 text-white relative overflow-hidden">
      
      {/* Grünlicher Hintergrund wie auf der Startseite */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(#22c55e_0.8px,transparent_1px)] [background-size:50px_50px]"></div>
        <div className="absolute -left-20 top-1/3 text-[380px] text-green-500/10 rotate-[-28deg] select-none">➶</div>
        <div className="absolute -right-32 bottom-1/4 text-[420px] text-green-500/10 rotate-[22deg] select-none">➶</div>
      </div>

      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 relative z-10">
        <div className="max-w-6xl mx-auto px-8 py-8 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <div className="text-7xl">{currentRank.icon}</div>
            <div>
              <h1 className="text-4xl font-black tracking-tight">{user?.username}</h1>
              <div className={`text-3xl font-bold ${currentRank.color}`}>{currentRank.name}</div>
            </div>
            <div className="text-5xl font-black text-white ml-6">{elo}</div>
          </div>

          <button 
            onClick={() => setMenuOpen(!menuOpen)}
            className="bg-zinc-800 hover:bg-zinc-700 px-6 py-3 rounded-2xl flex items-center gap-3 transition"
          >
            Optionen <span>▼</span>
          </button>
        </div>
      </div>

      {/* Dropdown - Besser positioniert */}
      {menuOpen && (
        <div className="absolute right-8 top-[118px] z-50 bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl py-2 w-72">
          <a href="/history" className="block px-6 py-3 hover:bg-zinc-800">📜 Match History</a>
          <a href="/leaderboard" className="block px-6 py-3 hover:bg-zinc-800">🏆 Leaderboard</a>
          <a href="/updates" className="block px-6 py-3 hover:bg-zinc-800">📢 Updates</a>
          <button onClick={() => router.push('/premium')} className="w-full text-left px-6 py-3 hover:bg-zinc-800 text-green-400">⭐ Premium</button>
          <div className="border-t border-zinc-700 my-2"></div>
          <button onClick={logout} className="w-full text-left px-6 py-3 hover:bg-red-900/30 text-red-500">Logout</button>
        </div>
      )}

      {/* Rest der Seite */}
      <div className="max-w-6xl mx-auto px-8 py-12 relative z-10">
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <div className="bg-zinc-900 rounded-3xl p-10 border border-zinc-700">
              <h3 className="uppercase text-emerald-400 text-sm tracking-widest mb-8">STATISTIKEN</h3>
              <div className="space-y-8">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Spiele</span>
                  <span className="text-5xl font-black">{user?.gamesPlayed || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Siege</span>
                  <span className="text-5xl font-black text-green-500">{user?.wins || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Winrate</span>
                  <span className="text-5xl font-black">
                    {user?.gamesPlayed > 0 ? Math.round((user.wins / user.gamesPlayed) * 100) : 0}%
                  </span>
               