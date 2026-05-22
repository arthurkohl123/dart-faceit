'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type MatchStatus = 'pending_result' | 'awaiting_confirmation' | 'completed' | 'disputed' | 'cancelled';

type ActiveMatch = {
  id: string;
  player1_id: string;
  player2_id: string;
  player1_username: string;
  player2_username: string;
  player1_elo: number;
  player2_elo: number;
  status: MatchStatus;
  submitted_by: string | null;
  submitted_winner_id: string | null;
  submitted_player1_legs: number | null;
  submitted_player2_legs: number | null;
  submitted_player1_average: number | null;
  submitted_player2_average: number | null;
  submitted_player1_checkout: number | null;
  submitted_player2_checkout: number | null;
  confirmed_by: string | null;
  dispute_reason: string | null;
};

type Opponent = {
  userId: string;
  username: string;
  elo: number;
};

type RpcStatusResponse = {
  result_status: string;
  result_message: string;
  elo_change?: number;
};

export default function MatchResult() {
  const [legsWon, setLegsWon] = useState(0);
  const [legsLost, setLegsLost] = useState(0);
  const [average, setAverage] = useState('');
  const [highestCheckout, setHighestCheckout] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [match, setMatch] = useState<ActiveMatch | null>(null);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

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

      setCurrentUserId(session.user.id);

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

      setMatch(activeMatch);
      setOpponent({
        userId: isPlayer1 ? activeMatch.player2_id : activeMatch.player1_id,
        username: isPlayer1 ? activeMatch.player2_username : activeMatch.player1_username,
        elo: isPlayer1 ? activeMatch.player2_elo : activeMatch.player1_elo,
      });
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

  const isSubmitter = Boolean(match?.submitted_by && match.submitted_by === currentUserId);
  const needsMyConfirmation = Boolean(match?.status === 'awaiting_confirmation' && match.submitted_by && match.submitted_by !== currentUserId);

  const submittedResultForMe = useMemo(() => {
    if (!match || !currentUserId) return null;

    const iAmPlayer1 = currentUserId === match.player1_id;
    const myLegs = iAmPlayer1 ? match.submitted_player1_legs : match.submitted_player2_legs;
    const opponentLegs = iAmPlayer1 ? match.submitted_player2_legs : match.submitted_player1_legs;
    const submitterName = match.submitted_by === match.player1_id ? match.player1_username : match.player2_username;
    const winnerName = match.submitted_winner_id === match.player1_id ? match.player1_username : match.player2_username;

    return {
      myLegs,
      opponentLegs,
      submitterName,
      winnerName,
      resultText: `${myLegs ?? '-'}:${opponentLegs ?? '-'}`,
    };
  }, [currentUserId, match]);

  const submitResult = async () => {
    if (!match || !opponent || legsWon === legsLost) return;

    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      const { data, error } = await supabase.rpc('submit_match_result', {
        p_match_id: match.id,
        p_my_legs: legsWon,
        p_opponent_legs: legsLost,
        p_my_average: average ? Number.parseFloat(average) : null,
        p_highest_checkout: highestCheckout ? Number.parseInt(highestCheckout, 10) : null,
      });

      if (error) throw error;

      const response = Array.isArray(data) ? data[0] as RpcStatusResponse | undefined : undefined;
      setInfoMessage(response?.result_message || 'Ergebnis eingereicht. Warte auf Bestätigung deines Gegners.');
      await loadMatch();
    } catch (error) {
      console.error('Match konnte nicht eingereicht werden:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Match konnte nicht eingereicht werden.');
    } finally {
      setLoading(false);
    }
  };

  const confirmResult = async () => {
    if (!match) return;

    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      const { data, error } = await supabase.rpc('confirm_match_result', {
        p_match_id: match.id,
      });

      if (error) throw error;

      const response = Array.isArray(data) ? data[0] as RpcStatusResponse | undefined : undefined;
      const eloText = typeof response?.elo_change === 'number'
        ? ` Deine Elo-Änderung: ${response.elo_change > 0 ? '+' : ''}${response.elo_change}.`
        : '';
      alert(`${response?.result_message || 'Ergebnis bestätigt.'}${eloText}`);
      router.push('/history');
    } catch (error) {
      console.error('Ergebnis konnte nicht bestätigt werden:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Ergebnis konnte nicht bestätigt werden.');
    } finally {
      setLoading(false);
    }
  };

  const disputeResult = async () => {
    if (!match) return;

    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      const { data, error } = await supabase.rpc('dispute_match_result', {
        p_match_id: match.id,
        p_reason: disputeReason || null,
      });

      if (error) throw error;

      const response = Array.isArray(data) ? data[0] as RpcStatusResponse | undefined : undefined;
      setInfoMessage(response?.result_message || 'Widerspruch gespeichert. Es wurde keine Elo vergeben.');
      await loadMatch();
    } catch (error) {
      console.error('Widerspruch konnte nicht gespeichert werden:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Widerspruch konnte nicht gespeichert werden.');
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
        <h1 className="text-4xl font-bold text-center mb-10">Ergebnis</h1>

        <div className="bg-zinc-900 rounded-3xl p-10 border border-zinc-800">
          <div className="text-center mb-10">
            <p className="text-xl">Gegner: <strong>{opponent?.username}</strong> ({opponent?.elo} Elo)</p>
            {errorMessage && <p className="text-red-400 mt-4">{errorMessage}</p>}
            {infoMessage && <p className="text-green-400 mt-4">{infoMessage}</p>}
          </div>

          {match?.status === 'pending_result' && (
            <>
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

              {legsWon === legsLost && (legsWon > 0 || legsLost > 0) && (
                <p className="text-center text-red-400 mb-6">Ein Unentschieden kann nicht eingereicht werden.</p>
              )}

              <button
                onClick={submitResult}
                disabled={loading || legsWon === legsLost || (legsWon === 0 && legsLost === 0)}
                className="w-full py-7 bg-green-600 hover:bg-green-700 text-2xl font-bold rounded-3xl disabled:opacity-50"
              >
                {loading ? 'Wird eingereicht...' : 'Ergebnis zur Bestätigung einreichen'}
              </button>
            </>
          )}

          {match?.status === 'awaiting_confirmation' && isSubmitter && (
            <div className="text-center bg-zinc-800 rounded-3xl p-8 border border-yellow-700/60">
              <h2 className="text-2xl font-bold text-yellow-400 mb-4">Warte auf Bestätigung</h2>
              <p className="text-zinc-300">
                Du hast das Ergebnis <strong>{submittedResultForMe?.resultText}</strong> eingereicht.
                Elo wird erst vergeben, wenn {opponent?.username} bestätigt.
              </p>
            </div>
          )}

          {match?.status === 'awaiting_confirmation' && needsMyConfirmation && (
            <div className="bg-zinc-800 rounded-3xl p-8 border border-green-700/60">
              <h2 className="text-2xl font-bold text-green-400 mb-4 text-center">Ergebnis bestätigen</h2>
              <p className="text-zinc-300 text-center mb-6">
                {submittedResultForMe?.submitterName} hat folgendes Ergebnis eingereicht:
              </p>
              <div className="text-center text-6xl font-black mb-6">
                {submittedResultForMe?.resultText}
              </div>
              <p className="text-center text-zinc-400 mb-8">
                Gewinner laut Einreichung: <strong className="text-white">{submittedResultForMe?.winnerName}</strong>
              </p>

              <div className="space-y-4">
                <button
                  onClick={confirmResult}
                  disabled={loading}
                  className="w-full py-5 bg-green-600 hover:bg-green-700 rounded-2xl text-xl font-bold disabled:opacity-50"
                >
                  {loading ? 'Wird bestätigt...' : 'Ergebnis bestätigen und Elo vergeben'}
                </button>

                <textarea
                  value={disputeReason}
                  onChange={(event) => setDisputeReason(event.target.value)}
                  className="w-full bg-zinc-900 p-4 rounded-2xl text-white"
                  placeholder="Optional: Warum stimmt das Ergebnis nicht?"
                  rows={3}
                />

                <button
                  onClick={disputeResult}
                  disabled={loading}
                  className="w-full py-5 bg-red-700 hover:bg-red-800 rounded-2xl text-xl font-bold disabled:opacity-50"
                >
                  Ergebnis widersprechen
                </button>
              </div>
            </div>
          )}

          {match?.status === 'completed' && (
            <div className="text-center bg-zinc-800 rounded-3xl p-8 border border-green-700/60">
              <h2 className="text-2xl font-bold text-green-400 mb-4">Match abgeschlossen</h2>
              <p className="text-zinc-300 mb-8">Dieses Match wurde bereits bestätigt und in der History gespeichert.</p>
              <button onClick={() => router.push('/history')} className="px-8 py-4 bg-green-600 hover:bg-green-700 rounded-2xl font-bold">
                Zur History
              </button>
            </div>
          )}

          {match?.status === 'disputed' && (
            <div className="text-center bg-zinc-800 rounded-3xl p-8 border border-red-700/60">
              <h2 className="text-2xl font-bold text-red-400 mb-4">Ergebnis im Widerspruch</h2>
              <p className="text-zinc-300">Für dieses Match wurde keine Elo vergeben. Es muss manuell geprüft werden.</p>
              {match.dispute_reason && <p className="text-zinc-400 mt-4">Grund: {match.dispute_reason}</p>}
            </div>
          )}
        </div>

        <button
          onClick={() => router.push('/profile')}
          className="mt-8 text-zinc-400 hover:text-white block mx-auto"
        >
          ← Zurück zum Profil
        </button>
      </div>
    </div>
  );
}
