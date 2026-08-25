'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, ChevronRight, Crown, Gauge, Lock, ShieldCheck, Sparkles, Swords, Trophy, Users, Zap } from 'lucide-react';

type Tournament = {
  id: string; title: string; description: string; starts_at: string; registration_closes_at: string;
  max_players: number; best_of: number; premium_only: boolean; max_average: number | null; min_average: number | null;
  status: 'registration' | 'live' | 'completed' | 'cancelled'; winner_id: string | null;
  participant_count: number; joined: boolean; winner_username: string | null;
};

type BracketMatch = {
  id: string; round_number: number; match_number: number; player1_id: string | null; player2_id: string | null;
  player1_username: string | null; player2_username: string | null; winner_id: string | null; winner_username: string | null; status: string; active_match_id: string | null;
};

const statusLabel: Record<Tournament['status'], string> = { registration: 'ANMELDUNG OFFEN', live: 'LIVE', completed: 'ABGESCHLOSSEN', cancelled: 'ABGESAGT' };

function formatDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export default function TournamentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selected, setSelected] = useState<Tournament | null>(null);
  const [bracket, setBracket] = useState<BracketMatch[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const loadTournaments = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_tournaments');
    if (error) { setNotice({ kind: 'error', text: 'Turniere konnten noch nicht geladen werden. Bitte gleich noch einmal versuchen.' }); return; }
    const next = (data ?? []) as Tournament[];
    setTournaments(next);
    setSelected(current => current ? next.find(item => item.id === current.id) ?? null : next[0] ?? null);
  }, [supabase]);

  const loadBracket = useCallback(async (tournament: Tournament) => {
    setSelected(tournament);
    const { data, error } = await supabase.rpc('get_tournament_bracket', { p_tournament_id: tournament.id });
    if (error) { setNotice({ kind: 'error', text: 'Der Turnierbaum konnte nicht geladen werden.' }); return; }
    setBracket((data ?? []) as BracketMatch[]);
  }, [supabase]);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }
      setCurrentUserId(session.user.id);
      const [{ data: profile }, result] = await Promise.all([
        supabase.from('profiles').select('"isPremium"').eq('"supabaseId"', session.user.id).maybeSingle(),
        supabase.rpc('list_tournaments'),
      ]);
      setIsPremium(Boolean(profile?.isPremium));
      if (result.error) setNotice({ kind: 'error', text: 'Die Turnierdatenbank wird gerade vorbereitet. Bitte lade die Seite gleich erneut.' });
      const next = (result.data ?? []) as Tournament[];
      setTournaments(next); setSelected(next[0] ?? null); setLoading(false);
    }
    void init();
  }, [router, supabase]);

  useEffect(() => { if (selected) void loadBracket(selected); }, [loadBracket, selected?.id]);

  async function joinTournament(tournament: Tournament) {
    setNotice(null); setJoining(tournament.id);
    const { error } = await supabase.rpc('join_tournament', { p_tournament_id: tournament.id });
    if (error) setNotice({ kind: 'error', text: error.message });
    else { setNotice({ kind: 'success', text: `Du bist für ${tournament.title} registriert. Viel Erfolg!` }); await loadTournaments(); }
    setJoining(null);
  }

  const rounds = bracket.reduce<Record<number, BracketMatch[]>>((all, match) => {
    (all[match.round_number] ??= []).push(match); return all;
  }, {});
  const selectedHasBracket = bracket.length > 0;

  if (loading) return <main className="min-h-screen bg-[#07080c] grid place-items-center text-zinc-400"><div className="flex items-center gap-3"><span className="h-5 w-5 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />Turnierzentrum wird geladen …</div></main>;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07080c] text-white selection:bg-amber-300 selection:text-black">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_75%_45%_at_50%_-5%,rgba(245,158,11,0.20),transparent_70%),radial-gradient(ellipse_55%_35%_at_100%_42%,rgba(239,68,68,0.13),transparent_70%)]" />
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 md:px-8">
        <Link href="/profile" className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-white"><ArrowLeft size={16} /> Zurück zur Zentrale</Link>
        <div className="hidden items-center gap-6 text-sm font-semibold text-zinc-400 md:flex"><Link href="/leaderboard" className="hover:text-white">Leaderboard</Link><Link href="/matchmaking" className="hover:text-white">Matchmaking</Link><Link href="/support" className="hover:text-white">Support</Link></div>
        <Link href="/premium" className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-black tracking-wide text-amber-200 transition hover:bg-amber-300/20"><Crown size={14} /> PREMIUM</Link>
      </nav>

      <section className="mx-auto max-w-7xl px-5 pb-10 pt-8 md:px-8 md:pt-14">
        <div className="grid items-end gap-8 lg:grid-cols-[1.25fr_.75fr]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black tracking-[0.22em] text-amber-200"><Sparkles size={13} /> RANKEDDARTS CUP SERIES</div>
            <h1 className="max-w-3xl text-5xl font-black leading-[0.9] tracking-[-0.055em] sm:text-7xl">SPIEL UM<br /><span className="bg-gradient-to-r from-amber-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent">MEHR ALS ELO.</span></h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-zinc-400">Offene Cups, Premium-Events und faire Skill-Divisions. Melde dich an, zieh in den K.-o.-Baum ein und hol dir den Pokal.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-[1.8rem] border border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl">
            <div className="rounded-2xl bg-black/25 p-4"><Trophy className="mb-5 text-amber-300" size={21} /><b className="block text-2xl">{tournaments.length}</b><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Events</span></div>
            <div className="rounded-2xl bg-black/25 p-4"><Zap className="mb-5 text-red-300" size={21} /><b className="block text-2xl">{tournaments.filter(t => t.status === 'live').length}</b><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Live</span></div>
            <div className="rounded-2xl bg-black/25 p-4"><Users className="mb-5 text-cyan-300" size={21} /><b className="block text-2xl">{tournaments.reduce((sum, t) => sum + Number(t.participant_count), 0)}</b><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Starter</span></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 md:px-8">
        {notice && <div className={`mb-5 flex items-center justify-between rounded-2xl border px-5 py-4 text-sm ${notice.kind === 'success' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-red-400/25 bg-red-400/10 text-red-200'}`}><span>{notice.text}</span><button onClick={() => setNotice(null)} className="font-black">×</button></div>}
        <div className="mb-5 flex items-center justify-between"><div><p className="text-[11px] font-black tracking-[0.2em] text-amber-300">FINDE DEINEN CUP</p><h2 className="mt-1 text-2xl font-black">Aktuelle Turniere</h2></div><span className="hidden rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-500 sm:block">K.-o.-Format · Best of 5</span></div>

        {tournaments.length === 0 ? <div className="rounded-[2rem] border border-dashed border-white/15 bg-white/[0.025] px-6 py-16 text-center"><Trophy className="mx-auto mb-4 text-zinc-600" size={34} /><h3 className="text-xl font-black">Der nächste Cup kommt.</h3><p className="mt-2 text-sm text-zinc-500">Sobald ein Admin ein Turnier veröffentlicht, erscheint es hier inklusive Teilnahmebedingungen.</p></div> :
          <div className="grid gap-4 lg:grid-cols-3">{tournaments.map(tournament => {
            const locked = tournament.premium_only && !isPremium;
            const full = Number(tournament.participant_count) >= tournament.max_players;
            const canJoin = tournament.status === 'registration' && !tournament.joined && !locked && !full;
            return <article key={tournament.id} className={`group relative overflow-hidden rounded-[1.75rem] border p-5 transition ${selected?.id === tournament.id ? 'border-amber-300/45 bg-amber-300/[0.09]' : 'border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06]'}`}>
              <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-amber-300/10 blur-3xl transition group-hover:bg-amber-300/20" />
              <div className="relative flex items-start justify-between gap-3"><span className={`rounded-full px-2.5 py-1 text-[9px] font-black tracking-[0.14em] ${tournament.status === 'live' ? 'bg-red-400/15 text-red-200' : tournament.status === 'completed' ? 'bg-zinc-600/30 text-zinc-300' : 'bg-emerald-400/12 text-emerald-200'}`}>{statusLabel[tournament.status]}</span>{tournament.premium_only && <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-200"><Crown size={13} /> PREMIUM</span>}</div>
              <h3 className="relative mt-6 text-xl font-black tracking-tight">{tournament.title}</h3><p className="relative mt-2 min-h-10 text-sm leading-5 text-zinc-400">{tournament.description || 'Zeig, was du am Oche kannst.'}</p>
              <div className="relative mt-5 grid grid-cols-2 gap-2 text-xs text-zinc-400"><div className="flex items-center gap-2"><CalendarDays size={14} className="text-amber-300" />{formatDate(tournament.starts_at)}</div><div className="flex items-center gap-2"><Users size={14} className="text-cyan-300" />{tournament.participant_count}/{tournament.max_players}</div><div className="flex items-center gap-2"><Swords size={14} className="text-red-300" />Best of {tournament.best_of}</div><div className="flex items-center gap-2"><Gauge size={14} className="text-violet-300" />{tournament.max_average ? `Bis ${tournament.max_average} AVG` : 'Alle AVG'}</div></div>
              <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500" style={{ width: `${Math.min(100, Number(tournament.participant_count) / tournament.max_players * 100)}%` }} /></div>
              <div className="relative mt-5 flex gap-2"><button onClick={() => void loadBracket(tournament)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-zinc-300 transition hover:bg-white/10">Baum <ChevronRight size={14} /></button>{tournament.joined ? <span className="flex flex-1 items-center justify-center rounded-xl bg-emerald-400/15 text-xs font-black text-emerald-200"><ShieldCheck size={14} className="mr-1.5" /> Angemeldet</span> : canJoin ? <button onClick={() => void joinTournament(tournament)} disabled={joining === tournament.id} className="flex flex-1 items-center justify-center rounded-xl bg-amber-300 px-3 py-2.5 text-xs font-black text-black transition hover:bg-amber-200 disabled:opacity-60">{joining === tournament.id ? 'Wird angemeldet …' : 'Teilnehmen'}</button> : <span className="flex flex-1 items-center justify-center rounded-xl bg-white/[0.07] px-3 text-center text-[11px] font-bold text-zinc-400">{locked ? <><Lock size={13} className="mr-1" /> Premium benötigt</> : full ? 'Ausgebucht' : tournament.status === 'live' ? 'Läuft bereits' : 'Anmeldung beendet'}</span>}</div>
            </article>;
          })}</div>}
      </section>

      {selected && <section className="border-y border-white/[0.08] bg-black/25 py-14"><div className="mx-auto max-w-7xl px-5 md:px-8"><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-black tracking-[0.2em] text-amber-300">LIVE BRACKET</p><h2 className="mt-1 text-3xl font-black">{selected.title}</h2></div>{selected.winner_username && <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-100"><Trophy size={16} /> Champion: {selected.winner_username}</div>}</div>
        {!selectedHasBracket ? <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-white/[0.025] px-6 py-12 text-center"><Swords className="mx-auto mb-4 text-zinc-600" size={30} /><p className="font-bold text-zinc-300">Der Turnierbaum wird erstellt, sobald alle {selected.max_players} Plätze besetzt sind.</p><p className="mt-2 text-sm text-zinc-500">Die Paarungen werden fair ausgelost und live hier angezeigt.</p></div> : <div className="overflow-x-auto pb-3"><div className="grid min-w-[760px] gap-5" style={{ gridTemplateColumns: `repeat(${Object.keys(rounds).length}, minmax(190px, 1fr))` }}>{Object.entries(rounds).map(([round, matches]) => <div key={round}><div className="mb-3 flex items-center gap-2 text-[10px] font-black tracking-[0.16em] text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />{Number(round) === Math.max(...Object.keys(rounds).map(Number)) ? 'FINALE' : `RUNDE ${round}`}</div><div className="space-y-3">{matches.map(match => <div key={match.id} className="overflow-hidden rounded-xl border border-white/10 bg-[#101116]"><div className={`flex items-center justify-between px-3 py-2.5 text-sm ${match.winner_id === match.player1_id ? 'bg-emerald-400/10 text-emerald-100' : 'text-zinc-300'}`}><span>{match.player1_username || 'Wird ermittelt'}</span>{match.winner_id === match.player1_id && <span className="text-[9px] font-black text-emerald-300">WIN</span>}</div><div className="h-px bg-white/10" /><div className={`flex items-center justify-between px-3 py-2.5 text-sm ${match.winner_id === match.player2_id ? 'bg-emerald-400/10 text-emerald-100' : 'text-zinc-300'}`}><span>{match.player2_username || 'Wird ermittelt'}</span>{match.winner_id === match.player2_id && <span className="text-[9px] font-black text-emerald-300">WIN</span>}</div></div>)}</div></div>)}</div></div>}
      </div></section>}
      {selected && currentUserId && bracket.some(match => match.active_match_id && (match.player1_id === currentUserId || match.player2_id === currentUserId) && match.status !== 'completed') && (
        <div className="fixed bottom-5 right-5 z-30">
          {bracket.filter(match => match.active_match_id && (match.player1_id === currentUserId || match.player2_id === currentUserId) && match.status !== 'completed').map(match => (
            <Link key={match.id} href={`/result?matchId=${match.active_match_id}&bestOf=${selected.best_of}`} className="flex items-center gap-2 rounded-2xl border border-amber-200/40 bg-amber-300 px-5 py-3 text-sm font-black text-black shadow-[0_15px_45px_rgba(245,158,11,0.35)] transition hover:bg-amber-200"><Swords size={17} /> Dein Turnier-Matchroom</Link>
          ))}
        </div>
      )}
    </main>
  );
}
