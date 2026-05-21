'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Matchmaking() {
  const [searching, setSearching] = useState(false);
  const [matchFound, setMatchFound] = useState<any>(null);
  const [status, setStatus] = useState("Bereit zum Suchen...");
  
  const supabase = createClient();
  const router = useRouter();

  const searchMatch = async () => {
    setSearching(true);
    setStatus("Warte auf Gegner...");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('elo, username')
      .eq('supabaseId', session.user.id)
      .single();

    const myElo = profile?.elo || 1000;

    // In Queue eintragen
    await supabase.from('matchmaking_queue').insert({
      user_id: session.user.id,
      elo: myElo
    });

    // Such-Loop
    const interval = setInterval(async () => {
      const { data: queue } = await supabase
        .from('matchmaking_queue')
        .select(`
          *,
          profiles!matchmaking_queue_user_id_fkey (username)
        `)
        .neq('user_id', session.user.id)
        .order('joined_at', { ascending: true })
        .limit(10);

      if (queue && queue.length > 0) {
        const opponent = queue[0];

        clearInterval(interval);

        // Queue aufräumen
        await supabase.from('matchmaking_queue').delete().eq('user_id', session.user.id);
        await supabase.from('matchmaking_queue').delete().eq('user_id', opponent.user_id);

        setMatchFound({
          username: opponent.profiles?.username || "Unbekannter Spieler",
          elo: opponent.elo
        });
        setSearching(false);
        setStatus("Gegner gefunden!");
      }
    }, 1500);

    // Timeout nach 40 Sekunden
    setTimeout(() => {
      clearInterval(interval);
      if (searching) {
        setSearching(false);
        setStatus("Keine Gegner gefunden. Versuche es in ein paar Sekunden erneut.");
        supabase.from('matchmaking_queue').delete().eq('user_id', session.user.id);
      }
    }, 40000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center">
        {!matchFound ? (
          <>
            <div className="mb-16">
              <div className="inline-flex items-center gap-3 bg-zinc-900 px-6 py-3 rounded-full mb-8">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-400 font-medium">Echte Spieler werden gesucht</span>
              </div>
              
              <h1 className="text-6xl font-bold tracking-tighter mb-6">Bereit für ein Match?</h1>
              <p className="text-xl text-zinc-400">{status}</p>
            </div>

            <button
              onClick={searchMatch}
              disabled={searching}
              className="w-full max-w-lg mx-auto bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 py-10 text-4xl font-black rounded-3xl transition-all active:scale-95 disabled:opacity-70"
            >
              {searching ? "🔍 SUCHE GEGNER..." : "🎯 MATCH SUCHEN"}
            </button>
          </>
        ) : (
          <div className="bg-zinc-900 rounded-3xl p-16">
            <div className="text-green-500 text-2xl mb-6">✅ GEGNER GEFUNDEN!</div>
            <div className="text-8xl mb-6">🎯</div>
            <div className="text-5xl font-bold">{matchFound.username}</div>
            <div className="text-3xl text-green-400 mt-4">{matchFound.elo} Elo</div>

            <button 
              onClick={() => router.push('/result')}
              className="mt-10 w-full py-6 bg-green-600 text-2xl font-bold rounded-3xl hover:bg-green-500"
            >
              Match starten
            </button>
          </div>
        )}

        <button 
          onClick={() => router.push('/profile')}
          className="mt-12 text-zinc-400 hover:text-white"
        >
          ← Zurück zum Profil
        </button>
      </div>
    </div>
  );
}