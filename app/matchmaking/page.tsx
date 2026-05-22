'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Matchmaking() {
  const [status, setStatus] = useState<'idle' | 'searching' | 'found'>('idle');
  const [opponent, setOpponent] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [queueCount, setQueueCount] = useState(0);
  const supabase = createClient();
  const router = useRouter();

  const startSearch = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return router.push('/auth/login');

    const { data: profile } = await supabase
      .from('profiles')
      .select('elo, username')
      .eq('supabaseId', session.user.id)
      .single();

    await supabase.from('matchmaking_queue').insert({
      user_id: session.user.id,
      elo: profile?.elo || 1000
    });

    console.log(`[${profile?.username}] In Queue mit ${profile?.elo} Elo`);
    setStatus('searching');
    setTimeLeft(60);
  };

  const stopSearch = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await supabase.from('matchmaking_queue').delete().eq('user_id', session.user.id);
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

      // Debug: Alle in Queue anzeigen
      const { data: all } = await supabase.from('matchmaking_queue').select('*');
      console.log("Aktuelle Queue:", all);
      setQueueCount(all?.length || 0);

      // Gegner suchen
      const { data: found } = await supabase
        .from('matchmaking_queue')
        .select('user_id, elo')
        .neq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();

      if (found) {
        console.log("✅ Gegner gefunden in DB:", found);

        const { data: opponentData } = await supabase
          .from('profiles')
          .select('username')
          .eq('supabaseId', found.user_id)
          .single();

        setOpponent(opponentData);
        setStatus('found');

        // Beide entfernen
        await supabase.from('matchmaking_queue').delete().eq('user_id', session.user.id);
        await supabase.from('matchmaking_queue').delete().eq('user_id', found.user_id);

        setTimeout(() => router.push('/result'), 1500);
      }
    }, 1800);

    const timer = setInterval(() => {
      setTimeLeft(p => p > 1 ? p - 1 : 0);
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [status]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-black mb-8">🎯 MATCHMAKING</h1>

        {status === 'idle' && (
          <button onClick={startSearch} className="px-20 py-8 bg-green-600 text-3xl font-bold rounded-3xl hover:bg-green-500">
            MATCH SUCHEN
          </button>
        )}

        {status === 'searching' && (
          <div className="space-y-6">
            <div className="text-4xl text-green-400 animate-pulse">Gegner wird gesucht...</div>
            <div className="text-6xl font-mono">{timeLeft}s</div>
            <div className="text-zinc-400">In Queue: {queueCount} Spieler</div>
            <button onClick={stopSearch} className="text-red-500 underline">Abbrechen</button>
          </div>
        )}

        {status === 'found' && opponent && (
          <div>
            <div className="text-5xl mb-4">✅ Gegner gefunden!</div>
            <div className="text-4xl">vs {opponent.username}</div>
          </div>
        )}
      </div>
    </div>
  );
}