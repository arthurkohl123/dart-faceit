'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Matchmaking() {
  const [status, setStatus] = useState<'idle' | 'searching' | 'found'>('idle');
  const [opponent, setOpponent] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(60);
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
    setTimeLeft(60);
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

      // Einfache Suche ohne komplizierten Join
      const { data: found } = await supabase
        .from('matchmaking_queue')
        .select('*')
        .neq('user_id', session.user.id)
        .gte('elo', (myProfile?.elo || 1000) - 50)
        .lte('elo', (myProfile?.elo || 1000) + 50)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (found) {
        // Gegner-Info holen
        const { data: opponentProfile } = await supabase
          .from('profiles')
          .select('username, elo')
          .eq('supabaseId', found.user_id)
          .single();

        setOpponent(opponentProfile);
        setStatus('found');

        // Beide aus Queue entfernen
        await supabase.from('matchmaking_queue').delete().eq('user_id', session.user.id);
        await supabase.from('matchmaking_queue').delete().eq('user_id', found.user_id);

        setTimeout(() => router.push('/result'), 2000);
      }
    }, 2000);

    const timer = setInterval(() => {
      setTimeLeft(p => p > 1 ? p - 1 : 0);
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [status]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-black mb-10">🎯 MATCHMAKING</h1>

        {status === 'idle' && (
          <button onClick={startSearch} className="px-20 py-8 bg-green-600 text-3xl font-bold rounded-3xl hover:bg-green-500">
            MATCH SUCHEN
          </button>
        )}

        {status === 'searching' && (
          <div>
            <div className="text-4xl animate-pulse mb-4">Gegner wird gesucht...</div>
            <div className="text-6xl font-mono mb-8">{timeLeft}s</div>
            <button onClick={stopSearch} className="text-red-500">Abbrechen</button>
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