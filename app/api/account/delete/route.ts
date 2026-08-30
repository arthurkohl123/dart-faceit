import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { consumeRateLimit } from '@/lib/rate-limit';
import { monitoringErrorMessage, recordMonitoringEvent } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const limit = await consumeRateLimit('account', request, user.id);
  if (!limit.allowed) return NextResponse.json({ error: 'Bitte versuche es später erneut.' }, { status: 429 });
  const input = await request.json().catch(() => ({})) as { confirmation?: string };
  if (input.confirmation !== 'ACCOUNT LÖSCHEN') {
    return NextResponse.json({ error: 'Bestätigung stimmt nicht überein.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('stripe_subscription_status, stripe_subscription_id')
    .eq('supabaseId', user.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: 'Profil konnte nicht geprüft werden.' }, { status: 500 });
  if (profile?.stripe_subscription_id && ['active','trialing','past_due'].includes(profile.stripe_subscription_status ?? '')) {
    return NextResponse.json({ error: 'Bitte kündige zuerst dein aktives Premium-Abo im Stripe-Kundenportal.' }, { status: 409 });
  }

  try {
    const { error: authError } = await admin.auth.admin.deleteUser(user.id);
    if (authError) throw authError;

    // Keep non-personal rating aggregates referentially intact while removing identity data.
    const anonymousName = `Gelöschter Spieler ${user.id.slice(0, 8)}`;
    const { error: anonymizeError } = await admin.from('profiles').update({
      username: anonymousName,
      phone_number: null,
      phone_verified: false,
      phone_verified_at: null,
      scolia_username: null,
      dartcounter_username: null,
      autodarts_username: null,
      isPremium: false,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      stripe_subscription_status: null,
      premium_manual_granted_at: null,
      premium_manual_until: null,
      premium_manual_reason: null,
      premium_manual_granted_by: null,
      is_admin: false,
      is_moderator: false,
      is_developer: false,
    }).eq('supabaseId', user.id);
    if (anonymizeError) throw anonymizeError;
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    await recordMonitoringEvent({
      source: 'account', eventType: 'account_deletion_error', severity: 'critical',
      message: monitoringErrorMessage(error), fingerprint: `account:deletion:${user.id}`,
      context: { userId: user.id },
    });
    return NextResponse.json({ error: 'Der Account konnte nicht vollständig gelöscht werden. Der Support wurde informiert.' }, { status: 500 });
  }
}
