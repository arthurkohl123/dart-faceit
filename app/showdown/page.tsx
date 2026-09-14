'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CalendarDays, Clock3, Crown, Medal, Menu, Swords, Trophy, Users, X, Zap } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { createClient } from '@/lib/supabase';

type ShowdownStatus = {
  is_active: boolean;
  event_enabled: boolean;
  free_limit_override: boolean;
  starts_at: string;
  ends_at: string;
  minimum_matches: number;
  title: string;
};

type ShowdownPlayer = {
  user_id: string;
  username: string;
  matches_played: number;
  wins: number;
  winrate: number;
  average: number | null;
  total_180s: number;
  elo: number;
};

type ShowdownRecapPlayer = ShowdownPlayer & {
  period_start: string;
  period_end: string;
};

type ShowdownConfig = {
  description: string;
  prize_first: string;
  prize_second: string;
  prize_third: string;
};

const defaultConfig: ShowdownConfig = {
  description: 'Vier Stunden, eine eigene Wochenwertung. Spiele ganz normal Ranked – deine Elo zählt weiter für die Saison und gleichzeitig für den Showdown.',
  prize_first: '15 €',
  prize_second: '14 Tage Premium',
  prize_third: '7 Tage Premium',
};
const medals = ['🥇', '🥈', '🥉'];

function formatEventTime(value: string) {
  return new Date(value).toLocaleString('de-DE', {
    weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function formatClock(value: string) {
  return new Date(value).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function ShowdownPage() {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<ShowdownStatus | null>(null);
  const [config, setConfig] = useState<ShowdownConfig>(defaultConfig);
  const [players, setPlayers] = useState<ShowdownPlayer[]>([]);
  const [recapPlayers, setRecapPlayers] = useState<ShowdownRecapPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [statusResult, leaderboardResult, configResult, recapResult] = await Promise.all([
        supabase.rpc('get_wednesday_showdown_status'),
        supabase.rpc('get_wednesday_showdown_leaderboard'),
        supabase.rpc('get_wednesday_showdown_public_config'),
        supabase.rpc('get_wednesday_showdown_recap'),
      ]);

      if (!mounted) return;
      const nextStatus = (statusResult.data?.[0] ?? null) as ShowdownStatus | null;
      setStatus(nextStatus);
      setPlayers((leaderboardResult.data ?? []) as ShowdownPlayer[]);
      setRecapPlayers((recapResult.data ?? []) as ShowdownRecapPlayer[]);
      setConfig((configResult.data?.[0] ?? defaultConfig) as ShowdownConfig);
      setLoading(false);
    };

    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [supabase]);

  const active = Boolean(status?.is_active);
  const eventAvailable = Boolean(status?.event_enabled);
  const qualifierText = `${status?.minimum_matches ?? 3} bestätigte Matches`;
  const prizes = [config.prize_first, config.prize_second, config.prize_third];
  const eventHours = status?.starts_at && status?.ends_at ? `${formatClock(status.starts_at)}–${formatClock(status.ends_at)} Uhr` : '18:00–22:00 Uhr';

  return (
    <main className="min-h-screen bg-[#0a0d0d] text-[#f5f3ee]">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 sport-grid opacity-30" />
      <nav className="border-b border-white/10 bg-[#0a0d0d]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3"><BrandLogo className="h-10 w-10 rounded-lg" /><span><span className="block text-lg font-black tracking-[-.05em]">RANKEDDARTS</span><span className="block text-[9px] font-bold uppercase tracking-[.25em] text-violet-300">{status?.title ?? 'Mittwoch Showdown'}</span></span></Link>
          <div className="hidden items-center gap-6 text-[13px] font-semibold text-zinc-300 lg:flex"><Link href="/matchmaking" className="hover:text-white">Matchmaking</Link><Link href="/leaderboard" className="hover:text-white">Rangliste</Link><Link href="/tournaments" className="hover:text-white">Turniere</Link><Link href="/profile" className="hover:text-white">Mein Profil</Link><Link href="/premium" className="border border-emerald-300/35 px-3 py-1.5 text-emerald-200 hover:bg-emerald-300/10">Premium</Link></div>
          <button onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-9 w-9 place-items-center border border-white/15 lg:hidden" aria-label="Menü öffnen">{mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
        {mobileMenuOpen && <div className="border-t border-white/10 px-5 py-3 lg:hidden"><div className="grid gap-1 text-sm font-bold text-zinc-300">{[['Matchmaking', '/matchmaking'], ['Rangliste', '/leaderboard'], ['Turniere', '/tournaments'], ['Mein Profil', '/profile'], ['Premium', '/premium']].map(([label, href]) => <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="border-b border-white/5 py-3 hover:text-violet-200">{label}</Link>)}</div></div>}
      </nav>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
        <header className="relative overflow-hidden border border-violet-300/20 bg-[linear-gradient(135deg,rgba(109,40,217,0.18),rgba(13,17,16,0.96)_54%,rgba(10,13,13,0.98))] p-6 md:p-10">
          <div aria-hidden className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-400/15 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_19rem] lg:items-end">
            <div>
              <div className={`inline-flex items-center gap-2 border px-3 py-1 text-[10px] font-black uppercase tracking-[.18em] ${active ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100' : 'border-violet-300/25 bg-violet-400/10 text-violet-100'}`}><span className={`h-2 w-2 rounded-full ${active ? 'animate-pulse bg-emerald-300' : 'bg-violet-300'}`} />{active ? `Live · ${eventHours}` : eventAvailable ? 'Wöchentlich · Mittwoch' : 'Derzeit pausiert'}</div>
              <p className="mt-7 border-l-2 border-violet-300 pl-3 text-[11px] font-black uppercase tracking-[.2em] text-violet-200">Nur Queue-Matches · normale Elo-Wertung bleibt aktiv</p>
              <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[.88] tracking-[-.075em] md:text-7xl"><span className="text-violet-300">{status?.title ?? 'Mittwoch Showdown'}</span></h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300">{config.description}</p>
            </div>
            <div className="border border-white/15 bg-black/25 p-5">
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-zinc-500">{active ? 'Showdown läuft bis' : 'Nächster Showdown'}</p>
              <p className="mt-3 text-xl font-black text-white">{status?.ends_at && active ? new Date(status.ends_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : status?.starts_at ? formatEventTime(status.starts_at) : 'Wird geladen…'}</p>
              <Link href="/matchmaking" className="mt-5 flex items-center justify-between border border-violet-300 bg-violet-300 px-4 py-3 text-xs font-black uppercase tracking-[.1em] text-violet-950 hover:bg-violet-200">Queue öffnen <ArrowUpRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </header>

        <div className="mt-5 grid border border-white/10 bg-[#0d1110] md:grid-cols-4">
          <div className="border-b border-r border-white/10 px-5 py-4 md:border-b-0"><Clock3 className="h-4 w-4 text-violet-300" /><p className="mt-2 text-sm font-black">{eventHours}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[.13em] text-zinc-500">Jeden Mittwoch</p></div>
          <div className="border-b border-r border-white/10 px-5 py-4 md:border-b-0"><Swords className="h-4 w-4 text-violet-300" /><p className="mt-2 text-sm font-black">{qualifierText}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[.13em] text-zinc-500">Für die Wertung</p></div>
          <div className="border-b border-r border-white/10 px-5 py-4 md:border-b-0"><Zap className="h-4 w-4 text-emerald-300" /><p className="mt-2 text-sm font-black">{status?.free_limit_override ? 'Kein Free-Limit' : 'Normales Free-Limit'}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[.13em] text-zinc-500">Im Event-Zeitraum</p></div>
          <div className="px-5 py-4"><Trophy className="h-4 w-4 text-amber-200" /><p className="mt-2 text-sm font-black">{config.prize_first} + mehr</p><p className="mt-1 text-[10px] font-black uppercase tracking-[.13em] text-zinc-500">Top 3 Preise</p></div>
        </div>

        <section className="mt-12 overflow-x-auto border border-white/15 bg-[#0d1110]">
          <div className="flex min-w-[780px] items-center justify-between border-b border-white/15 px-6 py-5"><div><p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.18em] text-violet-300"><Medal className="h-4 w-4" /> {status?.title ?? 'Mittwoch Showdown'} · Rangliste</p><p className="mt-1 text-sm text-zinc-500">{active ? `Live · mindestens ${qualifierText} · Sortierung nach Siegen, Winrate und Average` : `Die Wertung ist ausschließlich mittwochs zwischen ${eventHours} sichtbar.`}</p></div><span className={`border px-3 py-1 text-[10px] font-black uppercase tracking-[.14em] ${active ? 'border-emerald-300/30 text-emerald-200' : 'border-white/10 text-zinc-500'}`}>{active ? `${players.length} qualifiziert` : 'Inaktiv'}</span></div>
          <div className="grid min-w-[780px] grid-cols-[3.5rem_minmax(12rem,1fr)_5rem_5rem_6rem_5rem_8rem] items-center gap-4 border-b border-white/10 px-6 py-3 text-[10px] font-black uppercase tracking-[.13em] text-zinc-500"><span>Platz</span><span>Spieler</span><span className="text-right">Matches</span><span className="text-right">Siege</span><span className="text-right">Winrate</span><span className="text-right">Ø Avg.</span><span className="text-right">Preis</span></div>
          {loading ? <div className="min-w-[780px] px-6 py-16 text-center text-sm font-bold text-zinc-500">Showdown wird geladen…</div> : active && players.length > 0 ? <div className="divide-y divide-white/10">{players.map((player, index) => <Link key={player.user_id} href={`/players/${encodeURIComponent(player.username)}`} className="grid min-w-[780px] grid-cols-[3.5rem_minmax(12rem,1fr)_5rem_5rem_6rem_5rem_8rem] items-center gap-4 px-6 py-4 transition hover:bg-violet-300/[.05]"><span className={`grid h-8 w-8 place-items-center text-xs font-black ${index < 3 ? 'bg-amber-300 text-black' : 'border border-white/10 text-zinc-400'}`}>{index < 3 ? medals[index] : `#${index + 1}`}</span><span className="min-w-0"><span className="block truncate text-sm font-black">{player.username}</span><span className="mt-1 block text-xs font-bold text-emerald-300">{player.elo} Elo · {player.total_180s} 180er</span></span><span className="text-right text-sm font-black">{player.matches_played}</span><span className="text-right text-sm font-black">{player.wins}</span><span className="text-right text-sm font-black text-zinc-200">{player.winrate.toFixed(1)}%</span><span className="text-right text-sm font-black text-zinc-200">{player.average?.toFixed(1) ?? '—'}</span><span className="text-right text-xs font-black text-amber-100">{prizes[index] ?? '—'}</span></Link>)}</div> : <div className="min-w-[780px] px-6 py-16 text-center"><CalendarDays className="mx-auto h-8 w-8 text-zinc-600" /><p className="mt-4 text-lg font-black">{active ? 'Noch niemand qualifiziert.' : 'Die nächste Wertung startet mittwochabends.'}</p><p className="mt-2 text-sm text-zinc-500">{active ? `Nach ${qualifierText} erscheint dein Name automatisch hier.` : `Zwischen ${eventHours} zählen bestätigte Queue-Matches.`}</p></div>}
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3"><div className="border border-amber-300/20 bg-amber-300/[.06] p-5"><Crown className="h-5 w-5 text-amber-200" /><p className="mt-5 text-[10px] font-black uppercase tracking-[.16em] text-amber-200">1. Platz</p><p className="mt-2 text-2xl font-black">{config.prize_first}</p></div><div className="border border-violet-300/20 bg-violet-400/[.06] p-5"><Users className="h-5 w-5 text-violet-200" /><p className="mt-5 text-[10px] font-black uppercase tracking-[.16em] text-violet-200">2. Platz</p><p className="mt-2 text-2xl font-black">{config.prize_second}</p></div><div className="border border-emerald-300/20 bg-emerald-400/[.06] p-5"><Zap className="h-5 w-5 text-emerald-200" /><p className="mt-5 text-[10px] font-black uppercase tracking-[.16em] text-emerald-200">3. Platz</p><p className="mt-2 text-2xl font-black">{config.prize_third}</p></div></section>

        {recapPlayers.length > 0 && <section className="mt-10 border border-white/15 bg-[#0d1110]"><div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.18em] text-amber-200"><Trophy className="h-4 w-4" /> Letzter Showdown · Rückblick</p><p className="mt-1 text-sm text-zinc-500">{formatEventTime(recapPlayers[0].period_start)}–{formatClock(recapPlayers[0].period_end)} Uhr · Die Top 3 der letzten abgeschlossenen Wertung</p></div><span className="border border-amber-300/25 bg-amber-300/[.07] px-3 py-1 text-[10px] font-black uppercase tracking-[.14em] text-amber-100">Sieger der Woche</span></div><div className="grid divide-y divide-white/10 md:grid-cols-3 md:divide-x md:divide-y-0">{recapPlayers.map((player, index) => <Link key={player.user_id} href={`/players/${encodeURIComponent(player.username)}`} className="group p-6 transition hover:bg-white/[.025]"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center bg-amber-300 text-lg text-black">{medals[index]}</span><span className="text-xs font-black text-zinc-500">{player.wins} Siege</span></div><p className="mt-5 truncate text-xl font-black group-hover:text-violet-200">{player.username}</p><p className="mt-2 text-sm text-zinc-400">{player.matches_played} Matches · {player.winrate.toFixed(1)}% Winrate · Ø {player.average?.toFixed(1) ?? '—'}</p></Link>)}</div></section>}
      </section>
    </main>
  );
}
