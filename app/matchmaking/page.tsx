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

    if (!profile) return alert("Profil nicht gefunden");

    // In die Queue eintragen
    await supabase.from('matchmaking_queue').insert({
      user_id: session.user.id,
      elo: profile.elo
    });

    setStatus('searching');
    setTimeLeft(60);
  };

  const stopSearch = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase
        .from('matchmaking_queue')
        .delete()
        .eq('user_id', session.user.id);
    }
    setStatus('idle');
    setOpponent(null);
  };

  // Polling
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

      if (!myProfile) return;

      // Gegner suchen (±40 Elo)
      const { data: found } = await supabase
        .from('matchmaking_queue')
        .select(`
          *,
          profiles!matchmaking_queue_user_id_fkey (username, elo)
        `)
        .neq('user_id', session.user.id)
        .gte('elo', myProfile.elo - 40)
        .lte('elo', myProfile.elo + 40)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (found) {
        setOpponent(found.profiles);
        setStatus('found');

        // Beide aus Queue entfernen
        await supabase.from('matchmaking_queue').delete().eq('user_id', session.user.id);
        await supabase.from('matchmaking_queue').delete().eq('user_id', found.user_id);

        setTimeout(() => router.push('/result'), 1800);
      }
    }, 1800);

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
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#22c55e_1px,transparent_1px)] [background-size:40px_40px]"></div>

      <div className="text-center z-10 max-w-md">
        <h1 className="text-6xl font-black mb-8">🎯 MATCHMAKING</h1>

        {status === 'idle' && (
          <button
            onClick={startSearch}
            className="px-20 py-8 bg-gradient-to-r from-green-500 to-emerald-600 text-3xl font-bold rounded-3xl hover:scale-105 transition-all active:scale-95"
          >
            MATCH SUCHEN
          </button>
        )}

        {status === 'searching' && (
          <div>
            <div className="text-4xl font-bold text-green-400 animate-pulse mb-6">Gegner wird gesucht...</div>
            <div className="text-7xl font-mono mb-8">{timeLeft}</div>
            <button
              onClick={stopSearch}
              className="px-10 py-4 bg-red-600 hover:bg-red-700 rounded-2xl text-lg"
            >
              Suche abbrechen
            </button>
          </div>
        )}

        {status === 'found' && opponent && (
          <div className="space-y-6">
            <div className="text-5xl">✅ Gegner gefunden!</div>
            <div className="text-4xl font-bold">vs {opponent.username}</div>
            <div className="text-green-400">Weiterleitung zum Match...</div>
          </div>
        )}
      </div>
    </div>
  );
}