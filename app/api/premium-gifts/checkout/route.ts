import { NextResponse } from 'next/server';
import { consumeRateLimit } from '@/lib/rate-limit';
import { monitoringErrorMessage, recordMonitoringEvent } from '@/lib/monitoring';
import {
  getPremiumGiftPriceId,
  parsePremiumGiftCheckoutPayload,
} from '@/lib/premium-gifts';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeCheckoutSession = {
  url?: string | null;
  error?: { message?: string };
};

const privateNoStoreHeaders = { 'Cache-Control': 'private, no-store' };

function getRequiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Bitte melde dich an, bevor du Premium verschenkst.' },
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

    const duration = parsePremiumGiftCheckoutPayload(payload);
    if (!duration) {
      return NextResponse.json(
        { error: 'Die gewählte Geschenk-Laufzeit ist ungültig.' },
        { status: 400, headers: privateNoStoreHeaders },
      );
    }

    const priceId = getPremiumGiftPriceId(duration);
    if (!priceId) {
      return NextResponse.json(
        {
          error: 'Dieses Premium-Geschenk ist aktuell noch nicht verfügbar.',
          code: 'PREMIUM_GIFT_UNAVAILABLE',
        },
        { status: 503, headers: privateNoStoreHeaders },
      );
    }

    const rateLimit = await consumeRateLimit('checkout', request, user.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Zu viele Checkout-Versuche. Bitte versuche es in einigen Minuten erneut.' },
        {
          status: 429,
          headers: {
            ...privateNoStoreHeaders,
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    const stripeSecretKey = getRequiredEnvironment('STRIPE_SECRET_KEY');
    const appUrl = new URL(getRequiredEnvironment('NEXT_PUBLIC_APP_URL')).origin;
    const body = new URLSearchParams({
      mode: 'payment',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: `${appUrl}/premium?gift=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/premium?gift=cancelled`,
      client_reference_id: user.id,
      'metadata[supabaseUserId]': user.id,
      'metadata[purchase_type]': 'premium_gift',
      'metadata[duration]': String(duration),
    });

    if (user.email) body.set('customer_email', user.email);

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const session = await stripeResponse.json() as StripeCheckoutSession;
    if (!stripeResponse.ok || !session.url) {
      throw new Error(session.error?.message || 'Stripe could not create a premium gift checkout session.');
    }

    return NextResponse.json({ url: session.url }, { headers: privateNoStoreHeaders });
  } catch (error) {
    console.error('Stripe Premium-Geschenk checkout error:', error);
    await recordMonitoringEvent({
      source: 'premium_gift_checkout',
      eventType: 'checkout_session_error',
      severity: 'critical',
      message: monitoringErrorMessage(error),
      fingerprint: 'premium_gift_checkout:session_creation',
      context: { endpoint: '/api/premium-gifts/checkout' },
    });
    return NextResponse.json(
      { error: 'Das Premium-Geschenk konnte nicht gestartet werden. Bitte versuche es später erneut.' },
      { status: 500, headers: privateNoStoreHeaders },
    );
  }
}
