import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27' as any,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get('stripe-signature') as string;

  let event: Stripe.Event;

  try {
    // Verifizieren, dass die Nachricht wirklich von Stripe kommt
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Wir reagieren auf erfolgreiche Zahlungen (Subscriptions)
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const supabaseUserId = session.metadata?.supabaseUserId;

    if (supabaseUserId) {
      const supabase = await createClient();
      
      // Den Nutzer in der Datenbank auf Premium setzen
      const { error } = await supabase
        .from('profiles')
        .update({ isPremium: true })
        .eq('supabaseId', supabaseUserId);

      if (error) {
        console.error('Fehler beim Update des Premium-Status:', error);
        return NextResponse.json({ error: 'DB Update failed' }, { status: 500 });
      }

      console.log(`Nutzer ${supabaseUserId} ist jetzt Premium!`);
    }
  }

  return NextResponse.json({ received: true });
}
