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
    setOpponent(null);
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

      const minElo = (myProfile?.elo || 1000) - 60;
      const maxElo = (myProfile?.elo || 1000) + 60;

      // WICHTIG: .maybeSingle() statt .single() + Fehlerbehandlung
      const { data: found, error } = await supabase
        .from('matchmaking_queue')
        .select('user_id, elo')
        .neq('user_id', session.user.id)
        .gte('elo', minElo)
        .lte('elo', maxElo)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();   // <--- Das ist der Fix

      if (error) {
        console.error("Queue Error:", error);
        return;
      }

      if (found) {
        const { data: opponentData } = await supabase
          .from('profiles')
          .select('username')
          .eq('supabaseId', found.user_id)
          .single();

        setOpponent(opponentData);
        setStatus('found');

        // Beide aus Queue entfernen
        await supabase.from('matchmaking_queue').delete().eq('user_id', session.user.id);
        await supabase.from('matchmaking_queue').delete().eq('user_id', found.user_id);

        setTimeout(() => router.push('/result'), 1800);
      }
    }, 2200);

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          stopSearch();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [status, router, supabase]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center relative">
      <div className="text-center z-10">
        <h1 className="text-6xl font-black mb-12">🎯 MATCHMAKING</h1>

        {status === 'idle' && (
          <button 
            onClick={startSearch}
            className="px-24 py-10 bg-gradient-to-r from-green-500 to-emerald-600 text-4xl font-bold rounded-3xl hover:scale-105 transition-all"
          >
            MATCH SUCHEN
          </button>
        )}

        {status === 'searching' && (
          <div>
            <div className="text-4xl text-green-400 animate-pulse mb-6">Gegner wird gesucht...</div>
            <div className="text-7xl font-mono mb-8">{timeLeft}</div>
            <button onClick={stopSearch} className="text-red-500 underline text-lg">Abbrechen</button>
          </div>
        )}

        {status === 'found' && opponent && (
          <div className="space-y-6">
            <div className="text-5xl">✅ Gegner gefunden!</div>
            <div className="text-4xl font-bold">vs {opponent.username}</div>
            <div className="text-green-400">Weiterleitung...</div>
          </div>
        )}
      </div>
    </div>
  );
}