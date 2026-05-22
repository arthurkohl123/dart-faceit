'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Check, Crown, Gauge, LifeBuoy, ShieldCheck, Sparkles, Swords, Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type ProfileData = {
  username?: string;
  elo?: number;
  gamesPlayed?: number;
  wins?: number;
  isPremium?: boolean;
};

const premiumBenefits = [
  {
    title: 'Unbegrenzt Matches spielen',
    description: 'Keine tägliche Match-Begrenzung. Du kannst so viele Ranked Matches spielen, wie deine Session hergibt.',
    icon: Swords,
  },
  {
    title: 'Turniere spielen',
    description: 'Zugang zu exklusiven Premium-Turnieren mit höheren Preisgeldern und stärkerem Wettbewerb.',
    icon: Trophy,
  },
  {
    title: 'Erweiterter Matchmaking-Bereich',
    description: '±30 Elo statt nur ±25 Elo. Dadurch findest du schneller passende Gegner auf deinem Niveau.',
    icon: Gauge,
  },
  {
    title: 'Priority Support',
    description: 'Schnellere Hilfe bei Problemen über ein priorisiertes Ticket-System.',
    icon: LifeBuoy,
  },
];

const comparisonRows = [
  { label: 'Ranked Matches pro Tag', free: 'Begrenzt', premium: 'Unbegrenzt' },
  { label: 'Matchmaking Range', free: '±25 Elo', premium: '±30 Elo' },
  { label: 'Premium-Turniere', free: 'Nicht enthalten', premium: 'Enthalten' },
  { label: 'Support', free: 'Standard', premium: 'Priority' },
];

export default function Premium() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('username, elo, gamesPlayed, wins, isPremium')
        .eq('supabaseId', session.user.id)
        .single();

      if (!isMounted) return;

      setProfile((data || null) as ProfileData | null);
      setLoading(false);
    };

    void getUser();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-6 text-lg font-bold text-emerald-200 backdrop-blur-xl">Premium wird geladen...</div>
      </main>
    );
  }

  const winrate = profile?.gamesPlayed ? Math.round(((profile.wins || 0) / profile.gamesPlayed) * 100) : 0;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.24),transparent_34%),radial-gradient(circle_at_82%_8%,rgba(6,182,212,0.14),transparent_28%),radial-gradient(circle_at_48%_46%,rgba(163,230,53,0.08),transparent_32%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_78%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <nav className="relative z-10 border-b border-white/10 bg-black/45 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-xl font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-xl font-black tracking-[-0.04em] md:text-2xl">RANKEDDARTS</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Premium</div>
            </div>
          </Link>

          <button
            onClick={() => router.push('/profile')}
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10"
          >
            Zurück zum Profil
          </button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-14 md:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]" />
              Premium Zugang
            </div>
            <h1 className="mt-6 text-6xl font-black leading-[0.88] tracking-[-0.07em] md:text-8xl">Mehr Matches. Mehr Chancen. Mehr Darts.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">RankedDarts Premium ist für Spieler gedacht, die regelmäßiger antreten, schneller Gegner finden und zukünftig exklusive Wettbewerbe spielen möchten.</p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
                <div className="text-4xl font-black tracking-[-0.05em]">{profile?.elo || 1000}</div>
                <div className="mt-2 text-sm font-bold text-emerald-300">Dein Elo</div>
              </div>
              <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
                <div className="text-4xl font-black tracking-[-0.05em]">{profile?.gamesPlayed || 0}</div>
                <div className="mt-2 text-sm font-bold text-emerald-300">Spiele</div>
              </div>
              <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
                <div className="text-4xl font-black tracking-[-0.05em]">{winrate}%</div>
                <div className="mt-2 text-sm font-bold text-emerald-300">Winrate</div>
              </div>
            </div>
          </div>

          <aside className="relative overflow-hidden rounded-[2.5rem] border border-emerald-300/25 bg-zinc-950/88 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl md:p-8">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent" />
            <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />

            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <div className="grid h-16 w-16 place-items-center rounded-[1.4rem] border border-emerald-300/25 bg-emerald-400/10 text-emerald-200 shadow-[0_0_35px_rgba(34,197,94,0.18)]">
                  <Crown className="h-8 w-8" />
                </div>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Bald verfügbar</span>
              </div>

              <div className="mt-8">
                <div className="text-sm font-black uppercase tracking-[0.3em] text-emerald-300">RankedDarts Premium</div>
                <div className="mt-3 flex items-end gap-3">
                  <span className="text-7xl font-black tracking-[-0.08em]">4,99€</span>
                  <span className="pb-3 text-zinc-400">/ Monat</span>
                </div>
                <p className="mt-5 text-zinc-400">Ein Upgrade für aktive Spieler, die mehr aus jeder Season herausholen möchten.</p>
              </div>

              <button
                disabled
                className="mt-8 w-full rounded-3xl border border-white/10 bg-white/[0.06] px-8 py-5 font-black uppercase tracking-[0.18em] text-zinc-500 shadow-inner shadow-white/5 disabled:cursor-not-allowed"
              >
                Zahlung bald verfügbar
              </button>

              <p className="mt-5 text-center text-sm text-zinc-500">Premium wird in Kürze freigeschaltet. Bis dahin bleibt dein aktueller Account unverändert.</p>
            </div>
          </aside>
        </div>

        <section className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {premiumBenefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <article key={benefit.title} className="group rounded-[2rem] border border-white/10 bg-zinc-950/80 p-6 backdrop-blur-xl transition hover:-translate-y-1 hover:border-emerald-300/30 hover:bg-emerald-400/[0.05]">
                <div className="grid h-13 w-13 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200 transition group-hover:scale-105">
                  <Icon className="h-6 w-6" />
                </div>
                <h2 className="mt-5 text-xl font-black tracking-[-0.03em]">{benefit.title}</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{benefit.description}</p>
              </article>
            );
          })}
        </section>

        <section className="mt-10 grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="rounded-[2rem] border border-white/10 bg-zinc-950/80 p-7 backdrop-blur-xl md:p-8">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div>
                <div className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Status</div>
                <h2 className="mt-1 text-3xl font-black tracking-[-0.04em]">{profile?.isPremium ? 'Premium aktiv' : 'Free Account'}</h2>
              </div>
            </div>
            <p className="mt-6 text-lg leading-8 text-zinc-300">{profile?.isPremium ? 'Dein Profil ist bereits als Premium markiert.' : 'Du nutzt aktuell den kostenlosen Zugang. Sobald Premium freigeschaltet ist, kann der Upgrade-Flow hier aktiviert werden.'}</p>
            <Link href="/updates" className="mt-7 inline-flex rounded-full border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/20">
              Updates ansehen
            </Link>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/80 backdrop-blur-xl">
            <div className="border-b border-white/10 bg-white/[0.03] p-6 md:p-8">
              <div className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Vergleich</div>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">Free vs. Premium</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-[0.22em] text-zinc-500">
                    <th className="px-6 py-5 text-left md:px-8">Feature</th>
                    <th className="px-6 py-5 text-center md:px-8">Free</th>
                    <th className="px-6 py-5 text-center md:px-8">Premium</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {comparisonRows.map((row) => (
                    <tr key={row.label} className="transition hover:bg-emerald-400/[0.05]">
                      <td className="px-6 py-5 font-bold md:px-8">{row.label}</td>
                      <td className="px-6 py-5 text-center text-zinc-400 md:px-8">{row.free}</td>
                      <td className="px-6 py-5 text-center font-black text-emerald-300 md:px-8">
                        <span className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2">
                          <Check className="h-4 w-4" />
                          {row.premium}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mt-10 overflow-hidden rounded-[2.5rem] border border-emerald-300/20 bg-gradient-to-br from-emerald-400/[0.10] via-white/[0.04] to-cyan-400/[0.08] p-8 text-center backdrop-blur-xl md:p-10">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-emerald-300/25 bg-black/25 text-emerald-200">
            <Sparkles className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-4xl font-black tracking-[-0.05em] md:text-5xl">Bereit für die nächste Stufe?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-zinc-300">Die Premium-Seite ist jetzt optisch vorbereitet. Sobald Zahlungsanbieter und Aktivierungslogik eingebunden sind, kann der deaktivierte Button direkt zum Upgrade-Flow erweitert werden.</p>
        </section>
      </section>
    </main>
  );
}
