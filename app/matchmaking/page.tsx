'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Radar, ShieldCheck, Swords, Timer, Users, XCircle, Menu, X, Zap, UserCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type MatchmakingStatus = 'idle' | 'selecting' | 'searching' | 'accepting' | 'found' | 'error';
type AppChoice = 'scolia' | 'dartcounter';

type MatchmakingResponse = {
  match_id: string | null;
  opponent_user_id: string | null;
  opponent_username: string | null;
  opponent_elo: number | null;
  player_elo: number | null;
  match_status: 'searching' | 'matched' | 'pending_accept' | 'already_in_match';
};

type Opponent = {
  username: string;
  elo: number;
};

type LiveMatch = {
  id: string;
  player1_username: string;
  player2_username: string;
  player1_elo: number;
  player2_elo: number;
  status: string;
  created_at: string;
};

const searchSteps = [
  { time: '0–20s', range: '±100 Elo', label: 'Sehr nahes Skill-Level' },
  { time: '20–40s', range: '±200 Elo', label: 'Erweiterte Suche' },
  { time: '40–60s', range: '±350 Elo', label: 'Breiter Spielerpool' },
  { time: '60s+', range: '±600 Elo', label: 'Maximale Reichweite' },
];

const appConfig = {
  scolia: {
    label: 'Scolia',
    description: '',
    color: 'emerald',
    icon: '📷',
    borderActive: 'border-emerald-300/50 bg-emerald-400/[0.10]',
    borderHover: 'hover:border-emerald-300/30 hover:bg-emerald-400/[0.06]',
    badge: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200',
    button: 'from-emerald-400 via-lime-300 to-emerald-400',
    queueLabel: 'text-emerald-300',
    dot: 'bg-emerald-300',
  },
  dartcounter: {
    label: 'DartCounter',
    description: '',
    color: 'cyan',
    icon: '📱',
    borderActive: 'border-cyan-300/50 bg-cyan-400/[0.10]',
    borderHover: 'hover:border-cyan-300/30 hover:bg-cyan-400/[0.06]',
    badge: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-200',
    button: 'from-cyan-400 via-sky-300 to-cyan-400',
    queueLabel: 'text-cyan-300',
    dot: 'bg-cyan-300',
  },
} as const;

export default function Matchmaking() {
  const [phoneVerified, setPhoneVerified] = useState<boolean | null>(null);
  const [smsVerificationEnabled, setSmsVerificationEnabled] = useState(true);
  const [scoliaUsername, setScoliaUsername] = useState<string | null>(null);
  const [dartcounterUsername, setDartcounterUsername] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [status, setStatus] = useState<MatchmakingStatus>('idle');
  const [selectedApp, setSelectedApp] = useState<AppChoice | null>(null);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [queueCounts, setQueueCounts] = useState<Record<AppChoice, number>>({ scolia: 0, dartcounter: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);

  // Accept-State
  const [acceptMatchId, setAcceptMatchId] = useState<string | null>(null);
  const [acceptCountdown, setAcceptCountdown] = useState(30);
  const [iHaveAccepted, setIHaveAccepted] = useState(false);
  const [opponentAccepted, setOpponentAccepted] = useState(false);
  const [acceptDeclineLoading, setAcceptDeclineLoading] = useState(false);
  const acceptIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acceptExpireCalledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const lastMatchSoundIdRef = useRef<string | null>(null);

  const [opponentDeclined, setOpponentDeclined] = useState(false);

  // Toast-Benachrichtigung
  const [toast, setToast] = useState<{ message: string; type: 'warning' | 'info' } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: 'warning' | 'info' = 'warning') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  };
  const isPollingRef = useRef(false);
  const statusRef = useRef<MatchmakingStatus>('idle');
  const selectedAppRef = useRef<AppChoice | null>(null);
  const userIdRef = useRef<string | null>(null);
  const iHaveAcceptedRef = useRef(false);
  const opponentDeclineHandledRef = useRef(false);
  const skipCancelOnSearchingExitRef = useRef(false);
  const pollForMatchRef = useRef<((seconds: number) => Promise<void>) | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { selectedAppRef.current = selectedApp; }, [selectedApp]);
  useEffect(() => { iHaveAcceptedRef.current = iHaveAccepted; }, [iHaveAccepted]);

  const getMaxEloDiff = (seconds: number) => {
    if (seconds < 20) return 100;
    if (seconds < 40) return 200;
    if (seconds < 60) return 350;
    return 600;
  };

  const searchProgress = Math.min((elapsedSeconds / 60) * 100, 100);
  const currentRange = getMaxEloDiff(elapsedSeconds);
  const effectivePhoneVerified = phoneVerified === null ? null : (!smsVerificationEnabled || phoneVerified === true);

  const unlockMatchFoundSound = useCallback(() => {
    if (typeof window === 'undefined' || audioUnlockedRef.current) return;
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const audioContext = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = audioContext;
    void audioContext.resume().then(() => {
      audioUnlockedRef.current = true;
    }).catch(() => {
      audioUnlockedRef.current = false;
    });
  }, []);

  const playMatchFoundSound = useCallback((matchId?: string | null) => {
    if (typeof window === 'undefined') return;
    if (matchId && lastMatchSoundIdRef.current === matchId) return;
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const audioContext = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = audioContext;
    const play = () => {
      const now = audioContext.currentTime;
      const masterGain = audioContext.createGain();
      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
      masterGain.connect(audioContext.destination);
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const noteGain = audioContext.createGain();
        const start = now + index * 0.14;
        const end = start + 0.18;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        noteGain.gain.setValueAtTime(0.0001, start);
        noteGain.gain.exponentialRampToValueAtTime(1, start + 0.02);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(noteGain);
        noteGain.connect(masterGain);
        oscillator.start(start);
        oscillator.stop(end + 0.03);
      });
      if (matchId) lastMatchSoundIdRef.current = matchId;
    };
    if (audioContext.state === 'suspended') {
      void audioContext.resume().then(play).catch(() => undefined);
      return;
    }
    play();
  }, []);

  const redirectToResult = useCallback((matchId: string) => {
    setTimeout(() => router.push(`/result?matchId=${matchId}`), 1500);
  }, [router]);

  const startAcceptCountdown = useCallback((matchId: string, deadlineIso?: string) => {
    if (acceptIntervalRef.current) clearInterval(acceptIntervalRef.current);
    acceptExpireCalledRef.current = false;
    opponentDeclineHandledRef.current = false;
    const deadline = deadlineIso ? new Date(deadlineIso).getTime() : Date.now() + 30_000;
    const calcRemaining = () => Math.max(0, Math.round((deadline - Date.now()) / 1000));
    setAcceptCountdown(calcRemaining());
    acceptIntervalRef.current = setInterval(async () => {
      const remaining = calcRemaining();
      setAcceptCountdown(remaining);
      if (remaining <= 0 && !acceptExpireCalledRef.current) {
        acceptExpireCalledRef.current = true;
        clearInterval(acceptIntervalRef.current!);
        try {
          await supabase.rpc('expire_match_accept', { p_match_id: matchId });
        } catch (err) {
          console.error('expire_match_accept fehlgeschlagen:', err);
        }
        setStatus('searching');
        setAcceptMatchId(null);
        setIHaveAccepted(false);
        setOpponentAccepted(false);
        setOpponentDeclined(false);
      }
    }, 500);
  }, [supabase]);

  const handleAccept = async () => {
    if (!acceptMatchId || acceptDeclineLoading) return;
    setAcceptDeclineLoading(true);
    try {
      const { data, error } = await supabase.rpc('accept_match', { p_match_id: acceptMatchId });
      if (error) throw error;
      const result = data as { status: string; match_id?: string } | null;
      setIHaveAccepted(true);
      iHaveAcceptedRef.current = true;
      if (result?.status === 'both_accepted' && result.match_id) {
        if (acceptIntervalRef.current) clearInterval(acceptIntervalRef.current);
        playMatchFoundSound(result.match_id);
        setStatus('found');
        redirectToResult(result.match_id);
      }
    } catch (err) {
      console.error('accept_match fehlgeschlagen:', err);
    } finally {
      setAcceptDeclineLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!acceptMatchId || acceptDeclineLoading) return;
    setAcceptDeclineLoading(true);
    try {
      const { error } = await supabase.rpc('decline_match', { p_match_id: acceptMatchId });
      if (error) throw error;
    } catch (err) {
      console.error('decline_match fehlgeschlagen:', err);
    } finally {
      if (acceptIntervalRef.current) clearInterval(acceptIntervalRef.current);
      setAcceptMatchId(null);
      setIHaveAccepted(false);
      setOpponentAccepted(false);
      setOpponentDeclined(false);
      setAcceptDeclineLoading(false);
      setStatus('idle');
    }
  };

  const fetchQueueCounts = useCallback(async () => {
    const [{ count: scoliaCount }, { count: dartCount }] = await Promise.all([
      supabase.from('matchmaking_queue').select('*', { count: 'exact', head: true }).eq('app', 'scolia'),
      supabase.from('matchmaking_queue').select('*', { count: 'exact', head: true }).eq('app', 'dartcounter'),
    ]);
    setQueueCounts({
      scolia: scoliaCount || 0,
      dartcounter: dartCount || 0,
    });
  }, [supabase]);

  const fetchLiveMatches = useCallback(async () => {
    const { data } = await supabase
      .from('active_matches')
      .select('id, player1_username, player2_username, player1_elo, player2_elo, status, created_at')
      .in('status', ['pending_result', 'awaiting_confirmation'])
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setLiveMatches(data as LiveMatch[]);
  }, [supabase]);

  const pollForMatch = useCallback(async (seconds: number) => {
    if (isPollingRef.current || statusRef.current !== 'searching') return;
    const app = selectedAppRef.current;
    if (!app) return;

    isPollingRef.current = true;
    const maxEloDiff = getMaxEloDiff(seconds);

    try {
      const { data, error } = await supabase.rpc('check_and_join_queue', {
        p_max_elo_diff: maxEloDiff,
        p_app: app,
      });

      if (statusRef.current !== 'searching') return;
      if (error) throw error;

      const result = Array.isArray(data) ? data[0] as MatchmakingResponse | undefined : data as MatchmakingResponse | undefined;

      await fetchQueueCounts();

      if (result?.match_status === 'pending_accept' && result.match_id) {
        playMatchFoundSound(result.match_id);
        setAcceptMatchId(result.match_id);
        setIHaveAccepted(false);
        setOpponentAccepted(false);
        setOpponentDeclined(false);
        setStatus('accepting');
        startAcceptCountdown(result.match_id);
      }
    } catch (error) {
      if (statusRef.current === 'searching') {
        const msg = error instanceof Error ? error.message : 'Matchmaking konnte nicht gestartet werden.';
        setErrorMessage(msg);
        setStatus('error');
      }
    } finally {
      isPollingRef.current = false;
    }
  }, [fetchQueueCounts, playMatchFoundSound, startAcceptCountdown, supabase]);

  useEffect(() => { pollForMatchRef.current = pollForMatch; }, [pollForMatch]);

  const startSearch = async (app: AppChoice) => {
    setErrorMessage('');
    setOpponent(null);

    if (!effectivePhoneVerified) {
      setErrorMessage('Bitte bestätige zuerst deine Handynummer.');
      router.push('/auth/verify-phone');
      return;
    }

    if (app === 'scolia' && !scoliaUsername) {
      setErrorMessage('Du musst zuerst deinen Scolia-Nutzernamen im Profil hinterlegen.');
      setStatus('error');
      return;
    }
    if (app === 'dartcounter' && !dartcounterUsername) {
      setErrorMessage('Du musst zuerst deinen DartCounter-Nutzernamen im Profil hinterlegen.');
      setStatus('error');
      return;
    }

    unlockMatchFoundSound();
    lastMatchSoundIdRef.current = null;
    setSelectedApp(app);
    selectedAppRef.current = app;
    setElapsedSeconds(0);
    statusRef.current = 'searching';
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
      setSelectedApp(null);
      setElapsedSeconds(0);
      await fetchQueueCounts();
    }
  };

  // Auth-Check + Profil laden + Queue-Counts
  useEffect(() => {
    let isMounted = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }
      const uid = session.user.id;
      userIdRef.current = uid;

      const { data: activeMatch } = await supabase
        .from('active_matches')
        .select('id, status, accept_deadline')
        .or(`player1_id.eq.${uid},player2_id.eq.${uid}`)
        .in('status', ['pending_accept', 'pending_result', 'awaiting_confirmation'])
        .maybeSingle();

      if (!isMounted) return;

      if (activeMatch?.id) {
        if (activeMatch.status === 'pending_accept') {
          const deadline = activeMatch.accept_deadline as string | null;
          const remaining = deadline
            ? Math.max(0, Math.round((new Date(deadline).getTime() - Date.now()) / 1000))
            : 0;
          if (remaining > 0) {
            setAcceptMatchId(activeMatch.id);
            setIHaveAccepted(false);
            setOpponentAccepted(false);
            setOpponentDeclined(false);
            setStatus('accepting');
            setPageLoading(false);
            startAcceptCountdown(activeMatch.id, deadline ?? undefined);
            return;
          }
        } else {
          router.replace(`/result?matchId=${activeMatch.id}`);
          return;
        }
      }

      const { data: smsSetting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'sms_verification')
        .maybeSingle();

      const smsEnabled = (smsSetting?.value as { enabled?: boolean } | null)?.enabled !== false;
      setSmsVerificationEnabled(smsEnabled);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('phone_verified, scolia_username, dartcounter_username')
        .eq('supabaseId', uid)
        .single();

      if (!isMounted) return;
      setPhoneVerified(!smsEnabled || Boolean(profileData?.phone_verified));
      setScoliaUsername(profileData?.scolia_username ?? null);
      setDartcounterUsername(profileData?.dartcounter_username ?? null);
      
      setPageLoading(false);
      void fetchQueueCounts();
      void fetchLiveMatches();
    }
    void init();
    return () => { isMounted = false; };
  }, [supabase, router, fetchQueueCounts, fetchLiveMatches, startAcceptCountdown]);

  // Realtime: Live-Matches
  useEffect(() => {
    const channel = supabase
      .channel('live-matches-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_matches' }, () => {
        void fetchLiveMatches();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, fetchLiveMatches]);

  // Realtime + Polling während der Suche
  useEffect(() => {
    if (status !== 'searching') return;

    const channel = supabase
      .channel('match-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'active_matches' }, (payload) => {
        const newMatch = payload.new;
        const uid = userIdRef.current;
        if (uid && (newMatch.player1_id === uid || newMatch.player2_id === uid)) {
          if (newMatch.status === 'pending_accept') {
            playMatchFoundSound(newMatch.id);
            setAcceptMatchId(newMatch.id);
            setIHaveAccepted(false);
            iHaveAcceptedRef.current = false;
            setOpponentAccepted(false);
            setOpponentDeclined(false);
            setStatus('accepting');
            startAcceptCountdown(newMatch.id, newMatch.accept_deadline);
          } else {
            const isPlayer1 = newMatch.player1_id === uid;
            setOpponent({
              username: isPlayer1 ? newMatch.player2_username : newMatch.player1_username,
              elo: isPlayer1 ? newMatch.player2_elo : newMatch.player1_elo,
            });
            playMatchFoundSound(newMatch.id);
            setStatus('found');
            redirectToResult(newMatch.id);
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'active_matches' }, (payload) => {
        const updatedMatch = payload.new;
        const uid = userIdRef.current;
        if (!uid || !(updatedMatch.player1_id === uid || updatedMatch.player2_id === uid)) return;
        const isPlayer1 = updatedMatch.player1_id === uid;
        if (updatedMatch.status === 'pending_accept') {
          const oppAccepted = isPlayer1 ? updatedMatch.player2_accepted : updatedMatch.player1_accepted;
          setOpponentAccepted(Boolean(oppAccepted));
        }
        if (updatedMatch.status === 'pending_result') {
          if (acceptIntervalRef.current) clearInterval(acceptIntervalRef.current);
          playMatchFoundSound(updatedMatch.id);
          setStatus('found');
          redirectToResult(updatedMatch.id);
        }
      })
      .subscribe();

    const pollingInterval = setInterval(() => {
      setElapsedSeconds((current) => {
        const next = current + 2;
        void pollForMatchRef.current?.(next);
        return next;
      });
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollingInterval);
      if (!skipCancelOnSearchingExitRef.current) {
        void supabase.rpc('cancel_matchmaking');
      }
      skipCancelOnSearchingExitRef.current = false;
    };
  }, [status, supabase, redirectToResult, playMatchFoundSound, startAcceptCountdown]);
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Radar, ShieldCheck, Swords, Timer, Users, XCircle, Menu, X, Zap, UserCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type MatchmakingStatus = 'idle' | 'selecting' | 'searching' | 'accepting' | 'found' | 'error';
type AppChoice = 'scolia' | 'dartcounter';

type MatchmakingResponse = {
  match_id: string | null;
  opponent_user_id: string | null;
  opponent_username: string | null;
  opponent_elo: number | null;
  player_elo: number | null;
  match_status: 'searching' | 'matched' | 'pending_accept' | 'already_in_match';
};

type Opponent = {
  username: string;
  elo: number;
};

type LiveMatch = {
  id: string;
  player1_username: string;
  player2_username: string;
  player1_elo: number;
  player2_elo: number;
  status: string;
  created_at: string;
};

const searchSteps = [
  { time: '0–20s', range: '±100 Elo', label: 'Sehr nahes Skill-Level' },
  { time: '20–40s', range: '±200 Elo', label: 'Erweiterte Suche' },
  { time: '40–60s', range: '±350 Elo', label: 'Breiter Spielerpool' },
  { time: '60s+', range: '±600 Elo', label: 'Maximale Reichweite' },
];

const appConfig = {
  scolia: {
    label: 'Scolia',
    description: '',
    color: 'emerald',
    icon: '📷',
    borderActive: 'border-emerald-300/50 bg-emerald-400/[0.10]',
    borderHover: 'hover:border-emerald-300/30 hover:bg-emerald-400/[0.06]',
    badge: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200',
    button: 'from-emerald-400 via-lime-300 to-emerald-400',
    queueLabel: 'text-emerald-300',
    dot: 'bg-emerald-300',
  },
  dartcounter: {
    label: 'DartCounter',
    description: '',
    color: 'cyan',
    icon: '📱',
    borderActive: 'border-cyan-300/50 bg-cyan-400/[0.10]',
    borderHover: 'hover:border-cyan-300/30 hover:bg-cyan-400/[0.06]',
    badge: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-200',
    button: 'from-cyan-400 via-sky-300 to-cyan-400',
    queueLabel: 'text-cyan-300',
    dot: 'bg-cyan-300',
  },
} as const;

export default function Matchmaking() {
  const [phoneVerified, setPhoneVerified] = useState<boolean | null>(null);
  const [smsVerificationEnabled, setSmsVerificationEnabled] = useState(true);
  const [scoliaUsername, setScoliaUsername] = useState<string | null>(null);
  const [dartcounterUsername, setDartcounterUsername] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [status, setStatus] = useState<MatchmakingStatus>('idle');
  const [selectedApp, setSelectedApp] = useState<AppChoice | null>(null);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [queueCounts, setQueueCounts] = useState<Record<AppChoice, number>>({ scolia: 0, dartcounter: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);

  // Accept-State
  const [acceptMatchId, setAcceptMatchId] = useState<string | null>(null);
  const [acceptCountdown, setAcceptCountdown] = useState(30);
  const [iHaveAccepted, setIHaveAccepted] = useState(false);
  const [opponentAccepted, setOpponentAccepted] = useState(false);
  const [acceptDeclineLoading, setAcceptDeclineLoading] = useState(false);
  const acceptIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acceptExpireCalledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const lastMatchSoundIdRef = useRef<string | null>(null);

  const [opponentDeclined, setOpponentDeclined] = useState(false);

  // Toast-Benachrichtigung
  const [toast, setToast] = useState<{ message: string; type: 'warning' | 'info' } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: 'warning' | 'info' = 'warning') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  };
  const isPollingRef = useRef(false);
  const statusRef = useRef<MatchmakingStatus>('idle');
  const selectedAppRef = useRef<AppChoice | null>(null);
  const userIdRef = useRef<string | null>(null);
  const iHaveAcceptedRef = useRef(false);
  const opponentDeclineHandledRef = useRef(false);
  const skipCancelOnSearchingExitRef = useRef(false);
  const pollForMatchRef = useRef<((seconds: number) => Promise<void>) | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { selectedAppRef.current = selectedApp; }, [selectedApp]);
  useEffect(() => { iHaveAcceptedRef.current = iHaveAccepted; }, [iHaveAccepted]);

  const getMaxEloDiff = (seconds: number) => {
    if (seconds < 20) return 100;
    if (seconds < 40) return 200;
    if (seconds < 60) return 350;
    return 600;
  };

  const searchProgress = Math.min((elapsedSeconds / 60) * 100, 100);
  const currentRange = getMaxEloDiff(elapsedSeconds);
  const effectivePhoneVerified = phoneVerified === null ? null : (!smsVerificationEnabled || phoneVerified === true);

  const unlockMatchFoundSound = useCallback(() => {
    if (typeof window === 'undefined' || audioUnlockedRef.current) return;
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const audioContext = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = audioContext;
    void audioContext.resume().then(() => {
      audioUnlockedRef.current = true;
    }).catch(() => {
      audioUnlockedRef.current = false;
    });
  }, []);

  const playMatchFoundSound = useCallback((matchId?: string | null) => {
    if (typeof window === 'undefined') return;
    if (matchId && lastMatchSoundIdRef.current === matchId) return;
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const audioContext = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = audioContext;
    const play = () => {
      const now = audioContext.currentTime;
      const masterGain = audioContext.createGain();
      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
      masterGain.connect(audioContext.destination);
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const noteGain = audioContext.createGain();
        const start = now + index * 0.14;
        const end = start + 0.18;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        noteGain.gain.setValueAtTime(0.0001, start);
        noteGain.gain.exponentialRampToValueAtTime(1, start + 0.02);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(noteGain);
        noteGain.connect(masterGain);
        oscillator.start(start);
        oscillator.stop(end + 0.03);
      });
      if (matchId) lastMatchSoundIdRef.current = matchId;
    };
    if (audioContext.state === 'suspended') {
      void audioContext.resume().then(play).catch(() => undefined);
      return;
    }
    play();
  }, []);

  const redirectToResult = useCallback((matchId: string) => {
    setTimeout(() => router.push(`/result?matchId=${matchId}`), 1500);
  }, [router]);

  const startAcceptCountdown = useCallback((matchId: string, deadlineIso?: string) => {
    if (acceptIntervalRef.current) clearInterval(acceptIntervalRef.current);
    acceptExpireCalledRef.current = false;
    opponentDeclineHandledRef.current = false;
    const deadline = deadlineIso ? new Date(deadlineIso).getTime() : Date.now() + 30_000;
    const calcRemaining = () => Math.max(0, Math.round((deadline - Date.now()) / 1000));
    setAcceptCountdown(calcRemaining());
    acceptIntervalRef.current = setInterval(async () => {
      const remaining = calcRemaining();
      setAcceptCountdown(remaining);
      if (remaining <= 0 && !acceptExpireCalledRef.current) {
        acceptExpireCalledRef.current = true;
        clearInterval(acceptIntervalRef.current!);
        try {
          await supabase.rpc('expire_match_accept', { p_match_id: matchId });
        } catch (err) {
          console.error('expire_match_accept fehlgeschlagen:', err);
        }
        setStatus('searching');
        setAcceptMatchId(null);
        setIHaveAccepted(false);
        setOpponentAccepted(false);
        setOpponentDeclined(false);
      }
    }, 500);
  }, [supabase]);

  const handleAccept = async () => {
    if (!acceptMatchId || acceptDeclineLoading) return;
    setAcceptDeclineLoading(true);
    try {
      const { data, error } = await supabase.rpc('accept_match', { p_match_id: acceptMatchId });
      if (error) throw error;
      const result = data as { status: string; match_id?: string } | null;
      setIHaveAccepted(true);
      iHaveAcceptedRef.current = true;
      if (result?.status === 'both_accepted' && result.match_id) {
        if (acceptIntervalRef.current) clearInterval(acceptIntervalRef.current);
        playMatchFoundSound(result.match_id);
        setStatus('found');
        redirectToResult(result.match_id);
      }
    } catch (err) {
      console.error('accept_match fehlgeschlagen:', err);
    } finally {
      setAcceptDeclineLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!acceptMatchId || acceptDeclineLoading) return;
    setAcceptDeclineLoading(true);
    try {
      const { error } = await supabase.rpc('decline_match', { p_match_id: acceptMatchId });
      if (error) throw error;
    } catch (err) {
      console.error('decline_match fehlgeschlagen:', err);
    } finally {
      if (acceptIntervalRef.current) clearInterval(acceptIntervalRef.current);
      setAcceptMatchId(null);
      setIHaveAccepted(false);
      setOpponentAccepted(false);
      setOpponentDeclined(false);
      setAcceptDeclineLoading(false);
      setStatus('idle');
    }
  };

  const fetchQueueCounts = useCallback(async () => {
    const [{ count: scoliaCount }, { count: dartCount }] = await Promise.all([
      supabase.from('matchmaking_queue').select('*', { count: 'exact', head: true }).eq('app', 'scolia'),
      supabase.from('matchmaking_queue').select('*', { count: 'exact', head: true }).eq('app', 'dartcounter'),
    ]);
    setQueueCounts({
      scolia: scoliaCount || 0,
      dartcounter: dartCount || 0,
    });
  }, [supabase]);

  const fetchLiveMatches = useCallback(async () => {
    const { data } = await supabase
      .from('active_matches')
      .select('id, player1_username, player2_username, player1_elo, player2_elo, status, created_at')
      .in('status', ['pending_result', 'awaiting_confirmation'])
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setLiveMatches(data as LiveMatch[]);
  }, [supabase]);

  const pollForMatch = useCallback(async (seconds: number) => {
    if (isPollingRef.current || statusRef.current !== 'searching') return;
    const app = selectedAppRef.current;
    if (!app) return;

    isPollingRef.current = true;
    const maxEloDiff = getMaxEloDiff(seconds);

    try {
      const { data, error } = await supabase.rpc('check_and_join_queue', {
        p_max_elo_diff: maxEloDiff,
        p_app: app,
      });

      if (statusRef.current !== 'searching') return;
      if (error) throw error;

      const result = Array.isArray(data) ? data[0] as MatchmakingResponse | undefined : data as MatchmakingResponse | undefined;

      await fetchQueueCounts();

      if (result?.match_status === 'pending_accept' && result.match_id) {
        playMatchFoundSound(result.match_id);
        setAcceptMatchId(result.match_id);
        setIHaveAccepted(false);
        setOpponentAccepted(false);
        setOpponentDeclined(false);
        setStatus('accepting');
        startAcceptCountdown(result.match_id);
      }
    } catch (error) {
      if (statusRef.current === 'searching') {
        const msg = error instanceof Error ? error.message : 'Matchmaking konnte nicht gestartet werden.';
        setErrorMessage(msg);
        setStatus('error');
      }
    } finally {
      isPollingRef.current = false;
    }
  }, [fetchQueueCounts, playMatchFoundSound, startAcceptCountdown, supabase]);

  useEffect(() => { pollForMatchRef.current = pollForMatch; }, [pollForMatch]);

  const startSearch = async (app: AppChoice) => {
    setErrorMessage('');
    setOpponent(null);

    if (!effectivePhoneVerified) {
      setErrorMessage('Bitte bestätige zuerst deine Handynummer.');
      router.push('/auth/verify-phone');
      return;
    }

    if (app === 'scolia' && !scoliaUsername) {
      setErrorMessage('Du musst zuerst deinen Scolia-Nutzernamen im Profil hinterlegen.');
      setStatus('error');
      return;
    }
    if (app === 'dartcounter' && !dartcounterUsername) {
      setErrorMessage('Du musst zuerst deinen DartCounter-Nutzernamen im Profil hinterlegen.');
      setStatus('error');
      return;
    }

    unlockMatchFoundSound();
    lastMatchSoundIdRef.current = null;
    setSelectedApp(app);
    selectedAppRef.current = app;
    setElapsedSeconds(0);
    statusRef.current = 'searching';
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
      setSelectedApp(null);
      setElapsedSeconds(0);
      await fetchQueueCounts();
    }
  };

  // Auth-Check + Profil laden + Queue-Counts
  useEffect(() => {
    let isMounted = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }
      const uid = session.user.id;
      userIdRef.current = uid;

      const { data: activeMatch } = await supabase
        .from('active_matches')
        .select('id, status, accept_deadline')
        .or(`player1_id.eq.${uid},player2_id.eq.${uid}`)
        .in('status', ['pending_accept', 'pending_result', 'awaiting_confirmation'])
        .maybeSingle();

      if (!isMounted) return;

      if (activeMatch?.id) {
        if (activeMatch.status === 'pending_accept') {
          const deadline = activeMatch.accept_deadline as string | null;
          const remaining = deadline
            ? Math.max(0, Math.round((new Date(deadline).getTime() - Date.now()) / 1000))
            : 0;
          if (remaining > 0) {
            setAcceptMatchId(activeMatch.id);
            setIHaveAccepted(false);
            setOpponentAccepted(false);
            setOpponentDeclined(false);
            setStatus('accepting');
            setPageLoading(false);
            startAcceptCountdown(activeMatch.id, deadline ?? undefined);
            return;
          }
        } else {
          router.replace(`/result?matchId=${activeMatch.id}`);
          return;
        }
      }

      const { data: smsSetting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'sms_verification')
        .maybeSingle();

      const smsEnabled = (smsSetting?.value as { enabled?: boolean } | null)?.enabled !== false;
      setSmsVerificationEnabled(smsEnabled);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('phone_verified, scolia_username, dartcounter_username')
        .eq('supabaseId', uid)
        .single();

      if (!isMounted) return;
      setPhoneVerified(!smsEnabled || Boolean(profileData?.phone_verified));
      setScoliaUsername(profileData?.scolia_username ?? null);
      setDartcounterUsername(profileData?.dartcounter_username ?? null);
      
      setPageLoading(false);
      void fetchQueueCounts();
      void fetchLiveMatches();
    }
    void init();
    return () => { isMounted = false; };
  }, [supabase, router, fetchQueueCounts, fetchLiveMatches, startAcceptCountdown]);

  // Realtime: Live-Matches
  useEffect(() => {
    const channel = supabase
      .channel('live-matches-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_matches' }, () => {
        void fetchLiveMatches();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, fetchLiveMatches]);

  // Realtime + Polling während der Suche
  useEffect(() => {
    if (status !== 'searching') return;

    const channel = supabase
      .channel('match-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'active_matches' }, (payload) => {
        const newMatch = payload.new;
        const uid = userIdRef.current;
        if (uid && (newMatch.player1_id === uid || newMatch.player2_id === uid)) {
          if (newMatch.status === 'pending_accept') {
            playMatchFoundSound(newMatch.id);
            setAcceptMatchId(newMatch.id);
            setIHaveAccepted(false);
            iHaveAcceptedRef.current = false;
            setOpponentAccepted(false);
            setOpponentDeclined(false);
            setStatus('accepting');
            startAcceptCountdown(newMatch.id, newMatch.accept_deadline);
          } else {
            const isPlayer1 = newMatch.player1_id === uid;
            setOpponent({
              username: isPlayer1 ? newMatch.player2_username : newMatch.player1_username,
              elo: isPlayer1 ? newMatch.player2_elo : newMatch.player1_elo,
            });
            playMatchFoundSound(newMatch.id);
            setStatus('found');
            redirectToResult(newMatch.id);
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'active_matches' }, (payload) => {
        const updatedMatch = payload.new;
        const uid = userIdRef.current;
        if (!uid || !(updatedMatch.player1_id === uid || updatedMatch.player2_id === uid)) return;
        const isPlayer1 = updatedMatch.player1_id === uid;
        if (updatedMatch.status === 'pending_accept') {
          const oppAccepted = isPlayer1 ? updatedMatch.player2_accepted : updatedMatch.player1_accepted;
          setOpponentAccepted(Boolean(oppAccepted));
        }
        if (updatedMatch.status === 'pending_result') {
          if (acceptIntervalRef.current) clearInterval(acceptIntervalRef.current);
          playMatchFoundSound(updatedMatch.id);
          setStatus('found');
          redirectToResult(updatedMatch.id);
        }
      })
      .subscribe();

    const pollingInterval = setInterval(() => {
      setElapsedSeconds((current) => {
        const next = current + 2;
        void pollForMatchRef.current?.(next);
        return next;
      });
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollingInterval);
      if (!skipCancelOnSearchingExitRef.current) {
        void supabase.rpc('cancel_matchmaking');
      }
      skipCancelOnSearchingExitRef.current = false;
    };
  }, [status, supabase, redirectToResult, playMatchFoundSound, startAcceptCountdown]);
