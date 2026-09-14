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
    // One database transaction owns the entire acceptance transition. This is
    // important when both players accept at the same moment or a browser
    // retries after a lost network response.
    const { data, error: invitationError } = await supabase.rpc('accept_match_invitation', { p_match_id: matchId });
    if (!invitationError) {
      const result = (Array.isArray(data) ? data[0] : data) as {
        status?: string;
        match_id?: string;
        match_status?: string;
      } | null;

      if (result?.status === 'not_found') {
        return NextResponse.json({ error: 'Match wurde nicht gefunden.' }, { status: 404 });
      }
      if (result?.status === 'daily_limit') {
        return NextResponse.json({ error: 'Ein Teilnehmer hat sein Tageslimit für Ranked Matches erreicht.' }, { status: 409 });
      }
      if (result?.status === 'already_handled' && result.match_status === 'cancelled') {
        return NextResponse.json({ status: 'expired', match_id: result.match_id ?? matchId });
      }

      return NextResponse.json({
        status: result?.status ?? 'waiting',
        match_id: result?.match_id ?? matchId,
      });
    }

    // During the few seconds of a deployment in which the application is live
    // before its matching migration, keep the previous safe route available.
    // Other database errors must be reported instead of being hidden here.
    if (!/accept_match_invitation|PGRST202|schema cache/i.test(invitationError.message)) throw invitationError;

    const admin = createAdminClient();
    const { data: match, error } = await admin
      .from('active_matches')
      .select('id, status, accept_deadline, player1_id, player2_id, player1_accepted, player2_accepted')
      .eq('id', matchId)
      .maybeSingle();
    if (error) throw error;
    if (!match) return NextResponse.json({ error: 'Match wurde nicht gefunden.' }, { status: 404 });
    if (match.player1_id !== user.id && match.player2_id !== user.id) return NextResponse.json({ error: 'Du bist kein Teilnehmer dieses Matches.' }, { status: 403 });
    if (match.status === 'pending_result') return NextResponse.json({ status: 'both_accepted', match_id: match.id });
    if (match.status !== 'pending_accept') return NextResponse.json({ error: 'Diese Match-Anfrage ist nicht mehr aktiv.' }, { status: 409 });

    if (match.accept_deadline && new Date(match.accept_deadline).getTime() <= Date.now()) {
      await admin.from('active_matches').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', match.id).eq('status', 'pending_accept');
      return NextResponse.json({ status: 'expired' });
    }

    const acceptedColumn = match.player1_id === user.id ? 'player1_accepted' : 'player2_accepted';
    const { error: acceptError } = await admin
      .from('active_matches')
      .update({ [acceptedColumn]: true, updated_at: new Date().toISOString() })
      .eq('id', match.id)
      .eq('status', 'pending_accept');
    if (acceptError) throw acceptError;

    const { data: refreshed, error: refreshedError } = await admin
      .from('active_matches')
      .select('status, player1_accepted, player2_accepted')
      .eq('id', match.id)
      .maybeSingle();
    if (refreshedError) throw refreshedError;
    if (!refreshed || refreshed.status !== 'pending_accept') {
      return NextResponse.json({ status: 'both_accepted', match_id: match.id });
    }

    if (refreshed.player1_accepted && refreshed.player2_accepted) {
      const { data: started, error: startError } = await admin
        .from('active_matches')
        .update({ status: 'pending_result', updated_at: new Date().toISOString() })
        .eq('id', match.id)
        .eq('status', 'pending_accept')
        .select('id')
        .maybeSingle();
      if (startError) throw startError;
      if (started) return NextResponse.json({ status: 'both_accepted', match_id: match.id });
    }

    return NextResponse.json({ status: 'waiting', match_id: match.id });
  } catch (error) {
    console.error('Could not accept match:', error);
    return NextResponse.json({ error: 'Match konnte nicht angenommen werden.' }, { status: 503 });
  }
}
