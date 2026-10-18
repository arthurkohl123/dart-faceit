'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { BrandLogo } from '@/components/BrandLogo';
import { eloPeriodMeta, getEloPeriodInsights, type EloPeriod, type EloTrendPoint } from '@/lib/elo-period-summary';
import { filterMatchHistory, getMatchFinishedAt as finishedAt, type MatchHistoryEntry, type MatchHistoryModeFilter, type MatchHistoryPlatform, type MatchHistoryResultFilter } from '@/lib/match-history';
import { Activity, ArrowUpRight, CalendarDays, ChevronDown, CircleDot, Crown, LockKeyhole, Menu, Search, SlidersHorizontal, TrendingDown, TrendingUp, X, Zap } from 'lucide-react';

type Platform = MatchHistoryPlatform;
type ResultFilter = MatchHistoryResultFilter;
type ModeFilter = MatchHistoryModeFilter;
type MatchEntry = MatchHistoryEntry;
type HistoryPeriod = Extract<EloPeriod, '7d' | '30d' | '90d'>;

const platformMeta: Record<Platform, { label: string; className: string }> = {
  scolia: { label: 'Scolia', className: 'border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-200' },
  dartcounter: { label: 'DartCounter', className: 'border-cyan-300/25 bg-cyan-400/[0.08] text-cyan-200' },
  autodarts: { label: 'AutoDarts', className: 'border-violet-300/25 bg-violet-400/[0.08] text-violet-200' },
};

const historyPeriodMeta: Record<HistoryPeriod, { label: string; description: string }> = {
  '7d': eloPeriodMeta['7d'],
  '30d': eloPeriodMeta['30d'],
  '90d': eloPeriodMeta['90d'],
};

const historyPeriodOptions: HistoryPeriod[] = ['7d', '30d', '90d'];

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
    <article className={`arena-ledger-row bg-[#0d1110] transition hover:bg-white/[.025] ${match.is_win ? 'border-l-emerald-300' : 'border-l-red-400'}`}>
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

function formatChartDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short' }).format(new Date(value));
}

function EloMetric({ label, value, detail, tone, className = '' }: { label: string; value: string; detail: string; tone: string; className?: string }) {
  return <div className={`min-w-0 p-4 sm:p-5 ${className}`}><p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">{label}</p><p className={`mt-2 truncate text-3xl font-black tracking-[-0.06em] sm:text-4xl ${tone}`}>{value}</p><p className="mt-1 truncate text-[11px] text-zinc-500">{detail}</p></div>;
}

function EloTrendChart({ points, startAt, endAt, hasEvents }: { points: EloTrendPoint[]; startAt: string; endAt: string; hasEvents: boolean }) {
  if (!hasEvents) return <div className="mt-5 grid min-h-44 place-items-center border border-dashed border-white/10 bg-black/20 px-6 text-center text-sm text-zinc-500">Noch keine gewerteten Ranked-Matches in diesem Zeitraum.</div>;

  const width = 640;
  const height = 196;
  const paddingX = 20;
  const paddingY = 22;
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  const timeSpan = Math.max(1, end - start);
  const largestMagnitude = Math.max(8, ...points.map((point) => Math.abs(point.cumulative)));
  const baseline = height / 2;
  const toX = (timestamp: string) => paddingX + Math.max(0, Math.min(1, (new Date(timestamp).getTime() - start) / timeSpan)) * (width - paddingX * 2);
  const toY = (value: number) => baseline - (value / largestMagnitude) * (baseline - paddingY);
  const coordinates = points.map((point) => ({ ...point, x: toX(point.timestamp), y: toY(point.cumulative) }));
  const linePath = coordinates.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L ${coordinates[coordinates.length - 1].x.toFixed(2)} ${baseline} L ${coordinates[0].x.toFixed(2)} ${baseline} Z`;
  const endingValue = coordinates[coordinates.length - 1]?.cumulative ?? 0;
  const isPositive = endingValue >= 0;
  const lineColor = isPositive ? '#9af0bc' : '#fda4af';
  const gradientId = isPositive ? 'history-elo-positive-fill' : 'history-elo-negative-fill';

  return <div className="mt-5 overflow-hidden border border-white/10 bg-black/20 p-3 sm:p-4">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Kumulierte Elo-Veränderung im ausgewählten Zeitraum" className="block h-auto w-full overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[paddingY, baseline, height - paddingY].map((y) => <line key={y} x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="rgba(255,255,255,.12)" strokeDasharray="3 5" />)}
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={lineColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      {coordinates.filter((point) => point.eloChange !== 0).map((point, index) => <circle key={`${point.timestamp}-${index}`} cx={point.x} cy={point.y} r="3.75" fill={point.eloChange > 0 ? '#9af0bc' : '#fda4af'} stroke="#0d1110" strokeWidth="2" />)}
    </svg>
    <div className="mt-2 flex items-center justify-between gap-4 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600"><span>{formatChartDate(startAt)}</span><span className={isPositive ? 'text-emerald-200' : 'text-rose-200'}>{endingValue > 0 ? '+' : ''}{endingValue} Elo</span><span>{formatChartDate(endAt)}</span></div>
  </div>;
}

function FilterPill({ active, onClick, children, activeClass }: { active: boolean; onClick: () => void; children: React.ReactNode; activeClass: string }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`shrink-0 border px-3 py-2 text-xs font-black transition ${active ? activeClass : 'border-white/10 bg-black/15 text-zinc-500 hover:border-white/25 hover:text-zinc-200'}`}>{children}</button>;
}

function HistoryPeriodPill({ period, active, isPremium, onClick }: { period: HistoryPeriod; active: boolean; isPremium: boolean; onClick: () => void }) {
  const premiumOnly = period !== '7d';
  const locked = premiumOnly && !isPremium;

  return <button
    type="button"
    aria-pressed={active}
    aria-label={locked ? `${historyPeriodMeta[period].label} mit Premium freischalten` : historyPeriodMeta[period].label}
    onClick={onClick}
    className={`flex min-w-0 items-center justify-center gap-1.5 border px-3 py-2 text-xs font-black transition ${active ? 'border-cyan-300 bg-cyan-300 text-black' : locked ? 'border-amber-300/20 bg-amber-300/[.05] text-amber-100 hover:border-amber-300/45' : 'border-white/10 bg-black/15 text-zinc-500 hover:border-white/25 hover:text-zinc-200'}`}
  >
    {locked && <LockKeyhole className="h-3 w-3 shrink-0" aria-hidden />}
    <span className="truncate">{historyPeriodMeta[period].label}</span>
  </button>;
}

export default function MatchHistory() {
  const [matches, setMatches] = useState<MatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<'all' | Platform>('all');
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('7d');
  const [isPremium, setIsPremium] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [summaryNow, setSummaryNow] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    async function load() {
      setPeriodLoading(true);
      setHistoryError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }

      // `get_my_premium_overview` is self-scoped in the database. Its active
      // value is only used for the interface; RLS below is the final source of
      // truth for the 7/90-day data boundary.
      const { data: overview, error: overviewError } = await supabase.rpc('get_my_premium_overview');
      const premiumActive = !overviewError
        && typeof overview === 'object'
        && overview !== null
        && !Array.isArray(overview)
        && (overview as { active?: unknown }).active === true;

      if (!mounted) return;
      if (overviewError) console.error('Premium-Status für Match History konnte nicht geladen werden:', overviewError);
      setIsPremium(premiumActive);

      if (!premiumActive && historyPeriod !== '7d') {
        setMatches([]);
        setHistoryPeriod('7d');
        setLoading(false);
        setPeriodLoading(false);
        return;
      }

      const periodStart = new Date(Date.now() - eloPeriodMeta[historyPeriod].hours * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('status', 'completed')
        .gte('completed_at', periodStart)
        .order('completed_at', { ascending: false });

      if (!mounted) return;
      if (error) {
        console.error('Match History konnte nicht geladen werden:', error);
        setMatches([]);
        setHistoryError('Dein Match-Verlauf konnte gerade nicht geladen werden. Bitte versuche es gleich noch einmal.');
      } else {
        setMatches((data || []) as MatchEntry[]);
      }
      setLoading(false);
      setPeriodLoading(false);
    }

    void load().catch((error: unknown) => {
      if (!mounted) return;
      console.error('Match History konnte nicht geladen werden:', error);
      setMatches([]);
      setHistoryError('Dein Match-Verlauf konnte gerade nicht geladen werden. Bitte versuche es gleich noch einmal.');
      setLoading(false);
      setPeriodLoading(false);
    });
    return () => { mounted = false; };
  }, [historyPeriod, router, supabase]);

  useEffect(() => {
    const interval = window.setInterval(() => setSummaryNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const ranked = matches.filter((match) => match.match_mode !== 'private');
  const wins = ranked.filter((match) => match.is_win);
  const winrate = ranked.length ? Math.round((wins.length / ranked.length) * 100) : 0;
  const averageMatches = ranked.filter((match) => match.my_average !== null);
  const average = averageMatches.length ? averageMatches.reduce((total, match) => total + Number(match.my_average), 0) / averageMatches.length : null;
  const total180s = ranked.reduce((total, match) => total + Number(match.one_eighties ?? 0), 0);
  const eloDelta = ranked.reduce((total, match) => total + Number(match.elo_change ?? 0), 0);
  const eloInsights = useMemo(() => getEloPeriodInsights(matches, historyPeriod, summaryNow), [historyPeriod, matches, summaryNow]);
  const eloPeriodSummary = eloInsights.summary;
  const form = ranked.slice(0, 10).reverse();
  const activePlatforms = new Set(ranked.map((match) => match.app).filter(Boolean)).size;
  let streak = 0;
  for (const match of ranked) { if (!match.is_win) break; streak += 1; }

  const filtered = useMemo(() => filterMatchHistory(matches, {
    result: resultFilter,
    mode: modeFilter,
    platform: platformFilter,
    period: historyPeriod,
    opponentQuery: search,
  }, summaryNow), [historyPeriod, matches, modeFilter, platformFilter, resultFilter, search, summaryNow]);
  const hasActiveFilters = resultFilter !== 'all' || modeFilter !== 'all' || platformFilter !== 'all' || Boolean(search.trim());
  const resetFilters = () => {
    setResultFilter('all');
    setModeFilter('all');
    setPlatformFilter('all');
    setHistoryPeriod('7d');
    setSearch('');
  };

  const groups = filtered.reduce<Array<{ label: string; matches: MatchEntry[] }>>((all, match) => {
    const label = dateLabel(finishedAt(match));
    const current = all[all.length - 1];
    if (current?.label === label) current.matches.push(match);
    else all.push({ label, matches: [match] });
    return all;
  }, []);

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#070909] text-white"><div className="flex items-center gap-3 border border-white/10 bg-[#0d1110] px-5 py-4 text-sm font-black text-zinc-300"><span className="h-2 w-2 animate-pulse bg-emerald-300" />Match-Verlauf wird geladen</div></main>;

  return (
    <main className="arena-page text-white">
      <div aria-hidden className="pointer-events-none fixed inset-0 sport-grid opacity-25" />
      <nav className="arena-nav sticky top-0 z-50 border-b border-white/10 bg-[#090c0b]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3"><BrandLogo className="h-10 w-10" /><div><p className="text-base font-black tracking-[-0.04em] md:text-xl">RANKEDDARTS</p><p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300/80">Match-Verlauf</p></div></Link>
          <div className="hidden items-center gap-5 text-sm font-bold text-zinc-400 lg:flex"><Link href="/matchmaking" className="hover:text-white">Matchmaking</Link><Link href="/leaderboard" className="hover:text-white">Rangliste</Link><Link href="/tournaments" className="hover:text-white">Turniere</Link><Link href="/premium" className="border border-emerald-300/30 px-3 py-1.5 text-emerald-100 hover:bg-emerald-400/10">Premium</Link></div>
          <button onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center border border-white/15 text-zinc-200 lg:hidden">{mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}</button>
        </div>
        {mobileMenuOpen && <div className="border-t border-white/10 px-5 py-3 lg:hidden"><div className="flex flex-col"><Link href="/matchmaking" className="px-3 py-2.5 text-sm font-bold text-zinc-300">Matchmaking</Link><Link href="/leaderboard" className="px-3 py-2.5 text-sm font-bold text-zinc-300">Rangliste</Link><Link href="/tournaments" className="px-3 py-2.5 text-sm font-bold text-zinc-300">Turniere</Link></div></div>}
      </nav>

      <section className="arena-content relative mx-auto px-4 pb-20 pt-8 sm:px-5 md:px-8 md:pt-12">
        <header className="arena-hero">
          <div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[1.25fr_.75fr] lg:items-end lg:p-10">
            <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300"><CalendarDays className="h-3.5 w-3.5" /> Match-Verlauf</div><h1 className="mt-4 text-4xl font-black tracking-[-0.075em] sm:text-6xl">Deine letzten<br /><span className="text-emerald-300">Matches.</span></h1><p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">Hier siehst du deine bestätigten Matches der letzten {historyPeriodMeta[historyPeriod].description}. Private Duelle werden nicht gewertet.</p></div>
            <div className="border-l-2 border-emerald-300 bg-emerald-400/[0.05] p-5"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Aktuelle Form</p><div className="mt-4 flex min-h-9 items-center gap-1.5">{form.length ? form.map((match) => <span key={match.id} title={match.is_win ? 'Sieg' : 'Niederlage'} className={`h-8 flex-1 border ${match.is_win ? 'border-emerald-300/40 bg-emerald-400/25' : 'border-red-400/35 bg-red-400/20'}`} />) : <span className="text-sm text-zinc-500">Noch keine Ranked-Matches</span>}</div><div className="mt-3 flex items-center justify-between text-xs"><span className="text-zinc-500">Letzte {form.length} Ranked-Matches</span><span className="font-black text-emerald-200">{streak ? `${streak} Siege in Folge` : 'Noch keine Siegesserie'}</span></div></div>
          </div>
          <div className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-3 lg:grid-cols-6">{[
            { label: `Ranked · ${historyPeriodMeta[historyPeriod].label}`, value: ranked.length, tone: 'text-white' }, { label: 'Siege', value: wins.length, tone: 'text-emerald-300' }, { label: 'Winrate', value: `${winrate}%`, tone: 'text-cyan-200' }, { label: 'Ø Average', value: average ? average.toFixed(1) : '—', tone: 'text-violet-200' }, { label: '180er', value: total180s, tone: 'text-amber-200' }, { label: `Elo-Bilanz · ${historyPeriodMeta[historyPeriod].label}`, value: `${eloDelta > 0 ? '+' : ''}${eloDelta}`, tone: eloDelta >= 0 ? 'text-emerald-300' : 'text-red-300' },
          ].map((stat) => <div key={stat.label} className="border-b border-r border-white/10 px-5 py-4 last:border-r-0 lg:border-b-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">{stat.label}</p><p className={`mt-1 text-2xl font-black tracking-[-0.05em] ${stat.tone}`}>{stat.value}</p></div>)}</div>
        </header>

        <section className="arena-panel mt-5 overflow-hidden" aria-label="Elo-Bilanz und Zeitraum">
          <div className="flex flex-col gap-5 border-b border-white/10 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200"><Activity className="h-3.5 w-3.5" /> Elo-Verlauf</div>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.05em] text-white">Dein Elo-Verlauf</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Gewonnene und verlorene Elo aus bestätigten Ranked-Matches im {historyPeriodMeta[historyPeriod].description}. Die Auswahl filtert zugleich deine Matchliste.</p>
            </div>
            <div className="w-full lg:w-[24rem]"><p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Zeitraum</p><div className="grid grid-cols-3 gap-2" role="group" aria-label="Zeitraum für Match-History und Elo auswählen">
              {historyPeriodOptions.map((period) => <HistoryPeriodPill key={period} period={period} active={historyPeriod === period} isPremium={isPremium} onClick={() => {
                if (!isPremium && period !== '7d') { router.push('/premium'); return; }
                setHistoryPeriod(period);
              }} />)}
            </div><p className="mt-3 flex min-h-5 items-center gap-1.5 text-[11px] leading-5 text-zinc-500">{periodLoading ? <><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-200" />Zeitraum wird aktualisiert …</> : isPremium ? <><Crown className="h-3.5 w-3.5 shrink-0 text-amber-200" />Premium aktiv: 7, 30 und 90 Tage verfügbar.</> : <>7 Tage sind kostenlos enthalten. <Link href="/premium" className="font-bold text-amber-100 underline decoration-amber-200/35 underline-offset-2 hover:text-amber-50">30 &amp; 90 Tage mit Premium</Link></>}</p></div>
          </div>
          <div className="grid lg:grid-cols-[minmax(0,1.45fr)_22rem]">
            <div className="border-b border-white/10 p-5 sm:p-6 lg:border-b-0 lg:border-r">
              <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Kumulierte Veränderung</p><p className="mt-1 text-sm font-bold text-zinc-300">Elo-Bilanz ab dem Start des Zeitraums</p></div><span className={`shrink-0 border px-2.5 py-1 text-xs font-black ${eloPeriodSummary.net >= 0 ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200' : 'border-rose-300/30 bg-rose-400/10 text-rose-200'}`}>{eloPeriodSummary.net > 0 ? '+' : ''}{eloPeriodSummary.net} Elo</span></div>
              <EloTrendChart points={eloInsights.points} startAt={eloInsights.startAt} endAt={eloInsights.endAt} hasEvents={eloPeriodSummary.ratedMatches > 0} />
            </div>
            <div className="grid grid-cols-2 bg-black/[0.08]">
              <EloMetric label="Elo gewonnen" value={`+${eloPeriodSummary.gained}`} detail="aus gewerteten Matches" tone="text-emerald-300" className="border-b border-r border-white/10" />
              <EloMetric label="Elo verloren" value={`−${eloPeriodSummary.lost}`} detail="aus gewerteten Matches" tone="text-rose-300" className="border-b border-white/10" />
              <EloMetric label="Bilanz" value={`${eloPeriodSummary.net > 0 ? '+' : ''}${eloPeriodSummary.net}`} detail={`${eloPeriodSummary.ratedMatches} gewertete${eloPeriodSummary.ratedMatches === 1 ? 's' : ''} Match${eloPeriodSummary.ratedMatches === 1 ? '' : 'es'}`} tone={eloPeriodSummary.net > 0 ? 'text-emerald-300' : eloPeriodSummary.net < 0 ? 'text-rose-300' : 'text-zinc-300'} className="border-r border-white/10" />
              <EloMetric label="Größter Gewinn" value={eloInsights.largestGain ? `+${eloInsights.largestGain.value}` : '—'} detail={eloInsights.largestGain ? `vs. ${eloInsights.largestGain.opponentName || 'Unbekannt'}` : 'Noch kein Elo-Gewinn'} tone="text-cyan-200" />
              <div className="col-span-2 flex items-center gap-3 border-t border-white/10 px-4 py-3 text-xs text-zinc-500"><TrendingDown className="h-4 w-4 shrink-0 text-rose-300" /><span>{eloInsights.largestLoss ? <>Größter Rückschlag: <strong className="font-black text-rose-200">−{eloInsights.largestLoss.value} Elo</strong> vs. {eloInsights.largestLoss.opponentName || 'unbekanntem Gegner'}</> : 'Noch kein Elo-Verlust im ausgewählten Zeitraum.'}</span></div>
            </div>
          </div>
          <p className="border-t border-white/10 px-5 py-3 text-xs leading-5 text-zinc-500 sm:px-6">Die Kurve zeigt die kumulierte Elo-Veränderung ab 0 – nicht deinen absoluten Elo-Stand. Private Freundschaftsspiele und Matches ohne Elo-Wertung fließen nicht ein. Jeder Zeitraum läuft fortlaufend und endet nicht um Mitternacht.</p>
          {historyError && <p role="alert" className="border-t border-rose-300/20 bg-rose-400/[.06] px-5 py-3 text-xs leading-5 text-rose-100 sm:px-6">{historyError}</p>}
        </section>

        <section className="arena-panel mt-5 overflow-hidden" aria-label="Match-Verlauf filtern">
          <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-zinc-400"><SlidersHorizontal className="h-4 w-4 text-emerald-300" /> Filter <span className="text-zinc-600">·</span> {filtered.length} Treffer <span className="inline-flex items-center gap-1 border border-cyan-300/20 bg-cyan-400/[0.07] px-2 py-1 text-[9px] text-cyan-100"><CalendarDays className="h-3 w-3" /> {historyPeriodMeta[historyPeriod].label}</span></div><p className="mt-2 text-xs text-zinc-500">Kombiniere Ergebnis, Spieltyp, Plattform und Gegner.</p></div><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><label htmlFor="history-opponent-search" className="flex h-10 items-center gap-2 border border-white/10 bg-black/20 px-3 sm:w-72"><Search className="h-4 w-4 text-zinc-500" /><input id="history-opponent-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Gegner suchen" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600" /></label>{hasActiveFilters && <button type="button" onClick={resetFilters} className="h-10 whitespace-nowrap border border-white/10 px-3 text-xs font-black text-zinc-400 transition hover:border-white/25 hover:text-white">Zurücksetzen</button>}</div></div>
          <div className="grid gap-px border-t border-white/10 bg-white/10 lg:grid-cols-3">
            <div className="bg-[#0d1110] p-4 sm:p-5"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Ergebnis</p><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{([['all', 'Alle'], ['wins', 'Siege'], ['losses', 'Niederlagen']] as const).map(([value, label]) => <FilterPill key={value} active={resultFilter === value} onClick={() => setResultFilter(value)} activeClass="border-emerald-300 bg-emerald-300 text-black">{label}</FilterPill>)}</div></div>
            <div className="bg-[#0d1110] p-4 sm:p-5"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Spieltyp</p><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{([['all', 'Alle Modi'], ['ranked', 'Ranked'], ['private', 'Unrated']] as const).map(([value, label]) => <FilterPill key={value} active={modeFilter === value} onClick={() => setModeFilter(value)} activeClass="border-cyan-300/70 bg-cyan-400/10 text-cyan-100">{label}</FilterPill>)}</div></div>
            <div className="bg-[#0d1110] p-4 sm:p-5"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Plattform</p><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{(['all', 'scolia', 'dartcounter', 'autodarts'] as const).map((value) => <FilterPill key={value} active={platformFilter === value} onClick={() => setPlatformFilter(value)} activeClass="border-violet-300/70 bg-violet-400/10 text-violet-100">{value === 'all' ? `Alle (${activePlatforms})` : platformMeta[value].label}</FilterPill>)}</div></div>
          </div>
        </section>

        <div className="mt-8">
          <div className="hidden grid-cols-[88px_minmax(190px,1.35fr)_112px_88px_95px_72px_90px_42px] gap-3 border-b border-white/10 px-5 pb-3 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 lg:grid"><span>Ergebnis</span><span>Gegner / Zeit</span><span>Plattform</span><span>Legs</span><span>Average</span><span>180er</span><span>Elo</span><span /></div>
          {groups.length ? groups.map((group) => <section key={group.label} className="mt-6 first:mt-0"><div className="mb-3 flex items-center gap-3"><span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">{group.label}</span><span className="h-px flex-1 bg-white/10" /><span className="text-[10px] font-bold text-zinc-600">{group.matches.length} Match{group.matches.length === 1 ? '' : 'es'}</span></div><div className="arena-ledger">{group.matches.map((match) => <MatchRow key={match.id} match={match} />)}</div></section>) : <div className="arena-panel border-dashed px-6 py-20 text-center"><CircleDot className="mx-auto h-8 w-8 text-zinc-700" /><h2 className="mt-4 text-xl font-black">Keine passenden Matches</h2><p className="mt-2 text-sm text-zinc-500">Passe die Filter an oder starte ein neues Match.</p><Link href="/matchmaking" className="arena-primary-action mt-6 inline-flex items-center gap-2 px-5 py-3 text-sm font-black">Match suchen <ArrowUpRight className="h-4 w-4" /></Link></div>}
        </div>
      </section>
    </main>
  );
}

