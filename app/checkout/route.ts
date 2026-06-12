import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27' as any,
});

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // 1. Prüfen, ob der Nutzer eingeloggt ist
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    // 2. Stripe Checkout Session erstellen
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'paypal', 'sofort'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'RankedDarts Premium',
              description: 'Unbegrenzte Matches, exklusive Turniere und VIP-Status.',
            },
            unit_amount: 499, // 4,99€
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/premium?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/premium?canceled=true`,
      metadata: {
        supabaseUserId: user.id,
      },
      customer_email: user.email || undefined,
    } );

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe Checkout Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
