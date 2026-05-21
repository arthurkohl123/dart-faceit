'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Trophy, Flame, Clock } from 'lucide-react';

export default function MatchHistory() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const fetchHistory = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login');
        return;
      }

      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
      } else {
        setMatches(data || []);
      }
      setLoading(false);
    };

    fetchHistory();
  }, [supabase, router]);

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-2xl">Lade Match History...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-8 py-12">
        
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-5xl font-black tracking-tighter">MATCH HISTORY</h1>
            <p className="text-zinc-400 text-xl">Deine letzten Spiele • {matches.length} Matches</p>
          </div>
          <button 
            onClick={() => router.push('/profile')}
            className="px-8 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition"
          >
            ← Zurück zum Profil
          </button>
        </div>

        {matches.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-6xl mb-6">🎯</div>
            <h3 className="text-2xl font-bold mb-3">Noch keine Matches</h3>
            <p className="text-zinc-400">Starte dein erstes Match über "Match suchen"</p>
          </div>
        ) : (
          <div className="space-y-6">
            {matches.map((match) => (
              <div 
                key={match.id}
                className="bg-zinc-900 border border-zinc-700 rounded-3xl p-8 hover:border-green-500/50 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm text-zinc-400">
                      {new Date(match.created_at).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                    <div className="text-2xl font-bold mt-2 flex items-center gap-3">
                      vs {match.opponent_name}
                      <span className="text-sm text-zinc-500">({match.opponent_elo} Elo)</span>
                    </div>
                  </div>

                  <div className={`text-4xl font-black ${match.is_win ? 'text-green-500' : 'text-red-500'}`}>
                    {match.result}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-8">
                  <div>
                    <div className="text-xs text-zinc-400">AVERAGE</div>
                    <div className="text-3xl font-bold">{match.my_average || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">HÖCHSTER CHECKOUT</div>
                    <div className="text-3xl font-bold">{match.highest_checkout || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">ELO-ÄNDERUNG</div>
                    <div className={`text-3xl font-bold ${match.elo_change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {match.elo_change >= 0 ? '+' : ''}{match.elo_change}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">ERGEBNIS</div>
                    <div className={`inline-flex items-center gap-2 mt-1 ${match.is_win ? 'text-green-500' : 'text-red-500'}`}>
                      {match.is_win ? <Trophy size={22} /> : <span>😔</span>}
                      <span className="font-bold">{match.is_win ? "Sieg" : "Niederlage"}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}