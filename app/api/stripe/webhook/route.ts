import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { verifyStripeSignature } from '@/lib/stripe-webhook';
import { monitoringErrorMessage, recordMonitoringEvent } from '@/lib/monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeEvent = {
  id: string;
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
const subscriptionEvents = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

function timestamp(value?: number | null) {
  return typeof value === 'number' ? new Date(value * 1000).toISOString() : null;
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = (await headers()).get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret || !verifyStripeSignature(payload, signature, webhookSecret)) {
    await recordMonitoringEvent({
      source: 'stripe_webhook',
      eventType: 'invalid_signature',
      severity: 'warning',
      message: 'Ein Stripe-Webhook wurde wegen einer ungültigen Signatur abgewiesen.',
      fingerprint: 'stripe_webhook:invalid_signature',
      context: { secretConfigured: Boolean(webhookSecret) },
    });
    return NextResponse.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
  }

  let event: StripeEvent | null = null;
  let claimed = false;

  try {
    event = JSON.parse(payload) as StripeEvent;
    if (!event.id || !event.type || !event.data?.object) {
      return NextResponse.json({ error: 'Invalid Stripe event payload.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const eventAt = timestamp(event.created) || new Date().toISOString();
    const { data: claimResult, error: claimError } = await admin.rpc('claim_stripe_webhook_event', {
      p_event_id: event.id,
      p_event_type: event.type,
      p_event_created_at: eventAt,
    });
    if (claimError) throw claimError;
    claimed = Boolean(claimResult);
    if (!claimed) return NextResponse.json({ received: true, ignored: 'duplicate_event' });

    const object = event.data.object;
    let supabaseUserId = object.metadata?.supabaseUserId || object.client_reference_id || null;

    if (!supabaseUserId && object.customer) {
      const { data: customerProfile, error: customerError } = await admin
        .from('profiles')
        .select('supabaseId')
        .eq('stripe_customer_id', object.customer)
        .maybeSingle();
      if (customerError) throw customerError;
      supabaseUserId = customerProfile?.supabaseId ?? null;
    }

    if (!supabaseUserId) {
      await admin.rpc('finish_stripe_webhook_event', { p_event_id: event.id, p_success: true });
      return NextResponse.json({ received: true });
    }

    const isCheckout = event.type === 'checkout.session.completed';
    const isSubscriptionEvent = subscriptionEvents.has(event.type);

    if (!isCheckout && !isSubscriptionEvent) {
      await admin.rpc('finish_stripe_webhook_event', { p_event_id: event.id, p_success: true });
      return NextResponse.json({ received: true });
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('stripe_last_event_at, premium_manual_granted_at, premium_manual_until')
      .eq('supabaseId', supabaseUserId)
      .maybeSingle();
    if (profileError) throw profileError;

    if (profile?.stripe_last_event_at && new Date(profile.stripe_last_event_at).getTime() > new Date(eventAt).getTime()) {
      await admin.rpc('finish_stripe_webhook_event', { p_event_id: event.id, p_success: true });
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

    const { error: finishError } = await admin.rpc('finish_stripe_webhook_event', {
      p_event_id: event.id,
      p_success: true,
    });
    if (finishError) throw finishError;

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    await recordMonitoringEvent({
      source: 'stripe_webhook',
      eventType: 'processing_error',
      severity: 'critical',
      message: monitoringErrorMessage(error),
      fingerprint: 'stripe_webhook:processing_error',
      context: { endpoint: '/api/stripe/webhook' },
    });
    if (event?.id && claimed) {
      try {
        await createAdminClient().rpc('finish_stripe_webhook_event', {
          p_event_id: event.id,
          p_success: false,
          p_error: monitoringErrorMessage(error),
        });
      } catch {
        // The original webhook failure remains the relevant response.
      }
    }
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}

