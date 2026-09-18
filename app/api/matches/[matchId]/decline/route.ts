import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  try {
    const { data, error: declineError } = await supabase.rpc('decline_match_invitation', { p_match_id: matchId });
    if (!declineError) {
      const result = (Array.isArray(data) ? data[0] : data) as { status?: string } | null;
      if (result?.status === 'not_found') return NextResponse.json({ error: 'Match wurde nicht gefunden.' }, { status: 404 });
      return NextResponse.json({ status: result?.status ?? 'already_handled' });
    }

    // Keep a safe short deployment overlap while the new locking function is
    // being rolled out. Do not hide any other database error.
    if (!/decline_match_invitation|PGRST202|schema cache/i.test(declineError.message)) throw declineError;

    const admin = createAdminClient();
    const { data: match, error } = await admin
      .from('active_matches')
      .select('id, status, player1_id, player2_id')
      .eq('id', matchId)
      .maybeSingle();
    if (error) throw error;
    if (!match) return NextResponse.json({ error: 'Match wurde nicht gefunden.' }, { status: 404 });
    if (match.player1_id !== user.id && match.player2_id !== user.id) return NextResponse.json({ error: 'Du bist kein Teilnehmer dieses Matches.' }, { status: 403 });
    if (match.status !== 'pending_accept') return NextResponse.json({ status: 'already_handled' });

    const { error: cancelError } = await admin
      .from('active_matches')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', match.id)
      .eq('status', 'pending_accept');
    if (cancelError) throw cancelError;
    return NextResponse.json({ status: 'declined' });
  } catch (error) {
    console.error('Could not decline match:', error);
    return NextResponse.json({ error: 'Match konnte nicht abgelehnt werden.' }, { status: 503 });
  }
}
