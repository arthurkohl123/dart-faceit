'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { BrandLogo } from '@/components/BrandLogo';
import { AdminBadge } from '@/components/AdminBadge';
import { getRankProgress } from '@/lib/ranks';
import { useRouter } from 'next/navigation';
import { NotificationBell } from '@/components/notification-bell';
import { ArrowUpRight, CheckCircle2, Crosshair, Flame, Headphones, Menu, Pencil, Save, ShieldCheck, Sparkles, Target, Trophy, X, XCircle, Zap } from 'lucide-react';

type MatchData = {
  id: string | number;
  created_at: string;
  opponent_name?: string;
  is_win?: boolean;
  result?: string;
};

type ProfileData = {
  username: string | null;
  elo: number;
  gamesPlayed: number;
  wins: number;
  phone_verified: boolean;
  phone_number: string | null;
  is_admin: boolean;
  isPremium: boolean;
  scolia_username: string | null;
  dartcounter_username: string | null;
};

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Performance-Stats
  const [avgAverage, setAvgAverage] = useState<number>(0);
  const [total180s, setTotal180s] = useState<number>(0);

  // Plattform-Usernamen Bearbeitungsstatus
  const [editingPlatforms, setEditingPlatforms] = useState(false);
  const [scoliaInput, setScoliaInput] = useState('');
  const [dartcounterInput, setDartcounterInput] = useState('');
  const [savingPlatforms, setSavingPlatforms] = useState(false);
  const [platformSaveMsg, setPlatformSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }

      const uid = session.user.id;

      const [{ data: profileData }, { data: matchData }, { data: statsData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('supabaseId', uid).single(),
        supabase.from('matches').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(5),
        supabase.rpc('get_my_stats'),
      ]);

      if (!isMounted) return;
      setProfile(profileData ?? null);
      setScoliaInput(profileData?.scolia_username ?? '');
      setDartcounterInput(profileData?.dartcounter_username ?? '');
      setMatches((matchData || []) as MatchData[]);
      if (statsData) {
        const s = statsData as { avg_average: number; total_180s: number };
        setAvgAverage(s.avg_average ?? 0);
        setTotal180s(s.total_180s ?? 0);
      }
      setLoading(false);
    }

    void load();
    return () => { isMounted = false; };
  }, [supabase, router]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const savePlatformUsernames = async () => {
    setSavingPlatforms(true);
    setPlatformSaveMsg(null);
    try {
      const { error } = await supabase.rpc('update_platform_usernames', {
        p_scolia_username:      scoliaInput.trim() || null,
        p_dartcounter_username: dartcounterInput.trim() || null,
      });
      if (error) throw error;
      setProfile((prev) => prev ? {
        ...prev,
        scolia_username:      scoliaInput.trim() || null,
        dartcounter_username: dartcounterInput.trim() || null,
      } : prev);
      setPlatformSaveMsg({ type: 'success', text: 'Gespeichert!' });
      setEditingPlatforms(false);
    } catch (err) {
      setPlatformSaveMsg({ type: 'error', text: err instanceof Error ? err.message : 'Fehler beim Speichern.' });
    } finally {
      setSavingPlatforms(false);
    }
  };

  const elo = profile?.elo ?? 1000;
  const gamesPlayed = profile?.gamesPlayed ?? 0;
  const wins = profile?.wins ?? 0;
  const losses = Math.max(gamesPlayed - wins, 0);
  const winrate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
  const { current: currentRank, upcoming, eloToNext, progress } = getRankProgress(elo);
  const nextRank = upcoming ?? currentRank;
  const phoneVerified = Boolean(profile?.phone_verified);
  const phoneStatusText = phoneVerified ? 'Telefon verifiziert' : 'Telefon offen';
  const hasPlatform = Boolean(profile?.scolia_username || profile?.dartcounter_username);
  const queueReady = phoneVerified && hasPlatform;
  const nextStep = !phoneVerified
    ? { label: 'Telefon verifizieren', detail: 'Noch ein Schritt bis zum Ranked-Zugang.', href: '/auth/verify-phone', icon: ShieldCheck }
    : !hasPlatform
      ? { label: 'Plattform verbinden', detail: 'Hinterlege Scolia oder DartCounter für die Queue.', href: '#platforms', icon: Target }
      : { label: 'Nächstes Match starten', detail: 'Du bist bereit für die Ranked-Queue.', href: '/matchmaking', icon: Zap };
  const NextStepIcon = nextStep.icon;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-6 text-lg font-bold text-emerald-200 backdrop-blur-xl">Profil wird geladen...</div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(6,182,212,0.14),transparent_28%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_78%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      {/* Navbar */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo className="h-10 w-10" />
            <div>
              <div className="text-base font-black tracking-[-0.04em] md:text-xl">RANKEDDARTS</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Profil Hub</div>
            </div>
          </Link>

          <div className="hidden items-center gap-7 text-sm font-medium text-zinc-300 lg:flex">
            <Link href="/matchmaking" className="transition hover:text-white">Matchmaking</Link>
            <Link href="/leaderboard" className="transition hover:text-white">Leaderboard</Link>
            <Link href="/tournaments" className="inline-flex items-center gap-1.5 transition hover:text-white"><Trophy size={14} />Turniere</Link>
            <Link href="/updates" className="transition hover:text-white">Updates</Link>
            <Link href="/support" className="inline-flex items-center gap-1.5 transition hover:text-white"><Headphones size={14} />Support</Link>
            <Link href="/premium" className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 font-bold text-emerald-200 transition hover:bg-emerald-400/20">Premium</Link>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <button onClick={logout} className="hidden rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10 sm:block">
              Logout
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/[0.04] text-zinc-200 transition hover:bg-white/10 lg:hidden"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-white/10 bg-black/80 px-5 py-4 backdrop-blur-2xl lg:hidden">
            <div className="flex flex-col gap-1">
              <Link href="/matchmaking" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Matchmaking</Link>
              <Link href="/leaderboard" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Leaderboard</Link>
              <Link href="/tournaments" onClick={() => setMobileMenuOpen(false)} className="inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white"><Trophy size={15} />Turniere</Link>
              <Link href="/history" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Match History</Link>
              <Link href="/updates" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Updates</Link>
              <Link href="/support" onClick={() => setMobileMenuOpen(false)} className="inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white"><Headphones size={15} />Support</Link>
              <Link href="/premium" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/10">Premium</Link>
              <div className="mt-2 border-t border-white/10 pt-2">
                <button onClick={logout} className="w-full rounded-2xl px-4 py-3 text-left text-sm font-bold text-zinc-400 transition hover:bg-white/10 hover:text-white">Logout</button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-5 md:px-8 md:pt-32">

        {/* ── Hero-Profil-Banner ──────────────────────────────────────────── */}
        <div className={`relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br ${currentRank.accent} p-7 shadow-2xl shadow-black/60 sm:p-10 md:p-12`}>
          {/* Hintergrund-Glow */}
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl opacity-30"
            style={{ background: `radial-gradient(circle, ${currentRank.glowColor}, transparent 70%)` }}
          />
          <div className="pointer-events-none absolute -right-10 top-1/2 hidden h-72 w-72 -translate-y-1/2 items-center justify-center lg:flex">
            <div className={`absolute inset-0 rounded-full border ${currentRank.ringColor} opacity-40`} />
            <div className={`absolute inset-10 rounded-full border ${currentRank.ringColor} opacity-35`} />
            <div className={`absolute inset-20 rounded-full border ${currentRank.ringColor} opacity-30`} />
            <div className="ranked-orbit absolute left-1/2 top-1/2 h-3 w-3 rounded-full bg-emerald-200 shadow-[0_0_22px_rgba(167,243,208,0.95)]" />
            <Crosshair className={`h-12 w-12 ${currentRank.color} opacity-70`} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent ranked-shine" />

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
            {/* Avatar-Ring */}
            <div
              className={`relative flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.6rem] border-2 bg-black/40 shadow-lg sm:h-24 sm:w-24 ${currentRank.ringColor}`}
              style={{ boxShadow: `0 0 32px ${currentRank.glowColor}` }}
            >
              <span className="text-3xl font-black text-white sm:text-4xl">
                {(profile?.username ?? 'S').charAt(0).toUpperCase()}
              </span>
              <span className="absolute -bottom-2 -right-2 grid h-7 w-7 place-items-center rounded-full border border-emerald-200/40 bg-emerald-400 text-black shadow-[0_0_20px_rgba(74,222,128,0.7)]"><Zap className="h-3.5 w-3.5 fill-current" /></span>
            </div>

            {/* Name + Rang */}
            <div className="flex-1 min-w-0">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-emerald-200/80"><Sparkles className="h-3.5 w-3.5" /> Player card · Season 01 · bis 01.11.2026</div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-black tracking-[-0.06em] sm:text-4xl md:text-5xl lg:text-6xl truncate">
                  {profile?.username || 'Spieler'}
                </h1>
                <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.2em] ${currentRank.ringColor} bg-black/30 ${currentRank.color}`}>
                  Level {currentRank.level} · {currentRank.name}
                </span>
                {profile?.isPremium && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/35 bg-emerald-300/15 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 shadow-[0_0_22px_rgba(74,222,128,0.18)]">
                    <Sparkles className="h-3.5 w-3.5 fill-current text-emerald-300" /> Premium
                  </span>
                )}
                {profile?.is_admin && <AdminBadge />}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <span className="text-base font-black text-white">{elo}</span>
                  <span>Elo</span>
                </span>
                <span className="h-3.5 w-px bg-white/15" />
                <span className="flex items-center gap-1.5">
                  <span className="text-base font-black text-white">{gamesPlayed}</span>
                  <span>Spiele</span>
                </span>
                <span className="h-3.5 w-px bg-white/15" />
                <span className="flex items-center gap-1.5">
                  <span className={`text-base font-black ${winrate >= 50 ? 'text-emerald-300' : 'text-zinc-300'}`}>{winrate}%</span>
                  <span>Winrate</span>
                </span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] ${queueReady ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/25 bg-amber-400/10 text-amber-100'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${queueReady ? 'bg-emerald-300 animate-pulse' : 'bg-amber-300'}`} />
                  {queueReady ? 'Queue bereit' : 'Profil vervollständigen'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-bold text-zinc-300"><Trophy className="h-3.5 w-3.5 text-yellow-200" /> Level {currentRank.level} · {currentRank.name}</span>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => router.push(phoneVerified ? '/matchmaking' : '/auth/verify-phone')}
              className="shrink-0 rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-6 py-3.5 text-sm font-black uppercase tracking-[0.16em] text-black shadow-[0_12px_40px_rgba(34,197,94,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_50px_rgba(34,197,94,0.38)] sm:px-8 sm:py-4"
            >
              {phoneVerified ? 'Match suchen' : 'Verifizieren'} <ArrowUpRight className="ml-2 inline-block h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Stats-Grid ──────────────────────────────────────────────────── */}
        <div className="mt-5 grid gap-4 grid-cols-2 sm:grid-cols-4">
          <div className="rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-5 backdrop-blur-xl sm:p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.26em] text-emerald-300">Rating</div>
            <div className="mt-2 text-4xl font-black tracking-[-0.07em] sm:text-5xl">{elo}</div>
            <div className="mt-1 text-xs text-zinc-500">Elo Punkte</div>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-5 backdrop-blur-xl sm:p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-300">Winrate</div>
            <div className="mt-2 text-4xl font-black tracking-[-0.07em] sm:text-5xl">{winrate}%</div>
            <div className="mt-1 text-xs text-zinc-500">{wins}W / {losses}L</div>
          </div>
          <div className="rounded-[1.5rem] border border-yellow-300/15 bg-yellow-400/[0.05] p-5 backdrop-blur-xl sm:p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.26em] text-yellow-300">Ø Average</div>
            <div className="mt-2 text-4xl font-black tracking-[-0.07em] text-yellow-200 sm:text-5xl">
              {avgAverage > 0 ? avgAverage.toFixed(1) : '—'}
            </div>
            <div className="mt-1 text-xs text-zinc-500">Alle Matches</div>
          </div>
          <div className="rounded-[1.5rem] border border-red-300/15 bg-red-400/[0.05] p-5 backdrop-blur-xl sm:p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.26em] text-red-300">180er</div>
            <div className="mt-2 text-4xl font-black tracking-[-0.07em] text-red-200 sm:text-5xl">{total180s}</div>
            <div className="mt-1 text-xs text-zinc-500">Gesamt</div>
          </div>
        </div>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <Link
            href={nextStep.href}
            className="group relative overflow-hidden rounded-[1.75rem] border border-emerald-300/20 bg-gradient-to-r from-emerald-400/[0.13] via-emerald-400/[0.06] to-cyan-400/[0.08] p-6 transition hover:-translate-y-1 hover:border-emerald-200/40 sm:p-7"
          >
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-emerald-300/15 blur-3xl transition group-hover:bg-emerald-300/25" />
            <div className="relative flex items-center gap-5">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-emerald-200/25 bg-black/25 text-emerald-100 shadow-[0_0_30px_rgba(34,197,94,0.15)]">
                <NextStepIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-200">Dein nächster Zug</div>
                <div className="mt-1 text-xl font-black tracking-[-0.04em] text-white sm:text-2xl">{nextStep.label}</div>
                <p className="mt-1 text-sm text-zinc-300">{nextStep.detail}</p>
              </div>
              <ArrowUpRight className="h-6 w-6 shrink-0 text-emerald-100 transition group-hover:-translate-y-1 group-hover:translate-x-1" />
            </div>
          </Link>

          <div className="rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-6 backdrop-blur-xl sm:p-7">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">Season Momentum</div>
              <Flame className="h-5 w-5 text-amber-300" />
            </div>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div><span className="text-3xl font-black tracking-[-0.06em] text-white">{gamesPlayed}</span><span className="ml-2 text-sm font-bold text-zinc-500">Matches</span></div>
              <div className="text-right text-sm font-bold text-emerald-200">{wins} Siege</div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-lime-300 to-cyan-300" style={{ width: `${Math.max(winrate, 8)}%` }} /></div>
          </div>
        </section>

        {/* ── Fortschritt + Verifizierung ─────────────────────────────────── */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
          {/* Rang-Fortschritt */}
          <section className="rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-6 backdrop-blur-xl sm:p-8">
            <div className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Nächster Rang</div>
            <div className="mt-2 flex items-baseline justify-between gap-4">
              <h2 className="text-2xl font-black tracking-[-0.04em] sm:text-3xl">{upcoming ? <>Fortschritt zu <span className={nextRank.color}>{nextRank.name}</span></> : <span className={currentRank.color}>Maximaler Rang erreicht</span>}</h2>
              <span className="text-2xl font-black text-emerald-300">{Math.round(progress)}%</span>
            </div>

            <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/10 sm:h-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300 transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white/[0.04] p-3 text-xs text-zinc-400 sm:p-4 sm:text-sm">
                <span className="block text-lg font-black text-white sm:text-xl">{currentRank.min}</span>
                <span className={`text-[10px] font-bold uppercase tracking-[0.18em] ${currentRank.color}`}>{currentRank.name}</span>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-3 text-center text-xs text-zinc-400 sm:p-4 sm:text-sm">
                <span className="block text-lg font-black text-emerald-300 sm:text-xl">{elo}</span>
                <span>Aktuell</span>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-3 text-right text-xs text-zinc-400 sm:p-4 sm:text-sm">
                <span className="block text-lg font-black text-white sm:text-xl">{nextRank.min}</span>
                <span className={`text-[10px] font-bold uppercase tracking-[0.18em] ${nextRank.color}`}>{nextRank.name}</span>
              </div>
            </div>

            {eloToNext > 0 && (
              <p className="mt-4 text-sm text-zinc-500">
                Noch <span className="font-black text-white">{eloToNext} Elo</span> bis {nextRank.name}.
              </p>
            )}
          </section>

          {/* Verifizierung */}
          <section className={`rounded-[1.75rem] border p-6 backdrop-blur-xl sm:p-8 ${phoneVerified ? 'border-emerald-300/20 bg-emerald-400/[0.06]' : 'border-amber-300/20 bg-amber-400/[0.06]'}`}>
            <div className={`text-xs font-black uppercase tracking-[0.28em] ${phoneVerified ? 'text-emerald-300' : 'text-amber-300'}`}>Verifizierung</div>
            <div className="mt-3 flex items-center gap-3">
              {phoneVerified
                ? <CheckCircle2 size={22} className="shrink-0 text-emerald-400" />
                : <XCircle size={22} className="shrink-0 text-amber-400" />
              }
              <span className="text-lg font-black tracking-[-0.03em] sm:text-xl">{phoneStatusText}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              {phoneVerified
                ? 'Dein Account ist für Fair-Play und Ranked vorbereitet.'
                : 'Bestätige deine Nummer, bevor du vollständig in Ranked startest.'}
            </p>
            {!phoneVerified && (
              <Link
                href={`/auth/verify-phone${profile?.phone_number ? `?phone=${encodeURIComponent(profile.phone_number)}` : ''}`}
                className="mt-5 inline-flex rounded-full border border-amber-300/25 bg-amber-300/10 px-5 py-2.5 text-sm font-black text-amber-100 transition hover:bg-amber-300/18"
              >
                Jetzt verifizieren →
              </Link>
            )}
          </section>
        </div>

        {/* ── Plattform-Verbindungen ─────────────────────────────────────── */}
        <section id="platforms" className="mt-5 scroll-mt-28 rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-6 backdrop-blur-xl sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Plattformen</div>
              <h2 className="mt-1.5 text-2xl font-black tracking-[-0.04em] sm:text-3xl">Verbundene Accounts</h2>
              <p className="mt-1 text-sm text-zinc-400">Hinterlege deine Nutzernamen, um die jeweilige Queue zu betreten.</p>
            </div>
            {!editingPlatforms && (
              <button
                onClick={() => { setEditingPlatforms(true); setPlatformSaveMsg(null); }}
                className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-zinc-300 transition hover:border-white/30 hover:bg-white/10"
              >
                <Pencil size={14} />
                Bearbeiten
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Scolia */}
            <div className={`rounded-2xl border p-5 transition sm:p-6 ${profile?.scolia_username ? 'border-emerald-300/25 bg-emerald-400/[0.07]' : 'border-white/10 bg-white/[0.03]'}`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Scolia</div>
                  <div className="mt-0.5 text-sm font-bold text-zinc-400">Kamera-Tracking</div>
                </div>
                {profile?.scolia_username
                  ? <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                  : <XCircle size={16} className="shrink-0 text-zinc-600" />
                }
              </div>
              {editingPlatforms ? (
                <input
                  type="text"
                  value={scoliaInput}
                  onChange={(e) => setScoliaInput(e.target.value)}
                  placeholder="Dein Scolia-Username"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/50 focus:bg-white/[0.08]"
                />
              ) : (
                <div className="text-sm font-bold">
                  {profile?.scolia_username
                    ? <span className="text-emerald-200">{profile.scolia_username}</span>
                    : <span className="text-zinc-600">Nicht hinterlegt</span>
                  }
                </div>
              )}
            </div>

            {/* DartCounter */}
            <div className={`rounded-2xl border p-5 transition sm:p-6 ${profile?.dartcounter_username ? 'border-cyan-300/25 bg-cyan-400/[0.07]' : 'border-white/10 bg-white/[0.03]'}`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">DartCounter</div>
                  <div className="mt-0.5 text-sm font-bold text-zinc-400">App-Tracking</div>
                </div>
                {profile?.dartcounter_username
                  ? <CheckCircle2 size={16} className="shrink-0 text-cyan-400" />
                  : <XCircle size={16} className="shrink-0 text-zinc-600" />
                }
              </div>
              {editingPlatforms ? (
                <input
                  type="text"
                  value={dartcounterInput}
                  onChange={(e) => setDartcounterInput(e.target.value)}
                  placeholder="Dein DartCounter-Username"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/50 focus:bg-white/[0.08]"
                />
              ) : (
                <div className="text-sm font-bold">
                  {profile?.dartcounter_username
                    ? <span className="text-cyan-200">{profile.dartcounter_username}</span>
                    : <span className="text-zinc-600">Nicht hinterlegt</span>
                  }
                </div>
              )}
            </div>
          </div>

          {/* Speichern / Abbrechen */}
          {editingPlatforms && (
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={savePlatformUsernames}
                disabled={savingPlatforms}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-6 py-2.5 text-sm font-black text-black transition hover:opacity-90 disabled:opacity-50"
              >
                <Save size={14} />
                {savingPlatforms ? 'Speichern...' : 'Speichern'}
              </button>
              <button
                onClick={() => {
                  setEditingPlatforms(false);
                  setScoliaInput(profile?.scolia_username ?? '');
                  setDartcounterInput(profile?.dartcounter_username ?? '');
                  setPlatformSaveMsg(null);
                }}
                className="flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-zinc-300 transition hover:bg-white/10"
              >
                <X size={14} />
                Abbrechen
              </button>
              {platformSaveMsg && (
                <span className={`text-sm font-bold ${platformSaveMsg.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>
                  {platformSaveMsg.text}
                </span>
              )}
            </div>
          )}

          {/* Hinweis wenn keine Plattform hinterlegt */}
          {!profile?.scolia_username && !profile?.dartcounter_username && !editingPlatforms && (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] px-5 py-4 text-sm text-amber-200">
              Hinterlege mindestens einen Plattform-Account, um am Matchmaking teilzunehmen.
            </div>
          )}
        </section>

        {/* ── Match History ──────────────────────────────────────────────── */}
        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-6 backdrop-blur-xl sm:p-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Verlauf</div>
              <h2 className="mt-1.5 text-2xl font-black tracking-[-0.04em] sm:text-3xl">Letzte Matches</h2>
            </div>
            <Link href="/history" className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-zinc-300 transition hover:border-white/30 hover:bg-white/10 sm:text-sm">
              Alle ansehen
            </Link>
          </div>

          {matches.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-zinc-500">Noch keine Matches gespielt.</div>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => (
                <div key={match.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
                  <div className="text-sm font-bold text-zinc-300">{match.opponent_name ?? 'Unbekannter Gegner'}</div>
                  <div className={`rounded-full px-3 py-1 text-xs font-black ${match.is_win ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>
                    {match.is_win ? 'SIEG' : 'NIEDERLAGE'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {profile?.is_admin && (
          <div className="mt-6 text-center">
            <Link href="/admin" className="inline-flex rounded-full border border-red-400/25 bg-red-500/10 px-6 py-3 text-sm font-bold text-red-300 transition hover:bg-red-500/20">
              Admin-Panel öffnen
            </Link>
          </div>
        )}
        <div className="mt-6 text-center">
          <Link href="/account" className="text-xs font-bold text-zinc-600 transition hover:text-zinc-300">Account verwalten & Daten exportieren</Link>
        </div>
      </section>
    </main>
  );
}
