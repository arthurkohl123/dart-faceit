import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { consumeRateLimit } from '@/lib/rate-limit';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { monitoringErrorMessage, recordMonitoringEvent } from '@/lib/monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeCheckoutSession = {
  url?: string | null;
  error?: { message?: string };
};

function getRequiredEnvironment(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Bitte melde dich an, bevor du Premium kaufst.' }, { status: 401 });
    }

    const rateLimit = await consumeRateLimit('checkout', request, user.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Zu viele Checkout-Versuche. Bitte versuche es in einigen Minuten erneut.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      );
    }

    const stripeSecretKey = getRequiredEnvironment('STRIPE_SECRET_KEY');
    const priceId = getRequiredEnvironment('STRIPE_PREMIUM_PRICE_ID');
    const appUrl = new URL(getRequiredEnvironment('NEXT_PUBLIC_APP_URL')).origin;

    const { data: profile } = await createAdminClient()
      .from('profiles')
      .select('stripe_customer_id')
      .eq('supabaseId', user.id)
      .maybeSingle();

    const body = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: `${appUrl}/premium?checkout=success`,
      cancel_url: `${appUrl}/premium?checkout=cancelled`,
      client_reference_id: user.id,
      'metadata[supabaseUserId]': user.id,
      'subscription_data[metadata][supabaseUserId]': user.id,
    });

    if (profile?.stripe_customer_id) {
      body.set('customer', profile.stripe_customer_id);
    } else if (user.email) {
      body.set('customer_email', user.email);
    }

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
      throw new Error(session.error?.message || 'Stripe could not create a checkout session.');
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    await recordMonitoringEvent({
      source: 'checkout',
      eventType: 'checkout_session_error',
      severity: 'critical',
      message: monitoringErrorMessage(error),
      fingerprint: 'checkout:session_creation',
      context: { endpoint: '/api/checkout' },
    });
    return NextResponse.json(
      { error: 'Der Checkout konnte nicht gestartet werden. Bitte versuche es später erneut.' },
      { status: 500 },
    );
  }
}

