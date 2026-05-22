'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardCheck, Crown, Gauge, MessageSquare, ShieldCheck, Target, Trophy, XCircle } from 'lucide-react';
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

type LocalMatchStats = {
  matchFormat: string;
  checkoutHits: string;
  checkoutAttempts: string;
  oneEighties: string;
  tonPlus: string;
  matchNote: string;
};

const matchFormats = ['Best of 3', 'Best of 5', 'Best of 7', 'Best of 9'];

const statHints = [
  { title: 'Legs', description: 'Pflichtfeld für Gewinner und Elo-Auswertung.' },
  { title: 'Average', description: 'Wichtig für Formkurve, Matchqualität und spätere Statistiken.' },
  { title: 'Highest Checkout', description: 'Zeigt deine beste Finish-Situation im Match.' },
  { title: 'Checkout-Quote', description: 'Hilft zu erkennen, ob Scoring oder Finishing dein Engpass ist.' },
  { title: '180er und Ton+', description: 'Macht starke Scoring-Matches später besser sichtbar.' },
  { title: 'Match-Notiz', description: 'Praktisch für Admin-Prüfung, Widersprüche und persönliche Analyse.' },
];

type NumberControlProps = {
  label: string;
  value: number;
  setValue: Dispatch<SetStateAction<number>>;
  accent: string;
};

function NumberControl({ label, value, setValue, accent }: NumberControlProps) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-center">
      <div className="text-sm font-black uppercase tracking-[0.22em] text-zinc-500">{label}</div>
      <div className="mt-5 flex items-center justify-center gap-4">
        <button onClick={() => setValue((current) => Math.max(0, current - 1))} className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 text-3xl font-black text-zinc-400 transition hover:bg-white/10 hover:text-white">−</button>
        <span className={`min-w-20 text-7xl font-black tracking-[-0.08em] ${accent}`}>{value}</span>
        <button onClick={() => setValue((current) => current + 1)} className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 text-3xl font-black text-zinc-400 transition hover:bg-white/10 hover:text-white">+</button>
      </div>
    </div>
  );
}

export default function MatchResult() {
  const [legsWon, setLegsWon] = useState(0);
  const [legsLost, setLegsLost] = useState(0);
  const [average, setAverage] = useState('');
  const [highestCheckout, setHighestCheckout] = useState('');
  const [matchFormat, setMatchFormat] = useState(matchFormats[1]);
  const [checkoutHits, setCheckoutHits] = useState('');
  const [checkoutAttempts, setCheckoutAttempts] = useState('');
  const [oneEighties, setOneEighties] = useState('');
  const [tonPlus, setTonPlus] = useState('');
  const [matchNote, setMatchNote] = useState('');
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

  const loadLocalStats = useCallback((matchId: string) => {
    if (typeof window === 'undefined') return;

    const saved = window.localStorage.getItem(`rankeddarts-result-stats-${matchId}`);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as Partial<LocalMatchStats>;
      setMatchFormat(parsed.matchFormat || matchFormats[1]);
      setCheckoutHits(parsed.checkoutHits || '');
      setCheckoutAttempts(parsed.checkoutAttempts || '');
      setOneEighties(parsed.oneEighties || '');
      setTonPlus(parsed.tonPlus || '');
      setMatchNote(parsed.matchNote || '');
    } catch (error) {
      console.error('Lokale Match-Stats konnten nicht gelesen werden:', error);
    }
  }, []);

  const saveLocalStats = useCallback((matchId: string) => {
    if (typeof window === 'undefined') return;

    const stats: LocalMatchStats = {
      matchFormat,
      checkoutHits,
      checkoutAttempts,
      oneEighties,
      tonPlus,
      matchNote,
    };

    window.localStorage.setItem(`rankeddarts-result-stats-${matchId}`, JSON.stringify(stats));
  }, [checkoutAttempts, checkoutHits, matchFormat, matchNote, oneEighties, tonPlus]);

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
      loadLocalStats(matchId);

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
  }, [loadLocalStats, router, supabase]);

  useEffect(() => {
    void Promise.resolve().then(loadMatch);
  }, [loadMatch]);

  const isSubmitter = Boolean(match?.submitted_by && match.submitted_by === currentUserId);
  const needsMyConfirmation = Boolean(match?.status === 'awaiting_confirmation' && match.submitted_by && match.submitted_by !== currentUserId);
  const checkoutHitsNumber = checkoutHits ? Number.parseInt(checkoutHits, 10) : 0;
  const checkoutAttemptsNumber = checkoutAttempts ? Number.parseInt(checkoutAttempts, 10) : 0;
  const checkoutRate = checkoutAttemptsNumber > 0 ? Math.round((checkoutHitsNumber / checkoutAttemptsNumber) * 100) : 0;
  const averageNumber = average ? Number.parseFloat(average) : 0;
  const legDifference = Math.abs(legsWon - legsLost);
  const isWin = legsWon > legsLost;
  const resultIsValid = legsWon !== legsLost && (legsWon > 0 || legsLost > 0);
  const statsCompletion = [resultIsValid, Boolean(average), Boolean(highestCheckout), checkoutAttemptsNumber > 0, Boolean(oneEighties), Boolean(tonPlus), Boolean(matchNote)].filter(Boolean).length;
  const statsCompletionPercent = Math.round((statsCompletion / 7) * 100);
  const performanceLabel = averageNumber >= 80 ? 'Starkes Scoring' : averageNumber >= 60 ? 'Solide Form' : averageNumber > 0 ? 'Ausbaufähig' : 'Noch offen';
  const resultTone = isWin ? 'text-emerald-300' : 'text-zinc-300';

  const submittedResultForMe = useMemo(() => {
    if (!match || !currentUserId) return null;

    const iAmPlayer1 = currentUserId === match.player1_id;
    const myLegs = iAmPlayer1 ? match.submitted_player1_legs : match.submitted_player2_legs;
    const opponentLegs = iAmPlayer1 ? match.submitted_player2_legs : match.submitted_player1_legs;
    const submitterName = match.submitted_by === match.player1_id ? match.player1_username : match.player2_username;
    const winnerName = match.submitted_winner_id === match.player1_id ? match.player1_username : match.player2_username;
    const myAverage = iAmPlayer1 ? match.submitted_player1_average : match.submitted_player2_average;
    const opponentAverage = iAmPlayer1 ? match.submitted_player2_average : match.submitted_player1_average;
    const myCheckout = iAmPlayer1 ? match.submitted_player1_checkout : match.submitted_player2_checkout;
    const opponentCheckout = iAmPlayer1 ? match.submitted_player2_checkout : match.submitted_player1_checkout;

    return {
      myLegs,
      opponentLegs,
      submitterName,
      winnerName,
      myAverage,
      opponentAverage,
      myCheckout,
      opponentCheckout,
      resultText: `${myLegs ?? '-'}:${opponentLegs ?? '-'}`,
    };
  }, [currentUserId, match]);

  const submitResult = async () => {
    if (!match || !opponent || !resultIsValid) return;

    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');
    saveLocalStats(match.id);

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
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-6 text-lg font-bold text-emerald-200 backdrop-blur-xl">Match wird geladen...</div>
      </main>
    );
  }

  if (errorMessage && !match) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050607] p-6 text-white">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_34%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_78%)]" />
        <div className="relative max-w-xl rounded-[2rem] border border-red-400/25 bg-zinc-950/86 p-8 text-center shadow-2xl shadow-black/60 backdrop-blur-2xl md:p-10">
          <XCircle className="mx-auto h-14 w-14 text-red-300" />
          <h1 className="mt-5 text-4xl font-black tracking-[-0.05em]">Kein gültiges Match</h1>
          <p className="mt-4 text-zinc-300">{errorMessage}</p>
          <button onClick={() => router.push('/matchmaking')} className="mt-8 rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-4 font-black uppercase tracking-[0.16em] text-black">
            Zum Matchmaking
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.24),transparent_34%),radial-gradient(circle_at_82%_8%,rgba(6,182,212,0.14),transparent_28%),radial-gradient(circle_at_45%_45%,rgba(163,230,53,0.08),transparent_34%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_78%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <nav className="relative z-10 border-b border-white/10 bg-black/45 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-xl font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-xl font-black tracking-[-0.04em] md:text-2xl">RANKEDDARTS</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Result Center</div>
            </div>
          </Link>

          <button onClick={() => router.push('/profile')} className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10">
            Zurück zum Profil
          </button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]" />
              Ergebnis & Matchanalyse
            </div>
            <h1 className="mt-6 text-6xl font-black leading-[0.9] tracking-[-0.07em] md:text-8xl">Result Center</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300">Trage das Ergebnis ein, ergänze wichtige Stats und bestätige fair. Die Kernwerte werden wie bisher an Supabase gesendet; zusätzliche Analysewerte werden lokal pro Match vorbereitet.</p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-zinc-950/86 p-6 backdrop-blur-xl">
            <div className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Match</div>
            <div className="mt-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-3xl font-black tracking-[-0.04em]">vs {opponent?.username}</div>
                <div className="mt-1 text-zinc-400">{opponent?.elo} Elo</div>
              </div>
              <div className="grid h-16 w-16 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
                <Target className="h-8 w-8" />
              </div>
            </div>
          </div>
        </div>

        {(errorMessage || infoMessage) && (
          <div className={`mb-8 rounded-3xl border p-5 ${errorMessage ? 'border-red-400/25 bg-red-500/10 text-red-100' : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'}`}>
            {errorMessage || infoMessage}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2.5rem] border border-white/10 bg-zinc-950/86 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl md:p-8">
            {match?.status === 'pending_result' && (
              <div>
                <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                  <div>
                    <div className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Scoreboard</div>
                    <h2 className="mt-2 text-4xl font-black tracking-[-0.05em]">Legs eintragen</h2>
                  </div>
                  <select value={matchFormat} onChange={(event) => setMatchFormat(event.target.value)} className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-emerald-300/50">
                    {matchFormats.map((format) => <option key={format}>{format}</option>)}
                  </select>
                </div>

                <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
                  <NumberControl label="Ich" value={legsWon} setValue={setLegsWon} accent="text-emerald-300" />
                  <div className="hidden text-6xl font-black text-zinc-700 md:block">:</div>
                  <NumberControl label="Gegner" value={legsLost} setValue={setLegsLost} accent="text-zinc-300" />
                </div>

                {legsWon === legsLost && (legsWon > 0 || legsLost > 0) && (
                  <p className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-center font-bold text-red-200">Ein Unentschieden kann nicht eingereicht werden.</p>
                )}

                <div className="mt-8 grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-black uppercase tracking-[0.18em] text-zinc-500">Average</span>
                    <input type="number" step="0.01" value={average} onChange={(event) => setAverage(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-center text-2xl font-black text-white outline-none focus:border-emerald-300/60" placeholder="84.70" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-black uppercase tracking-[0.18em] text-zinc-500">Höchster Checkout</span>
                    <input type="number" value={highestCheckout} onChange={(event) => setHighestCheckout(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-center text-2xl font-black text-white outline-none focus:border-emerald-300/60" placeholder="170" />
                  </label>
                </div>

                <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-black uppercase tracking-[0.25em] text-cyan-300">Zusatz-Stats</div>
                      <p className="mt-1 text-sm text-zinc-500">Für bessere Analyse und spätere Datenbank-Erweiterung vorbereitet.</p>
                    </div>
                    <div className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-200">{statsCompletionPercent}% ausgefüllt</div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-bold text-zinc-400">Checkouts getroffen</span>
                      <input type="number" value={checkoutHits} onChange={(event) => setCheckoutHits(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-emerald-300/60" placeholder="3" />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-bold text-zinc-400">Checkout-Versuche</span>
                      <input type="number" value={checkoutAttempts} onChange={(event) => setCheckoutAttempts(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-emerald-300/60" placeholder="9" />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-bold text-zinc-400">180er</span>
                      <input type="number" value={oneEighties} onChange={(event) => setOneEighties(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-emerald-300/60" placeholder="1" />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-bold text-zinc-400">Ton+ Aufnahmen</span>
                      <input type="number" value={tonPlus} onChange={(event) => setTonPlus(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-emerald-300/60" placeholder="12" />
                    </label>
                  </div>

                  <label className="mt-4 block">
                    <span className="mb-2 block text-sm font-bold text-zinc-400">Match-Notiz</span>
                    <textarea value={matchNote} onChange={(event) => setMatchNote(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-emerald-300/60" rows={3} placeholder="Zum Beispiel: Gegner hat 104 gecheckt, ein Leg war sehr knapp, Stream vorhanden..." />
                  </label>
                </div>

                <button onClick={submitResult} disabled={loading || !resultIsValid} className="mt-8 w-full rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-6 text-xl font-black uppercase tracking-[0.16em] text-black shadow-[0_18px_60px_rgba(34,197,94,0.22)] transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-50">
                  {loading ? 'Wird eingereicht...' : 'Ergebnis zur Bestätigung einreichen'}
                </button>
              </div>
            )}

            {match?.status === 'awaiting_confirmation' && isSubmitter && (
              <div className="rounded-[2rem] border border-cyan-300/20 bg-cyan-400/10 p-8 text-center">
                <ClipboardCheck className="mx-auto h-14 w-14 text-cyan-200" />
                <h2 className="mt-5 text-3xl font-black tracking-[-0.04em]">Warte auf Bestätigung</h2>
                <p className="mx-auto mt-4 max-w-xl text-zinc-300">Du hast das Ergebnis <strong className="text-white">{submittedResultForMe?.resultText}</strong> eingereicht. Elo wird erst vergeben, wenn {opponent?.username} bestätigt.</p>
              </div>
            )}

            {match?.status === 'awaiting_confirmation' && needsMyConfirmation && (
              <div>
                <div className="rounded-[2rem] border border-emerald-300/20 bg-emerald-400/[0.07] p-8 text-center">
                  <ShieldCheck className="mx-auto h-14 w-14 text-emerald-200" />
                  <h2 className="mt-5 text-3xl font-black tracking-[-0.04em]">Ergebnis bestätigen</h2>
                  <p className="mt-4 text-zinc-300">{submittedResultForMe?.submitterName} hat folgendes Ergebnis eingereicht:</p>
                  <div className="mt-5 text-7xl font-black tracking-[-0.08em] text-white">{submittedResultForMe?.resultText}</div>
                  <p className="mt-4 text-zinc-400">Gewinner laut Einreichung: <strong className="text-emerald-300">{submittedResultForMe?.winnerName}</strong></p>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center">
                    <div className="text-sm text-zinc-500">Average</div>
                    <div className="mt-2 text-3xl font-black">{submittedResultForMe?.myAverage ?? '–'} : {submittedResultForMe?.opponentAverage ?? '–'}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center">
                    <div className="text-sm text-zinc-500">High Checkout</div>
                    <div className="mt-2 text-3xl font-black">{submittedResultForMe?.myCheckout ?? '–'} : {submittedResultForMe?.opponentCheckout ?? '–'}</div>
                  </div>
                </div>

                <button onClick={confirmResult} disabled={loading} className="mt-6 w-full rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-5 text-lg font-black uppercase tracking-[0.16em] text-black disabled:opacity-50">
                  {loading ? 'Wird bestätigt...' : 'Ergebnis bestätigen und Elo vergeben'}
                </button>

                <textarea value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} className="mt-5 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white outline-none focus:border-red-300/50" placeholder="Optional: Warum stimmt das Ergebnis nicht?" rows={3} />

                <button onClick={disputeResult} disabled={loading} className="mt-4 w-full rounded-3xl border border-red-400/25 bg-red-500/10 px-8 py-5 text-lg font-black uppercase tracking-[0.16em] text-red-100 transition hover:bg-red-500/15 disabled:opacity-50">
                  Ergebnis widersprechen
                </button>
              </div>
            )}

            {match?.status === 'completed' && (
              <div className="rounded-[2rem] border border-emerald-300/20 bg-emerald-400/[0.07] p-8 text-center">
                <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-200" />
                <h2 className="mt-5 text-3xl font-black tracking-[-0.04em]">Match abgeschlossen</h2>
                <p className="mx-auto mt-4 max-w-xl text-zinc-300">Dieses Match wurde bereits bestätigt und in der History gespeichert.</p>
                <button onClick={() => router.push('/history')} className="mt-8 rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-4 font-black uppercase tracking-[0.16em] text-black">
                  Zur History
                </button>
              </div>
            )}

            {match?.status === 'disputed' && (
              <div className="rounded-[2rem] border border-red-400/25 bg-red-500/10 p-8 text-center">
                <AlertTriangle className="mx-auto h-14 w-14 text-red-200" />
                <h2 className="mt-5 text-3xl font-black tracking-[-0.04em]">Ergebnis im Widerspruch</h2>
                <p className="mx-auto mt-4 max-w-xl text-zinc-300">Für dieses Match wurde keine Elo vergeben. Es muss manuell geprüft werden.</p>
                {match.dispute_reason && <p className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 text-zinc-300">Grund: {match.dispute_reason}</p>}
              </div>
            )}
          </div>

          <aside className="space-y-6">
            <div className="rounded-[2.5rem] border border-white/10 bg-zinc-950/86 p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl md:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Live Summary</div>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">{resultIsValid ? (isWin ? 'Sieg eingetragen' : 'Niederlage eingetragen') : 'Noch offen'}</h2>
                </div>
                <div className="grid h-14 w-14 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
                  <Trophy className="h-7 w-7" />
                </div>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
                  <div className={`text-4xl font-black tracking-[-0.05em] ${resultTone}`}>{legsWon}:{legsLost}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">Legs</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
                  <div className="text-4xl font-black tracking-[-0.05em] text-cyan-200">{legDifference}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">Differenz</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
                  <div className="text-4xl font-black tracking-[-0.05em] text-emerald-200">{checkoutRate}%</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">Checkout</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
                  <div className="text-4xl font-black tracking-[-0.05em] text-lime-200">{oneEighties || 0}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">180er</div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.07] p-5">
                <div className="flex items-center gap-3">
                  <Gauge className="h-5 w-5 text-emerald-300" />
                  <span className="font-black text-emerald-200">{performanceLabel}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Diese Einschätzung basiert auf dem eingetragenen Average und hilft dir, das Match schneller einzuordnen.</p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-zinc-950/86 p-6 backdrop-blur-xl md:p-7">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-6 w-6 text-cyan-300" />
                <h3 className="text-2xl font-black tracking-[-0.04em]">Stats, die nicht fehlen dürfen</h3>
              </div>
              <div className="mt-5 space-y-3">
                {statHints.map((hint) => (
                  <div key={hint.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="font-black text-white">{hint.title}</div>
                    <p className="mt-1 text-sm leading-6 text-zinc-500">{hint.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-zinc-950/86 p-6 backdrop-blur-xl md:p-7">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-6 w-6 text-emerald-300" />
                <h3 className="text-2xl font-black tracking-[-0.04em]">Fair-Play Check</h3>
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-400">Kontrolliere vor dem Absenden Score, Average und Checkout. Bei Unstimmigkeiten kann der Gegner das Ergebnis widersprechen, bevor Elo vergeben wird.</p>
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-100">
                <Crown className="h-5 w-5" />
                Saubere Stats machen Leaderboard und History später deutlich wertvoller.
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
