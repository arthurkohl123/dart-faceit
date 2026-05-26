'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Menu, Pencil, Save, X, XCircle } from 'lucide-react';

const rankTiers = [
  { name: 'Eisen',   min: 0,    color: 'text-zinc-300',    accent: 'from-zinc-400/20 to-zinc-950',    badge: 'EI' },
  { name: 'Bronze',  min: 1000, color: 'text-amber-300',   accent: 'from-amber-500/20 to-zinc-950',   badge: 'BR' },
  { name: 'Silber',  min: 1250, color: 'text-slate-200',   accent: 'from-slate-300/20 to-zinc-950',   badge: 'SI' },
  { name: 'Gold',    min: 1500, color: 'text-yellow-200',  accent: 'from-yellow-300/20 to-zinc-950',  badge: 'GO' },
  { name: 'Platin',  min: 1750, color: 'text-cyan-200',    accent: 'from-cyan-300/20 to-zinc-950',    badge: 'PL' },
  { name: 'Diamant', min: 2000, color: 'text-blue-200',    accent: 'from-blue-300/20 to-zinc-950',    badge: 'DI' },
  { name: 'Legende', min: 2500, color: 'text-emerald-200', accent: 'from-emerald-300/25 to-zinc-950', badge: 'LG' },
];

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
  scolia_username: string | null;
  dartcounter_username: string | null;
};

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
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
      if (isMounted) setUserId(uid);

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
  const currentRankIndex = rankTiers.reduce((current, rank, index) => (elo >= rank.min ? index : current), 0);
  const currentRank = rankTiers[currentRankIndex];
  const nextRank = rankTiers[currentRankIndex + 1] || currentRank;
  const eloToNext = Math.max(nextRank.min - elo, 0);
  const rankRange = nextRank.min - currentRank.min;
  const progress = nextRank === currentRank ? 100 : Math.min(Math.max(((elo - currentRank.min) / rankRange) * 100, 0), 100);
  const phoneVerified = Boolean(profile?.phone_verified);
  const phoneStatusText = phoneVerified ? 'Telefon verifiziert' : 'Telefon offen';

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
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-lg font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-base font-black tracking-[-0.04em] md:text-xl">RANKEDDARTS</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Profil Hub</div>
            </div>
          </Link>

          <div className="hidden items-center gap-7 text-sm font-medium text-zinc-300 lg:flex">
            <Link href="/matchmaking" className="transition hover:text-white">Matchmaking</Link>
            <Link href="/leaderboard" className="transition hover:text-white">Leaderboard</Link>
            <Link href="/updates" className="transition hover:text-white">Updates</Link>
            <Link href="/premium" className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 font-bold text-emerald-200 transition hover:bg-emerald-400/20">Premium</Link>
          </div>

          <div className="flex items-center gap-3">
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
              <Link href="/history" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Match History</Link>
              <Link href="/updates" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Updates</Link>
              <Link href="/premium" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/10">Premium</Link>
              <div className="mt-2 border-t border-white/10 pt-2">
                <button onClick={logout} className="w-full rounded-2xl px-4 py-3 text-left text-sm font-bold text-zinc-400 transition hover:bg-white/10 hover:text-white">Logout</button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-5 md:px-8 md:pt-32">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          {/* Profil-Karte */}
          <div className={`relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br ${currentRank.accent} p-6 shadow-2xl shadow-black/50 sm:p-8 md:p-10`}>
            <div className="absolute right-5 top-5 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200 sm:right-8 sm:top-8 sm:px-4 sm:py-2 sm:text-xs">Aktives Profil</div>
            <div className="grid h-20 w-20 place-items-center rounded-[1.75rem] border border-white/10 bg-black/35 text-2xl font-black text-emerald-200 shadow-[0_0_40px_rgba(34,197,94,0.16)] sm:h-24 sm:w-24 sm:text-3xl">{currentRank.badge}</div>
            <h1 className="mt-5 text-4xl font-black tracking-[-0.07em] sm:text-5xl md:text-6xl lg:text-7xl">{profile?.username || 'Spieler'}</h1>
            <div className={`mt-2 text-2xl font-black tracking-[-0.05em] sm:text-3xl sm:mt-3 ${currentRank.color}`}>{currentRank.name}</div>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base sm:leading-8">Dein aktueller RankedDarts-Status. Starte neue Matches, bestätige Ergebnisse und arbeite dich in Richtung der nächsten Division.</p>
          </div>

          {/* Stats-Karten */}
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-5 backdrop-blur-xl sm:p-7">
              <div className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Aktuelles Rating</div>
              <div className="mt-3 text-5xl font-black tracking-[-0.08em] sm:text-6xl lg:text-7xl">{elo}</div>
              <div className="mt-1 text-sm text-zinc-400">Elo Punkte</div>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-5 backdrop-blur-xl sm:p-7">
              <div className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Winrate</div>
              <div className="mt-3 text-5xl font-black tracking-[-0.08em] sm:text-6xl lg:text-7xl">{winrate}%</div>
              <div className="mt-1 text-sm text-zinc-400">{wins} Siege aus {gamesPlayed} Spielen</div>
            </div>
            <div className={`col-span-2 rounded-[1.75rem] border p-5 backdrop-blur-xl sm:p-7 lg:col-span-1 ${phoneVerified ? 'border-emerald-300/20 bg-emerald-400/[0.07]' : 'border-amber-300/20 bg-amber-400/[0.07]'}`}>
              <div className={`text-xs font-black uppercase tracking-[0.28em] ${phoneVerified ? 'text-emerald-300' : 'text-amber-300'}`}>Verifizierung</div>
              <div className="mt-3 text-xl font-black tracking-[-0.04em] sm:text-2xl">{phoneStatusText}</div>
              <div className="mt-1 text-xs leading-6 text-zinc-400 sm:text-sm">
                {phoneVerified ? 'Dein Account ist für Fair-Play und Ranked vorbereitet.' : 'Bestätige deine Nummer, bevor du vollständig in Ranked startest.'}
              </div>
              {!phoneVerified && (
                <Link href={`/auth/verify-phone${profile?.phone_number ? `?phone=${encodeURIComponent(profile.phone_number)}` : ''}`} className="mt-4 inline-flex rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-black text-amber-100 transition hover:bg-amber-300/15 sm:text-sm">
                  Jetzt verifizieren
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Statistiken + Fortschritt */}
        <div className="mt-6 grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
          <section className="rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-5 backdrop-blur-xl sm:p-7 md:p-8">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Statistiken</div>
                <h2 className="mt-1.5 text-2xl font-black tracking-[-0.04em] sm:text-3xl">Season Snapshot</h2>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                <div className="text-3xl font-black sm:text-4xl">{gamesPlayed}</div>
                <div className="mt-1.5 text-xs text-zinc-400 sm:text-sm">Spiele</div>
              </div>
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.07] p-4 sm:p-5">
                <div className="text-3xl font-black text-emerald-300 sm:text-4xl">{wins}</div>
                <div className="mt-1.5 text-xs text-zinc-400 sm:text-sm">Siege</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                <div className="text-3xl font-black text-zinc-300 sm:text-4xl">{losses}</div>
                <div className="mt-1.5 text-xs text-zinc-400 sm:text-sm">Niederlagen</div>
              </div>
            </div>

            {/* Performance-Stats: Average & 180er */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-yellow-300/20 bg-yellow-400/[0.06] p-4 sm:p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-yellow-300 mb-1">Ø Average</div>
                <div className="text-2xl font-black text-yellow-200 sm:text-3xl">
                  {avgAverage > 0 ? avgAverage.toFixed(2) : '—'}
                </div>
                <div className="mt-1 text-xs text-zinc-500">Durchschnitt über alle Matches</div>
              </div>
              <div className="rounded-2xl border border-red-300/20 bg-red-400/[0.06] p-4 sm:p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-red-300 mb-1">180er</div>
                <div className="text-2xl font-black text-red-200 sm:text-3xl">{total180s}</div>
                <div className="mt-1 text-xs text-zinc-500">Gesamt geworfene 180er</div>
              </div>
            </div>

            <button
              onClick={() => router.push(phoneVerified ? '/matchmaking' : '/auth/verify-phone')}
              className="mt-6 w-full rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-4 font-black uppercase tracking-[0.18em] text-black shadow-[0_18px_60px_rgba(34,197,94,0.22)] transition hover:-translate-y-1 sm:py-5"
            >
              {phoneVerified ? 'Match suchen' : 'Telefon verifizieren'}
            </button>
          </section>

          <section className="rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-5 backdrop-blur-xl sm:p-7 md:p-8">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Nächster Rang</div>
                <h2 className="mt-1.5 text-2xl font-black tracking-[-0.04em] sm:text-3xl">Fortschritt zu {nextRank.name}</h2>
              </div>
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-base font-black text-emerald-200 sm:h-16 sm:w-16 sm:text-lg">{nextRank.badge}</div>
            </div>

            <div className="flex items-end justify-between gap-4">
              <div>
                <div className={`text-3xl font-black tracking-[-0.05em] sm:text-4xl lg:text-5xl ${nextRank.color}`}>{nextRank.name}</div>
                <div className="mt-2 text-sm text-zinc-400">{eloToNext > 0 ? `${eloToNext} Elo bis zum nächsten Rang` : 'Maximaler Rang erreicht'}</div>
              </div>
              <div className="text-right text-2xl font-black text-emerald-300 sm:text-3xl">{Math.round(progress)}%</div>
            </div>

            <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10 sm:h-4">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300" style={{ width: `${progress}%` }} />
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white/[0.04] p-3 text-xs text-zinc-400 sm:p-4 sm:text-sm"><span className="block text-lg font-black text-white sm:text-xl">{currentRank.min}</span>Rang Start</div>
              <div className="rounded-2xl bg-white/[0.04] p-3 text-center text-xs text-zinc-400 sm:p-4 sm:text-sm"><span className="block text-lg font-black text-emerald-300 sm:text-xl">{elo}</span>Aktuell</div>
              <div className="rounded-2xl bg-white/[0.04] p-3 text-right text-xs text-zinc-400 sm:p-4 sm:text-sm"><span className="block text-lg font-black text-white sm:text-xl">{nextRank.min}</span>Ziel</div>
            </div>
          </section>
        </div>

        {/* ── Plattform-Verbindungen ─────────────────────────────────────── */}
        <section className="mt-6 rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-5 backdrop-blur-xl sm:p-7 md:p-8">
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
              <div className="mb-3 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/40 text-lg">📷</div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Scolia</div>
                  <div className="text-sm font-bold text-zinc-300">Kamera-Tracking</div>
                </div>
                {profile?.scolia_username
                  ? <CheckCircle2 size={16} className="ml-auto text-emerald-400" />
                  : <XCircle size={16} className="ml-auto text-zinc-600" />
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
                <div className="text-sm font-bold text-white">
                  {profile?.scolia_username
                    ? <span className="text-emerald-200">{profile.scolia_username}</span>
                    : <span className="text-zinc-600">Nicht hinterlegt</span>
                  }
                </div>
              )}
            </div>

            {/* DartCounter */}
            <div className={`rounded-2xl border p-5 transition sm:p-6 ${profile?.dartcounter_username ? 'border-cyan-300/25 bg-cyan-400/[0.07]' : 'border-white/10 bg-white/[0.03]'}`}>
              <div className="mb-3 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/40 text-lg">📱</div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">DartCounter</div>
                  <div className="text-sm font-bold text-zinc-300">App-Tracking</div>
                </div>
                {profile?.dartcounter_username
                  ? <CheckCircle2 size={16} className="ml-auto text-cyan-400" />
                  : <XCircle size={16} className="ml-auto text-zinc-600" />
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
                <div className="text-sm font-bold text-white">
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

        {/* Match History */}
        <section className="mt-6 rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-5 backdrop-blur-xl sm:p-7 md:p-8">
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
      </section>
    </main>
  );
}
