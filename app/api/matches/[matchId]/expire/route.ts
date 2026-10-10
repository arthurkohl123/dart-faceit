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
    const { data, error: expireRpcError } = await supabase.rpc('expire_match_accept', { p_match_id: matchId });
    if (!expireRpcError) {
      const result = (Array.isArray(data) ? data[0] : data) as { status?: string; reason?: string; requeue_current?: boolean; removed_current_from_queue?: boolean } | null;
      return NextResponse.json({
        status: result?.status ?? 'already_handled',
        reason: result?.reason,
        requeue_current: result?.requeue_current === true,
        removed_current_from_queue: result?.removed_current_from_queue === true,
      });
    }

    // The fallback is only for a short app-before-migration overlap. It keeps
    // expired invitations recoverable without masking regular database errors.
    if (!/expire_match_accept|PGRST202|schema cache/i.test(expireRpcError.message)) throw expireRpcError;

    const admin = createAdminClient();
    const { data: match, error } = await admin
      .from('active_matches')
      .select('id, status, accept_deadline, player1_id, player2_id, player1_accepted, player2_accepted')
      .eq('id', matchId)
      .maybeSingle();
    if (error) throw error;
    if (!match) return NextResponse.json({ status: 'already_handled' });
    if (match.player1_id !== user.id && match.player2_id !== user.id) return NextResponse.json({ error: 'Du bist kein Teilnehmer dieses Matches.' }, { status: 403 });
    if (match.status !== 'pending_accept') return NextResponse.json({ status: 'already_handled' });
    if (match.accept_deadline && new Date(match.accept_deadline).getTime() > Date.now()) return NextResponse.json({ status: 'not_expired' });

    const { error: expireError } = await admin
      .from('active_matches')
      .update({ status: 'cancelled', cancellation_reason: 'accept_timeout', updated_at: new Date().toISOString() })
      .eq('id', match.id)
      .eq('status', 'pending_accept');
    if (expireError) throw expireError;
    const currentAccepted = match.player1_id === user.id
      ? Boolean(match.player1_accepted)
      : Boolean(match.player2_accepted);
    if (!match.player1_accepted) {
      await admin.from('matchmaking_queue').delete().eq('user_id', match.player1_id);
    }
    if (!match.player2_accepted) {
      await admin.from('matchmaking_queue').delete().eq('user_id', match.player2_id);
    }
    return NextResponse.json({
      status: 'expired',
      reason: 'accept_timeout',
      requeue_current: currentAccepted,
      removed_current_from_queue: !currentAccepted,
    });
  } catch (error) {
    console.error('Could not expire match accept:', error);
    return NextResponse.json({ error: 'Abgelaufene Match-Anfrage konnte nicht bereinigt werden.' }, { status: 503 });
  }
}
