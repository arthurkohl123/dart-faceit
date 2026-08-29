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
    const admin = createAdminClient();
    const { data: match, error } = await admin
      .from('active_matches')
      .select('id, status, accept_deadline, player1_id, player2_id')
      .eq('id', matchId)
      .maybeSingle();
    if (error) throw error;
    if (!match) return NextResponse.json({ status: 'already_handled' });
    if (match.player1_id !== user.id && match.player2_id !== user.id) return NextResponse.json({ error: 'Du bist kein Teilnehmer dieses Matches.' }, { status: 403 });
    if (match.status !== 'pending_accept') return NextResponse.json({ status: 'already_handled' });
    if (match.accept_deadline && new Date(match.accept_deadline).getTime() > Date.now()) return NextResponse.json({ status: 'not_expired' });

    const { error: expireError } = await admin
      .from('active_matches')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', match.id)
      .eq('status', 'pending_accept');
    if (expireError) throw expireError;
    return NextResponse.json({ status: 'expired' });
  } catch (error) {
    console.error('Could not expire match accept:', error);
    return NextResponse.json({ error: 'Abgelaufene Match-Anfrage konnte nicht bereinigt werden.' }, { status: 503 });
  }
}
