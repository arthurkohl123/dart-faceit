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

  // "Gegner hat abgelehnt"-Anzeige
  const [opponentDeclined, setOpponentDeclined] = useState(false);

  // Cooldown-State
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [cancelCount24h, setCancelCount24h] = useState(0);
  const [queueBanReason, setQueueBanReason] = useState<string | null>(null);
  const [queueBannedUntil, setQueueBannedUntil] = useState<string | null>(null);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Toast-Benachrichtigung
  const [toast, setToast] = useState<{ message: string; type: 'warning' | 'info' } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'warning' | 'info' = 'warning') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // ─── REFS ─────────────────────────────────────────────────────────────────
  // statusRef spiegelt immer den aktuellen status-State wider.
  // WICHTIG: Wir setzen statusRef IMMER synchron bevor wir setStatus aufrufen,
  // damit Funktionen die sofort danach laufen den korrekten Wert sehen.
  const statusRef = useRef<MatchmakingStatus>('idle');
  const selectedAppRef = useRef<AppChoice | null>(null);
  const userIdRef = useRef<string | null>(null);
  const iHaveAcceptedRef = useRef(false);
  const isPollingRef = useRef(false);

  // Wenn true: der nächste searching-useEffect-Cleanup soll cancel_matchmaking NICHT aufrufen.
  // Wird gesetzt wenn wir nach Gegner-Ablehnung re-queuen (kein echter Abbruch).
  const skipNextCancelRef = useRef(false);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // statusRef synchron halten (zusätzlich zum direkten Setzen vor setStatus)
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { selectedAppRef.current = selectedApp; }, [selectedApp]);
  useEffect(() => { iHaveAcceptedRef.current = iHaveAccepted; }, [iHaveAccepted]);

  // Hilfsfunktion: status synchron + als React-State setzen
  const setStatusSync = useCallback((s: MatchmakingStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const getMaxEloDiff = (seconds: number) => {
    if (seconds < 20) return 100;
    if (seconds < 40) return 200;
    if (seconds < 60) return 350;
    return 600;
  };

  const searchProgress = Math.min((elapsedSeconds / 60) * 100, 100);
  const currentRange = getMaxEloDiff(elapsedSeconds);
  const effectivePhoneVerified = !smsVerificationEnabled || phoneVerified === true;

  const unlockMatchFoundSound = useCallback(() => {
    if (typeof window === 'undefined' || audioUnlockedRef.current) return;
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const audioContext = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = audioContext;
    void audioContext.resume().then(() => { audioUnlockedRef.current = true; }).catch(() => { audioUnlockedRef.current = false; });
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
    if (audioContext.state === 'suspended') { void audioContext.resume().then(play).catch(() => undefined); return; }
    play();
  }, []);

  const redirectToResult = useCallback((matchId: string) => {
    setTimeout(() => router.push(`/result?matchId=${matchId}`), 1500);
  }, [router]);

  // Accept-Countdown stoppen (ohne State-Seiteneffekte)
  const stopAcceptCountdown = useCallback(() => {
    if (acceptIntervalRef.current) {
      clearInterval(acceptIntervalRef.current);
      acceptIntervalRef.current = null;
    }
  }, []);

  const startAcceptCountdown = useCallback((matchId: string, deadlineIso?: string) => {
    stopAcceptCountdown();
    acceptExpireCalledRef.current = false;
    const deadline = deadlineIso ? new Date(deadlineIso).getTime() : Date.now() + 30_000;
    const calcRemaining = () => Math.max(0, Math.round((deadline - Date.now()) / 1000));
    setAcceptCountdown(calcRemaining());
    acceptIntervalRef.current = setInterval(async () => {
      const remaining = calcRemaining();
      setAcceptCountdown(remaining);
      if (remaining <= 0 && !acceptExpireCalledRef.current) {
        acceptExpireCalledRef.current = true;
        stopAcceptCountdown();
        try {
          await supabase.rpc('expire_match_accept', { p_match_id: matchId });
        } catch (err) {
          console.error('expire_match_accept fehlgeschlagen:', err);
        }
        // Nach Ablauf: zurück in die Suche (kein cancel_matchmaking nötig)
        setAcceptMatchId(null);
        setIHaveAccepted(false);
        setOpponentAccepted(false);
        setOpponentDeclined(false);
        setStatusSync('searching');
      }
    }, 500);
  }, [supabase, stopAcceptCountdown, setStatusSync]);

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
        stopAcceptCountdown();
        playMatchFoundSound(result.match_id);
        setStatusSync('found');
        redirectToResult(result.match_id);
      }
      // 'waiting' → warte auf Gegner via Realtime
    } catch (err) {
      console.error('accept_match fehlgeschlagen:', err);
    } finally {
      setAcceptDeclineLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!acceptMatchId || acceptDeclineLoading) return;
    setAcceptDeclineLoading(true);
    const banUntil = new Date(Date.now() + 60_000).toISOString();
    const banReason = 'Match abgelehnt – Queue-Sperre für 1 Minute.';
    try {
      const { error } = await supabase.rpc('decline_match', { p_match_id: acceptMatchId });
      if (error) throw error;
      // Sperre in DB persistieren damit sie nach F5 noch aktiv ist
      const uid = userIdRef.current;
      if (uid) {
        await supabase.from('profiles').update({ queue_banned_until: banUntil, queue_ban_reason: banReason }).eq('supabaseId', uid);
      }
    } catch (err) {
      console.error('decline_match fehlgeschlagen:', err);
    } finally {
      stopAcceptCountdown();
      setAcceptMatchId(null);
      setIHaveAccepted(false);
      iHaveAcceptedRef.current = false;
      setOpponentAccepted(false);
      setOpponentDeclined(false);
      setQueueBannedUntil(banUntil);
      setQueueBanReason(banReason);
      setCooldownSeconds(60);
      setErrorMessage('Du hast das Match abgelehnt und bist deshalb für 1 Minute für die Queue gesperrt.');
      showToast('Match abgelehnt. Du bist für 1 Minute für die Queue gesperrt.', 'warning');
      setAcceptDeclineLoading(false);
      setStatusSync('error');
    }
  };

  const fetchCooldown = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_cooldown');
    let nextCooldown = data?.on_cooldown ? Number(data.seconds_remaining ?? 0) : 0;
    if (data) setCancelCount24h(data.cancel_count_24h ?? 0);
    const uid = userIdRef.current;
    if (uid) {
      const { data: profileCooldown } = await supabase.from('profiles').select('queue_banned_until, queue_ban_reason').eq('supabaseId', uid).single();
      const qbu = profileCooldown?.queue_banned_until as string | null | undefined;
      if (qbu) {
        const secs = Math.max(0, Math.ceil((new Date(qbu).getTime() - Date.now()) / 1000));
        if (secs > nextCooldown) {
          nextCooldown = secs;
          setQueueBanReason(profileCooldown?.queue_ban_reason ?? 'Queue-Sperre aktiv.');
          setQueueBannedUntil(qbu);
        } else if (secs <= 0) {
          setQueueBanReason(null);
          setQueueBannedUntil(null);
        }
      } else {
        setQueueBanReason(null);
        setQueueBannedUntil(null);
      }
    }
    setCooldownSeconds(nextCooldown);
  }, [supabase]);

  // Cooldown-Countdown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    cooldownIntervalRef.current = setInterval(() => {
      setCooldownSeconds(prev => {
        if (prev <= 1) {
          if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
          setQueueBanReason(null);
          setQueueBannedUntil(null);
          if (statusRef.current === 'error') setStatusSync('idle');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current); };
  }, [cooldownSeconds, setStatusSync]);

  const formatCooldown = (secs: number) => {
    if (secs >= 60) return `${Math.ceil(secs / 60)} Min.`;
    return `${secs} Sek.`;
  };

  const getCooldownMessage = useCallback((secs = cooldownSeconds) => {
    const duration = formatCooldown(secs);
    if (queueBanReason) {
      const untilText = queueBannedUntil ? ` Ablauf: ${new Date(queueBannedUntil).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} Uhr.` : '';
      return `Du bist aktuell für die Queue gesperrt. Verbleibend: ${duration}. Grund: ${queueBanReason}.${untilText}`;
    }
    return `Du hast die Suche zu oft abgebrochen und bist noch ${duration} im Cooldown.`;
  }, [cooldownSeconds, queueBanReason, queueBannedUntil]);

  const fetchQueueCounts = useCallback(async () => {
    const [{ count: scoliaCount }, { count: dartCount }] = await Promise.all([
      supabase.from('matchmaking_queue').select('*', { count: 'exact', head: true }).eq('app', 'scolia'),
      supabase.from('matchmaking_queue').select('*', { count: 'exact', head: true }).eq('app', 'dartcounter'),
    ]);
    setQueueCounts({ scolia: scoliaCount || 0, dartcounter: dartCount || 0 });
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
    // statusRef.current wird SYNCHRON gesetzt bevor dieser Aufruf erfolgt
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
        iHaveAcceptedRef.current = false;
        setOpponentAccepted(false);
        setOpponentDeclined(false);
        setStatusSync('accepting');
        startAcceptCountdown(result.match_id);
      }
    } catch (error) {
      if (statusRef.current === 'searching') {
        const msg = error instanceof Error ? error.message : 'Matchmaking konnte nicht gestartet werden.';
        if (msg.includes('COOLDOWN:')) {
          const secs = parseInt(msg.split('COOLDOWN:')[1] ?? '30', 10);
          setCooldownSeconds(secs);
          setErrorMessage(getCooldownMessage(secs));
        } else {
          setErrorMessage(msg);
        }
        setStatusSync('error');
      }
    } finally {
      isPollingRef.current = false;
    }
  }, [fetchQueueCounts, getCooldownMessage, playMatchFoundSound, startAcceptCountdown, supabase, setStatusSync]);

  // ─── RE-QUEUE nach Gegner-Ablehnung ───────────────────────────────────────
  // Zentralisierte Funktion die den Spieler sauber wieder in die Queue einträgt.
  // Kernfix: statusRef wird SYNCHRON gesetzt BEVOR pollForMatch aufgerufen wird,
  // damit die statusRef-Prüfung in pollForMatch den richtigen Wert sieht.
  const reQueueAfterDecline = useCallback(async (app: AppChoice) => {
    setOpponentDeclined(false);
    setElapsedSeconds(0);
    isPollingRef.current = false;
    // skipNextCancelRef ist bereits gesetzt vom Aufrufer
    // statusRef synchron setzen BEVOR setStatus → pollForMatch sieht 'searching'
    statusRef.current = 'searching';
    setStatus('searching');
    selectedAppRef.current = app;
    // Direkt in die Queue eintragen
    await pollForMatch(0);
  }, [pollForMatch]);

  const startSearch = async (app: AppChoice) => {
    setErrorMessage('');
    setOpponent(null);
    if (cooldownSeconds > 0) { setErrorMessage(getCooldownMessage()); return; }
    if (!effectivePhoneVerified) { setErrorMessage('Bitte bestätige zuerst deine Handynummer.'); router.push('/auth/verify-phone'); return; }
    if (app === 'scolia' && !scoliaUsername) { setErrorMessage('Du musst zuerst deinen Scolia-Nutzernamen im Profil hinterlegen.'); setStatusSync('error'); return; }
    if (app === 'dartcounter' && !dartcounterUsername) { setErrorMessage('Du musst zuerst deinen DartCounter-Nutzernamen im Profil hinterlegen.'); setStatusSync('error'); return; }
    unlockMatchFoundSound();
    lastMatchSoundIdRef.current = null;
    setSelectedApp(app);
    selectedAppRef.current = app;
    setElapsedSeconds(0);
    isPollingRef.current = false;
    statusRef.current = 'searching';
    setStatus('searching');
    await pollForMatch(0);
  };

  const stopSearch = async () => {
    try { await supabase.rpc('cancel_matchmaking'); } catch (error) { console.error('Matchmaking-Abbruch fehlgeschlagen:', error); }
    setStatusSync('idle');
    setSelectedApp(null);
    setElapsedSeconds(0);
    const newCount = cancelCount24h + 1;
    setCancelCount24h(newCount);
    if (newCount >= 3) {
      setCooldownSeconds(20);
      const message = 'Du hast die Suche zum dritten Mal abgebrochen und erhältst jetzt 20 Sekunden Cooldown.';
      setErrorMessage(message);
      showToast(message, 'warning');
    }
    await fetchQueueCounts();
  };

  // ─── CANCELLED-HANDLER (zentralisiert) ────────────────────────────────────
  // Wird sowohl vom Realtime-Event als auch vom checkCurrentMatchStatus-Polling aufgerufen.
  const handleMatchCancelled = useCallback((app: AppChoice | null, accepted: boolean) => {
    stopAcceptCountdown();
    setAcceptMatchId(null);
    setIHaveAccepted(false);
    iHaveAcceptedRef.current = false;
    setOpponentAccepted(false);

    if (accepted && app) {
      // Spieler hatte angenommen → Ablehnungs-Screen zeigen, dann re-queuen
      setOpponentDeclined(true);
      showToast('Der Gegner hat abgelehnt. Du wirst automatisch wieder in die Queue eingetragen.', 'info');
      // Status auf 'accepting' lassen damit der opponentDeclined-Screen sichtbar bleibt
      // (status === 'accepting' && opponentDeclined === true zeigt den declined-screen)
      // Nach kurzer Anzeigezeit re-queuen
      skipNextCancelRef.current = true; // searching-cleanup soll cancel_matchmaking NICHT aufrufen
      setTimeout(() => {
        void reQueueAfterDecline(app);
      }, 1500);
    } else {
      // Spieler hatte noch nicht angenommen → zurück zur App-Auswahl
      setOpponentDeclined(false);
      setStatusSync('idle');
    }
  }, [stopAcceptCountdown, showToast, reQueueAfterDecline, setStatusSync]);

  // ─── INIT ──────────────────────────────────────────────────────────────────
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
          const remaining = deadline ? Math.max(0, Math.round((new Date(deadline).getTime() - Date.now()) / 1000)) : 0;
          if (remaining > 0) {
            setAcceptMatchId(activeMatch.id);
            setIHaveAccepted(false);
            iHaveAcceptedRef.current = false;
            setOpponentAccepted(false);
            setOpponentDeclined(false);
            setStatusSync('accepting');
            setPageLoading(false);
            startAcceptCountdown(activeMatch.id, deadline ?? undefined);
            return;
          }
        } else {
          router.replace(`/result?matchId=${activeMatch.id}`);
          return;
        }
      }

      const { data: smsSetting } = await supabase.from('app_settings').select('value').eq('key', 'sms_verification').maybeSingle();
      const smsEnabled = (smsSetting?.value as { enabled?: boolean } | null)?.enabled !== false;
      setSmsVerificationEnabled(smsEnabled);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('phone_verified, scolia_username, dartcounter_username, queue_banned_until, queue_ban_reason')
        .eq('supabaseId', uid)
        .single();

      if (!isMounted) return;
      setPhoneVerified(!smsEnabled || Boolean(profileData?.phone_verified));
      setScoliaUsername(profileData?.scolia_username ?? null);
      setDartcounterUsername(profileData?.dartcounter_username ?? null);
      const qbu = profileData?.queue_banned_until as string | null | undefined;
      if (qbu) {
        const secs = Math.max(0, Math.ceil((new Date(qbu).getTime() - Date.now()) / 1000));
        if (secs > 0) {
          setCooldownSeconds(secs);
          setQueueBanReason(profileData?.queue_ban_reason ?? 'Queue-Sperre aktiv.');
          setQueueBannedUntil(qbu);
          setStatusSync('error');
          setErrorMessage('');
        }
      }
      setPageLoading(false);
      void fetchQueueCounts();
      void fetchLiveMatches();
      void fetchCooldown();
    }
    void init();
    return () => { isMounted = false; };
  }, [supabase, router, fetchQueueCounts, fetchLiveMatches, fetchCooldown, startAcceptCountdown, setStatusSync]);

  // ─── REALTIME: Live-Matches ────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel('live-matches-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_matches' }, () => { void fetchLiveMatches(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, fetchLiveMatches]);

  // ─── REALTIME + POLLING: Suche ────────────────────────────────────────────
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
            setStatusSync('accepting');
            startAcceptCountdown(newMatch.id, newMatch.accept_deadline);
          } else {
            const isPlayer1 = newMatch.player1_id === uid;
            setOpponent({ username: isPlayer1 ? newMatch.player2_username : newMatch.player1_username, elo: isPlayer1 ? newMatch.player2_elo : newMatch.player1_elo });
            playMatchFoundSound(newMatch.id);
            setStatusSync('found');
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
          setOpponentAccepted(Boolean(isPlayer1 ? updatedMatch.player2_accepted : updatedMatch.player1_accepted));
        }
        if (updatedMatch.status === 'pending_result') {
          stopAcceptCountdown();
          playMatchFoundSound(updatedMatch.id);
          setStatusSync('found');
          redirectToResult(updatedMatch.id);
        }
        if (updatedMatch.status === 'cancelled' && statusRef.current === 'accepting') {
          handleMatchCancelled(selectedAppRef.current, iHaveAcceptedRef.current);
        }
      })
      .subscribe();

    const pollingInterval = setInterval(() => {
      setElapsedSeconds((current) => {
        const next = current + 2;
        void pollForMatch(next);
        return next;
      });
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollingInterval);
      // cancel_matchmaking NUR aufrufen wenn kein Re-Queue nach Ablehnung
      if (!skipNextCancelRef.current) {
        void supabase.rpc('cancel_matchmaking');
      }
      skipNextCancelRef.current = false;
    };
  }, [status, supabase, pollForMatch, redirectToResult, playMatchFoundSound, startAcceptCountdown, stopAcceptCountdown, handleMatchCancelled, setStatusSync]);

  // ─── REALTIME: Accept-Phase ────────────────────────────────────────────────
  useEffect(() => {
    if (!acceptMatchId) return;
    const uid = userIdRef.current;

    const channel = supabase
      .channel(`accept-match-${acceptMatchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'active_matches', filter: `id=eq.${acceptMatchId}` }, (payload) => {
        const updated = payload.new;
        if (!uid || !(updated.player1_id === uid || updated.player2_id === uid)) return;
        const isPlayer1 = updated.player1_id === uid;

        if (updated.status === 'pending_accept') {
          setOpponentAccepted(Boolean(isPlayer1 ? updated.player2_accepted : updated.player1_accepted));
        }
        if (updated.status === 'pending_result') {
          stopAcceptCountdown();
          playMatchFoundSound(updated.id);
          setStatusSync('found');
          redirectToResult(updated.id);
        }
        if (updated.status === 'cancelled') {
          handleMatchCancelled(selectedAppRef.current, iHaveAcceptedRef.current);
        }
      })
      .subscribe();

    // Race-Condition-Fix: Sofort nach Subscribe aktuellen Status aus DB laden
    const checkCurrentMatchStatus = async () => {
      if (!acceptMatchId || !uid) return;
      const { data } = await supabase
        .from('active_matches')
        .select('status, player1_id, player2_id, player1_accepted, player2_accepted')
        .eq('id', acceptMatchId)
        .maybeSingle();

      if (!data) return;
      if (!(data.player1_id === uid || data.player2_id === uid)) return;
      const isPlayer1 = data.player1_id === uid;

      if (data.status === 'pending_accept') {
        setOpponentAccepted(Boolean(isPlayer1 ? data.player2_accepted : data.player1_accepted));
      } else if (data.status === 'pending_result') {
        stopAcceptCountdown();
        playMatchFoundSound(acceptMatchId);
        setStatusSync('found');
        redirectToResult(acceptMatchId);
      } else if (data.status === 'cancelled') {
        handleMatchCancelled(selectedAppRef.current, iHaveAcceptedRef.current);
      }
    };
    void checkCurrentMatchStatus();

    return () => { void supabase.removeChannel(channel); };
  }, [acceptMatchId, redirectToResult, playMatchFoundSound, startAcceptCountdown, stopAcceptCountdown, supabase, handleMatchCancelled, setStatusSync]);

  // ─── HEARTBEAT ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'searching') return;
    const sendHeartbeat = async () => {
      try { await supabase.rpc('queue_heartbeat'); } catch (err) { console.error('Heartbeat fehlgeschlagen:', err); }
    };
    void sendHeartbeat();
    const heartbeatInterval = setInterval(sendHeartbeat, 20_000);
    return () => clearInterval(heartbeatInterval);
  }, [status, supabase]);

  const cfg = selectedApp ? appConfig[selectedApp] : appConfig.scolia;

  if (pageLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-6 text-lg font-bold text-emerald-200 backdrop-blur-xl">Laden...</div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.24),transparent_34%),radial-gradient(circle_at_82%_8%,rgba(6,182,212,0.14),transparent_28%),radial-gradient(circle_at_50%_50%,rgba(163,230,53,0.08),transparent_34%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_78%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      {/* Nav */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-lg font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-base font-black tracking-[-0.04em] md:text-xl">RANKEDDARTS</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Matchmaking</div>
            </div>
          </Link>
          <div className="hidden items-center gap-7 text-sm font-medium text-zinc-300 lg:flex">
            <Link href="/leaderboard" className="transition hover:text-white">Leaderboard</Link>
            <Link href="/profile" className="transition hover:text-white">Profil</Link>
            <Link href="/history" className="transition hover:text-white">History</Link>
            <Link href="/updates" className="transition hover:text-white">Updates</Link>
            <Link href="/premium" className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 font-bold text-emerald-200 transition hover:bg-emerald-400/20">Premium</Link>
          </div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/[0.04] text-zinc-200 transition hover:bg-white/10 lg:hidden">
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-white/10 bg-black/80 px-5 py-4 backdrop-blur-2xl lg:hidden">
            <div className="flex flex-col gap-1">
              <Link href="/leaderboard" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Leaderboard</Link>
              <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Profil</Link>
              <Link href="/history" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Match History</Link>
              <Link href="/updates" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Updates</Link>
              <Link href="/premium" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/10">Premium</Link>
            </div>
          </div>
        )}
      </nav>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-3 rounded-2xl border px-5 py-3.5 shadow-2xl backdrop-blur-xl transition-all ${toast.type === 'warning' ? 'border-amber-400/30 bg-amber-500/15 text-amber-100' : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'}`}>
          <AlertTriangle className={`h-4 w-4 shrink-0 ${toast.type === 'warning' ? 'text-amber-300' : 'text-emerald-300'}`} />
          <span className="text-sm font-bold">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-zinc-500 hover:text-white"><X size={14} /></button>
        </div>
      )}

      <section className="relative z-10 mx-auto grid max-w-7xl items-start gap-8 px-4 pb-16 pt-28 sm:px-5 md:px-8 md:pt-32 lg:min-h-[calc(100vh-88px)] lg:items-center lg:gap-10 lg:grid-cols-[0.92fr_1.08fr]">

        {/* Linke Spalte */}
        <div>
          <div className="inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]" />
            Live Queue
          </div>
          <h1 className="mt-6 text-4xl font-black leading-[0.88] tracking-[-0.07em] sm:text-5xl md:text-6xl lg:text-7xl">Finde dein nächstes Match.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">Wähle deine Dart-App und tritt der passenden Queue bei. Du wirst nur mit Spielern gematcht, die dieselbe App nutzen.</p>

          {cooldownSeconds > 0 && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-100">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div>
                <div className="font-black">{queueBanReason ? 'Queue-Sperre aktiv' : 'Cooldown aktiv'}</div>
                <p className="mt-1 text-amber-100/85">{getCooldownMessage()}</p>
              </div>
            </div>
          )}

          {effectivePhoneVerified === false && (
            <div className="mt-8 rounded-[1.7rem] border border-amber-300/20 bg-amber-400/[0.08] p-5 text-sm leading-6 text-amber-100 backdrop-blur-xl">
              Dein Account ist noch nicht telefonisch verifiziert.
              <Link href="/auth/verify-phone" className="mt-4 inline-flex rounded-full border border-amber-300/25 bg-amber-300/10 px-5 py-2.5 font-black text-amber-50 transition hover:bg-amber-300/15 ml-3">Jetzt verifizieren</Link>
            </div>
          )}

          <div className="mt-6 grid grid-cols-3 gap-3 sm:mt-8 sm:gap-4">
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
              <Timer className="h-6 w-6 text-emerald-300" />
              <div className="mt-4 text-4xl font-black tracking-[-0.05em]">{status === 'searching' ? `${elapsedSeconds}s` : '—'}</div>
              <div className="mt-1 text-sm text-zinc-500">Suchzeit</div>
            </div>
            <div className="rounded-[1.7rem] border border-emerald-300/15 bg-emerald-400/[0.04] p-5 backdrop-blur-xl">
              <Users className="h-6 w-6 text-emerald-300" />
              <div className="mt-4 text-4xl font-black tracking-[-0.05em] text-emerald-300">{queueCounts.scolia}</div>
              <div className="mt-1 text-sm text-zinc-500">Scolia Queue</div>
            </div>
            <div className="rounded-[1.7rem] border border-cyan-300/15 bg-cyan-400/[0.04] p-5 backdrop-blur-xl">
              <Users className="h-6 w-6 text-cyan-300" />
              <div className="mt-4 text-4xl font-black tracking-[-0.05em] text-cyan-300">{queueCounts.dartcounter}</div>
              <div className="mt-1 text-sm text-zinc-500">DartCounter Queue</div>
            </div>
          </div>
        </div>

        {/* Rechte Spalte: Matchmaking-Box */}
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-zinc-950/86 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl md:p-8">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent" />
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />

          {/* IDLE */}
          {status === 'idle' && (
            <div className="relative">
              <div className="mx-auto mb-8 grid h-24 w-24 place-items-center rounded-[2rem] border border-emerald-300/25 bg-emerald-400/10 text-emerald-200 shadow-[0_0_45px_rgba(34,197,94,0.18)]">
                <Radar className="h-12 w-12" />
              </div>
              <h2 className="text-center text-4xl font-black tracking-[-0.05em] md:text-5xl">Bereit für das Oche?</h2>
              <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">Wähle zuerst deine Dart-App, um in die passende Queue einzutreten.</p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {(Object.keys(appConfig) as AppChoice[]).map((app) => {
                  const c = appConfig[app];
                  return (
                    <button key={app} onClick={() => void startSearch(app)} disabled={cooldownSeconds > 0} title={cooldownSeconds > 0 ? getCooldownMessage() : undefined}
                      className={`group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6 text-left transition-all duration-300 ${cooldownSeconds > 0 ? 'cursor-not-allowed opacity-55' : `${c.borderHover} hover:scale-[1.02]`}`}>
                      <div className="text-xl font-black tracking-[-0.03em]">{c.label}</div>
                      <div className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${c.badge}`}>
                        <span className={`h-2 w-2 rounded-full ${c.dot}`} />{queueCounts[app]} in Queue
                      </div>
                      {app === 'scolia' && !scoliaUsername && <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-amber-300"><span>⚠</span> Scolia-Username fehlt</div>}
                      {app === 'dartcounter' && !dartcounterUsername && <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-amber-300"><span>⚠</span> DartCounter-Username fehlt</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* SEARCHING */}
          {status === 'searching' && selectedApp && (
            <div className="relative text-center">
              <div className={`mx-auto grid h-28 w-28 animate-pulse place-items-center rounded-full border ${cfg.borderActive} text-white shadow-[0_0_55px_rgba(34,197,94,0.24)]`}>
                <Activity className="h-14 w-14" />
              </div>
              <div className={`mt-6 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${cfg.badge}`}>
                <span className={`h-2 w-2 rounded-full ${cfg.dot} animate-pulse`} />{appConfig[selectedApp].label} Queue
              </div>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.05em]">Gegner wird gesucht</h2>
              <p className="mt-3 text-zinc-400">Aktueller Elo-Suchradius: <span className="font-black text-emerald-300">±{currentRange}</span></p>
              <div className="mt-8 h-4 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300 transition-all" style={{ width: `${searchProgress}%` }} />
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-4">
                {searchSteps.map((step) => (
                  <div key={step.time} className={`rounded-2xl border p-4 text-left ${currentRange >= Number.parseInt(step.range.replace(/\D/g, ''), 10) ? 'border-emerald-300/25 bg-emerald-400/[0.08]' : 'border-white/10 bg-white/[0.03]'}`}>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">{step.time}</div>
                    <div className="mt-2 font-black text-emerald-200">{step.range}</div>
                    <div className="mt-1 text-xs text-zinc-500">{step.label}</div>
                  </div>
                ))}
              </div>
              <button onClick={stopSearch} className="mt-8 inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 font-bold text-zinc-300 transition hover:border-white/35 hover:bg-white/10">
                <XCircle className="h-5 w-5" />Suche abbrechen
              </button>
            </div>
          )}

          {/* ACCEPTING */}
          {status === 'accepting' && selectedApp && (
            <div className="relative text-center">
              {opponentDeclined ? (
                /* Gegner hat abgelehnt – kein Timer, kein Countdown */
                <div className="flex flex-col items-center gap-6 py-4">
                  <div className="grid h-24 w-24 place-items-center rounded-[2rem] border border-red-400/25 bg-red-500/10 text-red-300">
                    <XCircle className="h-12 w-12" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black tracking-[-0.05em] text-red-200">Gegner hat abgelehnt</h2>
                    <p className="mt-3 text-zinc-400">Du wirst automatisch wieder in die Queue eingetragen…</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/50 px-5 py-3 text-sm font-bold text-zinc-400">
                    <Activity className="h-4 w-4 animate-pulse text-emerald-300" />
                    Suche wird gestartet…
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative mx-auto h-32 w-32">
                    <div className="absolute inset-0 animate-ping rounded-full border-2 border-emerald-300/30" />
                    <div className="absolute inset-2 animate-ping rounded-full border border-emerald-300/20" style={{ animationDelay: '0.3s' }} />
                    <div className={`relative grid h-full w-full place-items-center rounded-full border-2 ${acceptCountdown <= 10 ? 'border-red-400/60 bg-red-500/10' : 'border-emerald-300/40 bg-emerald-400/10'}`}>
                      <span className={`text-4xl font-black tracking-[-0.06em] ${acceptCountdown <= 10 ? 'text-red-300' : 'text-emerald-200'}`}>{acceptCountdown}</span>
                    </div>
                  </div>
                  <h2 className="mt-8 text-4xl font-black tracking-[-0.05em]">Match gefunden!</h2>
                  <p className="mt-3 text-zinc-400">Bestätige innerhalb von <span className="font-black text-white">30 Sekunden</span> um das Match zu starten.</p>
                  <div className={`mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${cfg.badge}`}>
                    <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />{appConfig[selectedApp].label}
                  </div>
                  <div className="mt-6 flex items-center justify-center gap-6">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className={`grid h-10 w-10 place-items-center rounded-full border-2 ${iHaveAccepted ? 'border-emerald-400 bg-emerald-400/20' : 'border-zinc-700 bg-zinc-800/50'}`}>
                        {iHaveAccepted ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : <Clock className="h-5 w-5 text-zinc-600" />}
                      </div>
                      <span className="text-xs font-bold text-zinc-500">Du</span>
                    </div>
                    <div className="h-px w-12 bg-zinc-800" />
                    <div className="flex flex-col items-center gap-1.5">
                      <div className={`grid h-10 w-10 place-items-center rounded-full border-2 ${opponentAccepted ? 'border-emerald-400 bg-emerald-400/20' : 'border-zinc-700 bg-zinc-800/50'}`}>
                        {opponentAccepted ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : <Clock className="h-5 w-5 text-zinc-600 animate-pulse" />}
                      </div>
                      <span className="text-xs font-bold text-zinc-500">Gegner</span>
                    </div>
                  </div>
                  {!iHaveAccepted ? (
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                      <button onClick={() => void handleAccept()} disabled={acceptDeclineLoading}
                        className="flex items-center justify-center gap-2 rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-10 py-5 text-lg font-black uppercase tracking-[0.16em] text-black shadow-[0_16px_50px_rgba(34,197,94,0.25)] transition hover:-translate-y-0.5 disabled:opacity-50">
                        <UserCheck className="h-5 w-5" />{acceptDeclineLoading ? 'Wird bestätigt…' : 'Match annehmen'}
                      </button>
                      <button onClick={() => void handleDecline()} disabled={acceptDeclineLoading}
                        className="flex items-center justify-center gap-2 rounded-3xl border border-red-400/25 bg-red-500/10 px-8 py-5 text-base font-black uppercase tracking-[0.16em] text-red-200 transition hover:bg-red-500/15 disabled:opacity-50">
                        <XCircle className="h-5 w-5" />Ablehnen
                      </button>
                    </div>
                  ) : (
                    <div className="mt-8 flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-bold text-emerald-200">
                        <Zap className="h-4 w-4" />Bestätigt! Warte auf Gegner…
                      </div>
                      <p className="text-xs text-zinc-600">Das Match startet sobald der Gegner bestätigt.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* FOUND */}
          {status === 'found' && opponent && selectedApp && (
            <div className="relative text-center">
              <div className="mx-auto grid h-28 w-28 place-items-center rounded-[2rem] border border-emerald-300/25 bg-emerald-400/10 text-emerald-200 shadow-[0_0_55px_rgba(34,197,94,0.24)]">
                <CheckCircle2 className="h-14 w-14" />
              </div>
              <h2 className="mt-8 text-4xl font-black tracking-[-0.05em]">Gegner gefunden</h2>
              <div className="mt-6 rounded-3xl border border-emerald-300/20 bg-emerald-400/[0.07] p-6">
                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold mb-4 ${cfg.badge}`}>{appConfig[selectedApp].label}</div>
                <div className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Dein Match</div>
                <div className="mt-3 text-4xl font-black tracking-[-0.05em]">{opponent.username}</div>
                <div className="mt-2 text-zinc-400">{opponent.elo} Elo</div>
              </div>
              <p className="mt-7 animate-pulse font-bold text-emerald-300">Du wirst zur Ergebnis-Eingabe weitergeleitet...</p>
            </div>
          )}

          {/* ERROR */}
          {status === 'error' && (
            <div className="relative text-center">
              {cooldownSeconds > 0 ? (
                <>
                  <div className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] border border-amber-400/25 bg-amber-500/10 text-amber-300"><Clock className="h-12 w-12" /></div>
                  <h2 className="mt-7 text-4xl font-black tracking-[-0.05em]">Cooldown aktiv</h2>
                  <div className="mt-4 rounded-3xl border border-amber-400/20 bg-amber-500/10 p-6">
                    <div className="text-5xl font-black tracking-[-0.05em] text-amber-300">{formatCooldown(cooldownSeconds)}</div>
                    <p className="mt-2 text-sm text-zinc-400">Du bist aktuell für die Queue gesperrt. Bitte kurz warten.</p>
                    {queueBanReason && <p className="mt-3 text-xs font-bold text-amber-200/80">Grund: {queueBanReason}</p>}
                    <p className="mt-3 text-xs text-amber-400/70">{queueBanReason ? 'Du kannst nach Ablauf der Sperre automatisch wieder eine neue Suche starten.' : `${cancelCount24h}. Abbruch heute — ab dem 3. Abbruch gibt es 20 Sek. Cooldown.`}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] border border-red-400/25 bg-red-500/10 text-red-300"><XCircle className="h-12 w-12" /></div>
                  <h2 className="mt-7 text-4xl font-black tracking-[-0.05em]">Matchmaking-Fehler</h2>
                  <p className="mt-4 rounded-3xl border border-red-400/20 bg-red-500/10 p-5 text-zinc-300">{errorMessage}</p>
                  <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                    <button onClick={() => setStatusSync('idle')} className="rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-4 font-black uppercase tracking-[0.16em] text-black">Erneut versuchen</button>
                    {(errorMessage.includes('Scolia') || errorMessage.includes('DartCounter')) && (
                      <a href="/profile" className="rounded-3xl border border-white/15 px-8 py-4 font-black uppercase tracking-[0.16em] text-zinc-300 transition hover:bg-white/10">Zum Profil</a>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Live-Matches */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/85 backdrop-blur-xl">
            <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.03] px-5 py-4">
              <Swords className="h-5 w-5 text-emerald-300" />
              <div>
                <div className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Live</div>
                <div className="text-sm font-bold text-zinc-300">Laufende Matches</div>
              </div>
              <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-400/20 px-1.5 text-[10px] font-black text-emerald-300">{liveMatches.length}</span>
            </div>
            {liveMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <Swords className="h-7 w-7 text-zinc-700" />
                <p className="text-sm font-semibold text-zinc-600">Keine laufenden Matches</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {liveMatches.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      <span className="truncate text-sm font-black text-white">{m.player1_username}</span>
                      <span className="shrink-0 text-xs font-black text-zinc-600">vs</span>
                      <span className="truncate text-sm font-black text-white">{m.player2_username}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${m.status === 'awaiting_confirmation' ? 'border border-amber-300/20 bg-amber-400/10 text-amber-200' : 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-200'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${m.status === 'awaiting_confirmation' ? 'bg-amber-300' : 'bg-emerald-300'}`} />
                        {m.status === 'awaiting_confirmation' ? 'Bestätigung' : 'Läuft'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Feature-Cards */}
        <div className="grid gap-4 sm:gap-5 sm:grid-cols-3 lg:col-span-2">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <ShieldCheck className="h-7 w-7 text-emerald-300" />
            <h3 className="mt-4 text-xl font-black">App-getrennte Queues</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Scolia- und DartCounter-Spieler werden in separaten Queues geführt und nur untereinander gematcht.</p>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <Timer className="h-7 w-7 text-cyan-300" />
            <h3 className="mt-4 text-xl font-black">Fairer Elo-Radius</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Der Suchbereich wächst automatisch, damit Matches fair bleiben und trotzdem schnell zustande kommen.</p>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <CheckCircle2 className="h-7 w-7 text-lime-300" />
            <h3 className="mt-4 text-xl font-black">Direkt zum Result</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Nach einem Treffer geht es automatisch zur Ergebnis-Eingabe für dein Match.</p>
          </div>
        </div>
      </section>
    </main>
  );
}