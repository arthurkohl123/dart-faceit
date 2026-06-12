'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Check, Crown, Gauge, LifeBuoy, ShieldCheck, Sparkles, Swords, Trophy, Zap, Star } from 'lucide-react';
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
    title: 'Unbegrenzt Matches',
    description: 'Keine tägliche Match-Begrenzung. Spiele so viele Ranked Matches, wie du möchtest.',
    icon: Swords,
    color: 'from-emerald-400 to-emerald-600',
  },
  {
    title: 'Exklusive Turniere',
    description: 'Zugang zu Premium-Events mit höheren Preisgeldern und stärkerem Wettbewerb.',
    icon: Trophy,
    color: 'from-amber-400 to-orange-500',
  },
  {
    title: 'Priority Support',
    description: 'Erhalte schnellere Hilfe bei Problemen über unser priorisiertes Ticket-System.',
    icon: LifeBuoy,
    color: 'from-blue-400 to-indigo-600',
  },
  {
    title: 'Premium Abzeichen',
    description: 'Ein exklusives Icon neben deinem Namen, das deinen Status auf der Plattform zeigt.',
    icon: Star,
    color: 'from-purple-400 to-pink-600',
  },
];

const comparisonRows = [
  { label: 'Ranked Matches pro Tag', free: '4', premium: 'Unbegrenzt' },
  { label: 'Premium-Turniere', free: 'Nicht enthalten', premium: 'Enthalten' },
  { label: 'Support', free: 'Standard', premium: 'Priority' },
  { label: 'Profil-Customization', free: 'Basis', premium: 'Erweitert' },
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
        <div className="relative">
          <div className="h-24 w-24 rounded-full border-t-2 border-emerald-500 animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-black uppercase tracking-widest text-emerald-500">
            Darts
          </div>
        </div>
      </main>
    );
  }

  const winrate = profile?.gamesPlayed ? Math.round(((profile.wins || 0) / profile.gamesPlayed) * 100) : 0;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white selection:bg-emerald-500/30">
      {/* Background Decorations */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.15),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(6,182,212,0.1),transparent_40%)]" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png' )] opacity-[0.03]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050607]/80 to-[#050607]" />
      </div>

      <nav className="relative z-50 border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-4 group">
            <div className="relative">
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 opacity-40 blur transition group-hover:opacity-70"></div>
              <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-black text-lg font-black text-emerald-400 border border-emerald-500/20">
                R
              </div>
            </div>
            <div>
              <div className="text-xl font-black tracking-tighter md:text-2xl">RANKEDDARTS</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-500/80 leading-none">Premium Experience</div>
            </div>
          </Link>

          <button
            onClick={() => router.push('/profile')}
            className="group relative overflow-hidden rounded-full bg-white/5 px-6 py-2 text-sm font-bold text-zinc-300 transition hover:text-white"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent opacity-0 transition group-hover:opacity-100"></div>
            Zurück zum Profil
          </button>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-12 md:px-8">
        {/* Hero Section */}
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5 text-xs font-bold text-emerald-400 uppercase tracking-widest">
              <Zap className="h-3.5 w-3.5 fill-current" />
              Level Up Your Game
            </div>
            
            <h1 className="text-5xl font-black leading-[0.9] tracking-tight md:text-7xl lg:text-8xl bg-gradient-to-br from-white via-white to-zinc-500 bg-clip-text text-transparent">
              Dominieren   

              <span className="text-emerald-500">ohne Limits.</span>
            </h1>
            
            <p className="max-w-xl text-lg leading-relaxed text-zinc-400">
              RankedDarts Premium bietet dir die Werkzeuge, die du brauchst, um an die Spitze zu gelangen. Mehr Matches, bessere Turniere und exklusiver Support.
            </p>

            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Dein Elo', value: profile?.elo || 1000 },
                { label: 'Matches', value: profile?.gamesPlayed || 0 },
                { label: 'Winrate', value: `${winrate}%` }
              ].map((stat) => (
                <div key={stat.label} className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition hover:border-emerald-500/30">
                  <div className="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-emerald-500/5 blur-xl transition group-hover:bg-emerald-500/10"></div>
                  <div className="text-2xl font-black tracking-tighter md:text-3xl">{stat.value}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/60">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing Card */}
          <div className="relative">
            <div className="absolute -inset-4 rounded-[3rem] bg-emerald-500/5 blur-3xl"></div>
            <aside className="relative overflow-hidden rounded-[2.5rem] border border-emerald-500/20 bg-zinc-900/40 p-8 shadow-2xl backdrop-blur-xl">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
              
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <Crown className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-black tracking-tight pt-4">Premium Pass</h3>
                </div>
                <div className="rounded-full bg-zinc-800/50 border border-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Coming Soon
                </div>
              </div>

              <div className="mt-8 space-y-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-6xl font-black tracking-tighter">4,99€</span>
                  <span className="text-zinc-500 font-medium">/Monat</span>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Schalte das volle Potenzial deines Accounts frei und unterstütze die Entwicklung von RankedDarts.
                </p>
              </div>

              <div className="mt-8 space-y-4">
                {['Unbegrenzt Ranked Matches', 'Premium Tournament Access', 'VIP Badge im Profil', 'Keine Werbung'].map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm font-medium text-zinc-300">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                      <Check className="h-3 w-3" />
                    </div>
                    {item}
                  </div>
                ))}
              </div>

              <button
                disabled
                className="mt-10 w-full group relative overflow-hidden rounded-2xl bg-zinc-800 px-6 py-4 font-black uppercase tracking-widest text-zinc-500 transition disabled:cursor-not-allowed"
              >
                <span className="relative z-10">Zahlung bald verfügbar</span>
              </button>
              
              <p className="mt-4 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                Sichere Verschlüsselung & 100% Datenschutz
              </p>
            </aside>
          </div>
        </div>

        {/* Benefits Grid */}
        <div className="mt-24 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {premiumBenefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div key={benefit.title} className="group relative overflow-hidden rounded-3xl border border-white/5 bg-white/[0.02] p-6 transition hover:border-emerald-500/20 hover:bg-white/[0.04]">
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${benefit.color} text-black mb-6 transition group-hover:scale-110`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h4 className="text-lg font-black tracking-tight mb-2">{benefit.title}</h4>
                <p className="text-sm text-zinc-400 leading-relaxed">{benefit.description}</p>
              </div>
            );
          })}
        </div>

        {/* Status & Comparison */}
        <div className="mt-24 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="flex flex-col justify-between rounded-3xl border border-white/5 bg-zinc-900/20 p-8 backdrop-blur-sm">
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Mitgliedschaft</div>
                  <h3 className="text-2xl font-black tracking-tight">{profile?.isPremium ? 'Premium Aktiv' : 'Kostenloser Account'}</h3>
                </div>
              </div>
              <p className="text-zinc-400 leading-relaxed">
                {profile?.isPremium 
                  ? 'Du genießt bereits alle Vorteile von RankedDarts Premium. Danke für deine Unterstützung!' 
                  : 'Du nutzt aktuell die Basis-Version. Ein Upgrade wird verfügbar sein, sobald unser Zahlungssystem live geht.'}
              </p>
            </div>
            <Link 
              href="/updates" 
              className="mt-8 inline-flex items-center justify-center rounded-xl bg-white/5 border border-white/10 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
            >
              System Updates
            </Link>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/5 bg-zinc-900/20 backdrop-blur-sm">
            <div className="border-b border-white/5 bg-white/[0.02] px-8 py-6">
              <h3 className="text-xl font-black tracking-tight">Vorteile im Überblick</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-widest text-zinc-500 border-b border-white/5">
                    <th className="px-8 py-4 text-left">Feature</th>
                    <th className="px-8 py-4 text-center">Free</th>
                    <th className="px-8 py-4 text-center text-emerald-400">Premium</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {comparisonRows.map((row) => (
                    <tr key={row.label} className="group transition hover:bg-white/[0.02]">
                      <td className="px-8 py-4 text-sm font-bold text-zinc-300">{row.label}</td>
                      <td className="px-8 py-4 text-center text-sm text-zinc-500">{row.free}</td>
                      <td className="px-8 py-4 text-center">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-black text-emerald-400 border border-emerald-500/20">
                          <Check className="h-3 w-3" />
                          {row.premium}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Final CTA */}
        <div className="mt-24 relative overflow-hidden rounded-[3rem] border border-emerald-500/20 bg-emerald-500/5 p-12 text-center">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-1/2 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-black border border-emerald-500/20 text-emerald-400">
            <Sparkles className="h-8 w-8" />
          </div>
          <h2 className="text-4xl font-black tracking-tighter md:text-5xl mb-4">Werde Teil der Elite.</h2>
          <p className="mx-auto max-w-2xl text-zinc-400 text-lg mb-8">
            Wir arbeiten hart daran, das beste Darts-Erlebnis der Welt zu schaffen. Bleib gespannt auf die kommenden Features.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
              <ShieldCheck className="h-4 w-4" /> Secure Payment
            </div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
              <Zap className="h-4 w-4" /> Instant Activation
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
