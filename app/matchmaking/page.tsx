'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Radar, ShieldCheck, Swords, Timer, Users, XCircle, Menu, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type MatchmakingStatus = 'idle' | 'selecting' | 'searching' | 'found' | 'error';
type AppChoice = 'scolia' | 'dartcounter';

type MatchmakingResponse = {
  match_id: string | null;
  opponent_user_id: string | null;
  opponent_username: string | null;
  opponent_elo: number | null;
  player_elo: number | null;
  match_status: 'searching' | 'matched' | 'already_in_match';
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
  const [userId, setUserId] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState<boolean | null>(null);
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

  // Cooldown-State
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [cancelCount24h, setCancelCount24h] = useState(0);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingRef = useRef(false);
  const statusRef = useRef<MatchmakingStatus>('idle');
  const selectedAppRef = useRef<AppChoice | null>(null);
  const userIdRef = useRef<string | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { selectedAppRef.current = selectedApp; }, [selectedApp]);

  const getMaxEloDiff = (seconds: number) => {
    if (seconds < 20) return 100;
    if (seconds < 40) return 200;
    if (seconds < 60) return 350;
    return 600;
  };

  const searchProgress = Math.min((elapsedSeconds / 60) * 100, 100);
  const currentRange = getMaxEloDiff(elapsedSeconds);

  const redirectToResult = useCallback((matchId: string) => {
    setTimeout(() => router.push(`/result?matchId=${matchId}`), 1500);
  }, [router]);

  const fetchCooldown = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_cooldown');
    if (data) {
      setCooldownSeconds(data.on_cooldown ? data.seconds_remaining : 0);
      setCancelCount24h(data.cancel_count_24h ?? 0);
    }
  }, [supabase]);

  // Cooldown-Countdown
  useEffect(() => {
    if (cooldownSeconds > 0) {
      cooldownIntervalRef.current = setInterval(() => {
        setCooldownSeconds(prev => {
          if (prev <= 1) {
            if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current); };
  }, [cooldownSeconds]);

  const formatCooldown = (secs: number) => {
    if (secs >= 60) return `${Math.ceil(secs / 60)} Min.`;
    return `${secs} Sek.`;
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

      if (result?.match_status === 'matched' && result.match_id && result.opponent_username) {
        setOpponent({ username: result.opponent_username, elo: result.opponent_elo || 1000 });
        setStatus('found');
        redirectToResult(result.match_id);
      }
    } catch (error) {
      if (statusRef.current === 'searching') {
        const msg = error instanceof Error ? error.message : 'Matchmaking konnte nicht gestartet werden.';
        if (msg.includes('COOLDOWN:')) {
          const secs = parseInt(msg.split('COOLDOWN:')[1] ?? '30', 10);
          setCooldownSeconds(secs);
          setErrorMessage(`Du bist noch ${secs >= 60 ? Math.ceil(secs / 60) + ' Min.' : secs + ' Sek.'} gesperrt.`);
        } else {
          setErrorMessage(msg);
        }
        setStatus('error');
      }
    } finally {
      isPollingRef.current = false;
    }
  }, [fetchQueueCounts, redirectToResult, supabase]);

  const startSearch = async (app: AppChoice) => {
    setErrorMessage('');
    setOpponent(null);

    if (cooldownSeconds > 0) {
      setErrorMessage(`Du bist noch ${cooldownSeconds >= 60 ? Math.ceil(cooldownSeconds / 60) + ' Min.' : cooldownSeconds + ' Sek.'} gesperrt.`);
      return;
    }

    if (!phoneVerified) {
      setErrorMessage('Bitte bestätige zuerst deine Handynummer.');
      router.push('/auth/verify-phone');
      return;
    }

    // Plattform-Username-Prüfung
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

    setSelectedApp(app);
    setElapsedSeconds(0);
    setStatus('searching');
    selectedAppRef.current = app;
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
  // Prüft außerdem ob der Spieler bereits ein aktives Match hat und leitet
  // ihn direkt in den Matchroom weiter, statt die Suche zu erlauben.
  useEffect(() => {
    let isMounted = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }
      const uid = session.user.id;
      userIdRef.current = uid;
      if (isMounted) setUserId(uid);

      // Aktives Match prüfen: läuft noch ein pending_result oder awaiting_confirmation?
      const { data: activeMatch } = await supabase
        .from('active_matches')
        .select('id, status')
        .or(`player1_id.eq.${uid},player2_id.eq.${uid}`)
        .in('status', ['pending_result', 'awaiting_confirmation'])
        .maybeSingle();

      if (!isMounted) return;

      if (activeMatch?.id) {
        // Spieler hat noch ein offenes Match → direkt in den Matchroom
        router.replace(`/result?matchId=${activeMatch.id}`);
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('phone_verified, scolia_username, dartcounter_username')
        .eq('supabaseId', uid)
        .single();

      if (!isMounted) return;
      setPhoneVerified(Boolean(profileData?.phone_verified));
      setScoliaUsername(profileData?.scolia_username ?? null);
      setDartcounterUsername(profileData?.dartcounter_username ?? null);
      setPageLoading(false);
      void fetchQueueCounts();
      void fetchLiveMatches();
      void fetchCooldown();
    }
    void init();
    return () => { isMounted = false; };
  }, [supabase, router, fetchQueueCounts, fetchLiveMatches]);

  // Realtime: Live-Matches aktualisieren wenn sich active_matches ändert
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
          const isPlayer1 = newMatch.player1_id === uid;
          setOpponent({
            username: isPlayer1 ? newMatch.player2_username : newMatch.player1_username,
            elo: isPlayer1 ? newMatch.player2_elo : newMatch.player1_elo,
          });
          setStatus('found');
          redirectToResult(newMatch.id);
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
      void supabase.rpc('cancel_matchmaking');
    };
  }, [pollForMatch, status, supabase, redirectToResult]);

  // Heartbeat: solange gesucht wird, alle 20 Sekunden last_seen aktualisieren.
  // Die DB-Funktion cleanup_stale_queue_entries löscht Einträge die älter als
  // 45 Sekunden sind – so werden verwaiste Einträge (Browser geschlossen)
  // automatisch aus der Queue entfernt.
  useEffect(() => {
    if (status !== 'searching') return;

    const sendHeartbeat = async () => {
      try {
        await supabase.rpc('queue_heartbeat');
      } catch (err) {
        console.error('Heartbeat fehlgeschlagen:', err);
      }
    };

    // Sofort beim Start senden, dann alle 20 Sekunden
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

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/[0.04] text-zinc-200 transition hover:bg-white/10 lg:hidden"
          >
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

      <section className="relative z-10 mx-auto grid max-w-7xl items-start gap-8 px-4 pb-16 pt-28 sm:px-5 md:px-8 md:pt-32 lg:min-h-[calc(100vh-88px)] lg:items-center lg:gap-10 lg:grid-cols-[0.92fr_1.08fr]">

        {/* Linke Spalte: Info */}
        <div>
          <div className="inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]" />
            Live Queue
          </div>
          <h1 className="mt-6 text-4xl font-black leading-[0.88] tracking-[-0.07em] sm:text-5xl md:text-6xl lg:text-7xl">Finde dein nächstes Match.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">Wähle deine Dart-App und tritt der passenden Queue bei. Du wirst nur mit Spielern gematcht, die dieselbe App nutzen.</p>

          {phoneVerified === false && (
            <div className="mt-8 rounded-[1.7rem] border border-amber-300/20 bg-amber-400/[0.08] p-5 text-sm leading-6 text-amber-100 backdrop-blur-xl">
              Dein Account ist noch nicht telefonisch verifiziert.
              <Link href="/auth/verify-phone" className="mt-4 inline-flex rounded-full border border-amber-300/25 bg-amber-300/10 px-5 py-2.5 font-black text-amber-50 transition hover:bg-amber-300/15 ml-3">
                Jetzt verifizieren
              </Link>
            </div>
          )}

          {/* Queue-Übersicht */}
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

          {/* IDLE: App-Auswahl */}
          {status === 'idle' && (
            <div className="relative">
              <div className="mx-auto mb-8 grid h-24 w-24 place-items-center rounded-[2rem] border border-emerald-300/25 bg-emerald-400/10 text-emerald-200 shadow-[0_0_45px_rgba(34,197,94,0.18)]">
                <Radar className="h-12 w-12" />
              </div>
              <h2 className="text-center text-4xl font-black tracking-[-0.05em] md:text-5xl">Bereit für die Oche?</h2>
              <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">Wähle zuerst deine Dart-App, um in die passende Queue einzutreten.</p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {(Object.keys(appConfig) as AppChoice[]).map((app) => {
                  const c = appConfig[app];
                  return (
                    <button
                      key={app}
                      onClick={() => void startSearch(app)}
                      className={`group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6 text-left transition-all duration-300 ${c.borderHover} hover:scale-[1.02]`}
                    >
                      <div className="text-4xl mb-3">{c.icon}</div>
                      <div className="text-xl font-black tracking-[-0.03em]">{c.label}</div>
                      <div className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${c.badge}`}>
                        <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                        {queueCounts[app]} in Queue
                      </div>
                      {/* Hinweis wenn Plattform-Username fehlt */}
                      {app === 'scolia' && !scoliaUsername && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-amber-300">
                          <span>⚠</span> Scolia-Username fehlt
                        </div>
                      )}
                      {app === 'dartcounter' && !dartcounterUsername && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-amber-300">
                          <span>⚠</span> DartCounter-Username fehlt
                        </div>
                      )}
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
                <span className={`h-2 w-2 rounded-full ${cfg.dot} animate-pulse`} />
                {appConfig[selectedApp].label} Queue
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
                <XCircle className="h-5 w-5" />
                Suche abbrechen
              </button>
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
                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold mb-4 ${cfg.badge}`}>
                  {appConfig[selectedApp].icon} {appConfig[selectedApp].label}
                </div>
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
                  <div className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] border border-amber-400/25 bg-amber-500/10 text-amber-300">
                    <Clock className="h-12 w-12" />
                  </div>
                  <h2 className="mt-7 text-4xl font-black tracking-[-0.05em]">Cooldown aktiv</h2>
                  <div className="mt-4 rounded-3xl border border-amber-400/20 bg-amber-500/10 p-6">
                    <div className="text-5xl font-black tracking-[-0.05em] text-amber-300">{formatCooldown(cooldownSeconds)}</div>
                    <p className="mt-2 text-sm text-zinc-400">Bitte warte bevor du wieder eine Queue betrittst.</p>
                    {cancelCount24h >= 2 && (
                      <p className="mt-3 text-xs text-amber-400/70">{cancelCount24h}. Abbruch heute — Cooldown eskaliert bei weiteren Abbrüchen.</p>
                    )}
                  </div>
                  <p className="mt-4 text-xs text-zinc-600">Cooldowns schützen die Queue vor Spam und sorgen für faire Matches.</p>
                </>
              ) : (
                <>
                  <div className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] border border-red-400/25 bg-red-500/10 text-red-300">
                    <XCircle className="h-12 w-12" />
                  </div>
                  <h2 className="mt-7 text-4xl font-black tracking-[-0.05em]">Matchmaking-Fehler</h2>
                  <p className="mt-4 rounded-3xl border border-red-400/20 bg-red-500/10 p-5 text-zinc-300">{errorMessage}</p>
                  <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                    <button onClick={() => setStatus('idle')} className="rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-4 font-black uppercase tracking-[0.16em] text-black">
                      Erneut versuchen
                    </button>
                    {(errorMessage.includes('Scolia') || errorMessage.includes('DartCounter')) && (
                      <a href="/profile" className="rounded-3xl border border-white/15 px-8 py-4 font-black uppercase tracking-[0.16em] text-zinc-300 transition hover:bg-white/10">
                        Zum Profil
                      </a>
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
              <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-400/20 px-1.5 text-[10px] font-black text-emerald-300">
                {liveMatches.length}
              </span>
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
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                        m.status === 'awaiting_confirmation'
                          ? 'border border-amber-300/20 bg-amber-400/10 text-amber-200'
                          : 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          m.status === 'awaiting_confirmation' ? 'bg-amber-300' : 'bg-emerald-300'
                        }`} />
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
