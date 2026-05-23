'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CheckCircle2, Radar, ShieldCheck, Timer, Users, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type MatchmakingStatus = 'idle' | 'searching' | 'found' | 'error';

type MatchmakingResponse = {
  match_id: string | null;
  opponent_username: string | null;
  opponent_elo: number | null;
  match_status: 'searching' | 'matched';
};

export default function Matchmaking() {
  const [status, setStatus] = useState<MatchmakingStatus>('idle');
  const [opponent, setOpponent] = useState<{ username: string; elo: number } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [phoneVerified, setPhoneVerified] = useState<boolean | null>(null);
  
  // Refs für stabilere Polling-Kontrolle
  const isPollingRef = useRef(false);
  const statusRef = useRef<MatchmakingStatus>('idle');
  
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // Status-Ref synchron halten
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const getMaxEloDiff = (seconds: number) => {
    if (seconds < 20) return 100;
    if (seconds < 40) return 200;
    if (seconds < 60) return 350;
    return 600;
  };

  const pollForMatch = useCallback(async (seconds: number) => {
    // Wenn wir nicht mehr suchen oder bereits pollen, abbrechen
    if (statusRef.current !== 'searching' || isPollingRef.current) return;

    isPollingRef.current = true;
    const maxEloDiff = getMaxEloDiff(seconds);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login');
        return;
      }

      // 1. RPC aufrufen
      const { data, error } = await supabase.rpc('find_or_create_match', {
        p_max_elo_diff: maxEloDiff,
      });

      // Wenn die Suche während des Requests abgebrochen wurde -> ignorieren
      if (statusRef.current !== 'searching') {
        isPollingRef.current = false;
        return;
      }

      if (error) throw error;
      const result = Array.isArray(data) ? data[0] as MatchmakingResponse : data as MatchmakingResponse;

      // 2. Queue Count holen
      const { count } = await supabase
        .from('matchmaking_queue')
        .select('*', { count: 'exact', head: true });
      setQueueCount(count || 0);

      // 3. Match-Erfolg prüfen
      if (result?.match_status === 'matched' && result.match_id) {
        setOpponent({
          username: result.opponent_username || 'Gegner',
          elo: result.opponent_elo || 1000,
        });
        setStatus('found');
        setTimeout(() => router.push(`/result?matchId=${result.match_id}`), 1500);
      }
    } catch (error) {
      if (statusRef.current === 'searching') {
        console.error('Matchmaking Fehler:', error);
        setErrorMessage('Verbindungsproblem beim Matchmaking.');
        setStatus('error');
      }
    } finally {
      isPollingRef.current = false;
    }
  }, [router, supabase]);

  const startSearch = async () => {
    setErrorMessage('');
    setOpponent(null);

    if (phoneVerified !== true) {
      router.push('/auth/verify-phone');
      return;
    }

    setElapsedSeconds(0);
    setStatus('searching');
    // Erster sofortiger Poll
    void pollForMatch(0);
  };

  const stopSearch = async () => {
    // Sofortiger UI-Stopp verhindert weitere Poll-Zyklen
    setStatus('idle');
    setElapsedSeconds(0);
    
    try {
      // Datenbank bereinigen
      await supabase.rpc('cancel_matchmaking');
    } catch (e) {
      console.error('Fehler beim Abbruch:', e);
    }
  };

  // Initialer Check der Telefon-Verifizierung
  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('phone_verified')
        .eq('supabaseId', session.user.id)
        .single();

      setPhoneVerified(Boolean(profile?.phone_verified));
    }
    void checkUser();
  }, [supabase]);

  // Das eigentliche Polling-Intervall
  useEffect(() => {
    if (status !== 'searching') return;

    const interval = setInterval(() => {
      setElapsedSeconds((s) => {
        const next = s + 2;
        void pollForMatch(next);
        return next;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [status, pollForMatch]);

  // Cleanup beim Verlassen der Seite
  useEffect(() => {
    return () => {
      // Wenn die Komponente unmounted wird, Suche in DB hart abbrechen
      const cleanup = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.rpc('cancel_matchmaking');
        }
      };
      void cleanup();
    };
  }, [supabase]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.24),transparent_34%),radial-gradient(circle_at_82%_8%,rgba(6,182,212,0.14),transparent_28%),radial-gradient(circle_at_50%_50%,rgba(163,230,53,0.08),transparent_34%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_78%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <nav className="relative z-10 border-b border-white/10 bg-black/45 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-xl font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-xl font-black tracking-[-0.04em] md:text-2xl">RANKEDDARTS</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Matchmaking</div>
            </div>
          </Link>
          <button onClick={() => router.push('/profile')} className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10">Zum Profil</button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-88px)] max-w-7xl items-center gap-10 px-5 py-14 md:px-8 lg:grid-cols-[0.92fr_1.08fr]">
        <div>
          <div className="inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]" /> Live Queue
          </div>
          <h1 className="mt-6 text-6xl font-black leading-[0.88] tracking-[-0.07em] md:text-8xl">Finde dein nächstes Match.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">Die Suche startet eng an deinem Elo-Level und erweitert den Radius automatisch. Deine Sicherheit steht an erster Stelle.</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
              <Timer className="h-6 w-6 text-emerald-300" />
              <div className="mt-4 text-4xl font-black tracking-[-0.05em]">{elapsedSeconds}s</div>
              <div className="mt-1 text-sm text-zinc-500">Suchzeit</div>
            </div>
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
              <Users className="h-6 w-6 text-cyan-300" />
              <div className="mt-4 text-4xl font-black tracking-[-0.05em]">{queueCount}</div>
              <div className="mt-1 text-sm text-zinc-500">In Queue</div>
            </div>
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
              <Radar className="h-6 w-6 text-lime-300" />
              <div className="mt-4 text-4xl font-black tracking-[-0.05em]">±{getMaxEloDiff(elapsedSeconds)}</div>
              <div className="mt-1 text-sm text-zinc-500">Elo Radius</div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-zinc-950/86 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl md:p-8">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent" />
          
          {status === 'idle' && (
            <div className="relative text-center">
              <div className="mx-auto grid h-28 w-28 place-items-center rounded-[2rem] border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
                <Radar className="h-14 w-14" />
              </div>
              <h2 className="mt-8 text-4xl font-black tracking-[-0.05em] md:text-5xl">Bereit für die Oche?</h2>
              <button onClick={startSearch} className="mt-8 w-full rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-6 text-2xl font-black uppercase tracking-[0.18em] text-black shadow-[0_18px_60px_rgba(34,197,94,0.24)] transition hover:-translate-y-1">Match suchen</button>
            </div>
          )}

          {status === 'searching' && (
            <div className="relative text-center">
              <div className="mx-auto grid h-28 w-28 animate-pulse place-items-center rounded-full border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
                <Activity className="h-14 w-14" />
              </div>
              <h2 className="mt-8 text-4xl font-black tracking-[-0.05em]">Gegner wird gesucht</h2>
              <div className="mt-8 h-4 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300 transition-all" style={{ width: `${Math.min((elapsedSeconds / 60) * 100, 100)}%` }} />
              </div>
              <button onClick={stopSearch} className="mt-8 inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 font-bold text-zinc-300 transition hover:bg-white/10">
                <XCircle className="h-5 w-5" /> Suche abbrechen
              </button>
            </div>
          )}

          {status === 'found' && opponent && (
            <div className="relative text-center">
              <div className="mx-auto grid h-28 w-28 place-items-center rounded-[2rem] border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
                <CheckCircle2 className="h-14 w-14" />
              </div>
              <h2 className="mt-8 text-4xl font-black tracking-[-0.05em]">Gegner gefunden</h2>
              <div className="mt-6 rounded-3xl border border-emerald-300/20 bg-emerald-400/[0.07] p-6">
                <div className="mt-3 text-5xl font-black tracking-[-0.06em]">vs {opponent.username}</div>
              </div>
              <p className="mt-7 animate-pulse font-bold text-emerald-300">Match startet...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="relative text-center">
              <h2 className="text-4xl font-black text-red-300">Fehler</h2>
              <p className="mt-4 text-zinc-300">{errorMessage}</p>
              <button onClick={() => setStatus('idle')} className="mt-7 rounded-3xl bg-white/10 px-8 py-4 font-black uppercase">Zurück</button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}