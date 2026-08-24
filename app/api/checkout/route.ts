import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

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

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Bitte melde dich an, bevor du Premium kaufst.' }, { status: 401 });
    }

    const stripeSecretKey = getRequiredEnvironment('STRIPE_SECRET_KEY');
    const priceId = getRequiredEnvironment('STRIPE_PREMIUM_PRICE_ID');
    const appUrl = new URL(getRequiredEnvironment('NEXT_PUBLIC_APP_URL')).origin;

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

    if (user.email) {
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
    return NextResponse.json(
      { error: 'Der Checkout konnte nicht gestartet werden. Bitte versuche es später erneut.' },
      { status: 500 },
    );
  }
}

