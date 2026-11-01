'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Crown, Link2, LoaderCircle, ShieldCheck, Swords, UserPlus, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Player = { id: string; username: string; accepted: boolean };
type DuoMatch = {
  id: string; status: 'pending_accept' | 'pending_result' | 'awaiting_confirmation' | 'disputed'; app: string; accept_deadline: string;
  team1: { players: [Player, Player]; elo: number }; team2: { players: [Player, Player]; elo: number };
};
type DuoState = {
  rating: { elo: number; games_played: number; wins: number };
  party: { id: string; leader_id: string; leader_username: string; invited_user_id: string; invited_username: string; status: 'pending' | 'ready' } | null;
  queue: { id: string; queue_kind: 'solo' | 'party'; team_elo: number; joined_at: string } | null;
  match: DuoMatch | null;
};
type Leader = { rank: number; username: string; elo: number; games_played: number; wins: number; winrate: number };

function messageOf(error: unknown) {
  const text = error instanceof Error ? error.message : String(error ?? '');
  const messages: Record<string, string> = {
    PLAYER_NOT_FOUND: 'Dieser Spieler wurde nicht gefunden.', CANNOT_INVITE_SELF: 'Du kannst dich nicht selbst einladen.',
    PARTY_ALREADY_EXISTS: 'Einer von euch ist bereits in einer Duo-Party.', DARTCOUNTER_USERNAME_REQUIRED: 'Beide Spieler benötigen einen hinterlegten DartCounter-Namen.',
    READY_PARTY_REQUIRED: 'Deine Party muss erst angenommen werden.', LEAVE_PARTY_FOR_SOLO_QUEUE: 'Verlasse zuerst deine Party, um solo zu suchen.',
    ACTIVE_1V1_QUEUE_EXISTS: 'Ein Spieler von euch sucht noch in der 1vs1-Queue.', ACTIVE_1V1_MATCH_EXISTS: 'Ein Spieler von euch hat noch ein offenes 1vs1-Match.', ACTIVE_DUO_MATCH_EXISTS: 'Ein Spieler von euch hat noch ein offenes Duo-Match.',
    QUEUE_BANNED: 'Die Queue ist für einen Spieler aktuell gesperrt.',
  };
  return Object.entries(messages).find(([key]) => text.includes(key))?.[1] ?? 'Das konnte gerade nicht ausgeführt werden. Bitte versuche es erneut.';
}

export default function DuoPage() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<DuoState | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    const [{ data: auth }, { data: stateData, error }, { data: leadersData }] = await Promise.all([
      supabase.auth.getUser(), supabase.rpc('duo_get_state'), supabase.rpc('duo_get_leaderboard', { p_limit: 8 }),
    ]);
    if (error) { setNotice({ text: messageOf(error), error: true }); return; }
    setUserId(auth.user?.id ?? null);
    setState(stateData as unknown as DuoState);
    setLeaders((leadersData ?? []) as Leader[]);
  }, [supabase]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!state?.queue && !state?.match) return;
    const timer = window.setInterval(async () => {
      if (state.queue) {
        await supabase.rpc('duo_join_queue', { p_max_elo_diff: 500, p_queue_kind: state.queue.queue_kind });
      }
      void load();
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [state?.queue, state?.match, load, supabase]);

  const run = async (name: string, action: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(name); setNotice(null);
    const { error } = await action();
    if (error) setNotice({ text: messageOf(error), error: true });
    else await load();
    setBusy(null);
  };
  const partyPartner = state?.party ? (state.party.leader_id === userId ? state.party.invited_username : state.party.leader_username) : null;
  const incoming = state?.party?.invited_user_id === userId && state.party.status === 'pending';

  return <main className="min-h-screen bg-[#080b0b] text-white">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_90%_25%,rgba(167,139,250,0.1),transparent_25%)]" />
    <section className="relative mx-auto max-w-7xl px-4 py-6 sm:px-7 lg:py-10">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
        <Link href="/" className="text-lg font-black tracking-[-0.05em]">RANKED<span className="text-cyan-300">DARTS</span></Link>
        <nav className="flex items-center gap-3 text-sm font-bold text-zinc-400"><Link href="/matchmaking" className="hover:text-white">1vs1</Link><Link href="/leaderboard" className="hover:text-white">Rangliste</Link><Link href="/duo/leaderboard" className="text-cyan-200">Duo-Rangliste</Link></nav>
      </header>

      <div className="mt-8 grid gap-5 xl:grid-cols-[1.55fr_.7fr]">
        <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[#0e1314]/90 shadow-[0_0_80px_rgba(34,211,238,0.07)]">
          <div className="border-b border-white/10 bg-gradient-to-r from-cyan-400/[0.11] via-transparent to-violet-400/[0.1] px-6 py-7 sm:px-9">
            <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-[10px] font-black uppercase tracking-[.26em] text-cyan-200">DartCounter · Team Mode</p><h1 className="mt-2 text-4xl font-black tracking-[-.065em] sm:text-5xl">Duo Ranked</h1><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">Tritt mit einem Freund an oder finde einen zufälligen Mate. Deine 1vs1-Elo bleibt komplett unberührt.</p></div>
              <div className="min-w-36 rounded-2xl border border-cyan-200/20 bg-black/25 px-4 py-3 text-right"><p className="text-[10px] font-black uppercase tracking-[.16em] text-zinc-500">Deine Duo-Elo</p><p className="mt-1 text-3xl font-black text-cyan-200">{state?.rating.elo ?? '—'}</p><p className="mt-1 text-xs font-bold text-zinc-500">{state?.rating.wins ?? 0} Siege · {state?.rating.games_played ?? 0} Matches</p></div>
            </div>
          </div>

          <div className="p-5 sm:p-8">
            {notice && <div className={`mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${notice.error ? 'border-rose-300/25 bg-rose-400/10 text-rose-100' : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'}`}><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{notice.text}</div>}
            {state?.match ? <div className="rounded-3xl border border-emerald-300/25 bg-emerald-400/[.06] p-6 text-center"><Swords className="mx-auto h-8 w-8 text-emerald-200"/><h2 className="mt-3 text-2xl font-black">Duo-Match gefunden</h2><p className="mt-2 text-sm text-zinc-400">Vier Spieler wurden zusammengestellt. Alle müssen den Fund bestätigen.</p><Link href={`/duo/match?id=${state.match.id}`} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-300 px-6 text-sm font-black uppercase tracking-[.13em] text-black hover:bg-emerald-200">Zum Duo-Match</Link></div>
            : state?.queue ? <div className="rounded-3xl border border-cyan-300/25 bg-cyan-400/[.06] p-6 text-center"><LoaderCircle className="mx-auto h-8 w-8 animate-spin text-cyan-200"/><h2 className="mt-3 text-2xl font-black">{state.queue.queue_kind === 'party' ? 'Ihr sucht als Duo' : 'Wir suchen deinen Mate'}</h2><p className="mt-2 text-sm text-zinc-400">DartCounter · {state.queue.team_elo} Team-Elo · Suche läuft</p><button onClick={() => void run('cancel', () => supabase.rpc('duo_cancel_queue'))} disabled={busy !== null} className="mt-5 min-h-11 rounded-xl border border-white/15 px-5 text-xs font-black uppercase tracking-[.13em] text-zinc-200 hover:bg-white/10">Suche abbrechen</button></div>
            : <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-3xl border border-violet-300/20 bg-violet-400/[.045] p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-300/20 bg-violet-400/10"><Users className="h-5 w-5 text-violet-200" /></span><div><p className="font-black">Mit Freund spielen</p><p className="text-xs text-zinc-500">Party erstellen und gemeinsam queuen</p></div></div>
                {!state?.party ? <><label className="mt-5 block text-xs font-bold text-zinc-400">RankedDarts-Nutzername<input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Freund einladen" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none placeholder:text-zinc-700 focus:border-violet-300/50" /></label><button onClick={() => void run('invite', () => supabase.rpc('duo_create_party', { p_invited_username: inviteName }))} disabled={!inviteName.trim() || busy !== null} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-300 text-xs font-black uppercase tracking-[.13em] text-black hover:bg-violet-200 disabled:opacity-50"><UserPlus className="h-4 w-4" />{busy === 'invite' ? 'Wird eingeladen…' : 'Einladung senden'}</button></>
                : <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-sm font-black">{partyPartner}</p><p className="mt-1 text-xs text-zinc-500">{state.party.status === 'ready' ? 'Bereit für die Duo-Queue.' : incoming ? 'Deine Einladung wartet auf Antwort.' : 'Einladung wurde gesendet.'}</p>{incoming ? <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => void run('accept-party', () => supabase.rpc('duo_respond_party_invite', { p_party_id: state.party!.id, p_accept: true }))} className="min-h-10 rounded-xl bg-emerald-300 text-xs font-black text-black">Annehmen</button><button onClick={() => void run('decline-party', () => supabase.rpc('duo_respond_party_invite', { p_party_id: state.party!.id, p_accept: false }))} className="min-h-10 rounded-xl border border-rose-300/20 text-xs font-black text-rose-200">Ablehnen</button></div> : state.party.status === 'ready' ? <button onClick={() => void run('party-search', () => supabase.rpc('duo_join_queue', { p_max_elo_diff: 50, p_queue_kind: 'party' }))} disabled={busy !== null} className="mt-4 min-h-11 w-full rounded-xl bg-violet-300 text-xs font-black uppercase tracking-[.13em] text-black">Als Duo suchen</button> : null}<button onClick={() => void run('leave-party', () => supabase.rpc('duo_leave_party'))} className="mt-3 text-xs font-bold text-zinc-500 hover:text-white">Party verlassen</button></div>}</article>
              <article className="rounded-3xl border border-cyan-300/20 bg-cyan-400/[.045] p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-400/10"><Link2 className="h-5 w-5 text-cyan-200" /></span><div><p className="font-black">Solo suchen</p><p className="text-xs text-zinc-500">Zufälliger Mate · faire Teamstärke</p></div></div><p className="mt-5 text-sm leading-6 text-zinc-400">Vier Solospieler werden so kombiniert, dass beide Teams möglichst nah beieinander liegen.</p><button onClick={() => void run('solo-search', () => supabase.rpc('duo_join_queue', { p_max_elo_diff: 50, p_queue_kind: 'solo' }))} disabled={Boolean(state?.party) || busy !== null} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 text-xs font-black uppercase tracking-[.13em] text-black hover:bg-cyan-200 disabled:opacity-40"><Swords className="h-4 w-4" />Solo-Queue starten</button>{state?.party && <p className="mt-3 text-xs text-zinc-500">Verlasse zuerst deine Party, um solo zu suchen.</p>}</article>
            </div>}
            <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3"><div className="bg-[#101516] p-4"><Clock3 className="h-4 w-4 text-cyan-200"/><p className="mt-3 text-sm font-black">Fairer Start</p><p className="mt-1 text-xs leading-5 text-zinc-500">Die Suche beginnt eng und erweitert sich automatisch.</p></div><div className="bg-[#101516] p-4"><Users className="h-4 w-4 text-violet-200"/><p className="mt-3 text-sm font-black">Party bleibt zusammen</p><p className="mt-1 text-xs leading-5 text-zinc-500">Dein Freund wird niemals auf die Gegenseite gelost.</p></div><div className="bg-[#101516] p-4"><Crown className="h-4 w-4 text-amber-200"/><p className="mt-3 text-sm font-black">Eigene Wertung</p><p className="mt-1 text-xs leading-5 text-zinc-500">Duo-Elo und 1vs1-Elo sind komplett getrennt.</p></div></div>
          </div>
        </div>
        <aside className="rounded-[2rem] border border-white/10 bg-[#0e1314]/90 p-5 sm:p-6"><div className="flex items-center gap-3"><Crown className="h-5 w-5 text-amber-200"/><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-200">Duo Ranked</p><h2 className="font-black">Top Spieler</h2></div></div><div className="mt-5 space-y-2">{leaders.length ? leaders.map((player) => <div key={player.username} className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-black/15 px-3 py-3"><span className="w-5 text-center text-xs font-black text-zinc-600">{player.rank}</span><span className="min-w-0 flex-1 truncate text-sm font-bold">{player.username}</span><span className="text-sm font-black text-cyan-200">{player.elo}</span></div>) : <p className="py-8 text-center text-sm text-zinc-600">Die erste Duo-Rangliste entsteht gerade.</p>}</div><Link href="/duo/leaderboard" className="mt-5 flex min-h-11 items-center justify-center rounded-xl border border-white/10 text-xs font-black uppercase tracking-[.13em] text-zinc-300 hover:bg-white/5">Ganze Rangliste</Link><div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-400/[.05] p-4 text-xs leading-5 text-zinc-400"><Check className="mb-2 h-4 w-4 text-emerald-200"/>Für ein Match müssen alle vier Spieler bestätigen. Das Ergebnis wird anschließend von der gegnerischen Seite bestätigt.</div></aside>
      </div>
    </section>
  </main>;
}
