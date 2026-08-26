import { createHmac, timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeEvent = {
  type: string;
  created?: number;
  data: {
    object: {
      id?: string;
      metadata?: Record<string, string | undefined>;
      client_reference_id?: string | null;
      status?: string;
      customer?: string | null;
      subscription?: string | null;
      current_period_end?: number | null;
      cancel_at_period_end?: boolean;
      canceled_at?: number | null;
    };
  };
};

const premiumStatuses = new Set(['active', 'trialing']);

function timestamp(value?: number | null) {
  return typeof value === 'number' ? new Date(value * 1000).toISOString() : null;
}

function verifyStripeSignature(payload: string, signature: string, webhookSecret: string) {
  const parts = signature.split(',').map((part) => part.split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value).filter(Boolean) as string[];

  if (!timestamp || signatures.length === 0 || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) {
    return false;
  }

  const expected = createHmac('sha256', webhookSecret).update(`${timestamp}.${payload}`, 'utf8').digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  return signatures.some((candidate) => {
    const candidateBuffer = Buffer.from(candidate, 'hex');
    return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
  });
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = (await headers()).get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret || !verifyStripeSignature(payload, signature, webhookSecret)) {
    return NextResponse.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
  }

  try {
    const event = JSON.parse(payload) as StripeEvent;
    const object = event.data.object;
    const supabaseUserId = object.metadata?.supabaseUserId || object.client_reference_id;

    if (!supabaseUserId) {
      return NextResponse.json({ received: true });
    }

    const isCheckout = event.type === 'checkout.session.completed';
    const isSubscriptionEvent = event.type === 'customer.subscription.updated'
      || event.type === 'customer.subscription.deleted';

    if (!isCheckout && !isSubscriptionEvent) return NextResponse.json({ received: true });

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('stripe_last_event_at, premium_manual_granted_at, premium_manual_until')
      .eq('supabaseId', supabaseUserId)
      .maybeSingle();
    if (profileError) throw profileError;

    const eventAt = timestamp(event.created) || new Date().toISOString();
    if (profile?.stripe_last_event_at && new Date(profile.stripe_last_event_at).getTime() > new Date(eventAt).getTime()) {
      return NextResponse.json({ received: true, ignored: 'stale_event' });
    }

    const subscriptionId = isCheckout ? object.subscription : object.id;
    const stripeStatus = isCheckout ? 'active' : (object.status || (event.type === 'customer.subscription.deleted' ? 'canceled' : 'unknown'));
    const manualPremiumActive = Boolean(
      profile?.premium_manual_granted_at
      && (!profile.premium_manual_until || new Date(profile.premium_manual_until).getTime() > Date.now()),
    );
    const premiumActive = isCheckout || premiumStatuses.has(stripeStatus) || manualPremiumActive;
    const { error } = await admin
      .from('profiles')
      .update({
        isPremium: premiumActive,
        stripe_customer_id: object.customer ?? undefined,
        stripe_subscription_id: subscriptionId ?? undefined,
        stripe_subscription_status: stripeStatus,
        stripe_current_period_end: timestamp(object.current_period_end) ?? undefined,
        stripe_cancel_at_period_end: Boolean(object.cancel_at_period_end),
        stripe_cancelled_at: timestamp(object.canceled_at) ?? (event.type === 'customer.subscription.deleted' ? eventAt : undefined),
        stripe_last_event_at: eventAt,
      })
      .eq('supabaseId', supabaseUserId);

    if (error) throw error;

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}

