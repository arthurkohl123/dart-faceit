'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gavel,
  Image as ImageIcon,
  Menu,
  MessageCircle,
  Send,
  Shield,
  Target,
  Trophy,
  Upload,
  UserX,
  X,
  XCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '@/components/BrandLogo';

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchStatus = 'matched' | 'pending_result' | 'awaiting_confirmation' | 'completed' | 'disputed' | 'cancelled';

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
  submitted_player1_180s: number | null;
  submitted_player2_180s: number | null;
  confirmed_by: string | null;
  dispute_reason: string | null;
  dispute_screenshot_url: string | null;
  confirmation_requested_at: string | null;
  app: string | null;
  player1_scolia_username: string | null;
  player1_dartcounter_username: string | null;
  player2_scolia_username: string | null;
  player2_dartcounter_username: string | null;
};

type RpcStatusResponse = {
  result_status: string;
  result_message: string;
  elo_change?: number;
};

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

type ChatMessage = {
  id: string;
  match_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
  is_admin_message?: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CONFIRM_TIMEOUT_SECONDS = 300;
const NO_SHOW_TIMEOUT_SECONDS = 300; // 5 Minuten
const DEFAULT_BEST_OF_LEGS = 7;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatChatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatInput({
  label,
  value,
  onChange,
  placeholder,
  step = '0.01',
  min = '0',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: string;
  min?: string;
  required?: boolean;
}) {
  return (
    <label className="group block rounded-2xl border border-white/10 bg-black/30 p-3 transition duration-300 focus-within:-translate-y-0.5 focus-within:border-emerald-300/50 focus-within:bg-white/[0.06]">
      <span className="mb-2 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 transition group-focus-within:text-emerald-300">
        <span>{label}</span>
        {required && <span className="text-emerald-300"></span>}
      </span>
      <input
        type="number"
        step={step}
        min={min}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-14 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-center text-2xl font-black tabular-nums tracking-[-0.04em] text-white outline-none transition placeholder:text-zinc-700 focus:border-transparent focus:bg-black/30 sm:h-16"
      />
    </label>
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
    <div className="min-w-0 flex-1 rounded-[1.5rem] border border-white/10 bg-black/30 p-3 sm:p-4">
      <span className="block truncate text-center text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 sm:text-[11px]">{label}</span>
      <div className="mt-3 grid grid-cols-[3.25rem_minmax(0,1fr)_3.25rem] items-center gap-2 sm:grid-cols-[3.5rem_minmax(0,1fr)_3.5rem]">
        <button
          type="button"
          aria-label={`${label} verringern`}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="grid h-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-3xl font-black text-zinc-400 transition hover:border-white/25 hover:bg-white/10 hover:text-white active:scale-95"
        >
          −
        </button>
        <span className={`text-center text-6xl font-black leading-none tabular-nums tracking-[-0.1em] sm:text-7xl ${accent}`}>
          {value}
        </span>
        <button
          type="button"
          aria-label={`${label} erhöhen`}
          onClick={() => onChange(value + 1)}
          className="grid h-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-3xl font-black text-zinc-400 transition hover:border-white/25 hover:bg-white/10 hover:text-white active:scale-95"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MatchResult() {
  const [bestOfLegs, setBestOfLegs] = useState(DEFAULT_BEST_OF_LEGS);
  // Form state
  const [legsWon, setLegsWon] = useState(0);
  const [legsLost, setLegsLost] = useState(0);
  const [myAverage, setMyAverage] = useState('');
  const [opponentAverageInput, setOpponentAverageInput] = useState('');
  const [myOneEighties, setMyOneEighties] = useState('');
  const [opponentOneEighties, setOpponentOneEighties] = useState('');

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

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // No-Show state
  const [noShowReportedAt, setNoShowReportedAt] = useState<string | null>(null);
  const [noShowReportedBy, setNoShowReportedBy] = useState<string | null>(null);
  const [noShowCountdown, setNoShowCountdown] = useState<number | null>(null);
  const [noShowResolved, setNoShowResolved] = useState(false);
  const [noShowLoading, setNoShowLoading] = useState(false);
  const [noShowMessage, setNoShowMessage] = useState('');
  const noShowCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noShowResolveCalledRef = useRef(false);

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);

  // Average-Stats beider Spieler (aus bisherigen Matches berechnet)
  const [player1AvgAverage, setPlayer1AvgAverage] = useState<number | null>(null);
  const [player2AvgAverage, setPlayer2AvgAverage] = useState<number | null>(null);
  const [adminWinnerId, setAdminWinnerId] = useState('');
  const [adminCancelling, setAdminCancelling] = useState(false);
  const [adminForcing, setAdminForcing] = useState(false);
  const [adminPendingAction, setAdminPendingAction] = useState<'cancel' | 'force_result' | null>(null);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoConfirmCalledRef = useRef(false);
  const completionRedirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => () => {
    if (completionRedirectRef.current) clearTimeout(completionRedirectRef.current);
  }, []);

  useEffect(() => {
    const bestOf = Number(new URLSearchParams(window.location.search).get('bestOf'));
    // Query-Parameter ist erst im Browser verfügbar; einmalige Hydrierung des Matchformats.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if ([3, 5, 7, 9].includes(bestOf)) setBestOfLegs(bestOf);
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const iAmPlayer1 = match ? currentUserId === match.player1_id : false;
  const iAmParticipant = match
    ? currentUserId === match.player1_id || currentUserId === match.player2_id
    : false;
  const opponentUsername = match ? (iAmPlayer1 ? match.player2_username : match.player1_username) : '';
  const isSubmitter = Boolean(match?.submitted_by && match.submitted_by === currentUserId);
  const needsMyConfirmation = Boolean(
    match?.status === 'awaiting_confirmation' &&
    match.submitted_by &&
    match.submitted_by !== currentUserId
  );
  const legsToWin = Math.ceil(bestOfLegs / 2);
  const resultIsValid = (legsWon === legsToWin && legsLost >= 0 && legsLost < legsToWin) || (legsLost === legsToWin && legsWon >= 0 && legsWon < legsToWin);
  const statsAreComplete = [myAverage, opponentAverageInput, myOneEighties, opponentOneEighties].every((value) => value.trim() !== '');
  const statsAreValid = statsAreComplete &&
    [myAverage, opponentAverageInput].every((value) => Number.isFinite(Number.parseFloat(value)) && Number.parseFloat(value) >= 0 && Number.parseFloat(value) <= 180) &&
    [myOneEighties, opponentOneEighties].every((value) => /^\d+$/.test(value) && Number.parseInt(value, 10) >= 0);
  const canSubmitResult = resultIsValid && statsAreValid;
  const countdownIsUrgent = countdown !== null && countdown <= 60;

  const submittedData = useMemo(() => {
    if (!match || !currentUserId) return null;
    const myLegs = iAmPlayer1 ? match.submitted_player1_legs : match.submitted_player2_legs;
    const oppLegs = iAmPlayer1 ? match.submitted_player2_legs : match.submitted_player1_legs;
    const myAvg = iAmPlayer1 ? match.submitted_player1_average : match.submitted_player2_average;
    const oppAvg = iAmPlayer1 ? match.submitted_player2_average : match.submitted_player1_average;
    const my180s = iAmPlayer1 ? match.submitted_player1_180s : match.submitted_player2_180s;
    const opp180s = iAmPlayer1 ? match.submitted_player2_180s : match.submitted_player1_180s;
    const submitterName =
      match.submitted_by === match.player1_id ? match.player1_username : match.player2_username;
    const winnerName =
      match.submitted_winner_id === match.player1_id ? match.player1_username : match.player2_username;
    return { myLegs, oppLegs, myAvg, oppAvg, my180s, opp180s, submitterName, winnerName };
  }, [currentUserId, iAmPlayer1, match]);

  // ── Countdown ────────────────────────────────────────────────────────────────

  const startCountdown = useCallback(
    (requestedAt: string, matchId: string) => {
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }
      const userId = session.user.id;
      setCurrentUserId(userId);

      const { data, error } = await supabase
        .from('active_matches')
        .select('*')
        .eq('id', matchId)
        .single();
      if (error) throw error;

      const m = data as ActiveMatch;
      const isParticipant = m.player1_id === userId || m.player2_id === userId;

      // Admin-Status prüfen: Admins dürfen alle Matchrooms betreten
      const { data: profileData } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('supabaseId', userId)
        .single();
      const adminFlag = Boolean(profileData?.is_admin);
      setIsAdmin(adminFlag);

      if (!isParticipant && !adminFlag) {
        setErrorMessage('Du bist kein Teilnehmer dieses Matches.');
        setPageLoading(false);
        return;
      }

      // Matches created by the former matcher used the legacy `matched`
      // status. Convert it once before rendering so all current result-room
      // actions (submit, no-show and chat) use the supported workflow.
      if (m.status === 'matched' && isParticipant) {
        const response = await fetch(`/api/matches/${encodeURIComponent(m.id)}/activate`, {
          method: 'POST',
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null) as { status?: MatchStatus; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error || 'Matchroom konnte nicht vorbereitet werden.');
        m.status = payload?.status ?? 'pending_result';
      }
      // Plattform-Usernamen immer aus Profilen laden (active_matches hat diese Felder ggf. nicht)
      const [{ data: p1Profile }, { data: p2Profile }, { data: p1Stats }, { data: p2Stats }] = await Promise.all([
        supabase.from('public_profiles').select('scolia_username, dartcounter_username').eq('supabaseId', m.player1_id).single(),
        supabase.from('public_profiles').select('scolia_username, dartcounter_username').eq('supabaseId', m.player2_id).single(),
        supabase.from('active_matches')
          .select('submitted_player1_average, submitted_player2_average, player1_id')
          .eq('status', 'completed')
          .or(`player1_id.eq.${m.player1_id},player2_id.eq.${m.player1_id}`)
          .not('submitted_player1_average', 'is', null),
        supabase.from('active_matches')
          .select('submitted_player1_average, submitted_player2_average, player1_id')
          .eq('status', 'completed')
          .or(`player1_id.eq.${m.player2_id},player2_id.eq.${m.player2_id}`)
          .not('submitted_player1_average', 'is', null),
      ]);
      if (p1Profile) {
        m.player1_scolia_username = p1Profile.scolia_username ?? null;
        m.player1_dartcounter_username = p1Profile.dartcounter_username ?? null;
      }
      if (p2Profile) {
        m.player2_scolia_username = p2Profile.scolia_username ?? null;
        m.player2_dartcounter_username = p2Profile.dartcounter_username ?? null;
      }
      // Durchschnitts-Average beider Spieler berechnen
      if (p1Stats && p1Stats.length > 0) {
        const avgs = p1Stats.map((r: { submitted_player1_average: number | null; submitted_player2_average: number | null; player1_id: string }) =>
          r.player1_id === m.player1_id ? r.submitted_player1_average : r.submitted_player2_average
        ).filter((v): v is number => v !== null);
        if (avgs.length > 0) setPlayer1AvgAverage(avgs.reduce((a, b) => a + b, 0) / avgs.length);
      }
      if (p2Stats && p2Stats.length > 0) {
        const avgs = p2Stats.map((r: { submitted_player1_average: number | null; submitted_player2_average: number | null; player1_id: string }) =>
          r.player1_id === m.player2_id ? r.submitted_player1_average : r.submitted_player2_average
        ).filter((v): v is number => v !== null);
        if (avgs.length > 0) setPlayer2AvgAverage(avgs.reduce((a, b) => a + b, 0) / avgs.length);
      }

      setMatch(m);
      if (adminFlag && m.player1_id) setAdminWinnerId(m.player1_id);
      if (m.status === 'awaiting_confirmation' && m.confirmation_requested_at) {
        startCountdown(m.confirmation_requested_at, m.id);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Match konnte nicht geladen werden.');
    } finally {
      setPageLoading(false);
    }
  }, [router, startCountdown, supabase]);

  useEffect(() => {
    let mounted = true;
    if (mounted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadMatch();
    }
    return () => { mounted = false; };
  }, [loadMatch]);

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
    if (!match) return;
    if (!resultIsValid) {
      setErrorMessage(`Bitte trage ein gültiges Best-of-${bestOfLegs}-Ergebnis ein. Ein Spieler muss genau ${legsToWin} Legs haben.`);
      return;
    }
    if (!statsAreValid) {
      setErrorMessage('Bitte fülle alle Statistikfelder aus: beide Averages und beide 180er-Werte.');
      return;
    }
    setLoading(true); setErrorMessage(''); setInfoMessage('');
    try {
      const resultPayload = {
        p_match_id: match.id,
        p_my_legs: legsWon,
        p_opponent_legs: legsLost,
        p_my_average: myAverage ? Number.parseFloat(myAverage) : null,
        p_opponent_average: opponentAverageInput ? Number.parseFloat(opponentAverageInput) : null,
        p_highest_checkout: null,
        p_my_180s: myOneEighties ? Number.parseInt(myOneEighties, 10) : 0,
        p_opponent_180s: opponentOneEighties ? Number.parseInt(opponentOneEighties, 10) : 0,
      };
      const { data, error } = await supabase.rpc('submit_match_result', resultPayload);

      let result = Array.isArray(data) ? (data[0] as RpcStatusResponse | undefined) : undefined;
      if (error) {
        // Compatibility fallback for legacy databases whose stored procedure
        // still references the missing active_matches.best_of column.
        const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            myLegs: legsWon,
            opponentLegs: legsLost,
            myAverage: resultPayload.p_my_average,
            opponentAverage: resultPayload.p_opponent_average,
            myOneEighties: resultPayload.p_my_180s,
            opponentOneEighties: resultPayload.p_opponent_180s,
            bestOf: bestOfLegs,
          }),
        });
        const fallback = await response.json().catch(() => null) as RpcStatusResponse & { error?: string } | null;
        if (!response.ok) throw new Error(fallback?.error || getActionErrorMessage(error, 'Fehler beim Einreichen.'));
        result = fallback ?? undefined;
      }
      setInfoMessage(result?.result_message || 'Ergebnis eingereicht. Warte auf Bestätigung.');
      await loadMatch();
    } catch (err) {
      setErrorMessage(getActionErrorMessage(err, 'Fehler beim Einreichen.'));
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
      setInfoMessage(`${r?.result_message || 'Ergebnis bestätigt.'}${eloText}`);
      setTimeout(() => router.push('/history'), 1200);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Fehler beim Bestätigen.');
    } finally {
      setLoading(false);
    }
  };

  const disputeResult = async () => {
    if (!match) return;
    const reason = disputeReason.trim();
    if (reason.length < 10) {
      setErrorMessage('Bitte beschreibe den Widerspruch mit mindestens 10 Zeichen.');
      return;
    }
    setLoading(true); setErrorMessage(''); setInfoMessage('');
    try {
      const screenshotUrl = disputeScreenshot ? await uploadScreenshot(match.id) : null;
      const { data, error } = await supabase.rpc('dispute_match_result', {
        p_match_id: match.id,
        p_reason: reason,
        p_screenshot_url: screenshotUrl,
      });
      if (error) throw error;
      const r = Array.isArray(data) ? (data[0] as RpcStatusResponse | undefined) : undefined;
      if (r?.result_status === 'error') throw new Error(r.result_message || 'Widerspruch konnte nicht gespeichert werden.');
      setInfoMessage(r?.result_message || 'Widerspruch gespeichert. Ein Admin wird das Match prüfen.');
      await loadMatch();
    } catch (err) {
      setErrorMessage(getActionErrorMessage(err, 'Fehler beim Widerspruch.'));
    } finally {
      setLoading(false);
    }
  };

  // ── Chat ──────────────────────────────────────────────────────────────────────

  // Nachrichten beim Match-Load initial laden
  // Admins die nicht Teilnehmer sind, lesen über eine eigene RPC-Funktion
  // die SECURITY DEFINER hat und die RLS umgeht.
  useEffect(() => {
    if (!match?.id) return;
    const fetchMessages = async () => {
      let data;
      if (isAdmin && !(currentUserId === match.player1_id || currentUserId === match.player2_id)) {
        // Admin-Pfad: RPC-Funktion mit SECURITY DEFINER
        const result = await supabase.rpc('admin_get_match_messages', { p_match_id: match.id });
        data = result.data;
      } else {
        // Normaler Pfad: RLS greift, Teilnehmer lesen direkt
        const result = await supabase
          .from('match_messages')
          .select('*')
          .eq('match_id', match.id)
          .order('created_at', { ascending: true });
        data = result.data;
      }
      if (data) setChatMessages(data as ChatMessage[]);
    };
    void fetchMessages();
  }, [match?.id, match?.player1_id, match?.player2_id, currentUserId, isAdmin, supabase]);

  // Realtime-Subscription für neue Chat-Nachrichten
  // Admins nutzen Broadcast-Kanal statt postgres_changes (umgeht RLS-Filter)
  useEffect(() => {
    if (!match?.id) return;
    const isParticipant = currentUserId === match.player1_id || currentUserId === match.player2_id;

    if (isAdmin && !isParticipant) {
      // Admin-Pfad: Nachrichten per Polling alle 3 Sekunden nachladen
      // (einfachste Lösung die keine zusätzliche DB-Konfiguration braucht)
      const pollInterval = setInterval(async () => {
        const { data } = await supabase.rpc('admin_get_match_messages', { p_match_id: match.id });
        if (data) setChatMessages(data as ChatMessage[]);
      }, 3000);
      return () => clearInterval(pollInterval);
    }

    // Normaler Pfad: Realtime via postgres_changes
    const channel = supabase
      .channel(`chat-${match.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_messages', filter: `match_id=eq.${match.id}` },
        (payload) => {
          setChatMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [match?.id, match?.player1_id, match?.player2_id, currentUserId, isAdmin, supabase]);

  // Automatisch nach unten scrollen wenn neue Nachrichten ankommen
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sendChatMessage = async () => {
    const content = chatInput.trim();
    if (!content || !match?.id || !currentUserId || chatSending) return;
    // Admins die nicht Teilnehmer sind, senden unter ihrem eigenen Username
    // mit is_admin_message = true (rot dargestellt)
    const isParticipant = currentUserId === match.player1_id || currentUserId === match.player2_id;
    const myUsername = isParticipant
      ? (currentUserId === match.player1_id ? match.player1_username : match.player2_username)
      : `[Admin]`;
    setChatSending(true);
    setChatInput('');
    try {
      const { error } = await supabase.from('match_messages').insert({
        match_id: match.id,
        user_id: currentUserId,
        username: myUsername,
        content,
        is_admin_message: isAdmin && !isParticipant,
      });
      if (error) {
        console.error('Insert-Fehler:', error);
        setChatInput(content);
      }
    } catch (err) {
      console.error('Nachricht konnte nicht gesendet werden:', err);
      setChatInput(content);
    } finally {
      setChatSending(false);
    }
  };

  // ── Admin-Aktionen ────────────────────────────────────────────────────────────

  const adminForceCancel = async () => {
    if (!match) return;
    if (adminPendingAction !== 'cancel') {
      setAdminPendingAction('cancel');
      setInfoMessage('Bitte bestätige den Match-Abbruch direkt auf der Seite.');
      setErrorMessage('');
      return;
    }
    setAdminCancelling(true);
    try {
      const response = await fetch(`/api/admin/matches/${encodeURIComponent(match.id)}/cancel`, {
        method: 'POST',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || 'Fehler beim Abbrechen.');
      setInfoMessage('Match wurde durch Admin abgebrochen.');
      setAdminPendingAction(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Fehler beim Abbrechen.');
    } finally {
      setAdminCancelling(false);
    }
  };

  const adminForceResult = async () => {
    if (!match || !adminWinnerId) return;
    if (adminPendingAction !== 'force_result') {
      setAdminPendingAction('force_result');
      setInfoMessage(`Bitte bestätige direkt auf der Seite, dass ${adminWinnerId === match.player1_id ? match.player1_username : match.player2_username} als Gewinner gesetzt und Elo vergeben werden soll.`);
      setErrorMessage('');
      return;
    }
    setAdminForcing(true);
    try {
      const { error } = await supabase.rpc('admin_force_match_result', {
        p_match_id: match.id,
        p_winner_id: adminWinnerId,
      });
      if (error) throw error;
      setInfoMessage('Ergebnis wurde durch Admin gesetzt.');
      setAdminPendingAction(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Fehler beim Setzen des Ergebnisses.');
    } finally {
      setAdminForcing(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendChatMessage();
    }
  };

  // ── No-Show ──────────────────────────────────────────────────────────────────────────────

  const startNoShowCountdown = useCallback((reportedAt: string, matchId: string) => {
    if (noShowCountdownRef.current) clearInterval(noShowCountdownRef.current);
    const calcRemaining = () => {
      const elapsed = Math.floor((Date.now() - new Date(reportedAt).getTime()) / 1000);
      return Math.max(0, NO_SHOW_TIMEOUT_SECONDS - elapsed);
    };
    setNoShowCountdown(calcRemaining());
    noShowCountdownRef.current = setInterval(async () => {
      const remaining = calcRemaining();
      setNoShowCountdown(remaining);
      if (remaining <= 0 && !noShowResolveCalledRef.current) {
        noShowResolveCalledRef.current = true;
        clearInterval(noShowCountdownRef.current!);
        try {
          const { data } = await supabase.rpc('resolve_no_show', { p_match_id: matchId });
          const result = data as { status: string; message: string } | null;
          if (result?.status === 'resolved') {
            setNoShowMessage('Gegner nicht erschienen. Match wurde abgebrochen und Sperre vergeben.');
            setNoShowResolved(true);
            setNoShowCountdown(0);
            setMatch((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
          } else if (result?.status === 'not_expired') {
            noShowResolveCalledRef.current = false;
          }
        } catch (err) {
          console.error('resolve_no_show fehlgeschlagen:', err);
          noShowResolveCalledRef.current = false;
        }
      }
    }, 1000);
  }, [supabase]);

  // ── Realtime (hier platziert damit startNoShowCountdown bereits deklariert ist) ──────────

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
          const updated = payload.new as ActiveMatch & {
            no_show_reported_by?: string | null;
            no_show_reported_at?: string | null;
            no_show_resolved?: boolean;
          };
          // Plattform-Usernamen aus dem alten State beibehalten (nicht in active_matches gespeichert)
          setMatch(prev => ({
            ...updated,
            player1_scolia_username: updated.player1_scolia_username ?? prev?.player1_scolia_username ?? null,
            player1_dartcounter_username: updated.player1_dartcounter_username ?? prev?.player1_dartcounter_username ?? null,
            player2_scolia_username: updated.player2_scolia_username ?? prev?.player2_scolia_username ?? null,
            player2_dartcounter_username: updated.player2_dartcounter_username ?? prev?.player2_dartcounter_username ?? null,
          }));

          // No-Show-State aus Realtime-Payload synchronisieren
          if (updated.no_show_reported_at && !updated.no_show_resolved) {
            noShowResolveCalledRef.current = false;
            setNoShowReportedAt(updated.no_show_reported_at);
            setNoShowReportedBy(updated.no_show_reported_by ?? null);
            startNoShowCountdown(updated.no_show_reported_at, updated.id);
          } else if (!updated.no_show_reported_at && !updated.no_show_resolved) {
            // No-Show zurückgezogen (cancel_no_show) → Banner für beide ausblenden
            if (noShowCountdownRef.current) clearInterval(noShowCountdownRef.current);
            setNoShowReportedAt(null);
            setNoShowReportedBy(null);
            setNoShowCountdown(null);
            setNoShowResolved(false);
            noShowResolveCalledRef.current = false;
          }
          if (updated.no_show_resolved) {
            setNoShowResolved(true);
            if (noShowCountdownRef.current) clearInterval(noShowCountdownRef.current);
            setNoShowCountdown(null);
          }

          if (updated.status === 'awaiting_confirmation' && updated.confirmation_requested_at && currentUserId) {
            autoConfirmCalledRef.current = false;
            startCountdown(updated.confirmation_requested_at, updated.id);
          }
          if (updated.status === 'completed') {
            if (countdownRef.current) clearInterval(countdownRef.current);
            setTimeout(() => router.push('/history'), 2500);
          }
          if (updated.status === 'disputed') {
            if (countdownRef.current) clearInterval(countdownRef.current);
            setCountdown(null);
          }
          if (updated.status === 'cancelled') {
            if (countdownRef.current) clearInterval(countdownRef.current);
            setCountdown(null);
            if (noShowCountdownRef.current) clearInterval(noShowCountdownRef.current);
            setNoShowCountdown(null);
            setInfoMessage('Dieses Match wurde abgebrochen.');
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [currentUserId, router, startCountdown, startNoShowCountdown, supabase]);

  // Realtime ist die schnellste Aktualisierung. Als belastbarer Fallback fragen
  // wir während des laufenden Matches und einer offenen Ergebnisbestätigung
  // zusätzlich den aktuellen Match-Status ab. Damit sieht auch der Gegner eine
  // gerade eingereichte Wertung ohne F5, selbst wenn Realtime im Browser/Netzwerk
  // gerade keine Datenbank-Events liefert.
  useEffect(() => {
    if (
      !match?.id ||
      !currentUserId ||
      (match.status !== 'pending_result' && match.status !== 'awaiting_confirmation')
    ) return;

    let active = true;
    let requestInFlight = false;

    const refreshConfirmationStatus = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const { data, error } = await supabase
          .from('active_matches')
          .select('*')
          .eq('id', match.id)
          .single();
        if (error || !data || !active) return;

        const updated = data as ActiveMatch;
        if (updated.status === 'completed') {
          if (countdownRef.current) clearInterval(countdownRef.current);
          setCountdown(null);
          setMatch((previous) => previous ? {
            ...updated,
            player1_scolia_username: previous.player1_scolia_username,
            player1_dartcounter_username: previous.player1_dartcounter_username,
            player2_scolia_username: previous.player2_scolia_username,
            player2_dartcounter_username: previous.player2_dartcounter_username,
          } : previous);
          setInfoMessage('Ergebnis wurde bestätigt. Die Wertung ist abgeschlossen.');
          if (!completionRedirectRef.current) {
            completionRedirectRef.current = setTimeout(() => router.push('/history'), 1800);
          }
        } else if (updated.status !== match.status) {
          setMatch((previous) => previous ? {
            ...updated,
            player1_scolia_username: previous.player1_scolia_username,
            player1_dartcounter_username: previous.player1_dartcounter_username,
            player2_scolia_username: previous.player2_scolia_username,
            player2_dartcounter_username: previous.player2_dartcounter_username,
          } : previous);
          if (updated.status === 'awaiting_confirmation' && updated.confirmation_requested_at) {
            autoConfirmCalledRef.current = false;
            startCountdown(updated.confirmation_requested_at, updated.id);
          }
        }
      } finally {
        requestInFlight = false;
      }
    };

    void refreshConfirmationStatus();
    const interval = window.setInterval(() => void refreshConfirmationStatus(), 3_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [currentUserId, match?.id, match?.status, router, startCountdown, supabase]);

  const reportNoShow = async () => {
    if (!match || noShowLoading) return;
    setNoShowLoading(true);
    setNoShowMessage('');
    try {
      const { data, error } = await supabase.rpc('report_no_show', { p_match_id: match.id });
      if (error) throw error;
      const result = data as { status: string; message: string; deadline?: string } | null;
      if (result?.status === 'reported' || result?.status === 'already_reported') {
        // noShowResolveCalledRef zurücksetzen damit resolve beim nächsten Ablauf funktioniert
        noShowResolveCalledRef.current = false;
        // reported_at aus der DB-Antwort nehmen (nicht lokale Zeit) damit Timer synchron ist
        const reportedAt = result.deadline
          ? new Date(new Date(result.deadline).getTime() - 5 * 60 * 1000).toISOString()
          : new Date().toISOString();
        setNoShowReportedAt(reportedAt);
        setNoShowReportedBy(currentUserId);
        setNoShowMessage('Gegner wurde gemeldet. Er hat 5 Minuten Zeit zu reagieren.');
        startNoShowCountdown(reportedAt, match.id);
      } else {
        setNoShowMessage(result?.message || 'Fehler beim Melden.');
      }
    } catch (err) {
      setNoShowMessage(err instanceof Error ? err.message : 'Fehler beim Melden.');
    } finally {
      setNoShowLoading(false);
    }
  };

  // No-Show-Status beim Match-Load initialisieren (falls bereits gemeldet)
  useEffect(() => {
    if (!match?.id) return;
    const checkNoShowStatus = async () => {
      const { data } = await supabase.rpc('get_no_show_status', { p_match_id: match.id });
      const s = data as {
        reported: boolean;
        reported_by: string | null;
        reported_at: string | null;
        resolved: boolean;
        remaining_seconds: number | null;
      } | null;
      if (!s || !s.reported) return;
      setNoShowReportedAt(s.reported_at);
      setNoShowReportedBy(s.reported_by);
      setNoShowResolved(s.resolved);
      if (!s.resolved && s.reported_at && (s.remaining_seconds ?? 0) > 0) {
        startNoShowCountdown(s.reported_at, match.id);
      }
    };
    void checkNoShowStatus();
  }, [match?.id, supabase, startNoShowCountdown]);

  // ── Loading screen ────────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050607] px-5 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(52,211,153,0.18),transparent_38%)]" />
        <div className="relative flex flex-col items-center text-center">
          <div className="relative grid h-20 w-20 place-items-center rounded-[1.75rem] border border-emerald-300/25 bg-emerald-400/10 shadow-[0_0_60px_rgba(52,211,153,0.2)]">
            <Target className="h-9 w-9 animate-pulse text-emerald-200" />
            <span className="absolute -inset-2 animate-ping rounded-[2rem] border border-emerald-300/10" />
          </div>
          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.35em] text-emerald-300">Live Matchroom</p>
          <p className="mt-2 text-xl font-black tracking-[-0.04em]">Match wird geladen…</p>
        </div>
      </main>
    );
  }

  if (errorMessage && !match) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050607] p-6 text-white">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.2),transparent_34%)]" />
        <div className="relative w-full max-w-xl rounded-[1.75rem] border border-red-400/25 bg-zinc-950/90 p-6 text-center shadow-2xl backdrop-blur-2xl sm:rounded-[2.5rem] sm:p-10">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-red-400/20 bg-red-500/10 sm:h-20 sm:w-20">
            <XCircle className="h-8 w-8 text-red-300 sm:h-10 sm:w-10" />
          </div>
          <h1 className="mt-5 text-3xl font-black tracking-[-0.05em] sm:text-4xl">Kein gültiges Match</h1>
          <p className="mt-4 text-zinc-300">{errorMessage}</p>
          <button
            onClick={() => router.push('/matchmaking')}
            className="mt-8 min-h-14 w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-4 font-black uppercase tracking-[0.14em] text-black shadow-[0_14px_50px_rgba(52,211,153,0.18)] sm:w-auto"
          >
            Zum Matchmaking
          </button>
        </div>
      </main>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white selection:bg-emerald-300 selection:text-black">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_4%,rgba(52,211,153,0.24),transparent_29%),radial-gradient(circle_at_88%_8%,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_50%_55%,rgba(132,204,22,0.06),transparent_38%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_76%)]" />
        <div className="absolute inset-0 opacity-[0.055] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]" />
        <div className="absolute left-1/2 top-20 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full border border-emerald-300/[0.05] sm:h-[44rem] sm:w-[44rem]" />
        <div className="absolute left-1/2 top-44 h-[18rem] w-[18rem] -translate-x-1/2 rounded-full border border-white/[0.04] sm:h-[30rem] sm:w-[30rem]" />
      </div>

      {/* Navbar */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo className="h-10 w-10" />
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

      <section className="relative z-10 mx-auto max-w-7xl px-3 pb-12 pt-20 sm:px-6 sm:pt-24 lg:px-8 lg:pb-20 lg:pt-28">

        {/* Arena intro */}
        <div className="mb-4 flex flex-col gap-3 px-1 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.9)]" />
              Live Matchroom
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.065em] sm:text-4xl lg:text-5xl">
              Result <span className="text-zinc-600">Center</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600 sm:justify-end sm:overflow-visible sm:pb-0">
            <span className="whitespace-nowrap text-emerald-300">01 · Match</span>
            <span>›</span>
            <span className={`whitespace-nowrap ${match?.status === 'pending_result' ? 'text-white' : 'text-emerald-300'}`}>02 · Ergebnis</span>
            <span>›</span>
            <span className={`whitespace-nowrap ${match?.status === 'completed' ? 'text-emerald-300' : 'text-zinc-600'}`}>03 · Wertung</span>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════
            NO-SHOW BANNER
        ════════════════════════════════════════════════════════════ */}
        {match && (match.status === 'pending_result' || (match.status === 'cancelled' && noShowResolved)) && (
          <div className="mb-6">
            {noShowResolved ? (
              <div className="flex items-center gap-3 rounded-3xl border border-red-400/30 bg-red-500/10 px-5 py-4">
                <XCircle className="h-5 w-5 shrink-0 text-red-300" />
                <div>
                  <p className="text-sm font-black text-red-200">Gegner ist nicht erschienen.</p>
                  <p className="mt-0.5 text-xs font-bold text-red-200/80">
                    Das Match wurde abgebrochen und eine Queue-Sperre wurde vergeben.
                  </p>
                </div>
              </div>
            ) : noShowReportedAt ? (
              /* Timer läuft bereits */
              <div className={`flex flex-col items-stretch gap-4 rounded-[1.5rem] border p-4 transition-colors sm:flex-row sm:items-center sm:rounded-3xl sm:p-5 ${
                (noShowCountdown ?? 999) <= 60
                  ? 'border-red-400/40 bg-red-500/10'
                  : 'border-orange-400/25 bg-orange-400/[0.07]'
              }`}>
                <UserX className={`hidden h-6 w-6 shrink-0 sm:block ${
                  (noShowCountdown ?? 999) <= 60 ? 'text-red-300' : 'text-orange-300'
                }`} />
                <div className="flex-1">
                  <p className={`text-sm font-black ${
                    (noShowCountdown ?? 999) <= 60 ? 'text-red-200' : 'text-orange-200'
                  }`}>
                    {noShowReportedBy === currentUserId
                      ? 'Du hast den Gegner als nicht erschienen gemeldet.'
                      : `${opponentUsername} hat dich als nicht erschienen gemeldet.`}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {noShowReportedBy === currentUserId
                      ? 'Wenn der Gegner nicht reagiert, wird das Match automatisch abgebrochen.'
                      : 'Drücke den Button, um zu bestätigen, dass du da bist.'}
                  </p>
                  {noShowReportedBy !== currentUserId && (
                    <button
                      onClick={async () => {
                        if (!match) return;
                        setNoShowLoading(true);
                        try {
                          const { data } = await supabase.rpc('cancel_no_show', { p_match_id: match.id });
                          const r = data as { status: string } | null;
                          if (r?.status === 'cancelled') {
                            if (noShowCountdownRef.current) clearInterval(noShowCountdownRef.current);
                            setNoShowReportedAt(null);
                            setNoShowReportedBy(null);
                            setNoShowCountdown(null);
                            setNoShowMessage('');
                          }
                        } catch (err) {
                          console.error('cancel_no_show fehlgeschlagen:', err);
                        } finally {
                          setNoShowLoading(false);
                        }
                      }}
                      disabled={noShowLoading}
                      className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-200 transition hover:bg-emerald-400/15 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {noShowLoading ? 'Wird bestätigt…' : 'Ich bin da!'}
                    </button>
                  )}
                </div>
                {noShowCountdown !== null && (
                  <div className={`shrink-0 rounded-2xl border px-4 py-2 text-center sm:min-w-28 ${
                    (noShowCountdown ?? 999) <= 60
                      ? 'border-red-400/30 bg-red-500/10'
                      : 'border-orange-400/20 bg-orange-400/[0.07]'
                  }`}>
                    <div className={`text-2xl font-black tracking-[-0.04em] ${
                      (noShowCountdown ?? 999) <= 60 ? 'text-red-300' : 'text-orange-300'
                    }`}>{formatCountdown(noShowCountdown)}</div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-600">verbleibend</div>
                  </div>
                )}
              </div>
            ) : (
              /* Button: Gegner ist nicht da */
              <button
                type="button"
                onClick={() => void reportNoShow()}
                disabled={noShowLoading}
                className="group flex w-full items-center justify-center gap-3 rounded-3xl border border-orange-400/25 bg-orange-400/[0.06] px-6 py-4 text-sm font-black text-orange-200 transition hover:border-orange-400/40 hover:bg-orange-400/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UserX className="h-5 w-5 shrink-0 transition group-hover:scale-110" />
                {noShowLoading ? 'Wird gemeldet…' : 'Gegner ist nicht da'}
              </button>
            )}
            {!noShowResolved && noShowMessage && (
              <p className="mt-2 text-center text-xs font-bold text-orange-300">{noShowMessage}</p>
            )}
          </div>
        )}

        {/* Match-Header — VS-Banner */}
        {match && (() => {
          const isScolia = match.app === 'scolia';
          const primaryIsPlayer1 = iAmParticipant ? iAmPlayer1 : true;
          const myPlatformUsername = primaryIsPlayer1
            ? (isScolia ? match.player1_scolia_username : match.player1_dartcounter_username)
            : (isScolia ? match.player2_scolia_username : match.player2_dartcounter_username);
          const oppPlatformUsername = primaryIsPlayer1
            ? (isScolia ? match.player2_scolia_username : match.player2_dartcounter_username)
            : (isScolia ? match.player1_scolia_username : match.player1_dartcounter_username);
          const platformLabel = isScolia ? 'Scolia' : 'DartCounter';
          const platformColor = isScolia ? 'text-emerald-300' : 'text-cyan-300';
          const platformBorder = isScolia ? 'border-emerald-300/20 bg-emerald-400/[0.06]' : 'border-cyan-300/20 bg-cyan-400/[0.06]';
          const myName = primaryIsPlayer1 ? match.player1_username : match.player2_username;
          const myElo = primaryIsPlayer1 ? match.player1_elo : match.player2_elo;
          const displayedOpponentName = primaryIsPlayer1 ? match.player2_username : match.player1_username;
          const displayedOpponentElo = primaryIsPlayer1 ? match.player2_elo : match.player1_elo;
          const myAvg = primaryIsPlayer1 ? player1AvgAverage : player2AvgAverage;
          const oppAvg = primaryIsPlayer1 ? player2AvgAverage : player1AvgAverage;
          const statusLabel = match.status === 'pending_result'
            ? 'Ergebnis offen'
            : match.status === 'awaiting_confirmation'
              ? 'Bestätigung offen'
              : match.status === 'completed'
                ? 'Abgeschlossen'
                : match.status === 'disputed'
                  ? 'In Prüfung'
                  : 'Abgebrochen';

          return (
            <div className="relative mb-5 overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/85 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:mb-8 sm:rounded-[2.5rem]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" />
              <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.025] px-4 py-3 sm:px-6">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]" />
                  Ranked Match
                </div>
                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-zinc-300">
                  {statusLabel}
                </span>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_3.75rem_minmax(0,1fr)] items-stretch sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col items-center justify-center px-2 py-5 text-center sm:px-6 sm:py-8">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-300/25 bg-emerald-400/10 text-lg font-black text-emerald-200 shadow-[0_0_28px_rgba(52,211,153,0.12)] sm:h-14 sm:w-14 sm:text-xl">
                    {myName.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="mt-3 text-[9px] font-black uppercase tracking-[0.22em] text-emerald-300/70 sm:text-[10px]">{iAmParticipant ? 'Du' : 'Spieler 1'}</span>
                  <span className="mt-1 w-full truncate text-lg font-black tracking-[-0.04em] sm:text-2xl" title={myName}>{myName}</span>
                  <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 text-[11px] font-bold text-zinc-500 sm:text-xs">
                    <span>{myElo} Elo</span>
                    {myAvg !== null && <span>Ø <b className="text-emerald-300">{myAvg.toFixed(1)}</b></span>}
                  </div>
                  {myPlatformUsername && (
                    <span className={`mt-3 max-w-full truncate rounded-full border px-2 py-1 text-[9px] font-bold sm:px-3 sm:text-[10px] ${platformBorder} ${platformColor}`} title={`${platformLabel}: ${myPlatformUsername}`}>
                      {myPlatformUsername}
                    </span>
                  )}
                </div>

                <div className="relative flex flex-col items-center justify-center border-x border-white/[0.07] bg-black/20">
                  <div className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-zinc-950 shadow-[0_0_35px_rgba(255,255,255,0.06)] sm:h-14 sm:w-14">
                    <Target className="h-5 w-5 text-emerald-300 sm:h-7 sm:w-7" />
                  </div>
                  <span className="mt-2 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">vs</span>
                </div>

                <div className="flex min-w-0 flex-col items-center justify-center px-2 py-5 text-center sm:px-6 sm:py-8">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-lg font-black text-cyan-200 shadow-[0_0_28px_rgba(34,211,238,0.1)] sm:h-14 sm:w-14 sm:text-xl">
                    {displayedOpponentName.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="mt-3 text-[9px] font-black uppercase tracking-[0.22em] text-cyan-300/70 sm:text-[10px]">{iAmParticipant ? 'Gegner' : 'Spieler 2'}</span>
                  <span className="mt-1 w-full truncate text-lg font-black tracking-[-0.04em] sm:text-2xl" title={displayedOpponentName}>{displayedOpponentName}</span>
                  <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 text-[11px] font-bold text-zinc-500 sm:text-xs">
                    <span>{displayedOpponentElo} Elo</span>
                    {oppAvg !== null && <span>Ø <b className="text-cyan-300">{oppAvg.toFixed(1)}</b></span>}
                  </div>
                  {oppPlatformUsername ? (
                    <span className={`mt-3 max-w-full truncate rounded-full border px-2 py-1 text-[9px] font-bold sm:px-3 sm:text-[10px] ${platformBorder} ${platformColor}`} title={`${platformLabel}: ${oppPlatformUsername}`}>
                      {oppPlatformUsername}
                    </span>
                  ) : (
                    <span className="mt-3 max-w-full truncate rounded-full border border-zinc-700/40 bg-zinc-800/40 px-2 py-1 text-[9px] font-bold text-zinc-600 sm:px-3 sm:text-[10px]">
                      Nicht hinterlegt
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-white/[0.07] border-t border-white/[0.07] bg-black/25 text-center">
                <div className="px-2 py-3 sm:px-4">
                  <p className="text-[8px] font-black uppercase tracking-[0.15em] text-zinc-600 sm:text-[9px]">Format</p>
                  <p className="mt-1 text-[11px] font-black text-zinc-200 sm:text-xs">Best of {bestOfLegs}</p>
                </div>
                <div className="min-w-0 px-2 py-3 sm:px-4">
                  <p className="text-[8px] font-black uppercase tracking-[0.15em] text-zinc-600 sm:text-[9px]">Plattform</p>
                  <p className={`mt-1 truncate text-[11px] font-black sm:text-xs ${platformColor}`}>{platformLabel}</p>
                </div>
                <div className="px-2 py-3 sm:px-4">
                  <p className="text-[8px] font-black uppercase tracking-[0.15em] text-zinc-600 sm:text-[9px]">Ziel</p>
                  <p className="mt-1 text-[11px] font-black text-zinc-200 sm:text-xs">{legsToWin} Legs</p>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(21rem,0.65fr)] lg:items-start lg:gap-6">
          <div className="min-w-0">
        {/* Countdown-Banner */}
        {countdown !== null && match?.status === 'awaiting_confirmation' && (
          <div
            className={`mb-5 flex flex-col items-stretch gap-3 rounded-[1.5rem] border p-4 transition-colors sm:mb-6 sm:flex-row sm:items-center sm:gap-4 sm:rounded-3xl sm:p-5 ${
              countdownIsUrgent
                ? 'border-red-400/40 bg-red-500/10'
                : 'border-amber-400/25 bg-amber-400/[0.07]'
            }`}
          >
            <Clock
              className={`hidden h-6 w-6 shrink-0 sm:block ${countdownIsUrgent ? 'text-red-300' : 'text-amber-300'}`}
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
          <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/85 shadow-2xl shadow-black/60 backdrop-blur-2xl sm:rounded-[2.5rem]">
            {/* Header */}
            <div className="border-b border-white/10 bg-gradient-to-r from-emerald-400/[0.06] to-transparent px-5 py-6 sm:px-8 sm:py-7">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-300">Scoreboard</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.06em] sm:text-4xl">Ergebnis eintragen</h2>
              <p className="mt-2 text-sm text-zinc-500">
                Trage das Best-of-{bestOfLegs}-Ergebnis sowie Average und 180er von beiden Spielern ein. Dein Gegner muss alles danach bestätigen.
              </p>
            </div>

            <div className="px-4 py-8 space-y-8 sm:px-8">
              {/* Legs */}
              <div>
                <p className="mb-5 text-[11px] font-black uppercase tracking-[0.24em] text-zinc-500">Legs</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <LegCounter label="Deine Legs" value={legsWon} onChange={(v) => setLegsWon(Math.min(legsToWin, v))} accent="text-emerald-300" />
                  <LegCounter label="Gegner Legs" value={legsLost} onChange={(v) => setLegsLost(Math.min(legsToWin, v))} accent="text-zinc-300" />
                </div>
                <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center text-sm font-bold text-zinc-400">
                  Gespielt wird Best of {bestOfLegs}. Ein gültiges Ergebnis endet mit {legsToWin} Legs für einen Spieler.
                </p>
                {!resultIsValid && (legsWon > 0 || legsLost > 0) && (
                  <p className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-center text-sm font-bold text-red-200">
                    Ungültiges Best-of-{bestOfLegs}-Ergebnis. Ein Spieler muss genau {legsToWin} Legs erreicht haben.
                  </p>
                )}
              </div>

              {/* Divider */}
              <div className="h-px bg-white/[0.06]" />

              {/* Stats */}
              <div>
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-zinc-500">Statistiken beider Spieler</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-500">Average und 180er sind für beide Spieler Pflichtfelder.</p>
                  </div>
                  <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
                    Pflichtangaben
                  </span>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <section className="rounded-[1.75rem] border border-emerald-300/20 bg-gradient-to-br from-emerald-400/[0.10] to-white/[0.025] p-4 shadow-inner shadow-emerald-950/20 sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="text-sm font-black uppercase tracking-[0.22em] text-emerald-200">Du</p>
                      <p className="text-xs font-bold text-zinc-500">deine Werte</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <StatInput label="Average" value={myAverage} onChange={setMyAverage} placeholder="84.70" required />
                      <StatInput label="180er" value={myOneEighties} onChange={setMyOneEighties} placeholder="0" step="1" required />
                    </div>
                  </section>

                  <section className="rounded-[1.75rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.10] to-white/[0.025] p-4 shadow-inner shadow-cyan-950/20 sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-200">Gegner</p>
                      <p className="text-xs font-bold text-zinc-500">gegnerische Werte</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <StatInput label="Average" value={opponentAverageInput} onChange={setOpponentAverageInput} placeholder="82.10" required />
                      <StatInput label="180er" value={opponentOneEighties} onChange={setOpponentOneEighties} placeholder="0" step="1" required />
                    </div>
                  </section>
                </div>
                {!statsAreValid && (myAverage || opponentAverageInput || myOneEighties || opponentOneEighties) && (
                  <p className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.08] p-3 text-center text-sm font-bold text-amber-100">
                    Bitte alle vier Statistikfelder korrekt ausfüllen. Average muss zwischen 0 und 180 liegen, 180er müssen ganze Zahlen sein.
                  </p>
                )}
              </div>

              {/* Live-Preview */}
              {resultIsValid && (
                <div
                  className={`flex flex-col items-start justify-between gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:p-5 ${
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
                  <span className="text-right text-sm font-bold text-zinc-400">
                    {myAverage && <>Du Ø {Number.parseFloat(myAverage).toFixed(2)}</>}<br />
                    {opponentAverageInput && <>Gegner Ø {Number.parseFloat(opponentAverageInput).toFixed(2)}</>}
                  </span>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={submitResult}
                disabled={loading || !canSubmitResult}
                className="sticky bottom-3 z-20 min-h-16 w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-4 py-4 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[0_16px_50px_rgba(34,197,94,0.25)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 sm:rounded-3xl sm:py-5 sm:text-lg sm:tracking-[0.16em] lg:static"
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
          <div className="rounded-[1.75rem] border border-cyan-300/15 bg-zinc-950/85 shadow-2xl backdrop-blur-2xl sm:rounded-[2.5rem]">
            <div className="flex flex-col items-center px-5 py-10 text-center sm:px-8 sm:py-12">
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
              <div className="mt-6 grid w-full max-w-md grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-600">Dein Average / 180er</p>
                  <p className="mt-1 font-black text-white">{submittedData?.myAvg != null ? submittedData.myAvg.toFixed(2) : '–'} · {submittedData?.my180s ?? 0}×180</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-600">Gegner Average / 180er</p>
                  <p className="mt-1 font-black text-white">{submittedData?.oppAvg != null ? submittedData.oppAvg.toFixed(2) : '–'} · {submittedData?.opp180s ?? 0}×180</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STATE: awaiting_confirmation — Gegner bestätigt / widerspricht
        ══════════════════════════════════════════════════════════════ */}
        {match?.status === 'awaiting_confirmation' && needsMyConfirmation && (
          <div className="space-y-5">
            {/* Eingereichte Daten */}
            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/85 shadow-2xl backdrop-blur-2xl sm:rounded-[2.5rem]">
              <div className="border-b border-white/10 px-5 py-6 sm:px-8 sm:py-7">
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-300">
                  Eingereicht von {submittedData?.submitterName}
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.06em] sm:text-4xl">Ergebnis bestätigen</h2>
              </div>

              {/* Scoreboard */}
              <div className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-center px-4 py-7 sm:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] sm:px-8 sm:py-8">
                <div className="min-w-0 text-center">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Du</p>
                  <p className="mt-2 text-6xl font-black leading-none tabular-nums tracking-[-0.1em] text-white sm:text-8xl">
                    {submittedData?.myLegs ?? '–'}
                  </p>
                </div>
                <span className="text-center text-3xl font-black text-zinc-700 sm:text-5xl">:</span>
                <div className="min-w-0 text-center">
                  <p className="truncate text-xs font-black uppercase tracking-[0.14em] text-zinc-500" title={opponentUsername}>{opponentUsername}</p>
                  <p className="mt-2 text-6xl font-black leading-none tabular-nums tracking-[-0.1em] text-zinc-300 sm:text-8xl">
                    {submittedData?.oppLegs ?? '–'}
                  </p>
                </div>
              </div>

              {/* Gewinner + eingereichte Statistiken */}
              <div className="grid gap-px border-t border-white/10 bg-white/10 md:grid-cols-3">
                <div className="bg-zinc-950 px-6 py-4 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Gewinner</p>
                  <p className="mt-1 font-black text-emerald-300">{submittedData?.winnerName}</p>
                </div>
                <div className="bg-zinc-950 px-6 py-4 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Dein Average / 180er</p>
                  <p className="mt-1 font-black text-white">
                    {submittedData?.myAvg != null ? submittedData.myAvg.toFixed(2) : '–'} · {submittedData?.my180s ?? 0}×180
                  </p>
                </div>
                <div className="bg-zinc-950 px-6 py-4 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Gegner Average / 180er</p>
                  <p className="mt-1 font-black text-white">
                    {submittedData?.oppAvg != null ? submittedData.oppAvg.toFixed(2) : '–'} · {submittedData?.opp180s ?? 0}×180
                  </p>
                </div>
              </div>

              {/* Confirm button */}
              <div className="px-4 pb-5 pt-5 sm:px-8 sm:pb-8 sm:pt-6">
                <button
                  onClick={confirmResult}
                  disabled={loading}
                  className="min-h-16 w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-4 py-4 text-sm font-black uppercase tracking-[0.11em] text-black shadow-[0_16px_50px_rgba(34,197,94,0.2)] transition hover:-translate-y-0.5 disabled:opacity-40 sm:rounded-3xl sm:py-5 sm:text-lg sm:tracking-[0.16em]"
                >
                  {loading ? 'Wird bestätigt…' : 'Ergebnis bestätigen & Elo vergeben'}
                </button>
              </div>
            </div>

            {/* Dispute-Bereich */}
            <div className="overflow-hidden rounded-[1.75rem] border border-red-400/15 bg-zinc-950/85 shadow-2xl backdrop-blur-2xl sm:rounded-[2.5rem]">
              <div className="border-b border-white/[0.06] px-5 py-5 sm:px-8 sm:py-6">
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

              <div className="space-y-5 px-5 py-6 sm:px-8 sm:py-7">
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
          <div className="rounded-[1.75rem] border border-emerald-300/15 bg-zinc-950/85 shadow-2xl backdrop-blur-2xl sm:rounded-[2.5rem]">
            <div className="flex flex-col items-center px-5 py-10 text-center sm:px-8 sm:py-14">
              <div className="grid h-20 w-20 place-items-center rounded-3xl border border-emerald-300/25 bg-emerald-400/10">
                <CheckCircle2 className="h-10 w-10 text-emerald-200" />
              </div>
              <h2 className="mt-6 text-3xl font-black tracking-[-0.05em]">Match abgeschlossen</h2>
              <p className="mx-auto mt-4 max-w-sm text-zinc-400">
                Das Ergebnis wurde bestätigt. Elo wurde vergeben. Du wirst zur History weitergeleitet…
              </p>
              <button
                onClick={() => router.push('/history')}
                className="mt-8 min-h-14 w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-4 font-black uppercase tracking-[0.14em] text-black sm:w-auto sm:rounded-3xl"
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
          <div className="rounded-[1.75rem] border border-amber-300/15 bg-zinc-950/85 shadow-2xl backdrop-blur-2xl sm:rounded-[2.5rem]">
            <div className="flex flex-col items-center px-5 py-10 text-center sm:px-8 sm:py-14">
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

        {/* ════════════════════════════════════════════════════════════
            STATE: cancelled
        ════════════════════════════════════════════════════════════ */}
        {match?.status === 'cancelled' && (
          <div className="rounded-[1.75rem] border border-red-400/15 bg-zinc-950/85 shadow-2xl backdrop-blur-2xl sm:rounded-[2.5rem]">
            <div className="flex flex-col items-center px-5 py-10 text-center sm:px-8 sm:py-14">
              <div className="grid h-20 w-20 place-items-center rounded-3xl border border-red-400/25 bg-red-500/10">
                <XCircle className="h-10 w-10 text-red-300" />
              </div>
              <h2 className="mt-6 text-3xl font-black tracking-[-0.05em]">Match abgebrochen</h2>
              <p className="mx-auto mt-4 max-w-sm text-zinc-400">
                Dieses Match wurde durch einen Administrator abgebrochen. Es wird keine Elo vergeben.
              </p>
              <button
                onClick={() => router.push('/matchmaking')}
                className="mt-8 min-h-14 w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-4 font-black uppercase tracking-[0.14em] text-black sm:w-auto sm:rounded-3xl"
              >
                Neues Match suchen
              </button>
            </div>
          </div>
        )}

          </div>

          <aside className="min-w-0 lg:sticky lg:top-24">
        {/* ════════════════════════════════════════════════════════════
            MATCHROOM CHAT
        ════════════════════════════════════════════════════════════ */}
        {match && (
          <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/85 shadow-2xl shadow-black/60 backdrop-blur-2xl sm:rounded-[2rem]">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-emerald-400/[0.07] to-white/[0.02] px-4 py-4 sm:px-6">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10">
                <MessageCircle className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Matchroom</div>
                <div className="truncate text-sm font-bold text-zinc-300">
                  {match.player1_username} &amp; {match.player2_username}
                </div>
              </div>
              {isAdmin && !(currentUserId === match.player1_id || currentUserId === match.player2_id) && (
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-red-300">
                  <Gavel className="h-3 w-3" />
                  Admin-Ansicht
                </span>
              )}
            </div>

            {/* Nachrichtenliste */}
            <div className="flex h-72 flex-col gap-2 overflow-y-auto px-4 py-4 sm:h-80 lg:h-[27rem] lg:px-5">
              {chatMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <MessageCircle className="h-8 w-8 text-zinc-700" />
                  <p className="text-sm font-semibold text-zinc-600">Noch keine Nachrichten.</p>
                  <p className="text-xs text-zinc-700">Schreib deinem Gegner!</p>
                </div>
              ) : (
                chatMessages.map((msg) => {
                  const isMe = msg.user_id === currentUserId;
                  const isAdminMsg = Boolean(msg.is_admin_message);
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col gap-0.5 ${
                        isAdminMsg ? 'items-center' : isMe ? 'items-end' : 'items-start'
                      }`}
                    >
                      <span className={`flex items-center gap-1.5 px-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                        isAdminMsg ? 'text-red-400' : 'text-zinc-600'
                      }`}>
                        {isAdminMsg ? '⚖ Admin' : isMe ? 'Du' : msg.username}
                        <span className="font-normal normal-case tracking-normal text-zinc-700">{formatChatTime(msg.created_at)}</span>
                      </span>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm font-semibold leading-relaxed ${
                          isAdminMsg
                            ? 'rounded-sm border border-red-400/25 bg-red-500/10 text-red-100 text-center'
                            : isMe
                            ? 'rounded-br-sm bg-emerald-400/15 text-emerald-100'
                            : 'rounded-bl-sm bg-white/[0.07] text-zinc-200'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Eingabefeld */}
            <div className="border-t border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Nachricht schreiben..."
                  maxLength={300}
                  disabled={chatSending}
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/40 focus:bg-white/[0.07] disabled:opacity-50"
                />
                <button
                  onClick={() => void sendChatMessage()}
                  disabled={!chatInput.trim() || chatSending}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300 transition hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
          </aside>
        </div>

        {/* ════════════════════════════════════════════════════════════
            ADMIN-TOOLS (nur für Admins sichtbar)
        ════════════════════════════════════════════════════════════ */}
        {isAdmin && match && (
          <div className="mt-6 overflow-hidden rounded-[2.5rem] border border-red-400/20 bg-red-500/[0.04] shadow-2xl shadow-black/60 backdrop-blur-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-red-400/15 bg-red-500/[0.04] px-6 py-4">
              <Gavel className="h-5 w-5 text-red-300" />
              <div>
                <div className="text-xs font-black uppercase tracking-[0.28em] text-red-300">Admin-Tools</div>
                <div className="text-sm font-bold text-zinc-400">Nur für Administratoren sichtbar</div>
              </div>
            </div>

            <div className="space-y-5 px-6 py-5">
              {adminPendingAction && (
                <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm font-semibold leading-6 text-amber-100">
                  <div className="font-black uppercase tracking-[0.18em] text-amber-200">Bestätigung ausstehend</div>
                  <p className="mt-2 text-amber-100/90">Klicke den hervorgehobenen Aktionsbutton erneut, um die Aktion ohne Browser-Popup auszuführen.</p>
                  <button
                    type="button"
                    onClick={() => { setAdminPendingAction(null); setInfoMessage(''); }}
                    className="mt-3 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-black text-zinc-200 transition hover:bg-white/10"
                  >
                    Abbrechen
                  </button>
                </div>
              )}
              {/* Match-Info */}
              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs">
                <div>
                  <div className="text-zinc-500">Match-ID</div>
                  <div className="mt-0.5 font-mono text-zinc-300 break-all">{match.id}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Status</div>
                  <div className="mt-0.5 font-black text-zinc-200 uppercase">{match.status}</div>
                </div>
              </div>

              {/* Ergebnis erzwingen */}
              {match.status !== 'completed' && match.status !== 'cancelled' && (
                <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] p-4">
                  <div className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-amber-300">Gewinner manuell setzen</div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <select
                      value={adminWinnerId}
                      onChange={(e) => setAdminWinnerId(e.target.value)}
                      className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark] focus:border-amber-300/40"
                    >
                      <option value={match.player1_id}>{match.player1_username} ({match.player1_elo} Elo)</option>
                      <option value={match.player2_id}>{match.player2_username} ({match.player2_elo} Elo)</option>
                    </select>
                    <button
                      onClick={adminForceResult}
                      disabled={adminForcing}
                      className="shrink-0 rounded-xl border border-amber-300/25 bg-amber-400/10 px-4 py-2.5 text-sm font-black text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-40"
                    >
                      {adminForcing ? 'Wird gesetzt...' : adminPendingAction === 'force_result' ? 'Jetzt endgültig bestätigen' : 'Ergebnis setzen & Elo vergeben'}
                    </button>
                  </div>
                </div>
              )}

              {/* Match abbrechen */}
              {match.status !== 'completed' && match.status !== 'cancelled' && (
                <div className="rounded-2xl border border-red-400/15 bg-red-500/[0.05] p-4">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-red-300">Match abbrechen</div>
                  <p className="mb-3 text-xs text-zinc-500">Bricht das Match ohne Elo-Wertung ab. Beide Spieler können danach neu suchen.</p>
                  <button
                    onClick={adminForceCancel}
                    disabled={adminCancelling}
                    className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm font-black text-red-200 transition hover:bg-red-500/15 disabled:opacity-40"
                  >
                    {adminCancelling ? 'Wird abgebrochen...' : adminPendingAction === 'cancel' ? 'Abbruch endgültig bestätigen' : 'Match ohne Wertung abbrechen'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </section>
    </main>
  );
}
