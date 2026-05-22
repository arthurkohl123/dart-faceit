'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type ActiveMatch = {
  id: string;
  player1_id: string;
  player2_id: string;
  player1_username: string;
  player2_username: string;
  player1_elo: number;
  player2_elo: number;
  status: 'pending_result' | 'completed' | 'cancelled';
};

type Profile = {
  elo: number;
  gamesPlayed: number;
  wins: number;
};

type Opponent = {
  userId: string;
  username: string;
  elo: number;
};

export default function MatchResult() {
  const [legsWon, setLegsWon] = useState(0);
  const [legsLost, setLegsLost] = useState(0);
  const [average, setAverage] = useState('');
  const [highestCheckout, setHighestCheckout] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [match, setMatch] = useState<ActiveMatch | null>(null);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [myEloAtMatchStart, setMyEloAtMatchStart] = useState(1000);
  const [errorMessage, setErrorMessage] = useState('');

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const loadMatch = useCallback(async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const matchId = params.get('matchId');

        if (!matchId) {
          setErrorMessage('Kein Match ausgewählt. Starte zuerst ein Matchmaking.');
          setPageLoading(false);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push('/auth/login');
          return;
        }

        const { data, error } = await supabase
          .from('active_matches')
          .select('*')
          .eq('id', matchId)
          .single();

        if (error) throw error;

        const activeMatch = data as ActiveMatch;
        const isPlayer1 = activeMatch.player1_id === session.user.id;
        const isPlayer2 = activeMatch.player2_id === session.user.id;

        if (!isPlayer1 && !isPlayer2) {
          setErrorMessage('Du bist kein Teilnehmer dieses Matches.');
          setPageLoading(false);
          return;
        }

        if (activeMatch.status !== 'pending_result') {
          setErrorMessage('Dieses Match wurde bereits abgeschlossen oder abgebrochen.');
          setPageLoading(false);
          return;
        }

        setMatch(activeMatch);
        setOpponent({
          userId: isPlayer1 ? activeMatch.player2_id : activeMatch.player1_id,
          username: isPlayer1 ? activeMatch.player2_username : activeMatch.player1_username,
          elo: isPlayer1 ? activeMatch.player2_elo : activeMatch.player1_elo,
        });
        setMyEloAtMatchStart(isPlayer1 ? activeMatch.player1_elo : activeMatch.player2_elo);
      } catch (error) {
        console.error('Match konnte nicht geladen werden:', error);
        setErrorMessage(error instanceof Error ? error.message : 'Match konnte nicht geladen werden.');
      } finally {
        setPageLoading(false);
      }
  }, [router, supabase]);

  useEffect(() => {
    void Promise.resolve().then(loadMatch);
  }, [loadMatch]);

  const submitResult = async () => {
    if (!match || !opponent || (legsWon === 0 && legsLost === 0)) return;

    setLoading(true);
    setErrorMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login');
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('elo, gamesPlayed, wins')
        .eq('supabaseId', session.user.id)
        .single();

      if (profileError) throw profileError;

      const profile = profileData as Profile;
      const isWin = legsWon > legsLost;
      const currentElo = profile?.elo || myEloAtMatchStart || 1000;
      const opponentElo = opponent.elo || 1000;
      const kFactor = 32;

      const score = isWin ? 1 : 0;
      const expected = 1 / (1 + Math.pow(10, (opponentElo - currentElo) / 400));
      const eloChange = Math.round(kFactor * (score - expected));
      const newElo = currentElo + eloChange;

      const { error: matchInsertError } = await supabase.from('matches').insert({
        user_id: session.user.id,
        opponent_name: opponent.username,
        opponent_elo: opponentElo,
        legs_won: legsWon,
        legs_lost: legsLost,
        result: `${legsWon}:${legsLost}`,
        is_win: isWin,
        my_average: parseFloat(average) || null,
        highest_checkout: parseInt(highestCheckout) || null,
        elo_change: eloChange,
      });

      if (matchInsertError) throw matchInsertError;

      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          elo: newElo,
          gamesPlayed: (profile?.gamesPlayed || 0) + 1,
          wins: isWin ? (profile?.wins || 0) + 1 : (profile?.wins || 0),
        })
        .eq('supabaseId', session.user.id);

      if (profileUpdateError) throw profileUpdateError;

      const { error: activeMatchUpdateError } = await supabase
        .from('active_matches')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result_submitted_by: session.user.id,
        })
        .eq('id', match.id);

      if (activeMatchUpdateError) throw activeMatchUpdateError;

      alert(`Match gespeichert!\n${legsWon}:${legsLost} Legs\nElo-Veränderung: ${eloChange > 0 ? '+' : ''}${eloChange}`);
      router.push('/history');
    } catch (error) {
      console.error('Match konnte nicht gespeichert werden:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Match konnte nicht gespeichert werden.');
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-3xl text-green-400 animate-pulse">Match wird geladen...</div>
      </div>
    );
  }

  if (errorMessage && !match) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-8">
        <div className="max-w-xl bg-zinc-900 rounded-3xl p-10 text-center border border-red-800">
          <h1 className="text-3xl font-bold text-red-400 mb-4">Kein gültiges Match</h1>
          <p className="text-zinc-300 mb-8">{errorMessage}</p>
          <button onClick={() => router.push('/matchmaking')} className="px-8 py-4 bg-green-600 hover:bg-green-700 rounded-2xl font-bold">
            Zum Matchmaking
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-10">Ergebnis eintragen</h1>

        <div className="bg-zinc-900 rounded-3xl p-10">
          <div className="text-center mb-10">
            <p className="text-xl">Gegner: <strong>{opponent?.username}</strong> ({opponent?.elo} Elo)</p>
            {errorMessage && <p className="text-red-400 mt-4">{errorMessage}</p>}
          </div>

          <div className="mb-12">
            <label className="block text-center text-zinc-400 mb-6 text-lg">Legs</label>
            <div className="flex justify-center items-center gap-12">
              <div className="text-center">
                <button onClick={() => setLegsWon(l => Math.max(0, l - 1))} className="text-5xl px-6 text-zinc-400 hover:text-white">-</button>
                <span className="text-7xl font-bold mx-8 text-green-500">{legsWon}</span>
                <button onClick={() => setLegsWon(l => l + 1)} className="text-5xl px-6 text-zinc-400 hover:text-white">+</button>
                <p className="text-sm text-green-500 mt-2">Ich</p>
              </div>

              <div className="text-6xl text-zinc-600">:</div>

              <div className="text-center">
                <button onClick={() => setLegsLost(l => Math.max(0, l - 1))} className="text-5xl px-6 text-zinc-400 hover:text-white">-</button>
                <span className="text-7xl font-bold mx-8 text-red-500">{legsLost}</span>
                <button onClick={() => setLegsLost(l => l + 1)} className="text-5xl px-6 text-zinc-400 hover:text-white">+</button>
                <p className="text-sm text-red-500 mt-2">Gegner</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-10">
            <div>
              <label className="block text-zinc-400 mb-3">Average</label>
              <input
                type="number"
                step="0.01"
                value={average}
                onChange={(event) => setAverage(event.target.value)}
                className="w-full bg-zinc-800 p-5 rounded-2xl text-2xl text-center"
                placeholder="84.7"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-3">Höchster Checkout</label>
              <input
                type="number"
                value={highestCheckout}
                onChange={(event) => setHighestCheckout(event.target.value)}
                className="w-full bg-zinc-800 p-5 rounded-2xl text-2xl text-center"
                placeholder="170"
              />
            </div>
          </div>

          <button
            onClick={submitResult}
            disabled={loading || (legsWon === 0 && legsLost === 0)}
            className="w-full py-7 bg-green-600 hover:bg-green-700 text-2xl font-bold rounded-3xl disabled:opacity-50"
          >
            {loading ? 'Wird gespeichert...' : 'Match speichern'}
          </button>
        </div>

        <button
          onClick={() => router.push('/profile')}
          className="mt-8 text-zinc-400 hover:text-white block mx-auto"
        >
          ← Abbrechen
        </button>
      </div>
    </div>
  );
}