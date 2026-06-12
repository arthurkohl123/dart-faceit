import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabaseClient } from '@/lib/supabase-server';

// Das verhindert, dass Next.js versucht, den Endpunkt während des Builds statisch zu generieren
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY ist nicht in der .env konfiguriert');
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-01-27' as any,
    });

    const supabase = await createServerSupabaseClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

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
            unit_amount: 499,
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
