import { NextResponse } from 'next/server';
import { monitoringErrorMessage, recordMonitoringEvent } from '@/lib/monitoring';
import {
  createPremiumGiftDisplayCode,
  hashPremiumRedemptionCode,
  isStripeCheckoutSessionId,
  parsePremiumGiftDuration,
} from '@/lib/premium-gifts';
import { consumeRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeCheckoutSession = {
  id?: string;
  mode?: string | null;
  payment_status?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string | undefined> | null;
  error?: { message?: string };
};

const privateNoStoreHeaders = { 'Cache-Control': 'private, no-store' };

function getStripeSecretKey() {
  const value = process.env.STRIPE_SECRET_KEY?.trim();
  if (!value) throw new Error('STRIPE_SECRET_KEY is not configured.');
  return value;
}

function getGiftCodeSigningSecret() {
  const value = process.env.STRIPE_WEBHOOK_SECRET;
  if (!value) throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
  return value;
}

function parsePayload(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const sessionId = (value as Record<string, unknown>).sessionId;
  return isStripeCheckoutSessionId(sessionId) ? sessionId : null;
}

function isOwnedPaidPremiumGift(
  session: StripeCheckoutSession,
  expectedSessionId: string,
  expectedBuyerId: string,
) {
  return session.id === expectedSessionId
    && session.mode === 'payment'
    && session.payment_status === 'paid'
    && session.metadata?.purchase_type === 'premium_gift'
    && session.metadata?.supabaseUserId === expectedBuyerId
    && session.client_reference_id === expectedBuyerId;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Bitte melde dich an, um dein Premium-Geschenk abzurufen.' },
        { status: 401, headers: privateNoStoreHeaders },
      );
    }

    const rawBody = await request.text();
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      return NextResponse.json(
        { error: 'Die Geschenk-Anfrage ist ungültig.' },
        { status: 400, headers: privateNoStoreHeaders },
      );
    }

    const sessionId = parsePayload(payload);
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Die Zahlungsbestätigung ist ungültig.' },
        { status: 400, headers: privateNoStoreHeaders },
      );
    }

    const rateLimit = await consumeRateLimit('premium_gift_code', request, user.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Zu viele Abrufversuche. Bitte versuche es in einigen Minuten erneut.' },
        {
          status: 429,
          headers: {
            ...privateNoStoreHeaders,
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    const stripeResponse = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${getStripeSecretKey()}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      },
    );
    const session = await stripeResponse.json() as StripeCheckoutSession;
    if (!stripeResponse.ok) {
      throw new Error(session.error?.message || 'Stripe could not retrieve a premium gift checkout session.');
    }

    if (!isOwnedPaidPremiumGift(session, sessionId, user.id)) {
      return NextResponse.json(
        { error: 'Die Zahlung wird noch bestätigt oder gehört nicht zu deinem Konto.' },
        { status: 409, headers: privateNoStoreHeaders },
      );
    }

    const duration = parsePremiumGiftDuration(session.metadata?.duration);
    if (!duration) {
      throw new Error('Premium gift checkout session has an invalid duration.');
    }

    const code = createPremiumGiftDisplayCode(sessionId, getGiftCodeSigningSecret());
    const { error: fulfilmentError } = await createAdminClient().rpc('fulfill_stripe_premium_gift', {
      p_checkout_session_id: sessionId,
      p_purchased_by_user_id: user.id,
      p_duration_days: duration,
      p_code_hash: hashPremiumRedemptionCode(code),
    });
    if (fulfilmentError) throw fulfilmentError;

    return NextResponse.json(
      { code, durationDays: duration },
      { headers: privateNoStoreHeaders },
    );
  } catch (error) {
    console.error('Premium-Geschenk code retrieval error:', error);
    await recordMonitoringEvent({
      source: 'premium_gift_code',
      eventType: 'gift_code_retrieval_error',
      severity: 'critical',
      message: monitoringErrorMessage(error),
      fingerprint: 'premium_gift_code:retrieval',
      context: { endpoint: '/api/premium-gifts/code' },
    });
    return NextResponse.json(
      { error: 'Der Geschenk-Code konnte nicht abgerufen werden. Bitte versuche es später erneut.' },
      { status: 500, headers: privateNoStoreHeaders },
    );
  }
}
