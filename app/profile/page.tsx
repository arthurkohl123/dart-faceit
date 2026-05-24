'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';

const rankTiers = [
  { name: 'Eisen', min: 0, color: 'text-zinc-300', accent: 'from-zinc-400/20 to-zinc-950', badge: 'EI' },
  { name: 'Bronze', min: 1000, color: 'text-amber-300', accent: 'from-amber-500/20 to-zinc-950', badge: 'BR' },
  { name: 'Silber', min: 1250, color: 'text-slate-200', accent: 'from-slate-300/20 to-zinc-950', badge: 'SI' },
  { name: 'Gold', min: 1500, color: 'text-yellow-200', accent: 'from-yellow-300/20 to-zinc-950', badge: 'GO' },
  { name: 'Platin', min: 1750, color: 'text-cyan-200', accent: 'from-cyan-300/20 to-zinc-950', badge: 'PL' },
  { name: 'Diamant', min: 2000, color: 'text-blue-200', accent: 'from-blue-300/20 to-zinc-950', badge: 'DI' },
  { name: 'Legende', min: 2500, color: 'text-emerald-200', accent: 'from-emerald-300/25 to-zinc-950', badge: 'LG' },
];

type ProfileData = {
  id?: string;
  email?: string;
  username?: string;
  elo?: number;
  gamesPlayed?: number;
  wins?: number;
  phone_number?: string;
  phone_verified?: boolean;
  phone_verified_at?: string | null;
};

type MatchData = {
  id: string | number;
  created_at: string;
  opponent_name?: string;
  is_win?: boolean;
  result?: string;
};

export default function Profile() {
  const [user, setUser] = useState<ProfileData | null>(null);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('supabaseId', session.user.id)
        .single();

      const { data: matchData } = await supabase
        .from('matches')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!isMounted) return;

      setUser({
        id: session.user.id,
        email: session.user.email,
        ...(profile || {}),
        phone_number: profile?.phone_number || session.user.phone || '',
        phone_verified: Boolean(profile?.phone_verified || session.user.phone_confirmed_at),
        phone_verified_at: profile?.phone_verified_at || session.user.phone_confirmed_at || null,
      });
      setMatches((matchData || []) as MatchData[]);
      setLoading(false);
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const elo = user?.elo || 1000;
  const gamesPlayed = user?.gamesPlayed || 0;
  const wins = user?.wins || 0;
  const losses = Math.max(gamesPlayed - wins, 0);
  const winrate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
  const currentRankIndex = rankTiers.reduce((current, rank, index) => (elo >= rank.min ? index : current), 0);
  const currentRank = rankTiers[currentRankIndex];
  const nextRank = rankTiers[currentRankIndex + 1] || currentRank;
  const eloToNext = Math.max(nextRank.min - elo, 0);
  const rankRange = nextRank.min - currentRank.min;
  const progress = nextRank === currentRank ? 100 : Math.min(Math.max(((elo - currentRank.min) / rankRange) * 100, 0), 100);
  const phoneVerified = Boolean(user?.phone_verified);
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

          {/* Desktop Nav */}
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
            {/* Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/[0.04] text-zinc-200 transition hover:bg-white/10 lg:hidden"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
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
            <h1 className="mt-5 text-4xl font-black tracking-[-0.07em] sm:text-5xl md:text-6xl lg:text-7xl">{user?.username || 'Spieler'}</h1>
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
                <Link href={`/auth/verify-phone${user?.phone_number ? `?phone=${encodeURIComponent(user.phone_number)}` : ''}`} className="mt-4 inline-flex rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-black text-amber-100 transition hover:bg-amber-300/15 sm:text-sm">
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
              <div className="rounded-2xl bg-white/[0.04] p-3 text-xs text-zinc-400 sm:p-4 sm:text-sm"><span className="block text-lg font-black text-white sm:text-xl">{elo}</span>Aktuell</div>
              <div className="rounded-2xl bg-white/[0.04] p-3 text-xs text-zinc-400 sm:p-4 sm:text-sm"><span className="block text-lg font-black text-white sm:text-xl">{nextRank.min}</span>Ziel</div>
            </div>
          </section>
        </div>

        {/* Letzte Matches */}
        <section className="mt-6 rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-5 backdrop-blur-xl sm:p-7 md:p-8">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Letzte Matches</div>
              <h2 className="mt-1.5 text-2xl font-black tracking-[-0.04em] sm:text-3xl">Aktuelle Form</h2>
            </div>
            <Link href="/history" className="text-sm font-bold text-zinc-400 transition hover:text-white">Match-History öffnen →</Link>
          </div>

          {matches.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {matches.slice(0, 5).map((match) => (
                <div key={match.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center transition hover:-translate-y-1 hover:border-emerald-300/35">
                  <div className="text-xs text-zinc-500">{new Date(match.created_at).toLocaleDateString('de-DE')}</div>
                  <div className="mt-2 truncate text-sm font-bold">vs {match.opponent_name || 'Gegner'}</div>
                  <div className={`mt-3 text-2xl font-black sm:text-3xl ${match.is_win ? 'text-emerald-300' : 'text-zinc-300'}`}>{match.result || '—'}</div>
                  <div className="mt-1.5 text-xs uppercase tracking-[0.2em] text-zinc-500">{match.is_win ? 'Sieg' : 'Match'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center text-sm text-zinc-400 sm:text-base">Noch keine Matches vorhanden. Starte dein erstes Ranked Match über das Matchmaking.</div>
          )}
        </section>
      </section>
    </main>
  );
}
