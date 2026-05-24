'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock, Crown, Image as ImageIcon, ShieldCheck, Target, Trophy, Upload, X, XCircle } from 'lucide-react';
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
  dispute_screenshot_url: string | null;
  confirmation_requested_at: string | null;
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

const CONFIRM_TIMEOUT_SECONDS = 300; // 5 Minuten

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type NumberControlProps = {
  label: string;
  value: number;
  setValue: (v: number) => void;
  accent: string;
};

function NumberControl({ label, value, setValue, accent }: NumberControlProps) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-center">
      <div className="text-sm font-black uppercase tracking-[0.22em] text-zinc-500">{label}</div>
      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          onClick={() => setValue(Math.max(0, value - 1))}
          className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 text-3xl font-black text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >−</button>
        <span className={`min-w-20 text-7xl font-black tracking-[-0.08em] ${accent}`}>{value}</span>
        <button
          onClick={() => setValue(value + 1)}
          className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 text-3xl font-black text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >+</button>
      </div>
    </div>
  );
}

export default function MatchResult() {
  const [legsWon, setLegsWon] = useState(0);
  const [legsLost, setLegsLost] = useState(0);
  const [average, setAverage] = useState('');
  const [oneEighties, setOneEighties] = useState(0);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeScreenshot, setDisputeScreenshot] = useState<File | null>(null);
  const [disputeScreenshotPreview, setDisputeScreenshotPreview] = useState<string | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [match, setMatch] = useState<ActiveMatch | null>(null);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoConfirmCalledRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const startCountdown = useCallback((requestedAt: string, matchId: string, isSubmitter: boolean) => {
    if (countdownRef.current) clearInterval(countdownRef.current);

    const calcRemaining = () => {
      const elapsed = Math.floor((Date.now() - new Date(requestedAt).getTime()) / 1000);
      return Math.max(0, CONFIRM_TIMEOUT_SECONDS - elapsed);
    };

    setCountdown(calcRemaining());

    countdownRef.current = setInterval(async () => {
      const remaining = calcRemaining();
      setCountdown(remaining);

      if (remaining <= 0 && !autoConfirmCalledRef.current) {
        autoConfirmCalledRef.current = true;
        clearInterval(countdownRef.current!);
        if (isSubmitter) {
          try {
            await supabase.rpc('auto_confirm_match_result', { p_match_id: matchId });
          } catch (err) {
            console.error('Auto-Confirm fehlgeschlagen:', err);
          }
        }
      }
    }, 1000);
  }, [supabase]);

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
      if (!session) { router.push('/auth/login'); return; }

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

      if (activeMatch.status === 'awaiting_confirmation' && activeMatch.confirmation_requested_at) {
        const isSubmitter = activeMatch.submitted_by === session.user.id;
        startCountdown(activeMatch.confirmation_requested_at, activeMatch.id, isSubmitter);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Match konnte nicht geladen werden.');
    } finally {
      setPageLoading(false);
    }
  }, [router, startCountdown, supabase]);

  useEffect(() => {
    void Promise.resolve().then(loadMatch);
  }, [loadMatch]);

  // Realtime-Subscription
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const matchId = params.get('matchId');
    if (!matchId) return;

    const channel = supabase
      .channel(`match-result-${matchId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'active_matches',
        filter: `id=eq.${matchId}`,
      }, async (payload) => {
        const updated = payload.new as ActiveMatch;
        setMatch(updated);

        if (updated.status === 'awaiting_confirmation' && updated.confirmation_requested_at) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const isSubmitter = updated.submitted_by === session.user.id;
            autoConfirmCalledRef.current = false;
            startCountdown(updated.confirmation_requested_at, updated.id, isSubmitter);
          }
        }

        if (updated.status === 'completed') {
          if (countdownRef.current) clearInterval(countdownRef.current);
          setTimeout(() => router.push('/history'), 2000);
        }

        if (updated.status === 'disputed' || updated.status === 'cancelled') {
          if (countdownRef.current) clearInterval(countdownRef.current);
          setCountdown(null);
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [router, startCountdown, supabase]);

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Screenshot darf maximal 5 MB groß sein.');
      return;
    }
    setDisputeScreenshot(file);
    setDisputeScreenshotPreview(URL.createObjectURL(file));
    setErrorMessage('');
  };

  const removeScreenshot = () => {
    setDisputeScreenshot(null);
    if (disputeScreenshotPreview) URL.revokeObjectURL(disputeScreenshotPreview);
    setDisputeScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadScreenshot = async (matchId: string): Promise<string | null> => {
    if (!disputeScreenshot) return null;
    setUploadingScreenshot(true);
    try {
      const ext = disputeScreenshot.name.split('.').pop() ?? 'png';
      const path = `${matchId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('dispute-screenshots')
        .upload(path, disputeScreenshot, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('dispute-screenshots').getPublicUrl(path);
      return data.publicUrl;
    } catch (err) {
      console.error('Screenshot-Upload fehlgeschlagen:', err);
      return null;
    } finally {
      setUploadingScreenshot(false);
    }
  };

  const isSubmitter = Boolean(match?.submitted_by && match.submitted_by === currentUserId);
  const needsMyConfirmation = Boolean(
    match?.status === 'awaiting_confirmation' &&
    match.submitted_by &&
    match.submitted_by !== currentUserId
  );
  const countdownIsUrgent = countdown !== null && countdown <= 60;
  const isWin = legsWon > legsLost;
  const resultIsValid = legsWon !== legsLost && (legsWon > 0 || legsLost > 0);

  const submittedResultForMe = useMemo(() => {
    if (!match || !currentUserId) return null;
    const iAmPlayer1 = currentUserId === match.player1_id;
    const myLegs = iAmPlayer1 ? match.submitted_player1_legs : match.submitted_player2_legs;
    const opponentLegs = iAmPlayer1 ? match.submitted_player2_legs : match.submitted_player1_legs;
    const submitterName = match.submitted_by === match.player1_id ? match.player1_username : match.player2_username;
    const winnerName = match.submitted_winner_id === match.player1_id ? match.player1_username : match.player2_username;
    const myAverage = iAmPlayer1 ? match.submitted_player1_average : match.submitted_player2_average;
    const opponentAverage = iAmPlayer1 ? match.submitted_player2_average : match.submitted_player1_average;
    return { myLegs, opponentLegs, submitterName, winnerName, myAverage, opponentAverage };
  }, [currentUserId, match]);

  const submitResult = async () => {
    if (!match || !opponent || !resultIsValid) return;
    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      const { data, error } = await supabase.rpc('submit_match_result', {
        p_match_id: match.id,
        p_my_legs: legsWon,
        p_opponent_legs: legsLost,
        p_my_average: average ? Number.parseFloat(average) : null,
        p_highest_checkout: null,
      });
      if (error) throw error;
      const response = Array.isArray(data) ? data[0] as RpcStatusResponse | undefined : undefined;
      setInfoMessage(response?.result_message || 'Ergebnis eingereicht. Warte auf Bestätigung deines Gegners.');
      await loadMatch();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Ergebnis konnte nicht eingereicht werden.');
    } finally {
      setLoading(false);
    }
  };

  const confirmResult = async () => {
    if (!match) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const { data, error } = await supabase.rpc('confirm_match_result', { p_match_id: match.id });
      if (error) throw error;
      const response = Array.isArray(data) ? data[0] as RpcStatusResponse | undefined : undefined;
      const eloText = typeof response?.elo_change === 'number'
        ? ` Deine Elo-Änderung: ${response.elo_change > 0 ? '+' : ''}${response.elo_change}.`
        : '';
      alert(`${response?.result_message || 'Ergebnis bestätigt.'}${eloText}`);
      router.push('/history');
    } catch (error) {
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
      let screenshotUrl: string | null = null;
      if (disputeScreenshot) {
        screenshotUrl = await uploadScreenshot(match.id);
      }

      const { data, error } = await supabase.rpc('dispute_match_result', {
        p_match_id: match.id,
        p_reason: disputeReason || null,
        p_screenshot_url: screenshotUrl,
      });
      if (error) throw error;
      const response = Array.isArray(data) ? data[0] as RpcStatusResponse | undefined : undefined;
      setInfoMessage(response?.result_message || 'Widerspruch gespeichert. Kein Elo wurde vergeben.');
      await loadMatch();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Widerspruch konnte nicht gespeichert werden.');
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-6 text-lg font-bold text-emerald-200 backdrop-blur-xl">
          Match wird geladen...
        </div>
      </main>
    );
  }

  if (errorMessage && !match) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050607] p-6 text-white">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_34%)]" />
        <div className="relative max-w-xl rounded-[2rem] border border-red-400/25 bg-zinc-950/86 p-8 text-center shadow-2xl backdrop-blur-2xl md:p-10">
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.24),transparent_34%),radial-gradient(circle_at_82%_8%,rgba(6,182,212,0.14),transparent_28%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_78%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 border-b border-white/10 bg-black/45 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
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

      <section className="relative z-10 mx-auto max-w-3xl px-5 py-12 md:px-8">

        {/* Match-Header */}
        <div className="mb-8 rounded-[2rem] border border-white/10 bg-zinc-950/86 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Aktuelles Match</div>
              <div className="mt-2 text-3xl font-black tracking-[-0.04em]">vs {opponent?.username}</div>
              <div className="mt-1 text-zinc-400">{opponent?.elo} Elo</div>
            </div>
            <div className="grid h-16 w-16 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
              <Target className="h-8 w-8" />
            </div>
          </div>
        </div>

        {/* Countdown-Banner */}
        {countdown !== null && match?.status === 'awaiting_confirmation' && (
          <div className={`mb-6 rounded-3xl border p-5 flex items-center gap-4 ${countdownIsUrgent ? 'border-red-400/40 bg-red-500/10 text-red-100' : 'border-amber-400/30 bg-amber-400/10 text-amber-100'}`}>
            <Clock className={`h-6 w-6 shrink-0 ${countdownIsUrgent ? 'text-red-300' : 'text-amber-300'}`} />
            <div className="flex-1 font-bold">
              {needsMyConfirmation
                ? <>Du hast noch <strong className={`text-2xl font-black ${countdownIsUrgent ? 'text-red-200' : 'text-amber-200'}`}>{formatCountdown(countdown)}</strong> um zu bestätigen oder zu widersprechen.</>
                : <>Dein Gegner hat noch <strong className={`text-2xl font-black ${countdownIsUrgent ? 'text-red-200' : 'text-amber-200'}`}>{formatCountdown(countdown)}</strong> um zu bestätigen. Danach wird dein Ergebnis automatisch gewertet.</>
              }
            </div>
          </div>
        )}

        {/* Feedback-Banner */}
        {(errorMessage || infoMessage) && (
          <div className={`mb-6 rounded-3xl border p-5 ${errorMessage ? 'border-red-400/25 bg-red-500/10 text-red-100' : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'}`}>
            {errorMessage || infoMessage}
          </div>
        )}

        {/* ===== ERGEBNIS EINTRAGEN ===== */}
        {match?.status === 'pending_result' && (
          <div className="rounded-[2.5rem] border border-white/10 bg-zinc-950/86 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl md:p-8">
            <div className="mb-7">
              <div className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Scoreboard</div>
              <h2 className="mt-2 text-4xl font-black tracking-[-0.05em]">Ergebnis eintragen</h2>
            </div>

            {/* Legs */}
            <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <NumberControl label="Meine Legs" value={legsWon} setValue={setLegsWon} accent="text-emerald-300" />
              <div className="hidden text-6xl font-black text-zinc-700 md:block">:</div>
              <NumberControl label="Gegner Legs" value={legsLost} setValue={setLegsLost} accent="text-zinc-300" />
            </div>

            {legsWon === legsLost && (legsWon > 0 || legsLost > 0) && (
              <p className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-center font-bold text-red-200">
                Ein Unentschieden kann nicht eingereicht werden.
              </p>
            )}

            {/* Stats: nur Average und 180er */}
            <div className="mt-8 grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-black uppercase tracking-[0.18em] text-zinc-500">Average</span>
                <input
                  type="number"
                  step="0.01"
                  value={average}
                  onChange={(e) => setAverage(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-center text-2xl font-black text-white outline-none focus:border-emerald-300/60"
                  placeholder="84.70"
                />
              </label>
              <div>
                <span className="mb-2 block text-sm font-black uppercase tracking-[0.18em] text-zinc-500">180er</span>
                <NumberControl label="" value={oneEighties} setValue={setOneEighties} accent="text-lime-300" />
              </div>
            </div>

            {/* Live-Vorschau */}
            {resultIsValid && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Trophy className={`h-6 w-6 ${isWin ? 'text-emerald-300' : 'text-zinc-400'}`} />
                  <span className={`text-2xl font-black ${isWin ? 'text-emerald-300' : 'text-zinc-300'}`}>
                    {isWin ? 'Sieg' : 'Niederlage'} — {legsWon}:{legsLost}
                  </span>
                </div>
                {average && (
                  <span className="text-zinc-400 font-bold">Ø {Number.parseFloat(average).toFixed(2)}</span>
                )}
              </div>
            )}

            <button
              onClick={submitResult}
              disabled={loading || !resultIsValid}
              className="mt-8 w-full rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-6 text-xl font-black uppercase tracking-[0.16em] text-black shadow-[0_18px_60px_rgba(34,197,94,0.22)] transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Wird eingereicht...' : 'Ergebnis zur Bestätigung einreichen'}
            </button>
          </div>
        )}

        {/* ===== WARTEN AUF BESTÄTIGUNG (Einreicher) ===== */}
        {match?.status === 'awaiting_confirmation' && isSubmitter && (
          <div className="rounded-[2.5rem] border border-cyan-300/20 bg-zinc-950/86 p-8 text-center shadow-2xl backdrop-blur-2xl">
            <ClipboardCheck className="mx-auto h-14 w-14 text-cyan-200" />
            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em]">Warte auf Bestätigung</h2>
            <p className="mx-auto mt-4 max-w-xl text-zinc-300">
              Du hast das Ergebnis <strong className="text-white">{submittedResultForMe?.myLegs}:{submittedResultForMe?.opponentLegs}</strong> eingereicht.
              Elo wird vergeben, sobald {opponent?.username} bestätigt — oder automatisch nach Ablauf des Timers.
            </p>
          </div>
        )}

        {/* ===== BESTÄTIGEN / DISPUTE (Gegner) ===== */}
        {match?.status === 'awaiting_confirmation' && needsMyConfirmation && (
          <div className="rounded-[2.5rem] border border-white/10 bg-zinc-950/86 p-6 shadow-2xl backdrop-blur-2xl md:p-8 space-y-6">

            {/* Eingereichte Stats anzeigen */}
            <div className="rounded-[2rem] border border-emerald-300/20 bg-emerald-400/[0.07] p-8 text-center">
              <ShieldCheck className="mx-auto h-14 w-14 text-emerald-200" />
              <h2 className="mt-5 text-3xl font-black tracking-[-0.04em]">Ergebnis bestätigen</h2>
              <p className="mt-4 text-zinc-300">
                <strong className="text-white">{submittedResultForMe?.submitterName}</strong> hat folgendes Ergebnis eingereicht:
              </p>
              <div className="mt-5 text-7xl font-black tracking-[-0.08em] text-white">
                {submittedResultForMe?.myLegs}:{submittedResultForMe?.opponentLegs}
              </div>
              <p className="mt-4 text-zinc-400">
                Gewinner: <strong className="text-emerald-300">{submittedResultForMe?.winnerName}</strong>
              </p>
              <div className="mt-5 grid grid-cols-2 gap-4 max-w-xs mx-auto">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-center">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Average</div>
                  <div className="text-2xl font-black">{submittedResultForMe?.myAverage?.toFixed(2) ?? '–'}</div>
                  <div className="text-xs text-zinc-500">vs {submittedResultForMe?.opponentAverage?.toFixed(2) ?? '–'}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-center">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">180er</div>
                  <div className="text-2xl font-black">–</div>
                </div>
              </div>
            </div>

            <button
              onClick={confirmResult}
              disabled={loading}
              className="w-full rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-5 text-lg font-black uppercase tracking-[0.16em] text-black disabled:opacity-50"
            >
              {loading ? 'Wird bestätigt...' : 'Ergebnis bestätigen und Elo vergeben'}
            </button>

            {/* Dispute-Bereich */}
            <div className="rounded-[2rem] border border-red-400/20 bg-red-500/[0.05] p-6 space-y-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-300 shrink-0" />
                <h3 className="font-black text-red-100 text-lg">Ergebnis widersprechen</h3>
              </div>

              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/25 p-4 text-white outline-none focus:border-red-300/50 resize-none"
                placeholder="Beschreibe warum das Ergebnis nicht stimmt..."
                rows={3}
              />

              {/* Screenshot-Upload */}
              <div>
                <div className="mb-2 text-sm font-bold text-zinc-400 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Screenshot als Beweis (optional, max. 5 MB)
                </div>

                {disputeScreenshotPreview ? (
                  <div className="relative rounded-2xl overflow-hidden border border-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={disputeScreenshotPreview}
                      alt="Dispute Screenshot"
                      className="w-full max-h-64 object-contain bg-black/40"
                    />
                    <button
                      onClick={removeScreenshot}
                      className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white hover:bg-red-500/80 transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-2xl border border-dashed border-white/20 bg-white/[0.03] p-6 text-center hover:border-red-300/40 hover:bg-red-500/5 transition group"
                  >
                    <Upload className="mx-auto h-8 w-8 text-zinc-500 group-hover:text-red-300 transition" />
                    <p className="mt-2 text-sm text-zinc-500 group-hover:text-zinc-300 transition">
                      Klicken um Screenshot hochzuladen
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">JPG, PNG, WebP — max. 5 MB</p>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleScreenshotChange}
                  className="hidden"
                />
              </div>

              <button
                onClick={disputeResult}
                disabled={loading || uploadingScreenshot}
                className="w-full rounded-3xl border border-red-400/25 bg-red-500/10 px-8 py-4 text-base font-black uppercase tracking-[0.16em] text-red-100 transition hover:bg-red-500/15 disabled:opacity-50"
              >
                {uploadingScreenshot ? 'Screenshot wird hochgeladen...' : loading ? 'Wird gespeichert...' : 'Widerspruch einreichen'}
              </button>
            </div>
          </div>
        )}

        {/* ===== MATCH ABGESCHLOSSEN ===== */}
        {match?.status === 'completed' && (
          <div className="rounded-[2.5rem] border border-emerald-300/20 bg-zinc-950/86 p-8 text-center shadow-2xl backdrop-blur-2xl">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-200" />
            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em]">Match abgeschlossen</h2>
            <p className="mx-auto mt-4 max-w-xl text-zinc-300">Dieses Match wurde bestätigt. Du wirst zur History weitergeleitet...</p>
            <button onClick={() => router.push('/history')} className="mt-8 rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-4 font-black uppercase tracking-[0.16em] text-black">
              Zur History
            </button>
          </div>
        )}

        {/* ===== DISPUTE ===== */}
        {match?.status === 'disputed' && (
          <div className="rounded-[2.5rem] border border-red-400/25 bg-zinc-950/86 p-8 text-center shadow-2xl backdrop-blur-2xl">
            <AlertTriangle className="mx-auto h-14 w-14 text-red-200" />
            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em]">Ergebnis im Widerspruch</h2>
            <p className="mx-auto mt-4 max-w-xl text-zinc-300">
              Für dieses Match wurde keine Elo vergeben. Ein Admin wird das Match prüfen.
            </p>
            {match.dispute_reason && (
              <p className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 text-zinc-300 text-sm">
                Grund: {match.dispute_reason}
              </p>
            )}
            {match.dispute_screenshot_url && (
              <div className="mt-4">
                <a
                  href={match.dispute_screenshot_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-zinc-200 hover:bg-white/10 transition"
                >
                  <ImageIcon className="h-4 w-4" />
                  Screenshot ansehen
                </a>
              </div>
            )}
            <div className="mt-6 flex items-center justify-center gap-3 text-sm text-emerald-200 font-bold">
              <Crown className="h-4 w-4" />
              Admin-Entscheidung steht noch aus
            </div>
          </div>
        )}

      </section>
    </main>
  );
}