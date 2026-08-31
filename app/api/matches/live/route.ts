import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// These are intentionally the only states exposed in the public live ticker.
// Finished and cancelled matches never leave the server.
const LIVE_STATUSES = [
  'pending_result',
  'awaiting_confirmation',
  'disputed',
  // Kept while old matches created by the legacy matcher still exist.
  'matched',
];

export async function GET() {
  try {
    const admin = createAdminClient();
    const baseQuery = () => admin
      .from('active_matches')
      .select('id, player1_username, player2_username, player1_elo, player2_elo, status, app, created_at')
      .in('status', LIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(10);

    let { data, error } = await baseQuery().eq('match_mode', 'ranked');

    // A deployment can reach Vercel a few seconds before its accompanying
    // database migration is executed. Keep the public ticker available during
    // that short window; once match_mode exists, private duels are excluded.
    if (error?.code === '42703') ({ data, error } = await baseQuery());

    if (error) throw error;

    return NextResponse.json({ matches: data ?? [] }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Could not load public live matches:', error);
    return NextResponse.json(
      { error: 'Live-Matches konnten nicht geladen werden.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
