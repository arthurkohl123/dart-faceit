import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PortalResponse = {
  url?: string;
  error?: { message?: string };
};

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Bitte melde dich zuerst an.' }, { status: 401 });
    }

    const input = await request.json().catch(() => ({})) as { flow?: string };
    const cancelFlow = input.flow === 'cancel';
    const { data: profile, error: profileError } = await createAdminClient()
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('supabaseId', user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: 'Für diesen Account wurde noch kein Stripe-Abo gefunden.' }, { status: 404 });
    }

    const appUrl = new URL(requiredEnvironment('NEXT_PUBLIC_APP_URL')).origin;
    const body = new URLSearchParams({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/premium?portal=return`,
      locale: 'de',
    });

    // Deep-link directly into the cancellation flow when the user selected
    // the legal cancellation button. Stripe still collects confirmation itself.
    if (cancelFlow && profile.stripe_subscription_id) {
      body.set('flow_data[type]', 'subscription_cancel');
      body.set('flow_data[subscription_cancel][subscription]', profile.stripe_subscription_id);
      body.set('flow_data[after_completion][type]', 'redirect');
      body.set('flow_data[after_completion][redirect][return_url]', `${appUrl}/premium?portal=cancel-requested`);
    }

    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requiredEnvironment('STRIPE_SECRET_KEY')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const portal = await response.json() as PortalResponse;

    if (!response.ok || !portal.url) {
      throw new Error(portal.error?.message || 'Das Kundenportal konnte nicht geöffnet werden.');
    }

    return NextResponse.json({ url: portal.url });
  } catch (error) {
    console.error('Stripe billing portal error:', error);
    return NextResponse.json({ error: 'Das Abo-Portal konnte gerade nicht geöffnet werden. Bitte versuche es später erneut.' }, { status: 500 });
  }
}
