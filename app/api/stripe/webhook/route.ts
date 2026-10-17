import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { verifyStripeSignature } from '@/lib/stripe-webhook';
import { monitoringErrorMessage, recordMonitoringEvent } from '@/lib/monitoring';
import { syncDiscordPremiumRole } from '@/lib/discord';
import {
  createPremiumGiftDisplayCode,
  hashPremiumRedemptionCode,
  isStripeCheckoutSessionId,
  parsePremiumGiftDuration,
} from '@/lib/premium-gifts';

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
      payment_status?: string | null;
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
const giftCheckoutEvents = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
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
    const purchaseType = object.metadata?.purchase_type;
    const isGiftCheckout = giftCheckoutEvents.has(event.type) && purchaseType === 'premium_gift';

    // A gift checkout is a one-time payment. It creates a single, hashed
    // redemption code for the purchaser to pass on; it must never grant the
    // purchaser a Premium entitlement or mutate their subscription profile.
    if (isGiftCheckout) {
      if (object.payment_status !== 'paid') {
        const { error: finishError } = await admin.rpc('finish_stripe_webhook_event', {
          p_event_id: event.id,
          p_success: true,
        });
        if (finishError) throw finishError;
        return NextResponse.json({ received: true, pendingPayment: 'premium_gift' });
      }

      const buyerId = object.metadata?.supabaseUserId;
      const duration = parsePremiumGiftDuration(object.metadata?.duration);
      if (
        !buyerId
        || buyerId !== object.client_reference_id
        || !duration
        || !isStripeCheckoutSessionId(object.id)
      ) {
        throw new Error('Invalid paid Premium gift Checkout session.');
      }

      const code = createPremiumGiftDisplayCode(object.id, webhookSecret);
      const { error: giftError } = await admin.rpc('fulfill_stripe_premium_gift', {
        p_checkout_session_id: object.id,
        p_purchased_by_user_id: buyerId,
        p_duration_days: duration,
        p_code_hash: hashPremiumRedemptionCode(code),
      });
      if (giftError) throw giftError;

      const { error: finishError } = await admin.rpc('finish_stripe_webhook_event', {
        p_event_id: event.id,
        p_success: true,
      });
      if (finishError) throw finishError;
      return NextResponse.json({ received: true, fulfilled: 'premium_gift' });
    }

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
      .select('stripe_last_event_at, premium_manual_granted_at, premium_manual_until, premium_first_activated_at, discord_user_id')
      .eq('supabaseId', supabaseUserId)
      .maybeSingle();
    if (profileError) throw profileError;

    if (profile?.stripe_last_event_at && new Date(profile.stripe_last_event_at).getTime() > new Date(eventAt).getTime()) {
      await admin.rpc('finish_stripe_webhook_event', { p_event_id: event.id, p_success: true });
      return NextResponse.json({ received: true, ignored: 'stale_event' });
    }

    const isSubscriptionCheckout = isCheckout && (purchaseType === 'subscription' || Boolean(object.subscription));
    if (isCheckout && !isSubscriptionCheckout) {
      await admin.rpc('finish_stripe_webhook_event', { p_event_id: event.id, p_success: true });
      return NextResponse.json({ received: true, ignored: 'non_subscription_checkout' });
    }

    const subscriptionId = isSubscriptionCheckout ? object.subscription : object.id;
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
        premium_access_managed: true,
        premium_first_activated_at: profile?.premium_first_activated_at ?? (premiumActive ? eventAt : undefined),
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

    // A cancelled Stripe subscription can overlap with a fixed gift/promo
    // grant. Refresh through the authoritative ledger before updating any
    // compatibility cache or Discord role, so fixed access is never removed.
    const { data: effectivePremium, error: entitlementRefreshError } = await admin.rpc('refresh_premium_entitlement_cache', {
      p_user_id: supabaseUserId,
    });
    if (entitlementRefreshError) throw entitlementRefreshError;

    // Discord is an optional downstream entitlement. A Discord outage must
    // never make Stripe retry a successfully processed payment event.
    if (profile?.discord_user_id) {
      const roleSync = await syncDiscordPremiumRole(profile.discord_user_id, Boolean(effectivePremium));
      if (!roleSync.ok) {
        console.warn('Discord Premium-Rolle konnte nach Stripe-Update nicht synchronisiert werden:', roleSync.message);
      }
    }

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

