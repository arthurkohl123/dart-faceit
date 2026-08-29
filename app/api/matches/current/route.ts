import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPEN_MATCH_STATUSES = [
  'matched',
  'pending_accept',
  'pending_result',
  'awaiting_confirmation',
  'disputed',
];

// The browser client can be delayed by RLS/realtime state exactly when a
// player retries the queue after a refresh. Resolve that state on the server
// from the authenticated session instead, so an existing match is resumed.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  try {
    const admin = createAdminClient();
    const { data: match, error } = await admin
      .from('active_matches')
      .select('id, status, accept_deadline')
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
      .in('status', OPEN_MATCH_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ match: match ?? null }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Could not load current match:', error);
    return NextResponse.json(
      { error: 'Offenes Match konnte nicht geprüft werden.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
