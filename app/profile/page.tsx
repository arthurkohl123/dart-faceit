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
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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

    const { data: matchData } = await supabase
      .from('matches')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    setMatches(matchData || []);
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
      
      {/* Grünlicher Hintergrund */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(#22c55e_0.8px,transparent_1px)] [background-size:50px_50px]"></div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-lg border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-8 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="text-4xl">🎯</div>
            <h1 className="text-3xl font-black tracking-tighter">RANKEDDARTS</h1>
          </div>

          <div className="flex items-center gap-8 text-lg">
            <a href="/" className="hover:text-green-400 transition">Startseite</a>
            <a href="/matchmaking" className="hover:text-green-400 transition">Matchmaking</a>
            <a href="/leaderboard" className="hover:text-green-400 transition">Leaderboard</a>
            <a href="/updates" className="hover:text-green-400 transition">Updates</a>
            <a href="/premium" className="bg-gradient-to-r from-yellow-400 to-amber-500 text-black px-6 py-2 rounded-2xl font-bold hover:scale-105 transition-all">⭐ Premium</a>
          </div>

          <button onClick={logout} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-2xl transition">
            Logout
          </button>
        </div>
      </nav>

      <div className="pt-24 pb-8">
        <div className="max-w-6xl mx-auto px-8">
          <div className="flex items-center gap-8 mb-12">
            <div className="text-8xl flex-shrink-0">{currentRank.icon}</div>
            <div>
              <h1 className="text-5xl font-black">{user?.username}</h1>
              <div className={`text-4xl font-bold ${currentRank.color}`}>{currentRank.name}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-7xl font-black text-white">{elo}</div>
              <div className="text-2xl text-zinc-400">ELO</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="bg-zinc-900 rounded-3xl p-8 mb-12 border border-zinc-700">
            <div className="flex justify-between mb-4">
              <span className="text-emerald-400 font-medium">NÄCHSTER RANG</span>
              <span className="text-zinc-400">{eloToNext} Elo</span>
            </div>
            <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-green-400 to-cyan-400" style={{ width: `${progress}%` }}></div>
            </div>
            <div className="flex justify-between text-sm text-zinc-500 mt-2">
              <span>{currentRank.name}</span>
              <span>{nextRank.name}</span>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-8">
            {/* Stats */}
            <div className="col-span-12 lg:col-span-5 grid grid-cols-3 gap-6">
              <div className="bg-zinc-900 rounded-3xl p-8 text-center border border-zinc-700">
                <div className="text-5xl font-black">{user?.gamesPlayed || 0}</div>
                <div className="text-zinc-400 mt-2">Spiele</div>
              </div>
              <div className="bg-zinc-900 rounded-3xl p-8 text-center border border-zinc-700">
                <div className="text-5xl font-black text-green-500">{user?.wins || 0}</div>
                <div className="text-zinc-400 mt-2">Siege</div>
              </div>
              <div className="bg-zinc-900 rounded-3xl p-8 text-center border border-zinc-700">
                <div className="text-5xl font-black text-red-500">
                  {(user?.gamesPlayed || 0) - (user?.wins || 0)}
                </div>
                <div className="text-zinc-400 mt-2">Niederlagen</div>
              </div>
            </div>

            {/* Letzte Matches */}
            <div className="col-span-12 lg:col-span-7">
              <h3 className="text-xl font-bold mb-6">Letzte Matches</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {matches.slice(0, 5).map((match) => (
                  <div key={match.id} className="bg-zinc-900 rounded-3xl p-6 border border-zinc-700 text-center">
                    <div className="text-xs text-zinc-400 mb-2">{new Date(match.created_at).toLocaleDateString('de-DE')}</div>
                    <div className="font-medium text-sm">vs {match.opponent_name}</div>
                    <div className={`text-2xl font-bold mt-3 ${match.is_win ? 'text-green-500' : 'text-red-500'}`}>
                      {match.result}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button 
            onClick={() => router.push('/matchmaking')}
            className="w-full mt-12 py-9 bg-gradient-to-r from-green-500 to-emerald-600 text-3xl font-bold rounded-3xl hover:scale-105 transition-all"
          >
            🎯 MATCH SUCHEN
          </button>
        </div>
      </div>
    </div>
  );
}