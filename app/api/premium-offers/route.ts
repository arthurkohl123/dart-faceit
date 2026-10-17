import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  getConfiguredPremiumGiftOffers,
  PREMIUM_GIFT_DURATIONS,
  type PremiumGiftDuration,
} from '@/lib/premium-gifts';
import { getConfiguredPremiumPlans, PREMIUM_PLANS, type PremiumPlan } from '@/lib/premium-offers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privateNoStoreHeaders = { 'Cache-Control': 'private, no-store' };

type StripePrice = {
  active?: boolean;
  currency?: string;
  type?: string;
  unit_amount?: number | null;
  recurring?: {
    interval?: string;
    interval_count?: number | null;
  } | null;
};

type PremiumOffer = {
  plan: PremiumPlan;
  configured: boolean;
  available: boolean;
  unitAmount: number | null;
  currency: string | null;
  interval: string | null;
  intervalCount: number | null;
};

type PremiumGiftOffer = {
  durationDays: PremiumGiftDuration;
  configured: boolean;
  available: boolean;
  unitAmount: number | null;
  currency: string | null;
};

function unavailableOffer(plan: PremiumPlan, configured: boolean): PremiumOffer {
  return {
    plan,
    configured,
    available: false,
    unitAmount: null,
    currency: null,
    interval: null,
    intervalCount: null,
  };
}

function unavailableGiftOffer(durationDays: PremiumGiftDuration, configured: boolean): PremiumGiftOffer {
  return {
    durationDays,
    configured,
    available: false,
    unitAmount: null,
    currency: null,
  };
}

async function loadOffer(plan: PremiumPlan, priceId: string, stripeSecretKey: string): Promise<PremiumOffer> {
  try {
    const response = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return unavailableOffer(plan, true);

    const price = await response.json() as StripePrice;
    const unitAmount = typeof price.unit_amount === 'number' && Number.isFinite(price.unit_amount)
      ? price.unit_amount
      : null;
    const currency = typeof price.currency === 'string' && price.currency.trim()
      ? price.currency.toLowerCase()
      : null;
    const interval = typeof price.recurring?.interval === 'string' ? price.recurring.interval : null;
    const intervalCount = typeof price.recurring?.interval_count === 'number'
      && Number.isFinite(price.recurring.interval_count)
      ? price.recurring.interval_count
      : null;
    const available = Boolean(
      price.active
      && price.type === 'recurring'
      && unitAmount !== null
      && currency
      && interval,
    );

    return {
      plan,
      configured: true,
      available,
      unitAmount: available ? unitAmount : null,
      currency: available ? currency : null,
      interval: available ? interval : null,
      intervalCount: available ? intervalCount : null,
    };
  } catch {
    return unavailableOffer(plan, true);
  }
}

async function loadGiftOffer(
  durationDays: PremiumGiftDuration,
  priceId: string,
  stripeSecretKey: string,
): Promise<PremiumGiftOffer> {
  try {
    const response = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return unavailableGiftOffer(durationDays, true);

    const price = await response.json() as StripePrice;
    const unitAmount = typeof price.unit_amount === 'number' && Number.isFinite(price.unit_amount)
      ? price.unit_amount
      : null;
    const currency = typeof price.currency === 'string' && price.currency.trim()
      ? price.currency.toLowerCase()
      : null;
    const available = Boolean(
      price.active
      && price.type === 'one_time'
      && unitAmount !== null
      && currency,
    );

    return {
      durationDays,
      configured: true,
      available,
      unitAmount: available ? unitAmount : null,
      currency: available ? currency : null,
    };
  } catch {
    return unavailableGiftOffer(durationDays, true);
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Bitte melde dich an, um die Premium-Angebote zu sehen.' },
        { status: 401, headers: privateNoStoreHeaders },
      );
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: 'Die Premium-Angebote sind aktuell nicht verfügbar.' },
        { status: 503, headers: privateNoStoreHeaders },
      );
    }

    const configuredPlans = getConfiguredPremiumPlans();
    const configuredGiftOffers = getConfiguredPremiumGiftOffers();
    const [loadedOffers, loadedGiftOffers] = await Promise.all([
      Promise.all(configuredPlans.map(({ plan, priceId }) => loadOffer(plan, priceId, stripeSecretKey))),
      Promise.all(configuredGiftOffers.map(({ duration, priceId }) => loadGiftOffer(duration, priceId, stripeSecretKey))),
    ]);
    const offersByPlan = new Map<PremiumPlan, PremiumOffer>(
      loadedOffers.map((offer) => [offer.plan, offer] as const),
    );
    const giftOffersByDuration = new Map<PremiumGiftDuration, PremiumGiftOffer>(
      loadedGiftOffers.map((offer) => [offer.durationDays, offer] as const),
    );
    const offers: PremiumOffer[] = PREMIUM_PLANS.map((plan) => (
      offersByPlan.get(plan) ?? unavailableOffer(plan, false)
    ));
    const giftOffers: PremiumGiftOffer[] = PREMIUM_GIFT_DURATIONS.map((durationDays) => (
      giftOffersByDuration.get(durationDays) ?? unavailableGiftOffer(durationDays, false)
    ));

    return NextResponse.json({ offers, giftOffers }, { headers: privateNoStoreHeaders });
  } catch (error) {
    console.error('Stripe premium offers error:', error);
    return NextResponse.json(
      { error: 'Die Premium-Angebote konnten gerade nicht geladen werden. Bitte versuche es später erneut.' },
      { status: 502, headers: privateNoStoreHeaders },
    );
  }
}
