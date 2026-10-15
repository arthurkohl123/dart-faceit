import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privateNoStoreHeaders = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Bitte melde dich zuerst an.' },
        { status: 401, headers: privateNoStoreHeaders },
      );
    }

    const { data: premium, error } = await createAdminClient()
      .from('profiles')
      .select('isPremium, stripe_subscription_status, stripe_current_period_end, stripe_cancel_at_period_end, premium_manual_granted_at, premium_manual_until')
      .eq('supabaseId', user.id)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ premium }, { headers: privateNoStoreHeaders });
  } catch (error) {
    console.error('Premium status error:', error);
    return NextResponse.json(
      { error: 'Der Premium-Status konnte gerade nicht geladen werden.' },
      { status: 500, headers: privateNoStoreHeaders },
    );
  }
}

