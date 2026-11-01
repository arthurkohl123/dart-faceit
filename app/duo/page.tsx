'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Link2, LoaderCircle, ShieldCheck, Swords, UserPlus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type Player = { id: string; username: string; accepted: boolean };
type DuoMatch = {
  id: string;
  status: 'pending_accept' | 'pending_result' | 'awaiting_confirmation' | 'disputed';
  app: string;
  accept_deadline: string;
  team1: { players: [Player, Player]; elo: number };
  team2: { players: [Player, Player]; elo: number };
};
type DuoState = {
  rating: { elo: number; games_played: number; wins: number };
  party: { id: string; leader_id: string; leader_username: string; invited_user_id: string; invited_username: string; status: 'pending' | 'ready' } | null;
  queue: { id: string; queue_kind: 'solo' | 'party'; team_elo: number; joined_at: string } | null;
  match: DuoMatch | null;
};

type DuoQueueSetting = {
  enabled?: boolean;
  message?: string;
};

const defaultDuoQueueMessage = 'Die Duo-Queue ist vorübergehend pausiert. Bitte versuche es später erneut.';

function messageOf(error: unknown) {
  const text = error instanceof Error ? error.message : String(error ?? '');
  const queueClosedMessage = text.match(/DUO_MATCHMAKING_QUEUE_DISABLED:\s*(.+)/i)?.[1]?.trim();
  if (queueClosedMessage) return queueClosedMessage;
  const messages: Record<string, string> = {
    PLAYER_NOT_FOUND: 'Dieser Spieler wurde nicht gefunden.',
    CANNOT_INVITE_SELF: 'Du kannst dich nicht selbst einladen.',
    PARTY_ALREADY_EXISTS: 'Einer von euch ist bereits in einer Duo-Party.',
    DARTCOUNTER_USERNAME_REQUIRED: 'Beide Spieler benötigen einen hinterlegten DartCounter-Namen.',
    READY_PARTY_REQUIRED: 'Deine Party muss erst angenommen werden.',
    LEAVE_PARTY_FOR_SOLO_QUEUE: 'Verlasse zuerst deine Party, um solo zu suchen.',
    ACTIVE_1V1_QUEUE_EXISTS: 'Ein Spieler von euch sucht noch in der 1vs1-Queue.',
    ACTIVE_1V1_MATCH_EXISTS: 'Ein Spieler von euch hat noch ein offenes 1vs1-Match.',
    ACTIVE_DUO_MATCH_EXISTS: 'Ein Spieler von euch hat noch ein offenes Duo-Match.',
    QUEUE_BANNED: 'Die Queue ist für einen Spieler aktuell gesperrt.',
  };
  return Object.entries(messages).find(([key]) => text.includes(key))?.[1] ?? 'Das konnte gerade nicht ausgeführt werden. Bitte versuche es erneut.';
}

export function DuoQueuePanel({
  embedded = false,
  onActivityChange,
}: {
  embedded?: boolean;
  onActivityChange?: (active: boolean) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<DuoState | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [duoQueueEnabled, setDuoQueueEnabled] = useState(true);
  const [duoQueueMessage, setDuoQueueMessage] = useState(defaultDuoQueueMessage);

  const load = useCallback(async () => {
    const [{ data: auth }, { data, error }, { data: queueSetting, error: queueSettingError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc('duo_get_state'),
      supabase.rpc('get_duo_matchmaking_queue_status'),
    ]);
    if (!queueSettingError) {
      const setting = queueSetting as DuoQueueSetting | null;
      setDuoQueueEnabled(setting?.enabled !== false);
      setDuoQueueMessage(setting?.message ?? defaultDuoQueueMessage);
    }
    if (error) {
      setNotice({ text: messageOf(error), error: true });
      return;
    }
    setUserId(auth.user?.id ?? null);
    setState(data as unknown as DuoState);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!state?.queue && !state?.match) return;
    const timer = window.setInterval(async () => {
      if (state.queue) {
        await supabase.rpc('duo_join_queue', { p_max_elo_diff: 500, p_queue_kind: state.queue.queue_kind });
      }
      void load();
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [state?.match, state?.queue, load, supabase]);

  useEffect(() => {
    onActivityChange?.(Boolean(state?.queue || state?.match));
  }, [onActivityChange, state?.match, state?.queue]);

  const run = async (name: string, action: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(name);
    setNotice(null);
    const { error } = await action();
    if (error) setNotice({ text: messageOf(error), error: true });
    else await load();
    setBusy(null);
  };

  const partyPartner = state?.party
    ? state.party.leader_id === userId ? state.party.invited_username : state.party.leader_username
    : null;
  const incoming = state?.party?.invited_user_id === userId && state.party.status === 'pending';
  const panelClass = embedded ? '' : 'mx-auto max-w-4xl px-4 py-10';

  return <div className={panelClass}>
    <div className="border-b border-white/10 pb-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">DartCounter · Team Mode</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.06em] text-white">2vs2 Duo Queue</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Spiele mit einem Freund oder lass dir einen zufälligen Mate zuteilen. Deine 1vs1-Elo bleibt separat.</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 border border-cyan-300/20 bg-cyan-400/[0.06] px-4 py-3 sm:text-right">
          <div className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,.8)]" />
          <div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">Duo Elo</p><p className="mt-0.5 text-xl font-black text-cyan-100">{state?.rating.elo ?? '—'} <span className="text-xs font-bold text-zinc-500">· {state?.rating.wins ?? 0}S / {state?.rating.games_played ?? 0}M</span></p></div>
        </div>
      </div>
    </div>

    {!duoQueueEnabled && !state?.match && <div className="mt-5 flex items-start gap-3 border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-50"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" /><div><strong className="font-black">Duo-Queue ist geschlossen</strong><p className="mt-1 text-amber-100/80">{duoQueueMessage}</p></div></div>}
    {notice && <div className={`mt-5 flex items-start gap-3 border px-4 py-3 text-sm ${notice.error ? 'border-rose-300/25 bg-rose-400/10 text-rose-100' : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'}`}><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{notice.text}</div>}

    <div className="mt-6">
      {state?.match ? (
        <div className="border border-emerald-300/25 bg-emerald-400/[.06] p-6 text-center">
          <Swords className="mx-auto h-7 w-7 text-emerald-200" />
          <h3 className="mt-3 text-xl font-black text-white">Duo-Match gefunden</h3>
          <p className="mt-2 text-sm text-zinc-400">Vier Spieler wurden zusammengestellt. Alle bestätigen den Fund, bevor es losgeht.</p>
          <Link href={`/duo/match?id=${state.match.id}`} className="mt-5 inline-flex min-h-11 items-center justify-center bg-emerald-300 px-5 text-xs font-black uppercase tracking-[.13em] text-black transition hover:bg-emerald-200">Zum Match</Link>
        </div>
      ) : !duoQueueEnabled ? (
        <div className="border border-amber-300/20 bg-amber-400/[.045] p-6 text-center">
          <ShieldCheck className="mx-auto h-7 w-7 text-amber-200" />
          <h3 className="mt-3 text-xl font-black text-white">Duo-Queue vorübergehend geschlossen</h3>
          <p className="mt-2 text-sm text-zinc-400">{duoQueueMessage}</p>
        </div>
      ) : state?.queue ? (
        <div className="border border-cyan-300/25 bg-cyan-400/[.06] p-6 text-center">
          <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-cyan-200" />
          <h3 className="mt-3 text-xl font-black text-white">{state.queue.queue_kind === 'party' ? 'Ihr sucht als Duo' : 'Wir suchen deinen Mate'}</h3>
          <p className="mt-2 text-sm text-zinc-400">DartCounter · {state.queue.team_elo} Team-Elo · Suche läuft</p>
          <button onClick={() => void run('cancel', () => supabase.rpc('duo_cancel_queue'))} disabled={busy !== null} className="mt-5 min-h-10 border border-white/15 px-5 text-xs font-black uppercase tracking-[.13em] text-zinc-200 transition hover:bg-white/10 disabled:opacity-50">Suche abbrechen</button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <section className="border border-violet-300/20 bg-violet-400/[.045] p-5">
            <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center border border-violet-300/20 bg-violet-400/10"><Users className="h-4 w-4 text-violet-200" /></span><div><h3 className="font-black text-white">Mit Freund spielen</h3><p className="mt-0.5 text-xs text-zinc-500">Party erstellen und gemeinsam suchen</p></div></div>
            {!state?.party ? <><label className="mt-5 block text-xs font-bold text-zinc-400">RankedDarts-Nutzername<input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Freund einladen" className="mt-2 min-h-11 w-full border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-violet-300/50" /></label><button onClick={() => void run('invite', () => supabase.rpc('duo_create_party', { p_invited_username: inviteName }))} disabled={!inviteName.trim() || busy !== null} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 bg-violet-300 text-xs font-black uppercase tracking-[.13em] text-black transition hover:bg-violet-200 disabled:opacity-50"><UserPlus className="h-4 w-4" />{busy === 'invite' ? 'Wird eingeladen…' : 'Einladung senden'}</button></> : <div className="mt-5 border border-white/10 bg-black/20 p-4"><p className="font-black text-white">{partyPartner}</p><p className="mt-1 text-xs text-zinc-500">{state.party.status === 'ready' ? 'Bereit für die Duo-Queue.' : incoming ? 'Diese Einladung wartet auf deine Antwort.' : 'Einladung wurde gesendet.'}</p>{incoming ? <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => void run('accept-party', () => supabase.rpc('duo_respond_party_invite', { p_party_id: state.party!.id, p_accept: true }))} className="min-h-10 bg-emerald-300 text-xs font-black text-black">Annehmen</button><button onClick={() => void run('decline-party', () => supabase.rpc('duo_respond_party_invite', { p_party_id: state.party!.id, p_accept: false }))} className="min-h-10 border border-rose-300/20 text-xs font-black text-rose-200">Ablehnen</button></div> : state.party.status === 'ready' ? <button onClick={() => void run('party-search', () => supabase.rpc('duo_join_queue', { p_max_elo_diff: 50, p_queue_kind: 'party' }))} disabled={!duoQueueEnabled || busy !== null} className="mt-4 min-h-11 w-full bg-violet-300 text-xs font-black uppercase tracking-[.13em] text-black transition hover:bg-violet-200 disabled:opacity-50">Als Duo suchen</button> : null}<button onClick={() => void run('leave-party', () => supabase.rpc('duo_leave_party'))} className="mt-3 text-xs font-bold text-zinc-500 transition hover:text-white">Party verlassen</button></div>}
          </section>
          <section className="border border-cyan-300/20 bg-cyan-400/[.045] p-5">
            <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center border border-cyan-300/20 bg-cyan-400/10"><Link2 className="h-4 w-4 text-cyan-200" /></span><div><h3 className="font-black text-white">Solo suchen</h3><p className="mt-0.5 text-xs text-zinc-500">Zufälliger Mate · faire Teamstärke</p></div></div>
            <p className="mt-5 text-sm leading-6 text-zinc-400">Wir kombinieren vier Solospieler so, dass beide Teams möglichst nah beieinander liegen.</p>
            <button onClick={() => void run('solo-search', () => supabase.rpc('duo_join_queue', { p_max_elo_diff: 50, p_queue_kind: 'solo' }))} disabled={!duoQueueEnabled || Boolean(state?.party) || busy !== null} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 bg-cyan-300 text-xs font-black uppercase tracking-[.13em] text-black transition hover:bg-cyan-200 disabled:opacity-40"><Swords className="h-4 w-4" />Solo-Queue starten</button>
            {state?.party && <p className="mt-3 text-xs text-zinc-500">Verlasse zuerst deine Party, um solo zu suchen.</p>}
          </section>
        </div>
      )}
    </div>

    <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 text-xs leading-5 text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />Vier Spieler bestätigen den Fund. Das gegnerische Team bestätigt anschließend das Ergebnis.</p>
      <Link href="/duo/leaderboard" className="shrink-0 font-black uppercase tracking-[.12em] text-cyan-200 transition hover:text-cyan-100">Duo-Rangliste →</Link>
    </div>
  </div>;
}

export default function DuoPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/matchmaking'); }, [router]);
  return <main className="grid min-h-screen place-items-center bg-[#080b0b] text-zinc-300"><LoaderCircle className="h-7 w-7 animate-spin" /></main>;
}
