import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Older matcher deployments created a match with status "matched". The
// current result-room workflow starts at "pending_result" instead. Convert
// only that legacy transition, and only when a participant opens the room.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  try {
    const admin = createAdminClient();
    const { data: match, error: matchError } = await admin
      .from('active_matches')
      .select('id, player1_id, player2_id, status')
      .eq('id', matchId)
      .maybeSingle();

    if (matchError) throw matchError;
    if (!match) return NextResponse.json({ error: 'Match wurde nicht gefunden.' }, { status: 404 });
    if (match.player1_id !== user.id && match.player2_id !== user.id) {
      return NextResponse.json({ error: 'Du bist kein Teilnehmer dieses Matches.' }, { status: 403 });
    }

    if (match.status !== 'matched') {
      return NextResponse.json({ status: match.status, migrated: false });
    }

    const { data: updated, error: updateError } = await admin
      .from('active_matches')
      .update({ status: 'pending_result', updated_at: new Date().toISOString() })
      .eq('id', matchId)
      .eq('status', 'matched')
      .select('status')
      .maybeSingle();

    if (updateError) throw updateError;
    return NextResponse.json({ status: updated?.status ?? 'pending_result', migrated: true });
  } catch (error) {
    console.error('Could not activate legacy match:', error);
    return NextResponse.json({ error: 'Matchroom konnte nicht vorbereitet werden.' }, { status: 503 });
  }
}
