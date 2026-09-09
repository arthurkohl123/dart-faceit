'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { BrandLogo } from '@/components/BrandLogo';
import { Activity, ArrowUpRight, CalendarDays, ChevronDown, CircleDot, Flame, Menu, Search, SlidersHorizontal, Target, TrendingDown, TrendingUp, X, Zap } from 'lucide-react';

type Platform = 'scolia' | 'dartcounter' | 'autodarts';
type ResultFilter = 'all' | 'wins' | 'losses';
type ModeFilter = 'all' | 'ranked' | 'private';

type MatchEntry = {
  id: string;
  created_at: string;
  completed_at?: string | null;
  opponent_name: string | null;
  opponent_elo: number | null;
  is_win: boolean;
  result: string | null;
  legs_won: number | null;
  legs_lost: number | null;
  my_average: number | null;
  highest_checkout: number | null;
  elo_change: number | null;
  one_eighties?: number | null;
  app?: Platform | null;
  match_mode?: 'ranked' | 'private' | null;
};

const platformMeta: Record<Platform, { label: string; className: string }> = {
  scolia: { label: 'Scolia', className: 'border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-200' },
  dartcounter: { label: 'DartCounter', className: 'border-cyan-300/25 bg-cyan-400/[0.08] text-cyan-200' },
  autodarts: { label: 'AutoDarts', className: 'border-violet-300/25 bg-violet-400/[0.08] text-violet-200' },
};

function finishedAt(match: MatchEntry) { return match.completed_at ?? match.created_at; }

function formatDate(value: string, includeYear = false) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', ...(includeYear ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function dateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((todayStart - targetStart) / 86400000);
  if (days === 0) return 'Heute';
  if (days === 1) return 'Gestern';
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

function PlatformBadge({ app }: { app?: Platform | null }) {
  if (!app) return <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">Unbekannt</span>;
  const meta = platformMeta[app];
  return <span className={`border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${meta.className}`}>{meta.label}</span>;
}

function MatchRow({ match }: { match: MatchEntry }) {
  const [open, setOpen] = useState(false);
  const isPrivate = match.match_mode === 'private';
  const eloChange = Number(match.elo_change ?? 0);
  const score = match.legs_won !== null && match.legs_lost !== null ? `${match.legs_won} : ${match.legs_lost}` : match.result || '—';
  const completed = finishedAt(match);

  return (
    <article className={`border border-white/[0.09] bg-[#0d1110] transition hover:border-white/20 ${match.is_win ? 'border-l-2 border-l-emerald-300' : 'border-l-2 border-l-red-400'}`}>
      <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[88px_minmax(190px,1.35fr)_112px_88px_95px_72px_90px_42px] lg:items-center lg:gap-3">
        <div className={`w-fit border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${match.is_win ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200' : 'border-red-400/25 bg-red-400/10 text-red-200'}`}>{match.is_win ? 'Sieg' : 'Niederl.'}</div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="truncate text-base font-black tracking-[-0.03em] text-zinc-100">vs {match.opponent_name || 'Unbekannter Gegner'}</span>{isPrivate && <span className="border border-violet-300/20 bg-violet-400/[0.08] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-violet-200">Unrated</span>}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500"><span>{formatDate(completed, new Date(completed).getFullYear() !== new Date().getFullYear())}</span>{match.opponent_elo ? <><span className="h-1 w-1 rounded-full bg-zinc-700" /><span>{match.opponent_elo} Gegner-Elo</span></> : null}</div>
        </div>
        <div className="lg:justify-self-start"><PlatformBadge app={match.app} /></div>
        <Metric label="Ergebnis" value={<span className={`text-xl font-black tracking-[-0.05em] ${match.is_win ? 'text-emerald-300' : 'text-red-300'}`}>{score}</span>} />
        <Metric label="Ø Average" value={<span className="text-base font-black text-zinc-200">{match.my_average !== null ? Number(match.my_average).toFixed(1) : '—'}</span>} />
        <Metric label="180er" value={<span className="inline-flex items-center gap-1 text-sm font-black text-amber-200"><Zap className="h-3.5 w-3.5 fill-current" />{match.one_eighties ?? 0}</span>} />
        <Metric label="Elo" value={isPrivate ? <span className="text-xs font-black uppercase tracking-wide text-violet-200">Unrated</span> : <span className={`inline-flex items-center gap-1 text-sm font-black ${eloChange > 0 ? 'text-emerald-300' : eloChange < 0 ? 'text-red-300' : 'text-zinc-400'}`}>{eloChange > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : eloChange < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}{eloChange > 0 ? '+' : ''}{eloChange}</span>} />
        <button onClick={() => setOpen((current) => !current)} aria-label="Matchdetails ein- oder ausblenden" className="hidden h-8 w-8 place-items-center border border-white/10 text-zinc-500 transition hover:border-emerald-300/30 hover:text-emerald-200 lg:grid"><ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} /></button>
      </div>
      <button onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between border-t border-white/[0.07] px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 lg:hidden">Details <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} /></button>
      {open && <div className="grid gap-3 border-t border-white/[0.07] bg-black/20 p-4 text-sm sm:grid-cols-3 sm:p-5"><Detail label="Beendet" value={formatDate(completed, true)} /><Detail label="Highest Checkout" value={String(match.highest_checkout ?? '—')} /><Detail label="Format" value={isPrivate ? 'Privates Freundschaftsduell' : 'Bestätigtes Ranked-Match'} /></div>}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between border-t border-white/[0.07] pt-3 lg:block lg:border-0 lg:p-0"><span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600 lg:hidden">{label}</span>{value}</div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">{label}</p><p className="mt-1 font-bold text-zinc-300">{value}</p></div>;
}

export default function MatchHistory() {
  const [matches, setMatches] = useState<MatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<'all' | Platform>('all');
  const [search, setSearch] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }
      const { data, error } = await supabase.from('matches').select('*').eq('user_id', session.user.id).order('completed_at', { ascending: false });
      if (!mounted) return;
      if (error) console.error('Match History konnte nicht geladen werden:', error);
      else setMatches((data || []) as MatchEntry[]);
      setLoading(false);
    }
    void load();
    return () => { mounted = false; };
  }, [router, supabase]);

  const ranked = matches.filter((match) => match.match_mode !== 'private');
  const wins = ranked.filter((match) => match.is_win);
  const losses = ranked.filter((match) => !match.is_win);
  const winrate = ranked.length ? Math.round((wins.length / ranked.length) * 100) : 0;
  const averageMatches = ranked.filter((match) => match.my_average !== null);
  const average = averageMatches.length ? averageMatches.reduce((total, match) => total + Number(match.my_average), 0) / averageMatches.length : null;
  const total180s = ranked.reduce((total, match) => total + Number(match.one_eighties ?? 0), 0);
  const eloDelta = ranked.reduce((total, match) => total + Number(match.elo_change ?? 0), 0);
  const form = ranked.slice(0, 10).reverse();
  const activePlatforms = new Set(ranked.map((match) => match.app).filter(Boolean)).size;
  let streak = 0;
  for (const match of ranked) { if (!match.is_win) break; streak += 1; }

  const filtered = matches.filter((match) => {
    if (resultFilter === 'wins' && !match.is_win) return false;
    if (resultFilter === 'losses' && match.is_win) return false;
    if (modeFilter !== 'all' && (match.match_mode === 'private' ? 'private' : 'ranked') !== modeFilter) return false;
    if (platformFilter !== 'all' && match.app !== platformFilter) return false;
    return !search.trim() || (match.opponent_name || '').toLocaleLowerCase('de-DE').includes(search.trim().toLocaleLowerCase('de-DE'));
  });

  const groups = filtered.reduce<Array<{ label: string; matches: MatchEntry[] }>>((all, match) => {
    const label = dateLabel(finishedAt(match));
    const current = all[all.length - 1];
    if (current?.label === label) current.matches.push(match);
    else all.push({ label, matches: [match] });
    return all;
  }, []);

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#070909] text-white"><div className="flex items-center gap-3 border border-white/10 bg-[#0d1110] px-5 py-4 text-sm font-black text-zinc-300"><span className="h-2 w-2 animate-pulse bg-emerald-300" />History wird geladen</div></main>;

  return (
    <main className="min-h-screen bg-[#090c0b] text-white">
      <div aria-hidden className="pointer-events-none fixed inset-0 sport-grid opacity-25" />
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#090c0b]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3"><BrandLogo className="h-10 w-10" /><div><p className="text-base font-black tracking-[-0.04em] md:text-xl">RANKEDDARTS</p><p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300/80">Match Ledger</p></div></Link>
          <div className="hidden items-center gap-6 text-sm font-bold text-zinc-400 lg:flex"><Link href="/matchmaking" className="hover:text-white">Matchmaking</Link><Link href="/leaderboard" className="hover:text-white">Leaderboard</Link><Link href="/tournaments" className="hover:text-white">Turniere</Link><Link href="/profile" className="hover:text-white">Mein Profil</Link><Link href="/premium" className="border border-emerald-300/30 px-3 py-1.5 text-emerald-100 hover:bg-emerald-400/10">Premium</Link></div>
          <button onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center border border-white/15 text-zinc-200 lg:hidden">{mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}</button>
        </div>
        {mobileMenuOpen && <div className="border-t border-white/10 px-5 py-3 lg:hidden"><div className="flex flex-col"><Link href="/matchmaking" className="px-3 py-2.5 text-sm font-bold text-zinc-300">Matchmaking</Link><Link href="/leaderboard" className="px-3 py-2.5 text-sm font-bold text-zinc-300">Leaderboard</Link><Link href="/tournaments" className="px-3 py-2.5 text-sm font-bold text-zinc-300">Turniere</Link><Link href="/profile" className="px-3 py-2.5 text-sm font-bold text-zinc-300">Mein Profil</Link></div></div>}
      </nav>

      <section className="relative mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-5 md:px-8 md:pt-12">
        <header className="overflow-hidden border border-white/10 bg-[#0d1110]">
          <div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[1.25fr_.75fr] lg:items-end lg:p-10">
            <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300"><CalendarDays className="h-3.5 w-3.5" /> Persönliches Match-Archiv</div><h1 className="mt-4 text-4xl font-black tracking-[-0.075em] sm:text-6xl">Deine Spiele.<br /><span className="text-emerald-300">Ohne Rauschen.</span></h1><p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">Alle bestätigten Ergebnisse, sauber nach Plattform und Spielmodus sortiert. Private Duelle bleiben unrated.</p></div>
            <div className="border-l-2 border-emerald-300 bg-emerald-400/[0.05] p-5"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Aktuelle Form</p><div className="mt-4 flex min-h-9 items-center gap-1.5">{form.length ? form.map((match) => <span key={match.id} title={match.is_win ? 'Sieg' : 'Niederlage'} className={`h-8 flex-1 border ${match.is_win ? 'border-emerald-300/40 bg-emerald-400/25' : 'border-red-400/35 bg-red-400/20'}`} />) : <span className="text-sm text-zinc-500">Noch keine Ranked-Matches</span>}</div><div className="mt-3 flex items-center justify-between text-xs"><span className="text-zinc-500">Letzte {form.length} Ranked-Matches</span><span className="font-black text-emerald-200">{streak ? `${streak} Winstreak` : 'Neue Serie starten'}</span></div></div>
          </div>
          <div className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-3 lg:grid-cols-6">{[
            { label: 'Ranked', value: ranked.length, tone: 'text-white' }, { label: 'Siege', value: wins.length, tone: 'text-emerald-300' }, { label: 'Winrate', value: `${winrate}%`, tone: 'text-cyan-200' }, { label: 'Ø Average', value: average ? average.toFixed(1) : '—', tone: 'text-violet-200' }, { label: '180er', value: total180s, tone: 'text-amber-200' }, { label: 'Elo-Bilanz', value: `${eloDelta > 0 ? '+' : ''}${eloDelta}`, tone: eloDelta >= 0 ? 'text-emerald-300' : 'text-red-300' },
          ].map((stat) => <div key={stat.label} className="border-b border-r border-white/10 px-5 py-4 last:border-r-0 lg:border-b-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">{stat.label}</p><p className={`mt-1 text-2xl font-black tracking-[-0.05em] ${stat.tone}`}>{stat.value}</p></div>)}</div>
        </header>

        <div className="mt-5 border border-white/10 bg-[#0d1110] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-zinc-400"><SlidersHorizontal className="h-4 w-4 text-emerald-300" /> Filter <span className="text-zinc-600">·</span> {filtered.length} Treffer</div><label className="flex h-10 items-center gap-2 border border-white/10 bg-black/20 px-3 lg:w-72"><Search className="h-4 w-4 text-zinc-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Gegner suchen" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600" /></label></div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
            {([['all', 'Alle'], ['wins', 'Siege'], ['losses', 'Niederlagen']] as const).map(([value, label]) => <button key={value} onClick={() => setResultFilter(value)} className={`border px-3 py-2 text-xs font-black ${resultFilter === value ? 'border-emerald-300 bg-emerald-300 text-black' : 'border-white/10 text-zinc-400 hover:border-white/25'}`}>{label}</button>)}
            <span className="mx-1 hidden h-8 w-px bg-white/10 sm:block" />
            {([['all', 'Alle Modi'], ['ranked', 'Ranked'], ['private', 'Unrated']] as const).map(([value, label]) => <button key={value} onClick={() => setModeFilter(value)} className={`border px-3 py-2 text-xs font-black ${modeFilter === value ? 'border-cyan-300/60 bg-cyan-400/10 text-cyan-100' : 'border-white/10 text-zinc-500 hover:border-white/25'}`}>{label}</button>)}
            <span className="mx-1 hidden h-8 w-px bg-white/10 sm:block" />
            {(['all', 'scolia', 'dartcounter', 'autodarts'] as const).map((value) => <button key={value} onClick={() => setPlatformFilter(value)} className={`border px-3 py-2 text-xs font-black ${platformFilter === value ? 'border-violet-300/60 bg-violet-400/10 text-violet-100' : 'border-white/10 text-zinc-500 hover:border-white/25'}`}>{value === 'all' ? `Plattformen (${activePlatforms})` : platformMeta[value].label}</button>)}
          </div>
        </div>

        <div className="mt-8">
          <div className="hidden grid-cols-[88px_minmax(190px,1.35fr)_112px_88px_95px_72px_90px_42px] gap-3 border-b border-white/10 px-5 pb-3 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 lg:grid"><span>Ergebnis</span><span>Gegner / Zeit</span><span>Plattform</span><span>Legs</span><span>Average</span><span>180er</span><span>Elo</span><span /></div>
          {groups.length ? groups.map((group) => <section key={group.label} className="mt-6 first:mt-0"><div className="mb-3 flex items-center gap-3"><span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">{group.label}</span><span className="h-px flex-1 bg-white/10" /><span className="text-[10px] font-bold text-zinc-600">{group.matches.length} Match{group.matches.length === 1 ? '' : 'es'}</span></div><div className="space-y-2">{group.matches.map((match) => <MatchRow key={match.id} match={match} />)}</div></section>) : <div className="border border-dashed border-white/15 bg-[#0d1110] px-6 py-20 text-center"><CircleDot className="mx-auto h-8 w-8 text-zinc-700" /><h2 className="mt-4 text-xl font-black">Keine passenden Matches</h2><p className="mt-2 text-sm text-zinc-500">Passe die Filter an oder starte ein neues Match.</p><Link href="/matchmaking" className="mt-6 inline-flex items-center gap-2 border border-emerald-300 bg-emerald-300 px-5 py-3 text-sm font-black text-black">Match suchen <ArrowUpRight className="h-4 w-4" /></Link></div>}
        </div>
      </section>
    </main>
  );
}
