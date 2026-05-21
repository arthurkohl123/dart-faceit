'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Matchmaking() {
  const [searching, setSearching] = useState(false);
  const [matchFound, setMatchFound] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const supabase = createClient();
  const router = useRouter();

  // Auth-Check
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login');
        return;
      }
      setLoading(false);
    };

    checkAuth();
  }, [router, supabase]);

  const searchMatch = async () => {
    setSearching(true);

    setTimeout(() => {
      setMatchFound({
        username: "DartKing42",
        elo: 1020,
        winrate: "68%"
      });
      setSearching(false);
    }, 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-xl">Überprüfe Anmeldung...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center">
        
        {!matchFound ? (
          <>
            <div className="mb-16">
              <div className="inline-flex items-center gap-3 bg-zinc-900 px-6 py-3 rounded-full mb-8">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-400 font-medium">47 Spieler suchen gerade</span>
              </div>
              
              <h1 className="text-6xl font-bold tracking-tighter mb-6">
                Bereit für ein Match?
              </h1>
              <p className="text-xl text-zinc-400 max-w-md mx-auto">
                Wir finden einen Gegner mit ähnlichem Elo-Level
              </p>
            </div>

            <button
              onClick={searchMatch}
              disabled={searching}
              className="w-full max-w-lg mx-auto bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 py-10 text-4xl font-black rounded-3xl transition-all active:scale-95 shadow-2xl shadow-green-500/40 disabled:opacity-70"
            >
              {searching ? (
                <div className="flex items-center justify-center gap-4">
                  <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                  SUCHE GEGNER...
                </div>
              ) : (
                "🎯 MATCH SUCHEN"
              )}
            </button>
          </>
        ) : (
          <div className="bg-zinc-900 rounded-3xl p-16">
            <div className="text-green-500 text-xl mb-4">✅ GEGNER GEFUNDEN!</div>
            
            <div className="text-8xl mb-6">🎯</div>
            <div className="text-5xl font-bold mb-2">{matchFound.username}</div>
            <div className="text-3xl text-green-400 mb-10">{matchFound.elo} Elo • {matchFound.winrate} Winrate</div>

            <div className="flex gap-4 justify-center">
              <button 
                onClick={() => router.push('/result')}
                className="bg-green-600 hover:bg-green-500 px-12 py-6 rounded-2xl text-2xl font-bold transition flex-1 max-w-xs"
              >
                Match starten
              </button>
              <button 
                onClick={() => setMatchFound(null)}
                className="bg-zinc-800 hover:bg-zinc-700 px-10 py-6 rounded-2xl text-xl transition flex-1 max-w-xs"
              >
                Neu suchen
              </button>
            </div>
          </div>
        )}

        <button 
          onClick={() => router.push('/profile')}
          className="mt-12 text-zinc-400 hover:text-white text-lg"
        >
          ← Zurück zum Profil
        </button>
      </div>
    </div>
  );
}