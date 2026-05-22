'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CheckCircle2, Radar, ShieldCheck, Timer, Users, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type MatchmakingStatus = 'idle' | 'searching' | 'found' | 'error';

type MatchmakingResponse = {
  match_id: string | null;
  opponent_user_id: string | null;
  opponent_username: string | null;
  opponent_elo: number | null;
  player_elo: number | null;
  match_status: 'searching' | 'matched';
};

type Opponent = {
  username: string;
  elo: number;
};

const searchSteps = [
  { time: '0–20s', range: '±100 Elo', label: 'Sehr nahes Skill-Level' },
  { time: '20–40s', range: '±200 Elo', label: 'Erweiterte Suche' },
  { time: '40–60s', range: '±350 Elo', label: 'Breiter Spielerpool' },
  { time: '60s+', range: '±600 Elo', label: 'Maximale Reichweite' },
];

export default function Matchmaking() {
  const [status, setStatus] = useState<MatchmakingStatus>('idle');
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const isPollingRef = useRef(false);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

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

  const pollForMatch = useCallback(async (seconds: number) => {
    if (isPollingRef.current) return;

    isPollingRef.current = true;
    const maxEloDiff = getMaxEloDiff(seconds);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login');
        return;
      }

      const { data, error } = await supabase.rpc('find_or_create_match', {
        p_max_elo_diff: maxEloDiff,
      });

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] as MatchmakingResponse | undefined : data as MatchmakingResponse | undefined;

      const { count } = await supabase
        .from('matchmaking_queue')
        .select('*', { count: 'exact', head: true });

      setQueueCount(count || 0);

      if (result?.match_status === 'matched' && result.match_id && result.opponent_username) {
        setOpponent({
          username: result.opponent_username,
          elo: result.opponent_elo || 1000,
        });
        setStatus('found');
        redirectToResult(result.match_id);
      }
    } catch (error) {
      console.error('Matchmaking fehlgeschlagen:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Matchmaking konnte nicht gestartet werden.');
      setStatus('error');
    } finally {
      isPollingRef.current = false;
    }
  }, [redirectToResult, router, supabase]);

  const startSearch = async () => {
    setErrorMessage('');
    setOpponent(null);
    setElapsedSeconds(0);
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
      setElapsedSeconds(0);
      setQueueCount(0);
    }
  };

  useEffect(() => {
    if (status !== 'searching') return;

    const pollingInterval = setInterval(() => {
      setElapsedSeconds((current) => {
        const next = current + 2;
        void pollForMatch(next);
        return next;
      });
    }, 2000);

    return () => clearInterval(pollingInterval);
  }, [pollForMatch, status]);

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

          <button
            onClick={() => router.push('/profile')}
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10"
          >
            Zum Profil
          </button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-88px)] max-w-7xl items-center gap-10 px-5 py-14 md:px-8 lg:grid-cols-[0.92fr_1.08fr]">
        <div>
          <div className="inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]" />
            Live Queue
          </div>
          <h1 className="mt-6 text-6xl font-black leading-[0.88] tracking-[-0.07em] md:text-8xl">Finde dein nächstes Match.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">Die Suche startet eng an deinem Elo-Level und erweitert den Radius automatisch, damit du schnell einen fairen Gegner findest.</p>

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
              <div className="mt-4 text-4xl font-black tracking-[-0.05em]">±{currentRange}</div>
              <div className="mt-1 text-sm text-zinc-500">Elo Radius</div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-zinc-950/86 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl md:p-8">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent" />
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />

          {status === 'idle' && (
            <div className="relative text-center">
              <div className="mx-auto grid h-28 w-28 place-items-center rounded-[2rem] border border-emerald-300/25 bg-emerald-400/10 text-emerald-200 shadow-[0_0_45px_rgba(34,197,94,0.18)]">
                <Radar className="h-14 w-14" />
              </div>
              <h2 className="mt-8 text-4xl font-black tracking-[-0.05em] md:text-5xl">Bereit für die Oche?</h2>
              <p className="mx-auto mt-4 max-w-xl text-zinc-400">Starte die Suche, bleib auf der Seite und du wirst automatisch zur Ergebnis-Eingabe weitergeleitet, sobald ein Match gefunden wurde.</p>
              <button
                onClick={startSearch}
                className="mt-8 w-full rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-6 text-2xl font-black uppercase tracking-[0.18em] text-black shadow-[0_18px_60px_rgba(34,197,94,0.24)] transition hover:-translate-y-1"
              >
                Match suchen
              </button>
            </div>
          )}

          {status === 'searching' && (
            <div className="relative text-center">
              <div className="mx-auto grid h-28 w-28 animate-pulse place-items-center rounded-full border border-emerald-300/25 bg-emerald-400/10 text-emerald-200 shadow-[0_0_55px_rgba(34,197,94,0.24)]">
                <Activity className="h-14 w-14" />
              </div>
              <h2 className="mt-8 text-4xl font-black tracking-[-0.05em]">Gegner wird gesucht</h2>
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

          {status === 'found' && opponent && (
            <div className="relative text-center">
              <div className="mx-auto grid h-28 w-28 place-items-center rounded-[2rem] border border-emerald-300/25 bg-emerald-400/10 text-emerald-200 shadow-[0_0_55px_rgba(34,197,94,0.24)]">
                <CheckCircle2 className="h-14 w-14" />
              </div>
              <h2 className="mt-8 text-4xl font-black tracking-[-0.05em]">Gegner gefunden</h2>
              <div className="mt-6 rounded-3xl border border-emerald-300/20 bg-emerald-400/[0.07] p-6">
                <div className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Dein Match</div>
                <div className="mt-3 text-5xl font-black tracking-[-0.06em]">vs {opponent.username}</div>
                <div className="mt-2 text-zinc-400">{opponent.elo} Elo</div>
              </div>
              <p className="mt-7 animate-pulse font-bold text-emerald-300">Du wirst zur Ergebnis-Eingabe weitergeleitet...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="relative text-center">
              <div className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] border border-red-400/25 bg-red-500/10 text-red-300">
                <XCircle className="h-12 w-12" />
              </div>
              <h2 className="mt-7 text-4xl font-black tracking-[-0.05em]">Matchmaking-Fehler</h2>
              <p className="mt-4 rounded-3xl border border-red-400/20 bg-red-500/10 p-5 text-zinc-300">{errorMessage}</p>
              <button onClick={() => setStatus('idle')} className="mt-7 rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-4 font-black uppercase tracking-[0.16em] text-black">
                Erneut versuchen
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 grid gap-5 md:grid-cols-3">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <ShieldCheck className="h-7 w-7 text-emerald-300" />
            <h3 className="mt-4 text-xl font-black">Fairer Radius</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Der Suchbereich wächst automatisch, damit Matches fair bleiben und trotzdem zustande kommen.</p>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <Timer className="h-7 w-7 text-cyan-300" />
            <h3 className="mt-4 text-xl font-black">Live Polling</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Die Seite prüft regelmäßig, ob ein passender Gegner gefunden wurde.</p>
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
