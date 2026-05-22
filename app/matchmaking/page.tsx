'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type MatchmakingStatus = 'idle' | 'searching' | 'found' | 'error';

type MatchmakingResponse = {
  match_id: string | null;
  opponent_user_id: string | null;
  opponent_username: string | null;
  opponent_elo: number | null;
  player_elo: number | null;
  match_status: 'searching' | 'matched';
};

type Opponent = {
  username: string;
  elo: number;
};

export default function Matchmaking() {
  const [status, setStatus] = useState<MatchmakingStatus>('idle');
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const isPollingRef = useRef(false);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const getMaxEloDiff = (seconds: number) => {
    if (seconds < 20) return 100;
    if (seconds < 40) return 200;
    if (seconds < 60) return 350;
    return 600;
  };

  const redirectToResult = useCallback((matchId: string) => {
    setTimeout(() => router.push(`/result?matchId=${matchId}`), 1500);
  }, [router]);

  const pollForMatch = useCallback(async (seconds: number) => {
    if (isPollingRef.current) return;

    isPollingRef.current = true;
    const maxEloDiff = getMaxEloDiff(seconds);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login');
        return;
      }

      const { data, error } = await supabase.rpc('find_or_create_match', {
        p_max_elo_diff: maxEloDiff,
      });

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] as MatchmakingResponse | undefined : data as MatchmakingResponse | undefined;

      const { count } = await supabase
        .from('matchmaking_queue')
        .select('*', { count: 'exact', head: true });

      setQueueCount(count || 0);

      if (result?.match_status === 'matched' && result.match_id && result.opponent_username) {
        setOpponent({
          username: result.opponent_username,
          elo: result.opponent_elo || 1000,
        });
        setStatus('found');
        redirectToResult(result.match_id);
      }
    } catch (error) {
      console.error('Matchmaking fehlgeschlagen:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Matchmaking konnte nicht gestartet werden.');
      setStatus('error');
    } finally {
      isPollingRef.current = false;
    }
  }, [redirectToResult, router, supabase]);

  const startSearch = async () => {
    setErrorMessage('');
    setOpponent(null);
    setElapsedSeconds(0);
    setStatus('searching');
    await pollForMatch(0);
  };

  const stopSearch = async () => {
    try {
      await supabase.rpc('cancel_matchmaking');
    } catch (error) {
      console.error('Matchmaking-Abbruch fehlgeschlagen:', error);
    } finally {
      setStatus('idle');
      setElapsedSeconds(0);
      setQueueCount(0);
    }
  };

  useEffect(() => {
    if (status !== 'searching') return;

    const pollingInterval = setInterval(() => {
      setElapsedSeconds((current) => {
        const next = current + 2;
        void pollForMatch(next);
        return next;
      });
    }, 2000);

    return () => clearInterval(pollingInterval);
  }, [pollForMatch, status]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="text-center max-w-3xl w-full">
        <h1 className="text-5xl md:text-6xl font-black mb-8">MATCHMAKING</h1>

        {status === 'idle' && (
          <div className="space-y-8">
            <p className="text-zinc-400 text-lg">
              Suche einen echten Gegner. Die Suche startet zuerst in deiner Elo-Nähe und erweitert den Bereich automatisch, falls niemand Passendes online ist.
            </p>
            <button onClick={startSearch} className="px-16 py-7 bg-green-600 text-2xl md:text-3xl font-bold rounded-3xl hover:bg-green-500 transition">
              MATCH SUCHEN
            </button>
          </div>
        )}

        {status === 'searching' && (
          <div className="space-y-6 bg-zinc-900 rounded-3xl p-10 border border-zinc-800">
            <div className="text-4xl text-green-400 animate-pulse">Gegner wird gesucht...</div>
            <div className="text-6xl font-mono">{elapsedSeconds}s</div>
            <div className="text-zinc-400">Aktueller Elo-Suchradius: ±{getMaxEloDiff(elapsedSeconds)}</div>
            <div className="text-zinc-400">In Queue: {queueCount} Spieler</div>
            <button onClick={stopSearch} className="text-red-500 underline hover:text-red-400">Abbrechen</button>
          </div>
        )}

        {status === 'found' && opponent && (
          <div className="bg-zinc-900 rounded-3xl p-10 border border-green-700">
            <div className="text-5xl mb-4">Gegner gefunden!</div>
            <div className="text-4xl">vs {opponent.username}</div>
            <div className="text-zinc-400 mt-3">{opponent.elo} Elo</div>
            <div className="text-green-400 mt-8 animate-pulse">Du wirst zur Ergebnis-Eingabe weitergeleitet...</div>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-red-950/40 rounded-3xl p-10 border border-red-800">
            <div className="text-3xl font-bold text-red-400 mb-4">Matchmaking-Fehler</div>
            <p className="text-zinc-300 mb-8">{errorMessage}</p>
            <button onClick={() => setStatus('idle')} className="px-8 py-4 bg-zinc-800 rounded-2xl hover:bg-zinc-700">
              Erneut versuchen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}