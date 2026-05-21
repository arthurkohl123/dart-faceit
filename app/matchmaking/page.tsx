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
    setStatus("Suche Gegner...");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('username, elo')
      .eq('supabaseId', session.user.id)
      .single();

    // Simuliere einen schnellen Match für Testzwecke (später echte Logik)
    setTimeout(() => {
      setMatchFound({
        username: "Gegner gefunden",
        elo: 1020
      });
      setSearching(false);
    }, 2500);
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