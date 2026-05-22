'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Matchmaking() {
  const [status, setStatus] = useState<'idle' | 'searching' | 'found'>('idle');
  const [opponent, setOpponent] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(45);
  const supabase = createClient();
  const router = useRouter();

  const startSearch = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return router.push('/auth/login');

    const { data: profile } = await supabase
      .from('profiles')
      .select('elo')
      .eq('supabaseId', session.user.id)
      .single();

    await supabase.from('matchmaking_queue').insert({
      user_id: session.user.id,
      elo: profile?.elo || 1000
    });

    setStatus('searching');
    setTimeLeft(45);
  };

  const stopSearch = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from('matchmaking_queue').delete().eq('user_id', session.user.id);
    }
    setStatus('idle');
  };

  useEffect(() => {
    if (status !== 'searching') return;

    const interval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('elo')
        .eq('supabaseId', session.user.id)
        .single();

      // Sehr einfache Abfrage ohne Join
      const { data: found, error } = await supabase
        .from('matchmaking_queue')
        .select('user_id, elo')
        .neq('user_id', session.user.id)
        .gte('elo', (myProfile?.elo || 1000) - 60)
        .lte('elo', (myProfile?.elo || 1000) + 60)
        .order('created_at')
        .limit(1)
        .single();

      if (error) console.error("Queue Error:", error);

      if (found) {
        const { data: opponentData } = await supabase
          .from('profiles')
          .select('username')
          .eq('supabaseId', found.user_id)
          .single();

        setOpponent(opponentData);
        setStatus('found');

        await supabase.from('matchmaking_queue').delete().eq('user_id', session.user.id);
        await supabase.from('matchmaking_queue').delete().eq('user_id', found.user_id);

        setTimeout(() => router.push('/result'), 1500);
      }
    }, 2200);

    const timer = setInterval(() => {
      setTimeLeft(prev => prev > 1 ? prev - 1 : 0);
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [status]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-black mb-12">🎯 MATCHMAKING</h1>

        {status === 'idle' && (
          <button 
            onClick={startSearch}
            className="px-24 py-10 bg-gradient-to-r from-green-500 to-emerald-600 text-4xl font-bold rounded-3xl hover:scale-105"
          >
            MATCH SUCHEN
          </button>
        )}

        {status === 'searching' && (
          <div>
            <div className="text-4xl text-green-400 animate-pulse mb-6">Gegner wird gesucht...</div>
            <div className="text-7xl font-mono mb-8">{timeLeft}</div>
            <button onClick={stopSearch} className="text-red-500 underline">Abbrechen</button>
          </div>
        )}

        {status === 'found' && opponent && (
          <div className="space-y-4">
            <div className="text-5xl">✅ Gefunden!</div>
            <div className="text-4xl">vs {opponent.username}</div>
          </div>
        )}
      </div>
    </div>
  );
}