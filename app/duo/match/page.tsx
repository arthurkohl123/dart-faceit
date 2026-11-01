'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, LoaderCircle, Swords } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type Player = { id: string; username: string; accepted: boolean };
type MatchState = { id: string; status: 'pending_accept' | 'pending_result' | 'awaiting_confirmation' | 'disputed'; accept_deadline: string; submitted_by: string | null; submitted_winner_team: number | null; submitted_team1_legs: number | null; submitted_team2_legs: number | null; team1: { players: [Player, Player]; elo: number }; team2: { players: [Player, Player]; elo: number } };
type State = { match: MatchState | null };

function errorText(error: unknown) {
  const text = error instanceof Error ? error.message : String(error ?? '');
  if (text.includes('OPPOSING_TEAM_CONFIRMATION_REQUIRED')) return 'Nur ein Spieler der gegnerischen Mannschaft kann das Ergebnis bestätigen.';
  if (text.includes('INVALID_MATCH_SCORE')) return 'Bitte trage ein gültiges Best-of-7-Ergebnis ein.';
  if (text.includes('MATCH_NOT_PENDING_RESULT')) return 'Für dieses Match kann gerade kein Ergebnis eingetragen werden.';
  return 'Die Aktion konnte nicht ausgeführt werden.';
}

export default function DuoMatchPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-[#080b0b] text-zinc-300"><LoaderCircle className="h-7 w-7 animate-spin" /></main>}><DuoMatchRoom /></Suspense>;
}

function DuoMatchRoom() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter(); const searchParams = useSearchParams(); const requestedId = searchParams.get('id');
  const [match, setMatch] = useState<MatchState | null>(null); const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [myLegs, setMyLegs] = useState('4'); const [opponentLegs, setOpponentLegs] = useState('0');
  const load = useCallback(async () => {
    const [{ data: auth }, { data, error }] = await Promise.all([supabase.auth.getUser(), supabase.rpc('duo_get_state')]);
    if (error) setNotice({ text: errorText(error), error: true });
    const next = (data as unknown as State | null)?.match ?? null;
    setUserId(auth.user?.id ?? null); setMatch(next && (!requestedId || requestedId === next.id) ? next : null); setLoading(false);
  }, [requestedId, supabase]);
  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); const timer = window.setInterval(() => void load(), 2_500); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [load]);
  const run = async (action: () => PromiseLike<{ error: { message: string } | null }>) => { setBusy(true); setNotice(null); const { error } = await action(); if (error) setNotice({ text: errorText(error), error: true }); else await load(); setBusy(false); };
  if (loading) return <main className="grid min-h-screen place-items-center bg-[#080b0b] text-zinc-300"><LoaderCircle className="h-7 w-7 animate-spin" /></main>;
  if (!match || !userId) return <main className="grid min-h-screen place-items-center bg-[#080b0b] px-4 text-center text-white"><div><h1 className="text-2xl font-black">Kein offenes Duo-Match</h1><p className="mt-2 text-zinc-500">Dieses Match ist nicht mehr aktiv oder gehört nicht zu deinem Account.</p><Link href="/duo" className="mt-5 inline-block rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-black">Zur Duo-Queue</Link></div></main>;
  const myTeam = match.team1.players.some((p) => p.id === userId) ? 1 : 2;
  const myPlayers = myTeam === 1 ? match.team1.players : match.team2.players; const opponents = myTeam === 1 ? match.team2.players : match.team1.players;
  const mine = myPlayers.find((p) => p.id === userId); const allAccepted = [...match.team1.players, ...match.team2.players].every((p) => p.accepted);
  const submittedByMe = match.submitted_by === userId;
  return <main className="min-h-screen bg-[#080b0b] px-4 py-7 text-white sm:px-7"><section className="mx-auto max-w-4xl"><header className="flex items-center justify-between border-b border-white/10 pb-5"><Link href="/duo" className="font-black">RANKED<span className="text-cyan-300">DARTS</span></Link><span className="text-xs font-black uppercase tracking-[.18em] text-cyan-200">Duo Match · DartCounter</span></header>
    <div className="mt-7 overflow-hidden rounded-[2rem] border border-white/10 bg-[#0e1314]"><div className="border-b border-white/10 bg-gradient-to-r from-cyan-400/[.08] via-transparent to-violet-400/[.08] px-6 py-7 text-center"><Swords className="mx-auto h-8 w-8 text-cyan-200"/><h1 className="mt-3 text-3xl font-black tracking-[-.06em]">{match.status === 'pending_accept' ? 'Team-Match gefunden' : match.status === 'pending_result' ? 'Match läuft' : 'Ergebnis wartet auf Bestätigung'}</h1><p className="mt-2 text-sm text-zinc-400">{match.status === 'pending_accept' ? 'Bestätige den Fund innerhalb von 30 Sekunden.' : 'Spielt den Team Mode in DartCounter und tragt danach das Ergebnis ein.'}</p></div>
      <div className="grid gap-px bg-white/10 md:grid-cols-[1fr_auto_1fr]"><Team title="Euer Team" players={myPlayers} elo={myTeam === 1 ? match.team1.elo : match.team2.elo} mine={userId} tone="cyan"/><div className="grid min-h-24 place-items-center bg-[#0e1314] px-5 py-5"><span className="text-sm font-black uppercase tracking-[.2em] text-zinc-600">VS</span></div><Team title="Gegner" players={opponents} elo={myTeam === 1 ? match.team2.elo : match.team1.elo} mine={userId} tone="violet"/></div>
      <div className="p-6 sm:p-8">{notice && <p className={`mb-5 rounded-xl border px-4 py-3 text-sm ${notice.error ? 'border-rose-300/25 bg-rose-400/10 text-rose-100' : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'}`}>{notice.text}</p>}
        {match.status === 'pending_accept' && <div className="text-center"><div className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-400/[.07] px-4 py-2 text-sm font-bold text-amber-100"><Clock3 className="h-4 w-4"/>{allAccepted ? 'Alle bereit' : 'Warte auf alle vier Spieler'}</div>{mine?.accepted ? <p className="mt-5 text-sm font-bold text-emerald-200">Du hast bestätigt. Warte auf die anderen Spieler…</p> : <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><button disabled={busy} onClick={() => void run(() => supabase.rpc('duo_accept_match', { p_match_id: match.id }))} className="min-h-12 rounded-xl bg-emerald-300 px-6 text-sm font-black uppercase tracking-[.13em] text-black">Match annehmen</button><button disabled={busy} onClick={() => void run(() => supabase.rpc('duo_decline_match', { p_match_id: match.id }))} className="min-h-12 rounded-xl border border-rose-300/25 px-6 text-sm font-black uppercase tracking-[.13em] text-rose-200">Ablehnen</button></div>}</div>}
        {match.status === 'pending_result' && <div className="mx-auto max-w-xl"><h2 className="text-center text-xl font-black">Ergebnis eintragen</h2><p className="mt-2 text-center text-sm text-zinc-500">Best of 7 · das gegnerische Team bestätigt anschließend.</p><div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-end gap-3"><label className="text-xs font-black uppercase tracking-[.13em] text-zinc-500">Euer Team<input value={myLegs} onChange={(e) => setMyLegs(e.target.value)} inputMode="numeric" className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-center text-2xl font-black outline-none focus:border-cyan-300/50"/></label><span className="pb-3 text-xl font-black text-zinc-600">:</span><label className="text-xs font-black uppercase tracking-[.13em] text-zinc-500">Gegner<input value={opponentLegs} onChange={(e) => setOpponentLegs(e.target.value)} inputMode="numeric" className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-center text-2xl font-black outline-none focus:border-violet-300/50"/></label></div><button disabled={busy} onClick={() => void run(() => supabase.rpc('duo_submit_result', { p_match_id: match.id, p_my_legs: Number(myLegs), p_opponent_legs: Number(opponentLegs) }))} className="mt-5 min-h-12 w-full rounded-xl bg-cyan-300 text-sm font-black uppercase tracking-[.13em] text-black">Ergebnis einreichen</button></div>}
        {match.status === 'awaiting_confirmation' && <div className="text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-amber-200"/><h2 className="mt-3 text-xl font-black">{match.submitted_team1_legs}:{match.submitted_team2_legs}</h2><p className="mt-2 text-sm text-zinc-400">{submittedByMe ? 'Dein Ergebnis wurde eingereicht. Ein Gegner muss es bestätigen.' : 'Die gegnerische Mannschaft hat ein Ergebnis eingereicht.'}</p>{!submittedByMe && <button disabled={busy} onClick={() => void run(async () => { const result = await supabase.rpc('duo_confirm_result', { p_match_id: match.id }); if (!result.error) { setNotice({ text: 'Ergebnis bestätigt. Die Duo-Elo wurde aktualisiert.' }); window.setTimeout(() => router.push('/duo'), 1300); } return result; })} className="mt-5 min-h-12 rounded-xl bg-emerald-300 px-6 text-sm font-black uppercase tracking-[.13em] text-black">Ergebnis bestätigen</button>}</div>}
      </div>
    </div></section></main>;
}

function Team({ title, players, elo, mine, tone }: { title: string; players: [Player, Player]; elo: number; mine: string; tone: 'cyan' | 'violet' }) {
  const className = tone === 'cyan' ? 'text-cyan-200 border-cyan-300/20 bg-cyan-400/[.05]' : 'text-violet-200 border-violet-300/20 bg-violet-400/[.05]';
  return <div className="bg-[#0e1314] p-5 sm:p-7"><p className={`inline-flex rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-[.14em] ${className}`}>{title} · {elo} Elo</p><div className="mt-4 space-y-2">{players.map((player) => <div key={player.id} className="flex items-center gap-3 rounded-xl border border-white/[.08] bg-black/15 px-3 py-3"><span className={`h-2.5 w-2.5 rounded-full ${player.accepted ? 'bg-emerald-300' : 'bg-zinc-700'}`}/><span className="min-w-0 flex-1 truncate text-sm font-black">{player.username}{player.id === mine ? ' (Du)' : ''}</span>{player.accepted ? <CheckCircle2 className="h-4 w-4 text-emerald-200"/> : <Clock3 className="h-4 w-4 text-zinc-600"/>}</div>)}</div></div>;
}
