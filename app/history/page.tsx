'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Menu,
  Minus,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchEntry = {
  id: string;
  created_at: string;
  opponent_name: string;
  opponent_elo: number;
  is_win: boolean;
  result: string;
  legs_won: number | null;
  legs_lost: number | null;
  my_average: number | null;
  highest_checkout: number | null;
  elo_change: number;
  one_eighties?: number | null;
  app?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `vor ${days} Tag${days !== 1 ? 'en' : ''}`;
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Winrate Arc ──────────────────────────────────────────────────────────────

function WinrateArc({ winrate }: { winrate: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (winrate / 100) * circ;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke="url(#winrateGrad)" strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
        <defs>
          <linearGradient id="winrateGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#a3e635" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-black tracking-[-0.06em] text-emerald-300">{winrate}%</div>
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Winrate</div>
      </div>
    </div>
  );
}

// ─── Form-Streak ──────────────────────────────────────────────────────────────

function FormStreak({ matches }: { matches: MatchEntry[] }) {
  const last10 = matches.slice(0, 10);
  return (
    <div className="flex items-center gap-1.5">
      {last10.map((m, i) => (
        <div
          key={i}
          title={m.is_win ? `Sieg vs ${m.opponent_name}` : `Niederlage vs ${m.opponent_name}`}
          className={`h-7 w-7 rounded-lg text-[10px] font-black flex items-center justify-center transition ${
            m.is_win
              ? 'bg-emerald-400/20 border border-emerald-300/30 text-emerald-300'
              : 'bg-red-400/20 border border-red-400/30 text-red-300'
          }`}
        >
          {m.is_win ? 'W' : 'L'}
        </div>
      ))}
      {last10.length === 0 && <span className="text-xs text-zinc-600">Noch keine Matches</span>}
    </div>
  );
}

// ─── Match-Karte ──────────────────────────────────────────────────────────────

function MatchCard({ match, index }: { match: MatchEntry; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const legsDisplay = match.legs_won != null
    ? `${match.legs_won} : ${match.legs_lost}`
    : (match.result || '—');

  return (
    <div
      className={`group relative overflow-hidden rounded-[2rem] border backdrop-blur-xl transition-all duration-300 ${
        match.is_win
          ? 'border-emerald-300/15 bg-gradient-to-br from-emerald-400/[0.05] to-transparent hover:border-emerald-300/25'
          : 'border-red-400/15 bg-gradient-to-br from-red-400/[0.05] to-transparent hover:border-red-400/25'
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Linker Streifen */}
      <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-full ${match.is_win ? 'bg-gradient-to-b from-emerald-300 to-emerald-500' : 'bg-gradient-to-b from-red-400 to-red-600'}`} />

      {/* Haupt-Inhalt */}
      <div className="px-6 py-5 pl-8 sm:px-8 sm:pl-10">
        <div className="flex flex-wrap items-start justify-between gap-4">

          {/* Links: Gegner + Zeit */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${
                match.is_win
                  ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200'
                  : 'border-red-400/25 bg-red-400/10 text-red-200'
              }`}>
                {match.is_win ? <Trophy size={11} /> : <TrendingDown size={11} />}
                {match.is_win ? 'Sieg' : 'Niederlage'}
              </span>
              {match.app && (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-bold text-zinc-500">
                  {match.app === 'scolia' ? '📷' : '📱'} {match.app === 'scolia' ? 'Scolia' : 'DartCounter'}
                </span>
              )}
              <span className="text-xs text-zinc-600">{timeAgo(match.created_at)}</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xl font-black tracking-[-0.04em] sm:text-2xl">vs {match.opponent_name}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-bold text-zinc-400">
                {match.opponent_elo} Elo
              </span>
            </div>
          </div>

          {/* Rechts: Ergebnis + Elo */}
          <div className="flex items-center gap-4 shrink-0">
            {/* Legs */}
            <div className="text-right">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-1">Legs</div>
              <div className={`text-3xl font-black tracking-[-0.06em] sm:text-4xl ${match.is_win ? 'text-emerald-300' : 'text-red-300'}`}>
                {legsDisplay}
              </div>
            </div>

            {/* Elo-Änderung */}
            <div className={`flex flex-col items-center justify-center rounded-2xl border px-4 py-3 min-w-[72px] ${
              match.elo_change > 0
                ? 'border-emerald-300/20 bg-emerald-400/10'
                : match.elo_change < 0
                  ? 'border-red-400/20 bg-red-400/10'
                  : 'border-white/10 bg-white/[0.04]'
            }`}>
              <div className={`text-[10px] font-black uppercase tracking-[0.18em] mb-1 ${
                match.elo_change > 0 ? 'text-emerald-400' : match.elo_change < 0 ? 'text-red-400' : 'text-zinc-500'
              }`}>Elo</div>
              <div className={`flex items-center gap-1 text-xl font-black tracking-[-0.04em] ${
                match.elo_change > 0 ? 'text-emerald-300' : match.elo_change < 0 ? 'text-red-300' : 'text-zinc-400'
              }`}>
                {match.elo_change > 0 ? <TrendingUp size={14} /> : match.elo_change < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
                {match.elo_change > 0 ? '+' : ''}{match.elo_change}
              </div>
            </div>
          </div>
        </div>

        {/* Stats-Zeile */}
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/[0.06] pt-4">
          <div className="flex items-center gap-2">
            <Activity size={13} className="text-zinc-600" />
            <span className="text-xs text-zinc-600">Average:</span>
            <span className={`text-sm font-black ${match.my_average != null ? 'text-white' : 'text-zinc-600'}`}>
              {match.my_average != null ? Number(match.my_average).toFixed(1) : '—'}
            </span>
          </div>
          <div className="h-3 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <Target size={13} className="text-zinc-600" />
            <span className="text-xs text-zinc-600">Checkout:</span>
            <span className={`text-sm font-black ${match.highest_checkout != null ? 'text-white' : 'text-zinc-600'}`}>
              {match.highest_checkout ?? '—'}
            </span>
          </div>
          {match.one_eighties != null && match.one_eighties > 0 && (
            <>
              <div className="h-3 w-px bg-white/10" />
              <div className="flex items-center gap-2">
                <Zap size={13} className="text-amber-400" />
                <span className="text-xs text-zinc-600">180er:</span>
                <span className="text-sm font-black text-amber-300">{match.one_eighties}×</span>
              </div>
            </>
          )}

          {/* Expand-Button */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-bold text-zinc-500 transition hover:border-white/20 hover:text-zinc-300"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? 'Weniger' : 'Details'}
          </button>
        </div>

        {/* Expanded: Datum */}
        {expanded && (
          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-1">Datum</div>
                <div className="text-sm font-bold text-zinc-300">{formatDate(match.created_at)}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-1">Gegner-Elo</div>
                <div className="text-sm font-bold text-zinc-300">{match.opponent_elo}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-1">Legs gewonnen</div>
                <div className="text-sm font-bold text-zinc-300">{match.legs_won ?? '—'}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-1">Legs verloren</div>
                <div className="text-sm font-bold text-zinc-300">{match.legs_lost ?? '—'}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MatchHistory() {
  const [matches, setMatches] = useState<MatchEntry[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (!isMounted) return;
      if (!error) setMatches((data || []) as MatchEntry[]);
      setMatchesLoading(false);
    }
    void load();
    return () => { isMounted = false; };
  }, [supabase, router]);

  const filtered = matches.filter(m => {
    if (filter === 'wins') return m.is_win;
    if (filter === 'losses') return !m.is_win;
    return true;
  });

  const totalWins    = matches.filter(m => m.is_win).length;
  const totalLosses  = matches.filter(m => !m.is_win).length;
  const winrate      = matches.length > 0 ? Math.round((totalWins / matches.length) * 100) : 0;
  const totalElo     = matches.reduce((s, m) => s + (m.elo_change || 0), 0);
  const avgAvg       = (() => {
    const withAvg = matches.filter(m => m.my_average != null);
    if (!withAvg.length) return null;
    return (withAvg.reduce((s, m) => s + Number(m.my_average), 0) / withAvg.length).toFixed(1);
  })();
  const total180s    = matches.reduce((s, m) => s + (m.one_eighties ?? 0), 0);

  // Aktueller Win-Streak
  let currentStreak = 0;
  for (const m of matches) {
    if (m.is_win) currentStreak++;
    else break;
  }

  if (matchesLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-emerald-400" />
          <p className="text-sm font-bold text-zinc-600">Match History wird geladen…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">

      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(34,197,94,0.16),transparent_38%),radial-gradient(ellipse_at_85%_5%,rgba(6,182,212,0.10),transparent_30%),radial-gradient(ellipse_at_30%_80%,rgba(239,68,68,0.06),transparent_35%)]" />
        <div className="absolute inset-0 opacity-[0.055] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-emerald-400/25 to-transparent" />
      </div>

      {/* Navbar */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-lg font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-base font-black tracking-[-0.04em] md:text-xl">RANKEDDARTS</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Match History</div>
            </div>
          </Link>
          <div className="hidden items-center gap-7 text-sm font-medium text-zinc-300 lg:flex">
            <Link href="/matchmaking" className="transition hover:text-white">Matchmaking</Link>
            <Link href="/leaderboard" className="transition hover:text-white">Leaderboard</Link>
            <Link href="/profile" className="transition hover:text-white">Profil</Link>
            <Link href="/updates" className="transition hover:text-white">Updates</Link>
            <Link href="/premium" className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 font-bold text-emerald-200 transition hover:bg-emerald-400/20">Premium</Link>
          </div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/[0.04] text-zinc-200 transition hover:bg-white/10 lg:hidden">
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-white/10 bg-black/80 px-5 py-4 backdrop-blur-2xl lg:hidden">
            <div className="flex flex-col gap-1">
              {[['Matchmaking', '/matchmaking'], ['Leaderboard', '/leaderboard'], ['Profil', '/profile'], ['Updates', '/updates']].map(([l, h]) => (
                <Link key={h} href={h} onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">{l}</Link>
              ))}
              <Link href="/premium" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/10">Premium</Link>
            </div>
          </div>
        )}
      </nav>

      <section className="relative z-10 mx-auto max-w-5xl px-4 pb-24 pt-28 sm:px-5 md:px-8 md:pt-32">

        {/* ── Header ── */}
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-emerald-200 mb-4">
              <Swords size={12} /> Match History
            </div>
            <h1 className="text-5xl font-black tracking-[-0.07em] sm:text-6xl">
              Deine <span className="bg-gradient-to-r from-emerald-300 via-lime-200 to-cyan-300 bg-clip-text text-transparent">Matches</span>
            </h1>
            <p className="mt-3 text-zinc-500">{matches.length} gespielte Matches insgesamt</p>
          </div>

          {/* Form-Streak */}
          {matches.length > 0 && (
            <div className="rounded-[1.75rem] border border-white/10 bg-zinc-950/60 p-5 backdrop-blur-xl">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600 mb-3">Letzte 10 Matches</div>
              <FormStreak matches={matches} />
            </div>
          )}
        </div>

        {/* ── Stats-Grid ── */}
        <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">

          {/* Winrate Arc */}
          <div className="col-span-2 sm:col-span-1 flex items-center justify-center rounded-[2rem] border border-white/10 bg-zinc-950/60 p-6 backdrop-blur-xl">
            <WinrateArc winrate={winrate} />
          </div>

          {/* Siege */}
          <div className="relative overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-gradient-to-br from-emerald-400/[0.07] to-transparent p-6 backdrop-blur-xl">
            <Trophy className="absolute right-5 top-5 h-8 w-8 text-emerald-300/20" />
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-400 mb-2">Siege</div>
            <div className="text-5xl font-black tracking-[-0.07em] text-emerald-300">{totalWins}</div>
            <div className="mt-2 text-xs text-zinc-600">von {matches.length} Matches</div>
          </div>

          {/* Niederlagen */}
          <div className="relative overflow-hidden rounded-[2rem] border border-red-400/15 bg-gradient-to-br from-red-400/[0.07] to-transparent p-6 backdrop-blur-xl">
            <TrendingDown className="absolute right-5 top-5 h-8 w-8 text-red-400/20" />
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-red-400 mb-2">Niederlagen</div>
            <div className="text-5xl font-black tracking-[-0.07em] text-red-300">{totalLosses}</div>
            <div className="mt-2 text-xs text-zinc-600">von {matches.length} Matches</div>
          </div>

          {/* Elo Gesamt */}
          <div className={`relative overflow-hidden rounded-[2rem] border p-6 backdrop-blur-xl ${
            totalElo >= 0
              ? 'border-cyan-300/15 bg-gradient-to-br from-cyan-400/[0.07] to-transparent'
              : 'border-red-400/15 bg-gradient-to-br from-red-400/[0.07] to-transparent'
          }`}>
            {totalElo >= 0
              ? <TrendingUp className="absolute right-5 top-5 h-8 w-8 text-cyan-300/20" />
              : <TrendingDown className="absolute right-5 top-5 h-8 w-8 text-red-400/20" />
            }
            <div className={`text-[10px] font-black uppercase tracking-[0.22em] mb-2 ${totalElo >= 0 ? 'text-cyan-300' : 'text-red-400'}`}>Elo Gesamt</div>
            <div className={`text-5xl font-black tracking-[-0.07em] ${totalElo >= 0 ? 'text-cyan-300' : 'text-red-300'}`}>
              {totalElo > 0 ? '+' : ''}{totalElo}
            </div>
            {currentStreak > 1 && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-black text-emerald-300">
                🔥 {currentStreak} Streak
              </div>
            )}
          </div>

          {/* Average + 180er */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div className="relative overflow-hidden rounded-[2rem] border border-violet-300/15 bg-gradient-to-br from-violet-400/[0.07] to-transparent p-5 backdrop-blur-xl">
              <Activity className="absolute right-4 top-4 h-6 w-6 text-violet-300/25" />
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300 mb-1">Ø Average</div>
              <div className="text-3xl font-black tracking-[-0.06em] text-violet-200">{avgAvg ?? '—'}</div>
            </div>
            <div className="relative overflow-hidden rounded-[2rem] border border-amber-300/15 bg-gradient-to-br from-amber-400/[0.07] to-transparent p-5 backdrop-blur-xl">
              <Zap className="absolute right-4 top-4 h-6 w-6 text-amber-300/25" />
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300 mb-1">180er</div>
              <div className="text-3xl font-black tracking-[-0.06em] text-amber-200">{total180s}</div>
            </div>
          </div>
        </div>

        {/* ── Filter ── */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            {([
              { key: 'all',    label: `Alle (${matches.length})` },
              { key: 'wins',   label: `Siege (${totalWins})` },
              { key: 'losses', label: `Niederlagen (${totalLosses})` },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full px-5 py-2.5 text-sm font-bold transition ${
                  filter === key
                    ? 'border border-emerald-300/40 bg-emerald-400/15 text-emerald-200 shadow-[0_0_20px_rgba(34,197,94,0.1)]'
                    : 'border border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <Crosshair size={13} />
            {filtered.length} Einträge
          </div>
        </div>

        {/* ── Match-Liste ── */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-5 rounded-[2.5rem] border border-white/10 bg-zinc-950/60 py-28 text-center backdrop-blur-xl">
            <div className="grid h-20 w-20 place-items-center rounded-[1.75rem] border border-white/10 bg-white/[0.05] text-4xl">🎯</div>
            <div>
              <h3 className="text-2xl font-black tracking-[-0.04em]">
                {filter === 'all' ? 'Noch keine Matches' : filter === 'wins' ? 'Noch keine Siege' : 'Noch keine Niederlagen'}
              </h3>
              <p className="mt-2 text-sm text-zinc-600 max-w-xs mx-auto">
                {filter === 'all' ? 'Starte dein erstes Match über Matchmaking.' : 'Ändere den Filter um andere Matches zu sehen.'}
              </p>
            </div>
            {filter === 'all' && (
              <Link href="/matchmaking" className="rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-8 py-3 text-sm font-black text-black transition hover:opacity-90">
                Match suchen
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((match, i) => (
              <MatchCard key={match.id} match={match} index={i} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
