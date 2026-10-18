'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, CalendarClock, Check, Crown, Gauge, LifeBuoy, ShieldCheck, Sparkles, Star, Swords, Trophy, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { BrandLogo } from '@/components/BrandLogo';
import { useRouter } from 'next/navigation';
import { formatPremiumTimeRemaining, getManualPremiumState, getPremiumSubscriptionState, type PremiumSubscriptionData } from '@/lib/premium-subscription';

type ProfileData = {
  username?: string;
  elo?: number;
  gamesPlayed?: number;
  wins?: number;
  isPremium?: boolean;
};

type PremiumStatusResponse = {
  premium: PremiumSubscriptionData | null;
  overview?: PremiumOverview | null;
};

type PremiumOverview = {
  active?: boolean;
  premium_since?: string | null;
  premium_cosmetic?: PremiumCosmetic | null;
  fixed_access_until?: string | null;
  code_redemptions?: number;
  premium_tournaments?: number;
  ranked_matches_since?: number;
};

type PremiumOffer = {
  plan: 'monthly' | 'yearly';
  configured: boolean;
  available: boolean;
  unitAmount: number | null;
  currency: string | null;
  interval: string | null;
  intervalCount: number | null;
};

type PremiumGiftOffer = {
  durationDays: 30 | 90 | 365;
  configured: boolean;
  available: boolean;
  unitAmount: number | null;
  currency: string | null;
};

type PremiumOffersResponse = {
  offers?: PremiumOffer[];
  giftOffers?: PremiumGiftOffer[];
};

type PremiumPlan = 'monthly' | 'yearly';
type PremiumCosmetic = 'emerald' | 'violet' | 'gold' | 'cyan';

type PremiumStatusFetchResult = {
  data: PremiumStatusResponse | null;
  unavailable: boolean;
};

type PerformancePeriod = 7 | 30 | 90;

type PerformanceSummary = {
  matches: number;
  wins: number;
  losses: number;
  winRate: number | null;
  eloDelta: number;
  average: number | null;
  averageMatches: number;
  highestCheckout: number | null;
  oneEighties: number;
};

type PerformanceFormPoint = {
  date: string;
  matches: number;
  wins: number;
  average: number | null;
  eloDelta: number;
};

type PerformancePlatform = {
  platform: 'scolia' | 'dartcounter' | 'autodarts';
  matches: number;
  wins: number;
  winRate: number | null;
  average: number | null;
  eloDelta: number;
  oneEighties: number;
};

type PerformancePersonalBests = {
  bestAverage: number | null;
  highestCheckout: number | null;
  most180sInMatch: number | null;
  bestEloGain: number | null;
};

type PremiumPerformance = {
  fullAccess: boolean;
  requestedPeriodDays: PerformancePeriod;
  periodDays: PerformancePeriod;
  periodStart: string | null;
  periodEnd: string | null;
  summary: PerformanceSummary;
  previousSummary: PerformanceSummary | null;
  form: PerformanceFormPoint[];
  platforms: PerformancePlatform[];
  unassignedMatches: number;
  personalBests: PerformancePersonalBests | null;
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

const performancePeriods: PerformancePeriod[] = [7, 30, 90];

const performancePlatforms: Array<{ platform: PerformancePlatform['platform']; label: string; className: string }> = [
  { platform: 'scolia', label: 'Scolia', className: 'border-emerald-300/25 bg-emerald-400/[0.06] text-emerald-100' },
  { platform: 'dartcounter', label: 'DartCounter', className: 'border-cyan-300/25 bg-cyan-400/[0.06] text-cyan-100' },
  { platform: 'autodarts', label: 'AutoDarts', className: 'border-violet-300/25 bg-violet-400/[0.06] text-violet-100' },
];

const comparisonRows = [
  { label: 'Ranked Matches pro Tag', free: '4', premium: 'Unbegrenzt' },
  { label: 'Premium-Turniere', free: 'Nicht enthalten', premium: 'Enthalten' },
  { label: 'Performance-Labor', free: '7 Tage Vorschau', premium: '7/30/90 Tage + Trends' },
  { label: 'Support', free: 'Standard', premium: 'Priority' },
  { label: 'Premium-Auszeichnung', free: '—', premium: 'Sichtbar im Profil' },
];

const premiumCosmetics: Array<{ value: PremiumCosmetic; label: string; className: string }> = [
  { value: 'emerald', label: 'Emerald', className: 'border-emerald-300 bg-emerald-300/20 text-emerald-100' },
  { value: 'violet', label: 'Violet', className: 'border-violet-300 bg-violet-400/20 text-violet-100' },
  { value: 'gold', label: 'Gold', className: 'border-amber-300 bg-amber-300/20 text-amber-100' },
  { value: 'cyan', label: 'Cyan', className: 'border-cyan-300 bg-cyan-400/20 text-cyan-100' },
];

function formatPrice(offer: Pick<PremiumOffer, 'available' | 'unitAmount' | 'currency'> | undefined) {
  if (!offer?.available || offer.unitAmount === null || !offer.currency) return null;
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: offer.currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(offer.unitAmount / 100);
}

function giftDurationLabel(durationDays: PremiumGiftOffer['durationDays']) {
  if (durationDays === 365) return '1 Jahr';
  return `${durationDays} Tage`;
}

function formatPremiumDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asFiniteNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNullableNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function asPerformancePeriod(value: unknown, fallback: PerformancePeriod = 7): PerformancePeriod {
  const days = asFiniteNumber(value, fallback);
  return days === 7 || days === 30 || days === 90 ? days : fallback;
}

function normalizePerformanceSummary(value: unknown): PerformanceSummary {
  const summary = asRecord(value);
  return {
    matches: Math.max(0, Math.round(asFiniteNumber(summary?.matches))),
    wins: Math.max(0, Math.round(asFiniteNumber(summary?.wins))),
    losses: Math.max(0, Math.round(asFiniteNumber(summary?.losses))),
    winRate: asNullableNumber(summary?.win_rate),
    eloDelta: Math.round(asFiniteNumber(summary?.elo_delta)),
    average: asNullableNumber(summary?.average),
    averageMatches: Math.max(0, Math.round(asFiniteNumber(summary?.average_matches))),
    highestCheckout: asNullableNumber(summary?.highest_checkout),
    oneEighties: Math.max(0, Math.round(asFiniteNumber(summary?.one_eighties))),
  };
}

function normalizePerformance(value: unknown): PremiumPerformance | null {
  const performance = asRecord(value);
  if (!performance || !asRecord(performance.summary)) return null;

  const normalizeForm = (source: unknown): PerformanceFormPoint[] => !Array.isArray(source) ? [] : source.flatMap((entry) => {
    const point = asRecord(entry);
    const date = typeof point?.date === 'string' ? point.date : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    return [{
      date,
      matches: Math.max(0, Math.round(asFiniteNumber(point?.matches))),
      wins: Math.max(0, Math.round(asFiniteNumber(point?.wins))),
      average: asNullableNumber(point?.average),
      eloDelta: Math.round(asFiniteNumber(point?.elo_delta)),
    }];
  });

  const normalizePlatforms = (source: unknown): PerformancePlatform[] => !Array.isArray(source) ? [] : source.flatMap((entry) => {
    const platform = asRecord(entry);
    if (!platform) return [];
    const key = platform?.platform;
    if (key !== 'scolia' && key !== 'dartcounter' && key !== 'autodarts') return [];
    return [{
      platform: key,
      matches: Math.max(0, Math.round(asFiniteNumber(platform.matches))),
      wins: Math.max(0, Math.round(asFiniteNumber(platform.wins))),
      winRate: asNullableNumber(platform.win_rate),
      average: asNullableNumber(platform.average),
      eloDelta: Math.round(asFiniteNumber(platform.elo_delta)),
      oneEighties: Math.max(0, Math.round(asFiniteNumber(platform.one_eighties))),
    }];
  });

  const personalBests = asRecord(performance.personal_bests);
  return {
    fullAccess: performance.full_access === true,
    requestedPeriodDays: asPerformancePeriod(performance.requested_period_days),
    periodDays: asPerformancePeriod(performance.period_days),
    periodStart: typeof performance.period_start === 'string' ? performance.period_start : null,
    periodEnd: typeof performance.period_end === 'string' ? performance.period_end : null,
    summary: normalizePerformanceSummary(performance.summary),
    previousSummary: asRecord(performance.previous_summary) ? normalizePerformanceSummary(performance.previous_summary) : null,
    form: normalizeForm(performance.form),
    platforms: normalizePlatforms(performance.platforms),
    unassignedMatches: Math.max(0, Math.round(asFiniteNumber(performance.unassigned_matches))),
    personalBests: personalBests ? {
      bestAverage: asNullableNumber(personalBests.best_average),
      highestCheckout: asNullableNumber(personalBests.highest_checkout),
      most180sInMatch: asNullableNumber(personalBests.most_180s_in_match),
      bestEloGain: asNullableNumber(personalBests.best_elo_gain),
    } : null,
  };
}

function formatPerformanceNumber(value: number | null, fractionDigits = 0) {
  if (value === null) return '—';
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value);
}

function formatPerformancePercent(value: number | null) {
  return value === null ? '—' : `${formatPerformanceNumber(value, 1)}%`;
}

function formatSignedElo(value: number) {
  return `${value > 0 ? '+' : ''}${formatPerformanceNumber(value)}`;
}

function formatPerformanceDay(value: string) {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.` : value;
}

function PerformanceMetric({ label, value, detail, tone = 'text-white' }: { label: string; value: ReactNode; detail: ReactNode; tone?: string }) {
  return <article className="min-w-0 border border-white/10 bg-black/20 p-4 sm:p-5">
    <p className="text-[9px] font-black uppercase tracking-[.16em] text-zinc-500">{label}</p>
    <strong className={`mt-2 block truncate text-3xl font-black tracking-[-.06em] sm:text-4xl ${tone}`}>{value}</strong>
    <p className="mt-2 min-h-5 text-[11px] leading-5 text-zinc-500">{detail}</p>
  </article>;
}

function PerformanceTrend({ points }: { points: PerformanceFormPoint[] }) {
  const hasMatches = points.some((point) => point.matches > 0);
  if (!hasMatches) return <div className="grid min-h-52 place-items-center border border-dashed border-white/10 bg-black/20 px-6 text-center text-sm leading-6 text-zinc-500">Noch keine gewerteten Ranked-Matches in diesem Zeitraum.</div>;

  const width = 640;
  const height = 192;
  const paddingX = 20;
  const paddingY = 24;
  const values = points.reduce<{ cumulative: number; values: number[] }>((series, point) => {
    const cumulative = series.cumulative + point.eloDelta;
    return { cumulative, values: [...series.values, cumulative] };
  }, { cumulative: 0, values: [] }).values;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = Math.max(max - min, 1);
  const drawWidth = width - paddingX * 2;
  const drawHeight = height - paddingY * 2;
  const coordinates = points.map((point, index) => ({
    ...point,
    cumulative: values[index] || 0,
    x: paddingX + (drawWidth * index) / Math.max(points.length - 1, 1),
    y: paddingY + ((max - (values[index] || 0)) / span) * drawHeight,
  }));
  const linePath = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const baseline = paddingY + ((max - 0) / span) * drawHeight;
  const areaPath = coordinates.length > 1
    ? `${linePath} L ${coordinates[coordinates.length - 1].x.toFixed(2)} ${baseline.toFixed(2)} L ${coordinates[0].x.toFixed(2)} ${baseline.toFixed(2)} Z`
    : '';
  const endingValue = values[values.length - 1] || 0;
  const positive = endingValue >= 0;

  return <div className="border border-white/10 bg-black/20 p-3 sm:p-4">
    <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full overflow-visible" role="img" aria-label="Elo-Formkurve im gewählten Zeitraum">
      <defs>
        <linearGradient id="premium-performance-trend" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={positive ? '#6ee7b7' : '#fda4af'} stopOpacity="0.38" />
          <stop offset="100%" stopColor={positive ? '#6ee7b7' : '#fda4af'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={paddingX} x2={width - paddingX} y1={baseline} y2={baseline} stroke="rgba(255,255,255,0.13)" strokeDasharray="5 6" />
      {areaPath && <path d={areaPath} fill="url(#premium-performance-trend)" />}
      <path d={linePath} fill="none" stroke={positive ? '#9af0bc' : '#fda4af'} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      {coordinates.filter((point) => point.matches > 0).map((point) => <circle key={point.date} cx={point.x} cy={point.y} r="3.5" fill={point.eloDelta >= 0 ? '#9af0bc' : '#fda4af'} stroke="#0d1110" strokeWidth="2" />)}
    </svg>
    <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[.12em] text-zinc-600">
      <span>{formatPerformanceDay(points[0]?.date || '')}</span>
      <span className={positive ? 'text-emerald-200' : 'text-rose-200'}>{formatSignedElo(endingValue)} Elo</span>
      <span>{formatPerformanceDay(points[points.length - 1]?.date || '')}</span>
    </div>
  </div>;
}

export default function Premium() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [premiumStatus, setPremiumStatus] = useState<PremiumSubscriptionData | null>(null);
  const [premiumOverview, setPremiumOverview] = useState<PremiumOverview | null>(null);
  const [offers, setOffers] = useState<PremiumOffer[]>([]);
  const [giftOffers, setGiftOffers] = useState<PremiumGiftOffer[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PremiumPlan>('monthly');
  const [premiumStatusUnavailable, setPremiumStatusUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [redemptionCode, setRedemptionCode] = useState('');
  const [redemptionLoading, setRedemptionLoading] = useState(false);
  const [redemptionMessage, setRedemptionMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [cosmeticSaving, setCosmeticSaving] = useState<PremiumCosmetic | null>(null);
  const [giftCheckoutLoading, setGiftCheckoutLoading] = useState<PremiumGiftOffer['durationDays'] | null>(null);
  const [giftSessionId, setGiftSessionId] = useState<string | null>(null);
  const [giftCodeLoading, setGiftCodeLoading] = useState(false);
  const [giftCode, setGiftCode] = useState<string | null>(null);
  const [giftCodeCopied, setGiftCodeCopied] = useState(false);
  const [giftMessage, setGiftMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [selectedPerformancePeriod, setSelectedPerformancePeriod] = useState<PerformancePeriod>(7);
  const [premiumPerformance, setPremiumPerformance] = useState<PremiumPerformance | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(true);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const performanceRequestRef = useRef(0);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const retrieveGiftCode = useCallback(async (sessionId: string) => {
    setGiftCodeLoading(true);
    setGiftMessage({ kind: 'info', text: 'Dein Geschenkcode wird sicher abgerufen …' });
    try {
      const response = await fetch('/api/premium-gifts/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const payload = await response.json().catch(() => ({})) as { code?: string; durationDays?: number; error?: string };

      if (!response.ok || !payload.code) {
        const isPending = response.status === 202 || response.status === 409;
        setGiftMessage({
          kind: isPending ? 'info' : 'error',
          text: payload.error || (isPending
            ? 'Die Zahlung wird noch bestätigt. Bitte versuche es gleich noch einmal.'
            : 'Dein Geschenkcode konnte nicht geladen werden.'),
        });
        return;
      }

      setGiftCode(payload.code);
      setGiftCodeCopied(false);
      const duration = payload.durationDays === 30 || payload.durationDays === 90 || payload.durationDays === 365
        ? giftDurationLabel(payload.durationDays)
        : 'die ausgewählte Laufzeit';
      setGiftMessage({ kind: 'success', text: `Dein Geschenkcode für ${duration} ist bereit. Teile ihn nur mit der Person, die Premium erhalten soll.` });
    } catch {
      setGiftMessage({ kind: 'error', text: 'Dein Geschenkcode konnte gerade nicht geladen werden. Bitte versuche es gleich noch einmal.' });
    } finally {
      setGiftCodeLoading(false);
    }
  }, []);

  const loadPerformance = useCallback(async (period: PerformancePeriod) => {
    const requestId = performanceRequestRef.current + 1;
    performanceRequestRef.current = requestId;
    setPerformanceLoading(true);
    setPerformanceError(null);

    const { data, error } = await supabase.rpc('get_my_premium_performance', { p_days: period });
    if (performanceRequestRef.current !== requestId) return;

    if (error) {
      setPremiumPerformance(null);
      setPerformanceError('Deine Performance-Auswertung konnte gerade nicht geladen werden. Bitte versuche es erneut.');
      setPerformanceLoading(false);
      return;
    }

    const normalized = normalizePerformance(data);
    if (!normalized) {
      setPremiumPerformance(null);
      setPerformanceError('Die Performance-Auswertung enthält gerade keine lesbaren Daten. Bitte versuche es erneut.');
      setPerformanceLoading(false);
      return;
    }

    setPremiumPerformance(normalized);
    setPerformanceLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const parameters = new URLSearchParams(window.location.search);
      setCheckoutStatus(parameters.get('checkout'));
      if (parameters.get('gift') === 'success' && parameters.get('session_id')) {
        setGiftSessionId(parameters.get('session_id'));
      } else if (parameters.get('gift') === 'cancelled') {
        setGiftMessage({ kind: 'info', text: 'Der Geschenk-Checkout wurde abgebrochen. Es wurde nichts verändert.' });
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!giftSessionId || loading) return;
    // The request changes several loading states. Schedule it after the
    // current render rather than causing a synchronous effect cascade.
    const timer = window.setTimeout(() => {
      void retrieveGiftCode(giftSessionId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [giftSessionId, loading, retrieveGiftCode]);

  useEffect(() => {
    const refreshTime = () => setCurrentTime(new Date());
    refreshTime();

    const timer = window.setInterval(refreshTime, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login');
        return;
      }

      const [profileResult, premiumResult, offersResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('username, elo, gamesPlayed, wins, isPremium')
          .eq('supabaseId', session.user.id)
          .single(),
        fetch('/api/premium-status', { cache: 'no-store' })
          .then(async (response) => {
            if (!response.ok) return { data: null, unavailable: true } satisfies PremiumStatusFetchResult;
            return { data: await response.json() as PremiumStatusResponse, unavailable: false } satisfies PremiumStatusFetchResult;
          })
          .catch(() => ({ data: null, unavailable: true }) satisfies PremiumStatusFetchResult),
        fetch('/api/premium-offers', { cache: 'no-store' })
          .then(async (response) => response.ok ? await response.json() as PremiumOffersResponse : null)
          .catch(() => null),
      ]);

      if (!isMounted) return;

      setProfile((profileResult.data || null) as ProfileData | null);
      setPremiumStatus(premiumResult.data?.premium || null);
      setPremiumOverview(premiumResult.data?.overview || null);
      setOffers(offersResult?.offers || []);
      setGiftOffers(offersResult?.giftOffers || []);
      setPremiumStatusUnavailable(premiumResult.unavailable);
      setLoading(false);
    };

    void getUser();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  useEffect(() => {
    if (loading) return;
    // Keep this scheduled like the other page-side requests: it avoids a
    // synchronous state cascade while the initial Premium profile settles.
    const timer = window.setTimeout(() => {
      void loadPerformance(selectedPerformancePeriod);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loading, loadPerformance, selectedPerformancePeriod]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-6 text-lg font-bold text-emerald-200 backdrop-blur-xl">Premium wird geladen...</div>
      </main>
    );
  }

  const winrate = profile?.gamesPlayed ? Math.round(((profile.wins || 0) / profile.gamesPlayed) * 100) : 0;
  const subscriptionState = getPremiumSubscriptionState(premiumStatus, currentTime);
  const manualPremiumState = getManualPremiumState(premiumStatus, currentTime);
  const hasStripeSubscription = subscriptionState.kind !== 'none';
  const isPremium = Boolean(premiumOverview?.active) || Boolean(premiumStatus?.isPremium) || Boolean(profile?.isPremium) || hasStripeSubscription;
  const monthlyOffer = offers.find((offer) => offer.plan === 'monthly');
  const yearlyOffer = offers.find((offer) => offer.plan === 'yearly');
  const selectedOffer = selectedPlan === 'yearly' ? yearlyOffer : monthlyOffer;
  const selectedOfferPrice = formatPrice(selectedOffer) || (selectedPlan === 'monthly' ? '4,99€' : null);
  const selectedCosmetic = premiumOverview?.premium_cosmetic || 'emerald';
  const premiumSinceLabel = formatPremiumDate(premiumOverview?.premium_since);
  const fixedAccessUntilLabel = formatPremiumDate(premiumOverview?.fixed_access_until);
  const premiumPeriodEnd = subscriptionState.kind === 'renewing' || subscriptionState.kind === 'ending'
    ? subscriptionState.periodEnd
    : null;
  const premiumPeriodEndLabel = premiumPeriodEnd
    ? new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(premiumPeriodEnd))
    : null;
  const premiumTimeRemaining = premiumPeriodEnd
    ? formatPremiumTimeRemaining(premiumPeriodEnd, currentTime)
    : null;
  const cancellationPending = subscriptionState.kind === 'ending';
  const staleStripeStatus = subscriptionState.kind === 'stale';
  const manualPremiumPeriodEnd = manualPremiumState.kind === 'ending' ? manualPremiumState.periodEnd : null;
  const manualPremiumPeriodEndLabel = manualPremiumPeriodEnd
    ? new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(manualPremiumPeriodEnd))
    : null;
  const manualPremiumTimeRemaining = manualPremiumPeriodEnd
    ? formatPremiumTimeRemaining(manualPremiumPeriodEnd, currentTime)
    : null;
  const manualPremiumExtendsPastStripe = Boolean(cancellationPending && premiumPeriodEnd && (
    manualPremiumState.kind === 'unlimited'
    || (manualPremiumState.kind === 'ending' && new Date(manualPremiumState.periodEnd).getTime() > new Date(premiumPeriodEnd).getTime())
  ));
  const cancellationMessage = manualPremiumExtendsPastStripe && manualPremiumState.kind === 'unlimited'
    ? 'Danach endet dein Stripe-Abo. Dein manuell gewährter Premium-Zugang bleibt ohne Enddatum aktiv.'
    : manualPremiumExtendsPastStripe && manualPremiumState.kind === 'ending' && manualPremiumPeriodEndLabel
      ? `Danach endet dein Stripe-Abo. Dein manuell gewährter Premium-Zugang bleibt bis ${manualPremiumPeriodEndLabel} aktiv.`
      : `Danach endet dein Premium-Zugang${premiumTimeRemaining ? ` · ${premiumTimeRemaining}` : ''}.`;
  const manualPremiumDescription = manualPremiumState.kind === 'unlimited'
    ? 'Dein Premium-Zugang wurde manuell und ohne Enddatum gewährt.'
    : manualPremiumState.kind === 'ending' && manualPremiumPeriodEndLabel
      ? `Dein manuell gewährter Premium-Zugang läuft ${manualPremiumTimeRemaining || 'noch'} und endet am ${manualPremiumPeriodEndLabel}.`
      : 'Dein Profil ist bereits als Premium markiert.';
  const performanceSummary = premiumPerformance?.summary ?? null;
  const previousPerformanceSummary = premiumPerformance?.previousSummary ?? null;
  const performanceDetailsUnlocked = premiumPerformance?.fullAccess === true;
  const canChooseFullPerformanceRange = isPremium || performanceDetailsUnlocked;
  const performancePeriodLabel = `${premiumPerformance?.periodDays ?? selectedPerformancePeriod} Tage`;
  const performancePeriodDescription = `${premiumPerformance?.periodDays ?? selectedPerformancePeriod} Tagen`;
  const averageDelta = performanceSummary?.average !== null && performanceSummary?.average !== undefined && previousPerformanceSummary?.average !== null && previousPerformanceSummary?.average !== undefined
    ? performanceSummary.average - previousPerformanceSummary.average
    : null;
  const platformPerformance = performancePlatforms.map((platform) => ({
    ...platform,
    stats: premiumPerformance?.platforms.find((stat) => stat.platform === platform.platform) ?? {
      platform: platform.platform,
      matches: 0,
      wins: 0,
      winRate: null,
      average: null,
      eloDelta: 0,
      oneEighties: 0,
    },
  }));
  const startCheckout = async () => {
    setCheckoutLoading(true);
    setCheckoutError(null);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan }),
      });
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

  const startGiftCheckout = async (duration: PremiumGiftOffer['durationDays']) => {
    setGiftCheckoutLoading(duration);
    setGiftCode(null);
    setGiftCodeCopied(false);
    setGiftMessage(null);

    try {
      const response = await fetch('/api/premium-gifts/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration }),
      });
      const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || 'Der Geschenk-Checkout konnte nicht gestartet werden.');
      }
      window.location.assign(payload.url);
    } catch (error) {
      setGiftMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Der Geschenk-Checkout konnte nicht gestartet werden.' });
      setGiftCheckoutLoading(null);
    }
  };

  const copyGiftCode = async () => {
    if (!giftCode) return;
    try {
      await navigator.clipboard.writeText(giftCode);
      setGiftCodeCopied(true);
    } catch {
      setGiftMessage({ kind: 'error', text: 'Der Code konnte nicht automatisch kopiert werden. Bitte kopiere ihn manuell.' });
    }
  };

  const refreshPremiumStatus = async () => {
    const response = await fetch('/api/premium-status', { cache: 'no-store' });
    if (!response.ok) throw new Error('Dein Premium-Status konnte nicht aktualisiert werden.');
    const payload = await response.json() as PremiumStatusResponse;
    setPremiumStatus(payload.premium || null);
    setPremiumOverview(payload.overview || null);
    setProfile((current) => current ? { ...current, isPremium: Boolean(payload.premium?.isPremium) } : current);
  };

  const redeemCode = async () => {
    const code = redemptionCode.trim();
    if (!code) {
      setRedemptionMessage({ kind: 'error', text: 'Gib zuerst deinen Premium-Code ein.' });
      return;
    }

    setRedemptionLoading(true);
    setRedemptionMessage(null);
    const { data, error } = await supabase.rpc('redeem_premium_code', { p_code: code });
    setRedemptionLoading(false);

    if (error) {
      setRedemptionMessage({ kind: 'error', text: error.message });
      return;
    }

    const redeemed = data as { starts_at?: string; ends_at?: string } | null;
    const startsAt = typeof redeemed?.starts_at === 'string' ? new Date(redeemed.starts_at) : null;
    const startsLater = Boolean(startsAt && !Number.isNaN(startsAt.getTime()) && startsAt.getTime() > Date.now() + 1_000);
    const startsAtLabel = startsAt && !Number.isNaN(startsAt.getTime()) ? formatPremiumDate(startsAt.toISOString()) : null;
    const endsAt = typeof redeemed?.ends_at === 'string' ? formatPremiumDate(redeemed.ends_at) : null;
    setRedemptionCode('');
    setRedemptionMessage({
      kind: 'success',
      text: startsLater && startsAtLabel
        ? `Premium-Zeit sicher vorgemerkt – sie startet am ${startsAtLabel}${endsAt ? ` und läuft bis ${endsAt}.` : '.'}`
        : endsAt ? `Premium freigeschaltet – dein Zugang läuft bis ${endsAt}.` : 'Premium-Code erfolgreich eingelöst.',
    });
    try {
      await refreshPremiumStatus();
      await loadPerformance(selectedPerformancePeriod);
    } catch (refreshError) {
      console.warn('Premium-Status nach Code-Einlösung konnte nicht aktualisiert werden:', refreshError);
    }
  };

  const setCosmetic = async (cosmetic: PremiumCosmetic) => {
    if (!isPremium || cosmetic === selectedCosmetic) return;
    setCosmeticSaving(cosmetic);
    const { error } = await supabase.rpc('set_my_premium_cosmetic', { p_cosmetic: cosmetic });
    setCosmeticSaving(null);
    if (error) {
      setRedemptionMessage({ kind: 'error', text: error.message });
      return;
    }
    setPremiumOverview((current) => ({ ...(current || {}), premium_cosmetic: cosmetic }));
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
    <main className="sport-grid min-h-screen overflow-hidden bg-[#0a0d0d] text-white">
      <nav className="relative z-10 border-b border-white/10 bg-[#0a0d0d]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo className="h-11 w-11" />
            <div>
              <div className="text-xl font-black tracking-[-0.04em] md:text-2xl">RANKEDDARTS</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Premium</div>
            </div>
          </Link>

          <Link href="/" className="border border-white/15 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10">Zur Startseite</Link>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-20">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-3 border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-100">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" /></span>
              Premium Arena · Season 01 · bis 01.11.2026
            </div>
            <h1 className="mt-6 max-w-4xl text-6xl font-black leading-[0.84] tracking-[-0.08em] md:text-8xl xl:text-[6.8rem]">MEHR SPIELE.<br /><span className="text-emerald-300">MEHR SEASON.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-300">Premium ist für Spieler, die nicht auf die nächste Chance warten wollen. Spiele ohne Tageslimit, tritt in Premium-Turnieren an und mach aus jeder Session echten Fortschritt.</p>

            <div className="mt-8 flex flex-wrap gap-3 text-xs font-bold text-zinc-300">
              <span className="inline-flex items-center gap-2 border border-white/10 bg-black/25 px-3.5 py-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Sicherer Stripe-Checkout</span>
              <span className="inline-flex items-center gap-2 border border-white/10 bg-black/25 px-3.5 py-2"><Zap className="h-3.5 w-3.5 text-lime-200" /> Jederzeit verwaltbar</span>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="group border border-white/10 bg-[#0d1110] p-5 transition hover:border-emerald-300/25 hover:bg-emerald-400/[0.05]">
                <div className="text-4xl font-black tracking-[-0.05em]">{profile?.elo || 1000}</div>
                <div className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-300"><Gauge className="h-4 w-4" /> Dein Elo</div>
              </div>
              <div className="group border border-white/10 bg-[#0d1110] p-5 transition hover:border-emerald-300/25 hover:bg-emerald-400/[0.05]">
                <div className="text-4xl font-black tracking-[-0.05em]">{profile?.gamesPlayed || 0}</div>
                <div className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-300"><Swords className="h-4 w-4" /> Spiele</div>
              </div>
              <div className="group border border-white/10 bg-[#0d1110] p-5 transition hover:border-emerald-300/25 hover:bg-emerald-400/[0.05]">
                <div className="text-4xl font-black tracking-[-0.05em]">{winrate}%</div>
                <div className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-300"><Trophy className="h-4 w-4" /> Winrate</div>
              </div>
            </div>
          </div>

          <aside className="relative overflow-hidden border border-emerald-300/30 border-t-2 border-t-emerald-300 bg-[#0d1110] p-6 md:p-8">

            <div className="relative z-10">
              <div className="flex items-center justify-between gap-4">
                <div className="grid h-16 w-16 place-items-center border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
                  <Crown className="h-8 w-8" />
                </div>
                <span className="border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100">{selectedPlan === 'yearly' ? 'Jahresabo' : 'Monatsabo'}</span>
              </div>

              <div className="mt-8">
                <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.3em] text-emerald-300"><Star className="h-4 w-4 fill-current" /> RankedDarts Premium</div>
                <div className="mt-3 flex items-end gap-3">
                  <span className="text-7xl font-black tracking-[-0.08em]">{selectedOfferPrice || '—'}</span>
                  <span className="pb-3 text-zinc-400">/ {selectedPlan === 'yearly' ? 'Jahr' : 'Monat'}</span>
                </div>
                <p className="mt-4 max-w-sm text-zinc-300">Dein Zugang zu mehr Ranked-Matches, exklusiven Turnieren und einer sichtbaren Premium-Identität.</p>
              </div>

              {!isPremium && !hasStripeSubscription && yearlyOffer?.available && (
                <div className="mt-6 grid grid-cols-2 gap-2 border border-white/10 bg-black/20 p-2">
                  <button type="button" onClick={() => setSelectedPlan('monthly')} className={`border px-3 py-3 text-left transition ${selectedPlan === 'monthly' ? 'border-emerald-300 bg-emerald-300/15 text-emerald-100' : 'border-white/10 text-zinc-400 hover:border-white/25'}`}><span className="block text-[10px] font-black uppercase tracking-[.16em]">Monatlich</span><span className="mt-1 block text-sm font-bold">{formatPrice(monthlyOffer) || '4,99€'} / Monat</span></button>
                  <button type="button" onClick={() => setSelectedPlan('yearly')} className={`border px-3 py-3 text-left transition ${selectedPlan === 'yearly' ? 'border-emerald-300 bg-emerald-300/15 text-emerald-100' : 'border-white/10 text-zinc-400 hover:border-white/25'}`}><span className="block text-[10px] font-black uppercase tracking-[.16em]">Jährlich</span><span className="mt-1 block text-sm font-bold">{formatPrice(yearlyOffer)} / Jahr</span></button>
                </div>
              )}

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="border border-white/10 bg-black/25 p-3.5"><span className="block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Matches</span><span className="mt-1 block text-lg font-black text-emerald-200">Ohne Limit</span></div>
                <div className="border border-white/10 bg-black/25 p-3.5"><span className="block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Abrechnung</span><span className="mt-1 block text-lg font-black text-emerald-200">{selectedPlan === 'yearly' ? 'Jährlich' : 'Monatlich'}</span></div>
              </div>

              {hasStripeSubscription && (
                <div className={`mt-5 border p-4 ${cancellationPending ? 'border-amber-300/30 bg-amber-300/[0.07]' : 'border-emerald-300/20 bg-emerald-400/[0.06]'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center border ${cancellationPending ? 'border-amber-300/25 bg-amber-300/10 text-amber-100' : 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'}`}>
                      <CalendarClock className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${cancellationPending ? 'text-amber-100' : 'text-emerald-200'}`}>{cancellationPending ? 'Kündigung vorgemerkt' : staleStripeStatus ? 'Abo-Status wird aktualisiert' : 'Premium aktiv'}</p>
                      </div>
                      {premiumPeriodEnd && premiumPeriodEndLabel ? (
                        <>
                          <p className="mt-2 text-sm font-bold text-zinc-200">{cancellationPending ? manualPremiumExtendsPastStripe ? 'Stripe-Abo aktiv bis' : 'Premium aktiv bis' : 'Nächste Verlängerung'}</p>
                          <time dateTime={premiumPeriodEnd} className="mt-1 block text-xl font-black tracking-[-0.03em] text-white">{premiumPeriodEndLabel}</time>
                          <p className="mt-2 text-xs leading-5 text-zinc-300">
                            {cancellationPending
                              ? cancellationMessage
                              : <>{premiumTimeRemaining ? `${premiumTimeRemaining} im aktuellen Zeitraum. ` : ''}Verlängert sich automatisch.</>}
                          </p>
                        </>
                      ) : staleStripeStatus ? (
                        <p className="mt-2 text-sm leading-6 text-zinc-300">Der gespeicherte Verlängerungstermin ist bereits abgelaufen. Wir aktualisieren gerade deinen Stripe-Status.</p>
                      ) : (
                        <p className="mt-2 text-sm leading-6 text-zinc-300">Dein Abo ist aktiv. Die Abrechnungsdaten werden gerade aktualisiert.</p>
                      )}
                      {manualPremiumState.kind === 'ending' && manualPremiumPeriodEnd && manualPremiumPeriodEndLabel ? (
                        <div className="mt-3 border-t border-white/10 pt-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Zusätzliche manuelle Freigabe</p>
                          <p className="mt-1 text-xs leading-5 text-zinc-300">Bis <time dateTime={manualPremiumPeriodEnd}>{manualPremiumPeriodEndLabel}</time>{manualPremiumTimeRemaining ? ` · ${manualPremiumTimeRemaining}` : ''}</p>
                        </div>
                      ) : manualPremiumState.kind === 'unlimited' ? (
                        <div className="mt-3 border-t border-white/10 pt-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Zusätzliche manuelle Freigabe</p>
                          <p className="mt-1 text-xs leading-5 text-zinc-300">Ohne Enddatum aktiv.</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {isPremium && fixedAccessUntilLabel && (
                <div className="mt-5 border border-violet-300/25 bg-violet-400/[0.07] p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center border border-violet-300/25 bg-violet-400/10 text-violet-100"><Sparkles className="h-5 w-5" /></div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-100">Geschenk- oder Aktionszeit</p>
                      <p className="mt-2 text-sm font-bold text-zinc-100">Vormerkung bis {fixedAccessUntilLabel}</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-400">Eingelöste Premium-Zeit wird sicher gespeichert und an bestehende feste Freigaben angehängt.</p>
                    </div>
                  </div>
                </div>
              )}

              {isPremium && premiumStatusUnavailable && (
                <div className="mt-5 border border-amber-300/25 bg-amber-300/[0.07] p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center border border-amber-300/25 bg-amber-300/10 text-amber-100">
                      <CalendarClock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">Abrechnungsdaten nicht verfügbar</p>
                      <p className="mt-2 text-sm leading-6 text-zinc-300">Dein Premium-Status ist gespeichert. Die genaue Laufzeit konnte gerade nicht geladen werden – bitte lade die Seite gleich noch einmal.</p>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={hasStripeSubscription ? openBillingPortal : startCheckout}
                disabled={hasStripeSubscription ? portalLoading : checkoutLoading || isPremium}
                className="group mt-7 w-full border border-emerald-200 bg-emerald-300 px-8 py-5 font-black uppercase tracking-[0.18em] text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.06] disabled:text-zinc-500"
              >
                {hasStripeSubscription
                  ? portalLoading ? 'Portal wird geöffnet...' : <span>Premium verwalten <ArrowUpRight className="ml-2 inline-block h-4 w-4 transition group-hover:-translate-y-1 group-hover:translate-x-1" /></span>
                  : isPremium ? 'Premium ist aktiv' : checkoutLoading ? 'Checkout wird geöffnet...' : <span>Premium freischalten <ArrowUpRight className="ml-2 inline-block h-4 w-4 transition group-hover:-translate-y-1 group-hover:translate-x-1" /></span>}
              </button>

              {checkoutError && <p className="mt-4 text-center text-sm font-semibold text-rose-300">{checkoutError}</p>}
              {portalError && <p className="mt-4 text-center text-sm font-semibold text-rose-300">{portalError}</p>}
              {checkoutStatus === 'success' && <p className="mt-4 text-center text-sm font-semibold text-emerald-200">Danke! Deine Zahlung wird bestätigt. Aktualisiere die Seite in wenigen Sekunden, falls der Status noch nicht erscheint.</p>}
              {checkoutStatus === 'cancelled' && <p className="mt-4 text-center text-sm text-zinc-400">Der Checkout wurde abgebrochen. Dein Account bleibt unverändert.</p>}
              <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-zinc-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Sichere Zahlung über Stripe · {selectedPlan === 'yearly' ? 'jährlich' : 'monatlich'} abrechenbar</p>
              <Link href="/premium/kuendigung" className="mt-3 block text-center text-xs font-bold text-emerald-200 underline decoration-emerald-300/40 underline-offset-4 transition hover:text-emerald-100">Informationen zu Laufzeit &amp; Kündigung</Link>
            </div>
          </aside>
        </div>

        <section className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {premiumBenefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <article key={benefit.title} className="group relative overflow-hidden border border-white/10 bg-[#0d1110] p-6 transition hover:border-emerald-300/30 hover:bg-emerald-400/[0.05]">
                <div className="absolute right-5 top-5 text-[11px] font-black tracking-[0.18em] text-white/10">0{index + 1}</div>
                <div className="grid h-14 w-14 place-items-center border border-emerald-300/20 bg-emerald-400/10 text-emerald-200 transition group-hover:bg-emerald-400/20">
                  <Icon className="h-6 w-6" />
                </div>
                <h2 className="mt-5 text-xl font-black tracking-[-0.03em]">{benefit.title}</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{benefit.description}</p>
              </article>
            );
          })}
        </section>

        <section className="mt-10 overflow-hidden border border-emerald-300/25 border-t-2 border-t-emerald-300 bg-[linear-gradient(135deg,rgba(16,185,129,.10),transparent_42%),#0d1110]">
          <div className="flex flex-col gap-6 border-b border-white/10 p-6 md:p-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[.2em] text-emerald-200"><Gauge className="h-4 w-4" /> Performance-Labor</div>
              <h2 className="mt-3 text-3xl font-black tracking-[-.05em] sm:text-4xl">Deine Form. Nicht nur dein Gefühl.</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">Elo-Entwicklung, Average, Checkouts und 180er werden direkt aus deinen bestätigten Ranked-Matches berechnet.</p>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Zeitraum für die Performance-Auswertung">
              {performancePeriods.map((period) => {
                const locked = period !== 7 && !canChooseFullPerformanceRange;
                const active = selectedPerformancePeriod === period;
                return <button
                  key={period}
                  type="button"
                  aria-pressed={active}
                  disabled={locked || performanceLoading}
                  onClick={() => setSelectedPerformancePeriod(period)}
                  title={locked ? 'Mit Premium stehen dir 30 und 90 Tage zur Verfügung.' : undefined}
                  className={`inline-flex items-center gap-2 border px-4 py-2.5 text-xs font-black transition ${active ? 'border-emerald-200 bg-emerald-300 text-black' : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/30 hover:text-zinc-100'} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {period} Tage
                  {locked && <Crown className="h-3.5 w-3.5" />}
                </button>;
              })}
            </div>
          </div>

          <div className="p-5 sm:p-6 md:p-8">
            {performanceLoading ? (
              <div className="animate-pulse">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[0, 1, 2, 3].map((index) => <div key={index} className="h-32 border border-white/10 bg-white/[0.035]" />)}
                </div>
                <div className="mt-5 h-60 border border-white/10 bg-white/[0.025]" />
              </div>
            ) : performanceError ? (
              <div className="flex flex-col gap-4 border border-rose-300/25 bg-rose-400/[.07] p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-rose-100">{performanceError}</p>
                <button type="button" onClick={() => void loadPerformance(selectedPerformancePeriod)} className="w-fit shrink-0 border border-rose-200/40 px-4 py-2.5 text-xs font-black uppercase tracking-[.12em] text-rose-100 transition hover:bg-rose-300/10">Erneut laden</button>
              </div>
            ) : !performanceSummary ? (
              <div className="border border-white/10 bg-black/20 p-5 text-sm text-zinc-400">Deine Performance-Auswertung wird vorbereitet.</div>
            ) : <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">{performancePeriodLabel} · nur bestätigte Ranked-Matches</p>
                <span className={`border px-3 py-1.5 text-[10px] font-black uppercase tracking-[.14em] ${performanceDetailsUnlocked ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/25 bg-amber-300/[.08] text-amber-100'}`}>{performanceDetailsUnlocked ? 'Vollständiger Bericht' : '7 Tage Vorschau'}</span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <PerformanceMetric
                  label="Elo-Bilanz"
                  value={formatSignedElo(performanceSummary.eloDelta)}
                  detail={previousPerformanceSummary ? `Vorperiode: ${formatSignedElo(previousPerformanceSummary.eloDelta)} Elo` : 'Noch keine Vergleichsphase'}
                  tone={performanceSummary.eloDelta > 0 ? 'text-emerald-200' : performanceSummary.eloDelta < 0 ? 'text-rose-200' : 'text-white'}
                />
                <PerformanceMetric label="Ranked Matches" value={formatPerformanceNumber(performanceSummary.matches)} detail={`${performanceSummary.wins} Siege · ${performanceSummary.losses} Niederlagen`} tone="text-emerald-100" />
                <PerformanceMetric
                  label="Siegquote"
                  value={formatPerformancePercent(performanceSummary.winRate)}
                  detail={previousPerformanceSummary?.winRate !== null && previousPerformanceSummary?.winRate !== undefined ? `Vorperiode: ${formatPerformancePercent(previousPerformanceSummary.winRate)}` : 'Noch keine Vergleichsphase'}
                  tone="text-cyan-100"
                />
                <PerformanceMetric
                  label="Ø Average"
                  value={formatPerformanceNumber(performanceSummary.average, 1)}
                  detail={performanceSummary.average === null ? 'Noch keine Average-Daten' : averageDelta === null ? `${performanceSummary.averageMatches} erfasste Matches` : `zur Vorperiode: ${averageDelta > 0 ? '+' : ''}${formatPerformanceNumber(averageDelta, 1)}`}
                  tone="text-violet-100"
                />
                {performanceDetailsUnlocked && <>
                  <PerformanceMetric label="Höchster Checkout" value={formatPerformanceNumber(performanceSummary.highestCheckout)} detail={performanceSummary.highestCheckout === null ? 'Noch nicht erfasst' : 'Im gewählten Zeitraum'} tone="text-amber-100" />
                  <PerformanceMetric label="180er" value={formatPerformanceNumber(performanceSummary.oneEighties)} detail="Im gewählten Zeitraum" tone="text-emerald-100" />
                </>}
              </div>

              {performanceSummary.matches === 0 && <p className="mt-5 border border-dashed border-white/15 bg-black/20 px-5 py-4 text-sm leading-6 text-zinc-400">Noch keine bestätigten Ranked-Matches in den letzten {performancePeriodDescription}. Dein Bericht füllt sich automatisch, sobald ein Match abgeschlossen ist.</p>}

              {performanceDetailsUnlocked && premiumPerformance ? <>
                <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
                  <article className="border border-white/10 bg-black/20 p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-200">Formkurve</p>
                        <h3 className="mt-1 text-xl font-black tracking-[-.035em]">Elo-Verlauf im Zeitraum</h3>
                      </div>
                      <span className="border border-white/10 bg-white/[.035] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.12em] text-zinc-400">Rollierend</span>
                    </div>
                    <div className="mt-5"><PerformanceTrend points={premiumPerformance.form} /></div>
                  </article>

                  <article className="border border-amber-300/20 bg-[linear-gradient(135deg,rgba(251,191,36,.08),transparent_62%),rgba(0,0,0,.2)] p-5 sm:p-6">
                    <p className="text-[10px] font-black uppercase tracking-[.16em] text-amber-200">Persönliche Bestwerte</p>
                    <h3 className="mt-1 text-xl font-black tracking-[-.035em]">All Time</h3>
                    <div className="mt-5 space-y-3">
                      <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3"><span className="text-sm text-zinc-400">Bester Average</span><strong className="text-lg font-black text-amber-100">{formatPerformanceNumber(premiumPerformance.personalBests?.bestAverage ?? null, 1)}</strong></div>
                      <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3"><span className="text-sm text-zinc-400">Höchster Checkout</span><strong className="text-lg font-black text-amber-100">{formatPerformanceNumber(premiumPerformance.personalBests?.highestCheckout ?? null)}</strong></div>
                      <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3"><span className="text-sm text-zinc-400">180er in einem Match</span><strong className="text-lg font-black text-amber-100">{formatPerformanceNumber(premiumPerformance.personalBests?.most180sInMatch ?? null)}</strong></div>
                      <div className="flex items-center justify-between gap-4"><span className="text-sm text-zinc-400">Bester Elo-Gewinn</span><strong className="text-lg font-black text-amber-100">{premiumPerformance.personalBests?.bestEloGain === null || premiumPerformance.personalBests?.bestEloGain === undefined ? '—' : formatSignedElo(premiumPerformance.personalBests.bestEloGain)}</strong></div>
                    </div>
                  </article>
                </div>

                <article className="mt-5 border border-white/10 bg-black/20 p-5 sm:p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-200">Plattformvergleich</p>
                      <h3 className="mt-1 text-xl font-black tracking-[-.035em]">Wo deine Form am stärksten ist</h3>
                    </div>
                    <p className="text-xs text-zinc-500">Siegquote · Average · Elo</p>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {platformPerformance.map(({ platform, label, className, stats }) => <article key={platform} className={`border p-4 ${className}`}>
                      <div className="flex items-center justify-between gap-3"><strong className="text-sm font-black">{label}</strong><span className="text-[10px] font-black uppercase tracking-[.12em] opacity-70">{stats.matches} Spiele</span></div>
                      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-center">
                        <div><span className="block text-[9px] font-black uppercase tracking-[.1em] opacity-60">Quote</span><strong className="mt-1 block text-sm font-black">{formatPerformancePercent(stats.winRate)}</strong></div>
                        <div className="border-x border-white/10"><span className="block text-[9px] font-black uppercase tracking-[.1em] opacity-60">Ø Avg.</span><strong className="mt-1 block text-sm font-black">{formatPerformanceNumber(stats.average, 1)}</strong></div>
                        <div><span className="block text-[9px] font-black uppercase tracking-[.1em] opacity-60">Elo</span><strong className="mt-1 block text-sm font-black">{formatSignedElo(stats.eloDelta)}</strong></div>
                      </div>
                    </article>)}
                  </div>
                  {premiumPerformance.unassignedMatches > 0 && <p className="mt-4 border border-amber-300/20 bg-amber-300/[.06] px-4 py-3 text-xs leading-5 text-amber-100">{premiumPerformance.unassignedMatches} {premiumPerformance.unassignedMatches === 1 ? 'Match ist' : 'Matches sind'} in diesem Zeitraum keiner Plattform sicher zugeordnet. Sie zählen in deine Gesamtwerte, aber nicht in den Vergleich.</p>}
                </article>
              </> : <div className="relative mt-6 overflow-hidden border border-amber-300/25 bg-[linear-gradient(135deg,rgba(251,191,36,.11),transparent_58%),rgba(0,0,0,.22)] p-5 sm:p-6">
                <div className="absolute -right-5 -top-7 text-[7rem] font-black leading-none text-amber-200/[.06]">+</div>
                <div className="relative max-w-2xl">
                  <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-amber-200"><Crown className="h-4 w-4" /> Vollständiger Bericht</p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-.04em]">Erkenne Muster statt nur Ergebnisse.</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-300">Mit Premium schaltest du 30- und 90-Tage-Ansichten, deine Elo-Formkurve, Plattformvergleich und persönliche Bestwerte frei.</p>
                  {isPremium ? <p className="mt-5 text-xs font-bold text-amber-100">Dein Premium-Zugang wird gerade mit dem Performance-Labor abgeglichen. Lade die Auswertung gleich noch einmal.</p> : <button type="button" onClick={startCheckout} disabled={checkoutLoading} className="group mt-5 border border-amber-200 bg-amber-300 px-5 py-3 text-xs font-black uppercase tracking-[.14em] text-black transition hover:bg-amber-200 disabled:opacity-60">{checkoutLoading ? 'Checkout wird geöffnet …' : <span>Performance freischalten <ArrowUpRight className="ml-1.5 inline-block h-3.5 w-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>}</button>}
                </div>
              </div>}
            </>}
          </div>
        </section>

        {giftOffers.some((offer) => offer.available) && (
          <section className="mt-10 overflow-hidden border border-amber-300/25 bg-[linear-gradient(135deg,rgba(251,191,36,.12),transparent_52%),#0d1110] p-6 md:p-8">
            <div className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-amber-200"><Crown className="h-4 w-4" /> Geschenk-Arena</p>
                <h2 className="mt-2 text-3xl font-black tracking-[-.045em]">Premium verschenken</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Schenke einer Person Premium-Zeit. Nach der Zahlung erhältst du einen persönlichen Code zum Weitergeben – ohne Abo und ohne automatische Verlängerung.</p>
              </div>
              <span className="w-fit border border-amber-300/25 bg-amber-300/[.08] px-3 py-2 text-[10px] font-black uppercase tracking-[.14em] text-amber-100">Einmalzahlung</span>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {giftOffers.filter((offer) => offer.available).map((offer) => (
                <article key={offer.durationDays} className="flex flex-col border border-white/10 bg-black/25 p-5 transition hover:border-amber-300/35 hover:bg-amber-300/[.05]">
                  <span className="text-[10px] font-black uppercase tracking-[.16em] text-amber-200">Premium-Geschenk</span>
                  <strong className="mt-3 text-3xl font-black tracking-[-.05em] text-white">{giftDurationLabel(offer.durationDays)}</strong>
                  <span className="mt-2 text-sm font-bold text-zinc-400">{formatPrice(offer)} · einmalig</span>
                  <p className="mt-4 text-xs leading-5 text-zinc-500">Der Code wird erst nach bestätigter Zahlung erzeugt und kann von einer Person eingelöst werden.</p>
                  <button type="button" onClick={() => void startGiftCheckout(offer.durationDays)} disabled={giftCheckoutLoading !== null} className="mt-6 border border-amber-200 bg-amber-300 px-4 py-3 text-xs font-black uppercase tracking-[.12em] text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                    {giftCheckoutLoading === offer.durationDays ? 'Checkout wird geöffnet …' : 'Verschenken'}
                  </button>
                </article>
              ))}
            </div>

            {giftMessage && (
              <div className={`mt-5 border px-4 py-3 text-sm font-semibold ${giftMessage.kind === 'success' ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : giftMessage.kind === 'error' ? 'border-rose-300/25 bg-rose-400/10 text-rose-100' : 'border-amber-300/25 bg-amber-300/[.08] text-amber-100'}`}>{giftMessage.text}</div>
            )}
            {giftCode && (
              <div className="mt-4 flex flex-col gap-3 border border-emerald-300/30 bg-emerald-400/[.09] p-4 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all border border-emerald-300/20 bg-black/30 px-4 py-3 font-mono text-sm font-black tracking-[.12em] text-emerald-100">{giftCode}</code>
                <button type="button" onClick={() => void copyGiftCode()} className="shrink-0 border border-emerald-200 bg-emerald-300 px-4 py-3 text-xs font-black uppercase tracking-[.1em] text-black transition hover:bg-emerald-200">{giftCodeCopied ? 'Kopiert' : 'Code kopieren'}</button>
              </div>
            )}
            {!giftCode && giftSessionId && (
              <button type="button" onClick={() => void retrieveGiftCode(giftSessionId)} disabled={giftCodeLoading} className="mt-4 text-xs font-black text-amber-100 underline decoration-amber-300/40 underline-offset-4 transition hover:text-amber-50 disabled:opacity-60">{giftCodeLoading ? 'Code wird geprüft …' : 'Geschenkcode erneut prüfen'}</button>
            )}
          </section>
        )}

        <section className="mt-10 grid gap-5 lg:grid-cols-[0.88fr_1.12fr]">
          <article className="border border-violet-300/20 bg-[#0d1110] p-6 md:p-7">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center border border-violet-300/25 bg-violet-400/10 text-violet-100"><Sparkles className="h-6 w-6" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-violet-200">Code Center</p>
                <h2 className="mt-1 text-2xl font-black tracking-[-.04em]">Premium-Code einlösen</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Für Geschenke, Discord-Aktionen und zeitlich begrenzte Community-Kampagnen.</p>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <input value={redemptionCode} onChange={(event) => setRedemptionCode(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === 'Enter') void redeemCode(); }} placeholder="RD-XXXXX-XXXXX-XXXXX" autoComplete="off" className="min-w-0 flex-1 border border-white/10 bg-black/25 px-4 py-3 text-sm font-black uppercase tracking-[.12em] text-white outline-none placeholder:text-zinc-600 focus:border-violet-300/60" />
              <button type="button" onClick={() => void redeemCode()} disabled={redemptionLoading} className="border border-violet-200 bg-violet-300 px-5 py-3 text-xs font-black uppercase tracking-[.12em] text-black transition hover:bg-violet-200 disabled:opacity-60">{redemptionLoading ? 'Prüft …' : 'Einlösen'}</button>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-500">Ein Code kann pro Account nur einmal verwendet werden. Bei einem laufenden Stripe-Abo wird die Einlösung bewusst gesperrt, damit keine bezahlte Laufzeit verloren geht.</p>
            {redemptionMessage && <p className={`mt-4 border px-3 py-3 text-sm font-semibold ${redemptionMessage.kind === 'success' ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-rose-300/25 bg-rose-400/10 text-rose-100'}`}>{redemptionMessage.text}</p>}
          </article>

          <article className={`border p-6 md:p-7 ${isPremium ? 'border-emerald-300/25 bg-[linear-gradient(135deg,rgba(16,185,129,.12),transparent_55%),#0d1110]' : 'border-white/10 bg-[#0d1110]'}`}>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-300">Member Center</p>
                <h2 className="mt-1 text-2xl font-black tracking-[-.04em]">{isPremium ? 'Dein Premium-Profil' : 'Deine Premium-Vorteile'}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{isPremium ? (premiumSinceLabel ? `Premium seit ${premiumSinceLabel}.` : 'Dein Premium-Zugang ist aktiv.') : 'Aktiviere Premium oder löse einen Code ein, um deine persönliche Identität freizuschalten.'}</p>
              </div>
              <span className={`w-fit border px-3 py-2 text-[10px] font-black uppercase tracking-[.16em] ${isPremium ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/[.04] text-zinc-500'}`}>{isPremium ? 'Aktiv' : 'Free'}</span>
            </div>

            {isPremium ? <>
              <div className="mt-6 grid grid-cols-3 gap-2 border border-white/10 bg-black/20 p-2">
                <div className="p-3"><span className="block text-[9px] font-black uppercase tracking-[.12em] text-zinc-500">Premium Cups</span><strong className="mt-2 block text-2xl font-black text-emerald-100">{premiumOverview?.premium_tournaments || 0}</strong></div>
                <div className="border-x border-white/10 p-3"><span className="block text-[9px] font-black uppercase tracking-[.12em] text-zinc-500">Ranked seitdem</span><strong className="mt-2 block text-2xl font-black text-emerald-100">{premiumOverview?.ranked_matches_since || 0}</strong></div>
                <div className="p-3"><span className="block text-[9px] font-black uppercase tracking-[.12em] text-zinc-500">Codes</span><strong className="mt-2 block text-2xl font-black text-emerald-100">{premiumOverview?.code_redemptions || 0}</strong></div>
              </div>
              <div className="mt-6"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[.16em] text-zinc-500">Premium-Auszeichnung</p><span className="text-xs text-zinc-500">Sichtbar im Profil &amp; Leaderboard</span></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{premiumCosmetics.map((cosmetic) => <button key={cosmetic.value} type="button" onClick={() => void setCosmetic(cosmetic.value)} disabled={cosmeticSaving !== null} className={`border px-3 py-3 text-left text-xs font-black transition ${selectedCosmetic === cosmetic.value ? cosmetic.className : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/30'} disabled:opacity-60`}><span className="block text-[9px] uppercase tracking-[.12em] opacity-70">Design</span><span className="mt-1 block">{cosmeticSaving === cosmetic.value ? 'Speichert …' : cosmetic.label}</span></button>)}</div></div>
            </> : <div className="mt-6 border border-dashed border-white/15 bg-black/20 p-5 text-sm leading-6 text-zinc-400">Mit Premium erhältst du eine sichtbare Auszeichnung, wählst dein Farbschema und siehst deinen persönlichen Premium-Run an einem Ort.</div>}
          </article>
        </section>

        <section className="mt-10 grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="border border-white/10 bg-[#0d1110] p-7 md:p-8">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div>
                <div className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Status</div>
                <h2 className="mt-1 text-3xl font-black tracking-[-0.04em]">{isPremium ? 'Premium aktiv' : 'Free Account'}</h2>
              </div>
            </div>
            <p className="mt-6 text-lg leading-8 text-zinc-300">
              {hasStripeSubscription
                ? subscriptionState.kind === 'syncing'
                  ? manualPremiumState.kind === 'ending' && manualPremiumPeriodEndLabel
                    ? `Dein Stripe-Abo ist aktiv. Die Abrechnungsdaten werden gerade aktualisiert. Zusätzlich ist dein Zugang manuell bis ${manualPremiumPeriodEndLabel} freigegeben${manualPremiumTimeRemaining ? ` (${manualPremiumTimeRemaining})` : ''}.`
                    : manualPremiumState.kind === 'unlimited'
                      ? 'Dein Stripe-Abo ist aktiv. Die Abrechnungsdaten werden gerade aktualisiert. Zusätzlich ist dein Zugang manuell ohne Enddatum freigegeben.'
                      : 'Dein Stripe-Abo ist aktiv. Die Abrechnungsdaten werden gerade aktualisiert.'
                  : staleStripeStatus
                    ? 'Der gespeicherte Verlängerungstermin ist bereits abgelaufen. Wir aktualisieren gerade deinen Stripe-Status. Öffne Premium verwalten, falls diese Anzeige gleich bleibt.'
                  : cancellationPending
                    ? `Dein Abo endet am ${premiumPeriodEndLabel}. ${cancellationMessage}`
                    : `Dein aktueller Abrechnungszeitraum läuft ${premiumTimeRemaining || 'noch'}. Die nächste Verlängerung ist am ${premiumPeriodEndLabel}.`
                : isPremium
                  ? premiumStatusUnavailable ? 'Dein Premium-Status ist gespeichert, die genaue Laufzeit konnte gerade aber nicht geladen werden. Bitte lade die Seite gleich noch einmal.' : manualPremiumDescription
                  : 'Du nutzt aktuell den kostenlosen Zugang. Wähle Premium, um den sicheren Stripe-Checkout zu öffnen.'}
            </p>
            {hasStripeSubscription ? (
              <div className="mt-7 flex flex-wrap gap-3">
                <button type="button" onClick={openBillingPortal} disabled={portalLoading} className="border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-60">{portalLoading ? 'Portal wird geöffnet …' : 'Premium verwalten'}</button>
                <Link href="/premium/kuendigung" className="border border-white/15 px-5 py-3 text-sm font-bold text-zinc-200 transition hover:bg-white/10">Kündigen</Link>
              </div>
            ) : !isPremium ? <Link href="/updates" className="mt-7 inline-flex border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/20">Updates ansehen</Link> : null}
          </div>

          <div className="overflow-hidden border border-white/10 bg-[#0d1110]">
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
                        <span className="inline-flex items-center justify-center gap-2 border border-emerald-300/20 bg-emerald-400/10 px-4 py-2">
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

        <section className="mt-10 overflow-hidden border border-emerald-300/20 border-t-2 border-t-emerald-300 bg-[#0d1110] p-8 text-center md:p-10">
          <div className="mx-auto grid h-16 w-16 place-items-center border border-emerald-300/25 bg-black/25 text-emerald-200">
            <Sparkles className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-4xl font-black tracking-[-0.05em] md:text-5xl">Bereit für die nächste Stufe?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-zinc-300">Dein Premium-Status wird nach erfolgreicher Zahlung automatisch über Stripe und Supabase aktiviert.</p>
          <button
            type="button"
            onClick={hasStripeSubscription ? openBillingPortal : startCheckout}
            disabled={hasStripeSubscription ? portalLoading : checkoutLoading || isPremium}
            className="group mt-8 border border-emerald-200 bg-emerald-300 px-8 py-5 text-sm font-black uppercase tracking-[0.18em] text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
          >
            {hasStripeSubscription
              ? portalLoading ? 'Portal wird geöffnet...' : <span>Premium verwalten <ArrowUpRight className="ml-2 inline-block h-4 w-4 transition group-hover:-translate-y-1 group-hover:translate-x-1" /></span>
              : isPremium ? 'Premium ist aktiv' : checkoutLoading ? 'Checkout wird geöffnet...' : <span>Jetzt Premium werden <ArrowUpRight className="ml-2 inline-block h-4 w-4 transition group-hover:-translate-y-1 group-hover:translate-x-1" /></span>}
          </button>
        </section>
      </section>
    </main>
  );
}



