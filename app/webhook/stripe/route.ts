import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecretKey || !webhookSecret) {
      throw new Error('Stripe Keys fehlen in der .env');
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-01-27' as any,
    });

    const body = await req.text();
    const signature = (await headers()).get('stripe-signature') as string;

    let event: Stripe.Event;

    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const supabaseUserId = session.metadata?.supabaseUserId;

      if (supabaseUserId) {
        const supabase = await createServerSupabaseClient();
        
        const { error } = await supabase
          .from('profiles')
          .update({ isPremium: true })
          .eq('supabaseId', supabaseUserId);

        if (error) throw error;
        console.log(`Nutzer ${supabaseUserId} ist jetzt Premium!`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
