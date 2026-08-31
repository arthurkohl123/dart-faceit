'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Swords, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type Platform = 'scolia' | 'dartcounter' | 'autodarts';

type FriendChallenge = {
  challenge_id: string;
  direction: 'incoming' | 'outgoing';
  user_id: string;
  username: string;
  app: Platform;
  best_of: number;
  expires_at: string;
};

type ReadyMatch = { match_id: string; best_of: number };

const platformNames: Record<Platform, string> = {
  scolia: 'Scolia',
  dartcounter: 'DartCounter',
  autodarts: 'AutoDarts',
};

export function FriendChallengePopup({ userId }: { userId: string | undefined }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [challenges, setChallenges] = useState<FriendChallenge[]>([]);
  const [readyMatch, setReadyMatch] = useState<ReadyMatch | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirectedMatchRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setChallenges([]);
      setReadyMatch(null);
      return;
    }

    const [challengeResult, readyResult] = await Promise.all([
      supabase.rpc('list_my_friend_challenges'),
      supabase.rpc('get_ready_friend_matchroom'),
    ]);
    setChallenges(((challengeResult.data ?? []) as FriendChallenge[]).filter((challenge) => challenge.direction === 'incoming'));
    // The redirect RPC is introduced with this feature. Silently ignoring a
    // missing function keeps the popup usable until its migration is applied.
    if (!readyResult.error) setReadyMatch(((readyResult.data ?? []) as ReadyMatch[])[0] ?? null);
  }, [supabase, userId]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(); }, 0);
    const interval = window.setInterval(() => { void load(); }, 4_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  useEffect(() => {
    if (!readyMatch || redirectedMatchRef.current === readyMatch.match_id) return;
    redirectedMatchRef.current = readyMatch.match_id;
    router.replace(`/result?matchId=${encodeURIComponent(readyMatch.match_id)}&bestOf=${readyMatch.best_of}`);
  }, [readyMatch, router]);

  const challenge = challenges.find((entry) => !dismissed.has(entry.challenge_id));

  const respond = async (accepted: boolean) => {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    const { data, error: responseError } = await supabase.rpc('respond_to_friend_challenge', {
      p_challenge_id: challenge.challenge_id,
      p_accept: accepted,
    });
    if (responseError) {
      setError(responseError.message);
      setBusy(false);
      return;
    }

    setDismissed((current) => new Set(current).add(challenge.challenge_id));
    if (accepted) {
      const result = data as { match_id?: string; best_of?: number } | null;
      if (result?.match_id) {
        router.replace(`/result?matchId=${encodeURIComponent(result.match_id)}&bestOf=${result.best_of ?? challenge.best_of}`);
        return;
      }
      setError('Das Duell wurde erstellt, aber der Matchroom konnte nicht geöffnet werden.');
    }
    await load();
    setBusy(false);
  };

  if (!challenge) return null;

  return (
    <aside role="dialog" aria-modal="true" aria-live="assertive" className="fixed inset-0 z-[80] flex items-end bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-amber-300/35 bg-[#0a0d0c] shadow-2xl shadow-black/80">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="relative p-6 sm:p-7">
          <div className="flex items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-100"><Swords className="h-6 w-6" /></div><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200">Direktes Duell</p><h2 className="mt-1 truncate text-2xl font-black">{challenge.username} fordert dich heraus</h2><p className="mt-2 text-sm leading-6 text-zinc-400">{platformNames[challenge.app]} · Best of {challenge.best_of} · privat und ohne Elo-Wertung</p></div><button onClick={() => setDismissed((current) => new Set(current).add(challenge.challenge_id))} aria-label="Später anzeigen" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div>
          <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-4 text-xs leading-5 text-amber-50/80">Bei Annahme werdet ihr beide sofort in denselben Matchroom geleitet.</div>
          {error && <p className="mt-3 rounded-xl border border-red-400/25 bg-red-400/[0.08] px-3 py-2 text-xs font-bold text-red-100">{error}</p>}
          <div className="mt-5 grid grid-cols-2 gap-2"><button onClick={() => void respond(false)} disabled={busy} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-zinc-200 transition hover:bg-white/10 disabled:opacity-50">Ablehnen</button><button onClick={() => void respond(true)} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-black transition hover:bg-amber-200 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Annehmen</button></div>
        </div>
      </div>
    </aside>
  );
}
