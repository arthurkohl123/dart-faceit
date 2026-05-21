'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Trophy, Flame, Star } from 'lucide-react';

export default function Leaderboard() {
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const fetchLeaderboard = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, elo, gamesPlayed, wins, isPremium')
        .order('elo', { ascending: false })
        .limit(100);

      if (error) console.error(error);
      else setPlayers(data || []);
      
      setLoading(false);
    };

    fetchLeaderboard();
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-3xl">Lade Rangliste...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-black to-zinc-950 text-white relative overflow-hidden">
      
      {/* Wow Hintergrund */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_30%,#22c55e_0%,transparent_60%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_70%,#eab308_0%,transparent_60%)]"></div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-12 relative">
        
        <div className="flex justify-between items-center mb-12">
          <div>
            <div className="flex items-center gap-4">
              <Trophy className="w-12 h-12 text-yellow-400" />
              <h1 className="text-6xl font-black tracking-tighter">LEADERBOARD</h1>
            </div>
            <p className="text-xl text-zinc-400 mt-2">Die besten Dartspieler der Welt • Live</p>
          </div>
          <button 
            onClick={() => router.push('/profile')}
            className="px-8 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition"
          >
            ← Zurück
          </button>
        </div>

        {/* Haupt-Tabelle mit Wow-Effekt */}
        <div className="bg-zinc-900/95 backdrop-blur-3xl rounded-3xl overflow-hidden border border-zinc-700 shadow-2xl shadow-green-500/10">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-700 bg-black/60">
                <th className="py-8 px-8 text-left w-28">RANG</th>
                <th className="py-8 px-8 text-left">SPIELER</th>
                <th className="py-8 px-8 text-center">ELO</th>
                <th className="py-8 px-8 text-center">SPIELE</th>
                <th className="py-8 px-8 text-center">SIEGE</th>
                <th className="py-8 px-8 text-center">WINRATE</th>
                <th className="py-8 px-8 text-right pr-12">PREISGELD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {players.map((player, index) => {
                const prize = index === 0 ? "100€" : index === 1 ? "50€" : index === 2 ? "25€" : null;
                const isTop3 = index < 3;

                return (
                  <tr 
                    key={index} 
                    className={`group hover:bg-gradient-to-r hover:from-green-500/10 hover:to-transparent transition-all duration-300 ${isTop3 ? 'bg-white/5' : ''}`}
                  >
                    <td className="py-8 px-8">
                      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl font-black text-2xl transition-all group-hover:scale-110
                        ${index === 0 ? 'bg-yellow-400 text-black' : 
                          index === 1 ? 'bg-zinc-300 text-black' : 
                          index === 2 ? 'bg-amber-600' : 'bg-zinc-800 text-zinc-400'}`}>
                        #{index + 1}
                      </div>
                    </td>
                    <td className="py-8 px-8 font-medium text-xl flex items-center gap-4">
                      {player.isPremium && <Star className="text-yellow-400" />}
                      <span>{player.username}</span>
                      {isTop3 && <Flame className="text-orange-500" />}
                    </td>
                    <td className="py-8 px-8 text-center">
                      <div className="text-4xl font-bold text-white group-hover:text-green-400 transition-colors">
                        {player.elo}
                      </div>
                    </td>
                    <td className="py-8 px-8 text-center text-zinc-400">{player.gamesPlayed}</td>
                    <td className="py-8 px-8 text-center text-green-500 font-bold">{player.wins}</td>
                    <td className="py-8 px-8 text-center text-zinc-400">
                      {player.gamesPlayed > 0 
                        ? Math.round((player.wins / player.gamesPlayed) * 100) + "%" 
                        : "0%"}
                    </td>
                    <td className="py-8 px-8 text-right pr-12">
                      {prize ? (
                        <div className="inline-block bg-green-500/10 text-green-400 font-bold px-6 py-2 rounded-2xl text-lg">
                          {prize}
                        </div>
                      ) : (
                        <span className="text-zinc-600">–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-center text-zinc-500 mt-10">
          Aktualisiert in Echtzeit • Monatliche Preisgelder für die Top 3
        </p>
      </div>
    </div>
  );
}