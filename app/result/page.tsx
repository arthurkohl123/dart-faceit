'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Menu,
  Shield,
  Target,
  Trophy,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/app/providers';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  confirmed_by: string | null;
  dispute_reason: string | null;
  dispute_screenshot_url: string | null;
  confirmation_requested_at: string | null;
};

type RpcStatusResponse = {
  result_status: string;
  result_message: string;
  elo_change?: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CONFIRM_TIMEOUT_SECONDS = 300;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="group flex flex-col gap-2">
      <span className="text-[11px] font-black uppercase tracking-[0.24em] text-zinc-500 transition group-focus-within:text-emerald-300">
        {label}
      </span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-center text-2xl font-black text-white outline-none transition placeholder:text-zinc-700 focus:border-emerald-300/50 focus:bg-white/[0.07]"
      />
    </div>
  );
}

function LegCounter({
  label,
  value,
  onChange,
  accent,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  accent: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-3">
      <span className="text-[11px] font-black uppercase tracking-[0.24em] text-zinc-500">{label}</span>
      {/* + Button */}
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="grid h-16 w-full max-w-[10rem] place-items-center rounded-2xl border border-white/10 text-4xl font-black text-zinc-400 transition hover:border-white/25 hover:bg-white/10 hover:text-white active:scale-95 sm:h-14 sm:max-w-[8rem]"
      >
        +
      </button>
      {/* Zahl */}
      <span className={`text-7xl font-black leading-none tracking-[-0.1em] sm:text-8xl ${accent}`}>
        {value}
      </span>
      {/* − Button */}
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="grid h-16 w-full max-w-[10rem] place-items-center rounded-2xl border border-white/10 text-4xl font-black text-zinc-400 transition hover:border-white/25 hover:bg-white/10 hover:text-white active:scale-95 sm:h-14 sm:max-w-[8rem]"
      >
        −
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MatchResult() {
  // Form state
  const [legsWon, setLegsWon] = useState(0);
  const [legsLost, setLegsLost] = useState(0);
  const [average, setAverage] = useState('');
  const [oneEighties, setOneEighties] = useState('');

  // Dispute state
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeScreenshot, setDisputeScreenshot] = useState<File | null>(null);
  const [disputePreview, setDisputePreview] = useState<string | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // App state
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [match, setMatch] = useState<ActiveMatch | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoConfirmCalledRef = useRef(false);

  const { user, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // currentUserId aus globalem Auth-Context beziehen
  useEffect(() => {
    if (user) setCurrentUserId(user.id);
  }, [user]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const iAmPlayer1 = match ? currentUserId === match.player1_id : false;
  const opponentUsername = match ? (iAmPlayer1 ? match.player2_username : match.player1_username) : '';
  const opponentElo = match ? (iAmPlayer1 ? match.player2_elo : match.player1_elo) : 0;
  const isSubmitter = Boolean(match?.submitted_by && match.submitted_by === currentUserId);
  const needsMyConfirmation = Boolean(
    match?.status === 'awaiting_confirmation' &&
    match.submitted_by &&
    match.submitted_by !== currentUserId
  );
  const resultIsValid = legsWon !== legsLost && (legsWon > 0 || legsLost > 0);
  const countdownIsUrgent = countdown !== null && countdown <= 60;

  const submittedData = useMemo(() => {
    if (!match || !currentUserId) return null;
    const myLegs = iAmPlayer1 ? match.submitted_player1_legs : match.submitted_player2_legs;
    const oppLegs = iAmPlayer1 ? match.submitted_player2_legs : match.submitted_player1_legs;
    const myAvg = iAmPlayer1 ? match.submitted_player1_average : match.submitted_player2_average;
    const oppAvg = iAmPlayer1 ? match.submitted_player2_average : match.submitted_player1_average;
    const submitterName =
      match.submitted_by === match.player1_id ? match.player1_username : match.player2_username;
    const winnerName =
      match.submitted_winner_id === match.player1_id ? match.player1_username : match.player2_username;
    return { myLegs, oppLegs, myAvg, oppAvg, submitterName, winnerName };
  }, [currentUserId, iAmPlayer1, match]);

  // ── Countdown ────────────────────────────────────────────────────────────────

  const startCountdown = useCallback(
    (requestedAt: string, matchId: string, isSubmitterArg: boolean) => {
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
          // Beide Spieler versuchen den Auto-Confirm auszulösen.
          // Die DB-Funktion ist idempotent: sie prüft selbst ob der Timeout
          // erreicht ist und ob das Match noch awaiting_confirmation ist.
          // Race-Conditions werden durch FOR UPDATE in der SQL-Funktion verhindert.
          try {
            await supabase.rpc('auto_confirm_match_result', { p_match_id: matchId });
          } catch (err) {
            console.error('Auto-Confirm fehlgeschlagen:', err);
          }
        }
      }, 1000);
    },
    [supabase]
  );

  // ── Load match ───────────────────────────────────────────────────────────────

  const loadMatch = useCallback(async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const matchId = params.get('matchId');
      if (!matchId) {
        setErrorMessage('Kein Match ausgewählt. Starte zuerst ein Matchmaking.');
        setPageLoading(false);
        return;
      }
      if (!user) { router.push('/auth/login'); return; }

      const { data, error } = await supabase
        .from('active_matches')
        .select('*')
        .eq('id', matchId)
        .single();
      if (error) throw error;

      const m = data as ActiveMatch;
      if (m.player1_id !== user.id && m.player2_id !== user.id) {
        setErrorMessage('Du bist kein Teilnehmer dieses Matches.');
        setPageLoading(false);
        return;
      }
      setMatch(m);
      if (m.status === 'awaiting_confirmation' && m.confirmation_requested_at) {
        const submitter = m.submitted_by === user.id;
        startCountdown(m.confirmation_requested_at, m.id, submitter);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Match konnte nicht geladen werden.');
    } finally {
      setPageLoading(false);
    }
  }, [router, startCountdown, supabase, user]);

  useEffect(() => {
    if (!authLoading) void loadMatch();
  }, [authLoading, loadMatch]);

  // ── Realtime ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const matchId = params.get('matchId');
    if (!matchId) return;

    const channel = supabase
      .channel(`match-result-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'active_matches', filter: `id=eq.${matchId}` },
        (payload) => {
          const updated = payload.new as ActiveMatch;
          setMatch(updated);
          if (updated.status === 'awaiting_confirmation' && updated.confirmation_requested_at && user) {
            const submitter = updated.submitted_by === user.id;
            autoConfirmCalledRef.current = false;
            startCountdown(updated.confirmation_requested_at, updated.id, submitter);
          }
          if (updated.status === 'completed') {
            if (countdownRef.current) clearInterval(countdownRef.current);
            setTimeout(() => router.push('/history'), 2500);
          }
          if (updated.status === 'disputed' || updated.status === 'cancelled') {
            if (countdownRef.current) clearInterval(countdownRef.current);
            setCountdown(null);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [router, startCountdown, supabase]);

  // ── Screenshot ───────────────────────────────────────────────────────────────

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setErrorMessage('Screenshot darf maximal 5 MB groß sein.'); return; }
    setDisputeScreenshot(file);
    setDisputePreview(URL.createObjectURL(file));
    setErrorMessage('');
  };

  const removeScreenshot = () => {
    setDisputeScreenshot(null);
    if (disputePreview) URL.revokeObjectURL(disputePreview);
    setDisputePreview(null);
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

  // ── Actions ──────────────────────────────────────────────────────────────────

  const submitResult = async () => {
    if (!match || !resultIsValid) return;
    setLoading(true); setErrorMessage(''); setInfoMessage('');
    try {
      const { data, error } = await supabase.rpc('submit_match_result', {
        p_match_id: match.id,
        p_my_legs: legsWon,
        p_opponent_legs: legsLost,
        p_my_average: average ? Number.parseFloat(average) : null,
        p_highest_checkout: null,
      });
      if (error) throw error;
      const r = Array.isArray(data) ? (data[0] as RpcStatusResponse | undefined) : undefined;
      setInfoMessage(r?.result_message || 'Ergebnis eingereicht. Warte auf Bestätigung.');
      await loadMatch();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Fehler beim Einreichen.');
    } finally {
      setLoading(false);
    }
  };

  const confirmResult = async () => {
    if (!match) return;
    setLoading(true); setErrorMessage('');
    try {
      const { data, error } = await supabase.rpc('confirm_match_result', { p_match_id: match.id });
      if (error) throw error;
      const r = Array.isArray(data) ? (data[0] as RpcStatusResponse | undefined) : undefined;
      const eloText = typeof r?.elo_change === 'number'
        ? ` Elo-Änderung: ${r.elo_change > 0 ? '+' : ''}${r.elo_change}`
        : '';
      alert(`${r?.result_message || 'Ergebnis bestätigt.'}${eloText}`);
      router.push('/history');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Fehler beim Bestätigen.');
    } finally {
      setLoading(false);
    }
  };

  const disputeResult = async () => {
    if (!match) return;
    setLoading(true); setErrorMessage(''); setInfoMessage('');
    try {
      const screenshotUrl = disputeScreenshot ? await uploadScreenshot(match.id) : null;
      const { data, error } = await supabase.rpc('dispute_match_result', {
        p_match_id: match.id,
        p_reason: disputeReason || null,
        p_screenshot_url: screenshotUrl,
      });
      if (error) throw error;
      const r = Array.isArray(data) ? (data[0] as RpcStatusResponse | undefined) : undefined;
      setInfoMessage(r?.result_message || 'Widerspruch gespeichert. Ein Admin wird das Match prüfen.');
      await loadMatch();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Fehler beim Widerspruch.');
    } finally {
      setLoading(false);
    }
  };

  // ── Loading screen ────────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-10 py-8 text-lg font-bold text-emerald-200 backdrop-blur-xl">
          Match wird geladen…
        </div>
      </main>
    );
  }

  if (errorMessage && !match) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050607] p-6 text-white">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.2),transparent_34%)]" />
        <div className="relative max-w-xl rounded-[2rem] border border-red-400/25 bg-zinc-950/90 p-10 text-center shadow-2xl backdrop-blur-2xl">
          <XCircle className="mx-auto h-14 w-14 text-red-300" />
          <h1 className="mt-5 text-4xl font-black tracking-[-0.05em]">Kein gültiges Match</h1>
          <p className="mt-4 text-zinc-300">{errorMessage}</p>
          <button
            onClick={() => router.push('/matchmaking')}
            className="mt-8 rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-4 font-black uppercase tracking-[0.16em] text-black"
          >
            Zum Matchmaking
          </button>
        </div>
      </main>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,197,94,0.22),transparent_32%),radial-gradient(circle_at_85%_8%,rgba(6,182,212,0.12),transparent_28%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_72%)]" />
        <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      {/* Navbar */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 font-black text-black shadow-[0_0_28px_rgba(34,197,94,0.3)]">
              R
            </div>
            <div className="hidden sm:block">
              <div className="text-base font-black tracking-[-0.04em]">RANKEDDARTS</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300/70">
                Match Result
              </div>
            </div>
          </Link>

          <div className="hidden items-center gap-6 text-sm font-medium text-zinc-300 lg:flex">
            <Link href="/matchmaking" className="transition hover:text-white">Matchmaking</Link>
            <Link href="/leaderboard" className="transition hover:text-white">Leaderboard</Link>
            <Link href="/profile" className="transition hover:text-white">Profil</Link>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/[0.04] text-zinc-200 transition hover:bg-white/10 lg:hidden"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-white/10 bg-black/80 px-5 py-4 backdrop-blur-2xl lg:hidden">
            <div className="flex flex-col gap-1">
              <Link href="/matchmaking" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Matchmaking</Link>
              <Link href="/leaderboard" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Leaderboard</Link>
              <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Profil</Link>
              <Link href="/history" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Match History</Link>
            </div>
          </div>
        )}
      </nav>

      <section className="relative z-10 mx-auto max-w-2xl px-4 pb-12 pt-24 sm:px-5 md:px-8 md:pt-28">

        {/* Match-Header — VS-Banner */}
        {match && (
          <div className="mb-8 overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/80 backdrop-blur-xl">
            <div className="flex items-stretch">
              <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-6">
                <span className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300/70">Du</span>
                <span className="text-2xl font-black tracking-[-0.04em]">
                  {iAmPlayer1 ? match.player1_username : match.player2_username}
                </span>
                <span className="text-sm font-bold text-zinc-500">
                  {iAmPlayer1 ? match.player1_elo : match.player2_elo} Elo
                </span>
              </div>
              <div className="flex flex-col items-center justify-center border-x border-white/10 px-6">
                <Target className="h-6 w-6 text-zinc-600" />
                <span className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-zinc-600">vs</span>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-6">
                <span className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300/70">Gegner</span>
                <span className="text-2xl font-black tracking-[-0.04em]">{opponentUsername}</span>
                <span className="text-sm font-bold text-zinc-500">{opponentElo} Elo</span>
              </div>
            </div>
          </div>
        )}

        {/* Countdown-Banner */}
        {countdown !== null && match?.status === 'awaiting_confirmation' && (
          <div
            className={`mb-6 flex items-center gap-4 rounded-3xl border p-5 transition-colors ${
              countdownIsUrgent
                ? 'border-red-400/40 bg-red-500/10'
                : 'border-amber-400/25 bg-amber-400/[0.07]'
            }`}
          >
            <Clock
              className={`h-6 w-6 shrink-0 ${countdownIsUrgent ? 'text-red-300' : 'text-amber-300'}`}
            />
            <div className="flex-1">
              <span
                className={`text-3xl font-black tracking-[-0.06em] ${
                  countdownIsUrgent ? 'text-red-200' : 'text-amber-200'
                }`}
              >
                {formatCountdown(countdown)}
              </span>
              <p className={`mt-0.5 text-sm font-semibold ${countdownIsUrgent ? 'text-red-300/80' : 'text-amber-300/80'}`}>
                {needsMyConfirmation
                  ? 'Zeit zum Bestätigen oder Widersprechen'
                  : 'Dein Gegner hat noch Zeit zu bestätigen — danach automatische Wertung'}
              </p>
            </div>
          </div>
        )}

        {/* Feedback */}
        {(errorMessage || infoMessage) && (
          <div
            className={`mb-6 rounded-2xl border p-4 text-sm font-semibold leading-6 ${
              errorMessage
                ? 'border-red-400/25 bg-red-500/10 text-red-100'
                : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
            }`}
          >
            {errorMessage || infoMessage}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STATE: pending_result — Ergebnis eintragen
        ══════════════════════════════════════════════════════════════ */}
        {match?.status === 'pending_result' && (
          <div className="rounded-[2.5rem] border border-white/10 bg-zinc-950/85 shadow-2xl shadow-black/60 backdrop-blur-2xl">
            {/* Header */}
            <div className="border-b border-white/10 px-8 py-7">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-300">Scoreboard</p>
              <h2 className="mt-2 text-4xl font-black tracking-[-0.06em]">Ergebnis eintragen</h2>
              <p className="mt-2 text-sm text-zinc-500">
                Trage das Ergebnis ein. Dein Gegner muss es danach bestätigen.
              </p>
            </div>

            <div className="px-4 py-8 space-y-8 sm:px-8">
              {/* Legs */}
              <div>
                <p className="mb-5 text-[11px] font-black uppercase tracking-[0.24em] text-zinc-500">Legs</p>
                <div className="flex items-start justify-center gap-4">
                  <LegCounter label="Deine Legs" value={legsWon} onChange={setLegsWon} accent="text-emerald-300" />
                  <span className="mt-[4.5rem] text-4xl font-black text-zinc-700 sm:mt-[5rem] sm:text-5xl">:</span>
                  <LegCounter label="Gegner Legs" value={legsLost} onChange={setLegsLost} accent="text-zinc-300" />
                </div>
                {legsWon === legsLost && (legsWon > 0 || legsLost > 0) && (
                  <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-center text-sm font-bold text-red-200">
                    Unentschieden kann nicht eingereicht werden.
                  </p>
                )}
              </div>

              {/* Divider */}
              <div className="h-px bg-white/[0.06]" />

              {/* Stats */}
              <div>
                <p className="mb-5 text-[11px] font-black uppercase tracking-[0.24em] text-zinc-500">Statistiken</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <StatInput
                    label="Average"
                    value={average}
                    onChange={setAverage}
                    placeholder="84.70"
                  />
                  <StatInput
                    label="180er"
                    value={oneEighties}
                    onChange={setOneEighties}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Live-Preview */}
              {resultIsValid && (
                <div
                  className={`flex items-center justify-between gap-4 rounded-2xl border p-5 ${
                    legsWon > legsLost
                      ? 'border-emerald-300/20 bg-emerald-400/[0.07]'
                      : 'border-red-400/20 bg-red-500/[0.07]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Trophy
                      className={`h-6 w-6 ${legsWon > legsLost ? 'text-emerald-300' : 'text-red-300'}`}
                    />
                    <span
                      className={`text-2xl font-black tracking-[-0.04em] ${
                        legsWon > legsLost ? 'text-emerald-200' : 'text-red-200'
                      }`}
                    >
                      {legsWon > legsLost ? 'Sieg' : 'Niederlage'} — {legsWon}:{legsLost}
                    </span>
                  </div>
                  {average && (
                    <span className="text-sm font-bold text-zinc-400">
                      Ø {Number.parseFloat(average).toFixed(2)}
                    </span>
                  )}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={submitResult}
                disabled={loading || !resultIsValid}
                className="w-full rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 py-5 text-lg font-black uppercase tracking-[0.16em] text-black shadow-[0_16px_50px_rgba(34,197,94,0.2)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? 'Wird eingereicht…' : 'Zur Bestätigung einreichen'}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STATE: awaiting_confirmation — Einreicher wartet
        ══════════════════════════════════════════════════════════════ */}
        {match?.status === 'awaiting_confirmation' && isSubmitter && (
          <div className="rounded-[2.5rem] border border-cyan-300/15 bg-zinc-950/85 shadow-2xl backdrop-blur-2xl">
            <div className="flex flex-col items-center px-8 py-12 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-3xl border border-cyan-300/20 bg-cyan-400/10">
                <Clock className="h-10 w-10 text-cyan-200" />
              </div>
              <h2 className="mt-6 text-3xl font-black tracking-[-0.05em]">Warte auf Bestätigung</h2>
              <p className="mx-auto mt-4 max-w-sm text-zinc-400">
                Du hast{' '}
                <strong className="text-white">
                  {submittedData?.myLegs}:{submittedData?.oppLegs}
                </strong>{' '}
                eingereicht. <strong className="text-white">{opponentUsername}</strong> muss das Ergebnis
                bestätigen — oder es wird nach Ablauf des Timers automatisch gewertet.
              </p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STATE: awaiting_confirmation — Gegner bestätigt / widerspricht
        ══════════════════════════════════════════════════════════════ */}
        {match?.status === 'awaiting_confirmation' && needsMyConfirmation && (
          <div className="space-y-5">
            {/* Eingereichte Daten */}
            <div className="overflow-hidden rounded-[2.5rem] border border-white/10 bg-zinc-950/85 shadow-2xl backdrop-blur-2xl">
              <div className="border-b border-white/10 px-8 py-7">
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-300">
                  Eingereicht von {submittedData?.submitterName}
                </p>
                <h2 className="mt-2 text-4xl font-black tracking-[-0.06em]">Ergebnis bestätigen</h2>
              </div>

              {/* Scoreboard */}
              <div className="flex items-center justify-center gap-8 px-8 py-8">
                <div className="text-center">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Du</p>
                  <p className="mt-2 text-8xl font-black leading-none tracking-[-0.1em] text-white">
                    {submittedData?.myLegs ?? '–'}
                  </p>
                </div>
                <span className="text-5xl font-black text-zinc-700">:</span>
                <div className="text-center">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">{opponentUsername}</p>
                  <p className="mt-2 text-8xl font-black leading-none tracking-[-0.1em] text-zinc-300">
                    {submittedData?.oppLegs ?? '–'}
                  </p>
                </div>
              </div>

              {/* Gewinner + Average */}
              <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10">
                <div className="bg-zinc-950 px-6 py-4 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Gewinner</p>
                  <p className="mt-1 font-black text-emerald-300">{submittedData?.winnerName}</p>
                </div>
                <div className="bg-zinc-950 px-6 py-4 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Dein Average</p>
                  <p className="mt-1 font-black text-white">
                    {submittedData?.myAvg != null ? submittedData.myAvg.toFixed(2) : '–'}
                  </p>
                </div>
              </div>

              {/* Confirm button */}
              <div className="px-8 pb-8 pt-6">
                <button
                  onClick={confirmResult}
                  disabled={loading}
                  className="w-full rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 py-5 text-lg font-black uppercase tracking-[0.16em] text-black shadow-[0_16px_50px_rgba(34,197,94,0.2)] transition hover:-translate-y-0.5 disabled:opacity-40"
                >
                  {loading ? 'Wird bestätigt…' : 'Ergebnis bestätigen & Elo vergeben'}
                </button>
              </div>
            </div>

            {/* Dispute-Bereich */}
            <div className="overflow-hidden rounded-[2.5rem] border border-red-400/15 bg-zinc-950/85 shadow-2xl backdrop-blur-2xl">
              <div className="border-b border-white/[0.06] px-8 py-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-300 shrink-0" />
                  <h3 className="text-xl font-black tracking-[-0.03em] text-red-100">
                    Ergebnis widersprechen
                  </h3>
                </div>
                <p className="mt-2 text-sm text-zinc-500">
                  Stimmt das Ergebnis nicht? Reiche einen Widerspruch ein — ein Admin prüft den Fall.
                </p>
              </div>

              <div className="space-y-5 px-8 py-7">
                <textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-300/40 focus:bg-white/[0.07]"
                  placeholder="Beschreibe kurz warum das Ergebnis nicht stimmt…"
                  rows={3}
                />

                {/* Screenshot Upload */}
                <div>
                  <p className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Beweis-Screenshot (optional, max. 5 MB)
                  </p>
                  {disputePreview ? (
                    <div className="relative overflow-hidden rounded-2xl border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={disputePreview}
                        alt="Dispute Screenshot"
                        className="max-h-52 w-full bg-black/40 object-contain"
                      />
                      <button
                        onClick={removeScreenshot}
                        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white transition hover:bg-red-500/80"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="group w-full rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-7 text-center transition hover:border-red-300/30 hover:bg-red-500/[0.04]"
                    >
                      <Upload className="mx-auto h-8 w-8 text-zinc-600 transition group-hover:text-red-300" />
                      <p className="mt-2 text-sm font-semibold text-zinc-600 transition group-hover:text-zinc-400">
                        Screenshot hochladen
                      </p>
                      <p className="mt-1 text-xs text-zinc-700">JPG, PNG, WebP — max. 5 MB</p>
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
                  className="w-full rounded-3xl border border-red-400/20 bg-red-500/10 py-4 text-base font-black uppercase tracking-[0.16em] text-red-100 transition hover:bg-red-500/15 disabled:opacity-40"
                >
                  {uploadingScreenshot
                    ? 'Screenshot wird hochgeladen…'
                    : loading
                    ? 'Wird gespeichert…'
                    : 'Widerspruch einreichen'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STATE: completed
        ══════════════════════════════════════════════════════════════ */}
        {match?.status === 'completed' && (
          <div className="rounded-[2.5rem] border border-emerald-300/15 bg-zinc-950/85 shadow-2xl backdrop-blur-2xl">
            <div className="flex flex-col items-center px-8 py-14 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-3xl border border-emerald-300/25 bg-emerald-400/10">
                <CheckCircle2 className="h-10 w-10 text-emerald-200" />
              </div>
              <h2 className="mt-6 text-3xl font-black tracking-[-0.05em]">Match abgeschlossen</h2>
              <p className="mx-auto mt-4 max-w-sm text-zinc-400">
                Das Ergebnis wurde bestätigt. Elo wurde vergeben. Du wirst zur History weitergeleitet…
              </p>
              <button
                onClick={() => router.push('/history')}
                className="mt-8 rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-4 font-black uppercase tracking-[0.16em] text-black"
              >
                Zur History
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STATE: disputed
        ══════════════════════════════════════════════════════════════ */}
        {match?.status === 'disputed' && (
          <div className="rounded-[2.5rem] border border-amber-300/15 bg-zinc-950/85 shadow-2xl backdrop-blur-2xl">
            <div className="flex flex-col items-center px-8 py-14 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-3xl border border-amber-300/25 bg-amber-400/10">
                <Shield className="h-10 w-10 text-amber-200" />
              </div>
              <h2 className="mt-6 text-3xl font-black tracking-[-0.05em]">Widerspruch eingereicht</h2>
              <p className="mx-auto mt-4 max-w-sm text-zinc-400">
                Für dieses Match wurde kein Elo vergeben. Ein Admin wird den Fall prüfen und eine
                Entscheidung treffen.
              </p>
              <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-5 py-2.5 text-sm font-bold text-amber-200">
                <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
                Admin-Entscheidung ausstehend
              </div>
            </div>
          </div>
        )}

      </section>
    </main>
  );
}
