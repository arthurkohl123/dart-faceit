import { createHash, createHmac } from 'node:crypto';

export const PREMIUM_GIFT_DURATIONS = [30, 90, 365] as const;

export type PremiumGiftDuration = (typeof PREMIUM_GIFT_DURATIONS)[number];

type PremiumGiftConfiguration = {
  environmentKey:
    | 'STRIPE_PREMIUM_GIFT_30D_PRICE_ID'
    | 'STRIPE_PREMIUM_GIFT_90D_PRICE_ID'
    | 'STRIPE_PREMIUM_GIFT_365D_PRICE_ID';
};

export type PremiumGiftEnvironment = {
  STRIPE_PREMIUM_GIFT_30D_PRICE_ID?: string;
  STRIPE_PREMIUM_GIFT_90D_PRICE_ID?: string;
  STRIPE_PREMIUM_GIFT_365D_PRICE_ID?: string;
};

const PREMIUM_GIFT_CONFIGURATION: Record<PremiumGiftDuration, PremiumGiftConfiguration> = {
  30: { environmentKey: 'STRIPE_PREMIUM_GIFT_30D_PRICE_ID' },
  90: { environmentKey: 'STRIPE_PREMIUM_GIFT_90D_PRICE_ID' },
  365: { environmentKey: 'STRIPE_PREMIUM_GIFT_365D_PRICE_ID' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePremiumGiftDuration(value: unknown): PremiumGiftDuration | null {
  const normalized = typeof value === 'string' && /^(30|90|365)$/.test(value)
    ? Number(value)
    : value;
  return typeof normalized === 'number'
    && Number.isInteger(normalized)
    && PREMIUM_GIFT_DURATIONS.includes(normalized as PremiumGiftDuration)
    ? normalized as PremiumGiftDuration
    : null;
}

export function parsePremiumGiftCheckoutPayload(payload: unknown): PremiumGiftDuration | null {
  if (!isRecord(payload)) return null;
  return parsePremiumGiftDuration(payload.duration);
}

export function getPremiumGiftPriceId(
  duration: PremiumGiftDuration,
  environment?: PremiumGiftEnvironment,
) {
  const environmentKey = PREMIUM_GIFT_CONFIGURATION[duration].environmentKey;
  const value = (environment?.[environmentKey] ?? process.env[environmentKey])?.trim();
  return value || null;
}

export function getConfiguredPremiumGiftOffers(environment?: PremiumGiftEnvironment) {
  return PREMIUM_GIFT_DURATIONS.flatMap((duration) => {
    const priceId = getPremiumGiftPriceId(duration, environment);
    return priceId ? [{ duration, priceId }] : [];
  });
}

/**
 * Restrict the value passed to Stripe and used as a derivation input. The
 * ownership and paid-status checks in the retrieval endpoint remain the
 * authorization boundary; this merely rejects malformed untrusted input.
 */
export function isStripeCheckoutSessionId(value: unknown): value is string {
  return typeof value === 'string'
    && /^cs_[A-Za-z0-9_]{8,250}$/.test(value);
}

export function normalizePremiumRedemptionCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function hashPremiumRedemptionCode(value: string) {
  return createHash('sha256')
    .update(normalizePremiumRedemptionCode(value))
    .digest('hex');
}

/**
 * The code is deliberately deterministic so a buyer can recover it after a
 * successful payment without saving plaintext in the database. Its HMAC key
 * is server-only, so a forwarded Checkout Session ID cannot be turned into a
 * redeemable code by a browser or another recipient.
 */
export function createPremiumGiftDisplayCode(checkoutSessionId: string, signingSecret: string) {
  if (!isStripeCheckoutSessionId(checkoutSessionId)) {
    throw new Error('Invalid Stripe Checkout Session ID.');
  }
  if (!signingSecret) {
    throw new Error('Premium gift signing secret is required.');
  }

  const digest = createHmac('sha256', signingSecret)
    .update(`rankeddarts:premium-gift:v1:${checkoutSessionId}`)
    .digest('hex')
    .toUpperCase();

  return `RD-GIFT-${digest.slice(0, 8)}-${digest.slice(8, 16)}-${digest.slice(16, 24)}-${digest.slice(24, 32)}`;
}
