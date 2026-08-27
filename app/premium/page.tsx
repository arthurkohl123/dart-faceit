'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, Crown, Gauge, LifeBuoy, Radar, ShieldCheck, Sparkles, Star, Swords, Trophy, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { BrandLogo } from '@/components/BrandLogo';
import { useRouter } from 'next/navigation';

type ProfileData = {
  username?: string;
  elo?: number;
  gamesPlayed?: number;
  wins?: number;
  isPremium?: boolean;
  stripe_subscription_status?: string | null;
  stripe_current_period_end?: string | null;
  stripe_cancel_at_period_end?: boolean;
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
    title: 'Priority Support',
    description: 'Schnellere Hilfe bei Problemen über ein priorisiertes Ticket-System.',
    icon: LifeBuoy,
  },
  {
    title: 'Premium-Auszeichnung',
    description: 'Dein Premium-Status ist auf deinem Spielerprofil und im Leaderboard sichtbar.',
    icon: Star,
  },
];

const comparisonRows = [
  { label: 'Ranked Matches pro Tag', free: '4', premium: 'Unbegrenzt' },
  { label: 'Premium-Turniere', free: 'Nicht enthalten', premium: 'Enthalten' },
  { label: 'Support', free: 'Standard', premium: 'Priority' },
  { label: 'Premium-Auszeichnung', free: '—', premium: 'Sichtbar im Profil' },
];

export default function Premium() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCheckoutStatus(new URLSearchParams(window.location.search).get('checkout'));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

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
        .select('username, elo, gamesPlayed, wins, isPremium, stripe_subscription_status, stripe_current_period_end, stripe_cancel_at_period_end')
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
  const startCheckout = async () => {
    setCheckoutLoading(true);
    setCheckoutError(null);

    try {
      const response = await fetch('/api/checkout', { method: 'POST' });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || 'Der Checkout konnte nicht gestartet werden.');
      }

      window.location.assign(payload.url);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Der Checkout konnte nicht gestartet werden.');
      setCheckoutLoading(false);
    }
  };

  const openBillingPortal = async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const response = await fetch('/api/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'manage' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error || 'Das Abo-Portal konnte nicht geöffnet werden.');
      window.location.assign(payload.url);
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : 'Das Abo-Portal konnte nicht geöffnet werden.');
      setPortalLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.24),transparent_34%),radial-gradient(circle_at_82%_8%,rgba(6,182,212,0.14),transparent_28%),radial-gradient(circle_at_48%_46%,rgba(163,230,53,0.08),transparent_32%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_78%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="absolute left-[8%] top-44 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl ranked-float" />
        <div className="absolute right-[6%] top-[32rem] h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl ranked-float-delayed" />
      </div>

      <nav className="relative z-10 border-b border-white/10 bg-black/45 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo className="h-11 w-11" />
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

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-20">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-100 shadow-[0_0_30px_rgba(34,197,94,0.12)]">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" /></span>
              Premium Arena · Season 01 · bis 01.11.2026
            </div>
            <h1 className="mt-6 max-w-4xl text-6xl font-black leading-[0.84] tracking-[-0.08em] md:text-8xl xl:text-[6.8rem]">Mehr Zeit<br /><span className="bg-gradient-to-r from-emerald-300 via-lime-200 to-cyan-300 bg-clip-text text-transparent">für deinen Aufstieg.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-300">Premium ist für Spieler, die nicht auf die nächste Chance warten wollen. Spiele ohne Tageslimit, tritt in Premium-Turnieren an und mach aus jeder Session echten Fortschritt.</p>

            <div className="mt-8 flex flex-wrap gap-3 text-xs font-bold text-zinc-300">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3.5 py-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Sicherer Stripe-Checkout</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3.5 py-2"><Zap className="h-3.5 w-3.5 text-lime-200" /> Jederzeit verwaltbar</span>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="group rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl transition hover:-translate-y-1 hover:border-emerald-300/25 hover:bg-emerald-400/[0.05]">
                <div className="text-4xl font-black tracking-[-0.05em]">{profile?.elo || 1000}</div>
                <div className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-300"><Gauge className="h-4 w-4" /> Dein Elo</div>
              </div>
              <div className="group rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl transition hover:-translate-y-1 hover:border-emerald-300/25 hover:bg-emerald-400/[0.05]">
                <div className="text-4xl font-black tracking-[-0.05em]">{profile?.gamesPlayed || 0}</div>
                <div className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-300"><Swords className="h-4 w-4" /> Spiele</div>
              </div>
              <div className="group rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl transition hover:-translate-y-1 hover:border-emerald-300/25 hover:bg-emerald-400/[0.05]">
                <div className="text-4xl font-black tracking-[-0.05em]">{winrate}%</div>
                <div className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-300"><Trophy className="h-4 w-4" /> Winrate</div>
              </div>
            </div>
          </div>

          <aside className="relative overflow-hidden rounded-[2.5rem] border border-emerald-300/30 bg-gradient-to-b from-emerald-400/[0.13] via-zinc-950/95 to-zinc-950/95 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl md:p-8">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent" />
            <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -right-10 top-24 hidden h-44 w-44 items-center justify-center lg:flex">
              <div className="absolute inset-0 rounded-full border border-emerald-300/20" />
              <div className="absolute inset-7 rounded-full border border-cyan-300/20" />
              <div className="absolute inset-14 rounded-full border border-emerald-300/25" />
              <div className="ranked-orbit absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-full bg-lime-200 shadow-[0_0_18px_rgba(190,242,100,0.95)]" />
              <Radar className="h-7 w-7 text-emerald-100/70" />
            </div>

            <div className="relative z-10">
              <div className="flex items-center justify-between gap-4">
                <div className="grid h-16 w-16 place-items-center rounded-[1.4rem] border border-emerald-300/25 bg-emerald-400/10 text-emerald-200 shadow-[0_0_35px_rgba(34,197,94,0.18)]">
                  <Crown className="h-8 w-8" />
                </div>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100">Monatsabo</span>
              </div>

              <div className="mt-8">
                <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.3em] text-emerald-300"><Star className="h-4 w-4 fill-current" /> RankedDarts Premium</div>
                <div className="mt-3 flex items-end gap-3">
                  <span className="text-7xl font-black tracking-[-0.08em]">4,99€</span>
                  <span className="pb-3 text-zinc-400">/ Monat</span>
                </div>
                <p className="mt-4 max-w-sm text-zinc-300">Dein Zugang zu mehr Ranked-Matches, exklusiven Turnieren und einer sichtbaren Premium-Identität.</p>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3.5"><span className="block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Matches</span><span className="mt-1 block text-lg font-black text-emerald-200">Ohne Limit</span></div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3.5"><span className="block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Abrechnung</span><span className="mt-1 block text-lg font-black text-cyan-200">Monatlich</span></div>
              </div>

              <button
                onClick={startCheckout}
                disabled={checkoutLoading || Boolean(profile?.isPremium)}
                className="group mt-7 w-full rounded-3xl border border-emerald-200/35 bg-gradient-to-r from-emerald-300 via-lime-200 to-emerald-300 px-8 py-5 font-black uppercase tracking-[0.18em] text-black shadow-[0_16px_45px_rgba(52,211,153,0.24)] transition hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(52,211,153,0.35)] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.06] disabled:text-zinc-500 disabled:shadow-inner disabled:shadow-white/5"
              >
                {profile?.isPremium ? 'Premium ist aktiv' : checkoutLoading ? 'Checkout wird geöffnet...' : <span>Premium freischalten <ArrowUpRight className="ml-2 inline-block h-4 w-4 transition group-hover:-translate-y-1 group-hover:translate-x-1" /></span>}
              </button>

              {checkoutError && <p className="mt-4 text-center text-sm font-semibold text-rose-300">{checkoutError}</p>}
              {checkoutStatus === 'success' && <p className="mt-4 text-center text-sm font-semibold text-emerald-200">Danke! Deine Zahlung wird bestätigt. Aktualisiere die Seite in wenigen Sekunden, falls der Status noch nicht erscheint.</p>}
              {checkoutStatus === 'cancelled' && <p className="mt-4 text-center text-sm text-zinc-400">Der Checkout wurde abgebrochen. Dein Account bleibt unverändert.</p>}
              <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-zinc-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Sichere Zahlung über Stripe · monatlich abrechenbar</p>
              <Link href="/premium/kuendigung" className="mt-3 block text-center text-xs font-bold text-emerald-200 underline decoration-emerald-300/40 underline-offset-4 transition hover:text-emerald-100">Informationen zu Laufzeit &amp; Kündigung</Link>
            </div>
          </aside>
        </div>

        <section className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {premiumBenefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <article key={benefit.title} className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/80 p-6 backdrop-blur-xl transition hover:-translate-y-2 hover:border-emerald-300/30 hover:bg-emerald-400/[0.05]">
                <div className="absolute right-5 top-5 text-[11px] font-black tracking-[0.18em] text-white/10">0{index + 1}</div>
                <div className="grid h-14 w-14 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200 transition group-hover:scale-105 group-hover:bg-emerald-400/20">
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
            <p className="mt-6 text-lg leading-8 text-zinc-300">{profile?.isPremium ? profile.stripe_cancel_at_period_end && profile.stripe_current_period_end ? `Dein Abo endet am ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(profile.stripe_current_period_end))}. Bis dahin bleiben deine Vorteile aktiv.` : 'Dein Profil ist bereits als Premium markiert.' : 'Du nutzt aktuell den kostenlosen Zugang. Wähle Premium, um den sicheren Stripe-Checkout zu öffnen.'}</p>
            {profile?.isPremium ? <div className="mt-7 flex flex-wrap gap-3"><button onClick={openBillingPortal} disabled={portalLoading} className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-60">{portalLoading ? 'Portal wird geöffnet …' : 'Premium verwalten'}</button><Link href="/premium/kuendigung" className="rounded-full border border-white/15 px-5 py-3 text-sm font-bold text-zinc-200 transition hover:bg-white/10">Kündigen</Link></div> : <Link href="/updates" className="mt-7 inline-flex rounded-full border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/20">Updates ansehen</Link>}
            {portalError && <p className="mt-4 text-sm font-semibold text-rose-300">{portalError}</p>}
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
          <div className="pointer-events-none mx-auto -mb-8 h-28 w-28 rounded-full border border-emerald-300/20 bg-emerald-300/10 blur-[1px] ranked-float" />
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-emerald-300/25 bg-black/25 text-emerald-200">
            <Sparkles className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-4xl font-black tracking-[-0.05em] md:text-5xl">Bereit für die nächste Stufe?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-zinc-300">Dein Premium-Status wird nach erfolgreicher Zahlung automatisch über Stripe und Supabase aktiviert.</p>
          <button
            onClick={startCheckout}
            disabled={checkoutLoading || Boolean(profile?.isPremium)}
            className="group mt-8 rounded-3xl bg-white px-8 py-5 text-sm font-black uppercase tracking-[0.18em] text-black shadow-[0_16px_45px_rgba(255,255,255,0.14)] transition hover:-translate-y-1 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
          >
            {profile?.isPremium ? 'Premium ist aktiv' : checkoutLoading ? 'Checkout wird geöffnet...' : <span>Jetzt Premium werden <ArrowUpRight className="ml-2 inline-block h-4 w-4 transition group-hover:-translate-y-1 group-hover:translate-x-1" /></span>}
          </button>
        </section>
      </section>
    </main>
  );
}


