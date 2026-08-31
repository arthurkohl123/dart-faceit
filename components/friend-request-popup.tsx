'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, UserPlus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type FriendRequest = {
  friendship_id: string;
  user_id: string;
  username: string;
  elo: number;
};

export function FriendRequestPopup({ userId }: { userId: string | undefined }) {
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setRequests([]);
      return;
    }
    const { data } = await supabase.rpc('list_my_friend_requests');
    setRequests((data ?? []) as FriendRequest[]);
  }, [supabase, userId]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(); }, 0);
    const interval = window.setInterval(() => { void load(); }, 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  const request = requests.find((entry) => !dismissed.has(entry.friendship_id));

  const respond = async (accepted: boolean) => {
    if (!request) return;
    setBusy(true);
    const { error } = await supabase.rpc('respond_to_friend_request', {
      p_friendship_id: request.friendship_id,
      p_accept: accepted,
    });
    if (!error) {
      setDismissed((current) => new Set(current).add(request.friendship_id));
      await load();
    }
    setBusy(false);
  };

  if (!request) return null;

  return (
    <aside aria-live="polite" className="fixed bottom-4 right-4 z-[70] w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-[1.5rem] border border-emerald-300/30 bg-[#0a0d0c]/95 shadow-2xl shadow-black/70 backdrop-blur-xl">
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-300/15 blur-3xl" />
      <div className="relative p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-emerald-300/30 bg-emerald-400/10 text-emerald-200"><UserPlus className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Freundschaftsanfrage</p>
            <h2 className="mt-1 truncate text-lg font-black">{request.username}</h2>
            <p className="mt-1 text-sm text-zinc-400">möchte dein Freund werden · {request.elo} Elo</p>
          </div>
          <button onClick={() => setDismissed((current) => new Set(current).add(request.friendship_id))} aria-label="Später anzeigen" className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={() => void respond(false)} disabled={busy} className="rounded-xl border border-white/15 px-3 py-2.5 text-sm font-black text-zinc-200 transition hover:bg-white/10 disabled:opacity-50">Ablehnen</button>
          <button onClick={() => void respond(true)} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-300 px-3 py-2.5 text-sm font-black text-black transition hover:bg-emerald-200 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Annehmen</button>
        </div>
      </div>
    </aside>
  );
}
