import { createHmac, timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeEvent = {
  type: string;
  data: {
    object: {
      metadata?: Record<string, string | undefined>;
      client_reference_id?: string | null;
      status?: string;
    };
  };
};

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

    const premiumActive = event.type === 'checkout.session.completed'
      || (event.type === 'customer.subscription.updated' && ['active', 'trialing'].includes(object.status || ''));
    const premiumInactive = event.type === 'customer.subscription.deleted'
      || (event.type === 'customer.subscription.updated' && !['active', 'trialing'].includes(object.status || ''));

    if (premiumActive || premiumInactive) {
      const { error } = await createAdminClient()
        .from('profiles')
        .update({ isPremium: premiumActive })
        .eq('supabaseId', supabaseUserId);

      if (error) {
        throw error;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}

