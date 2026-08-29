import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: actor, error: actorError } = await admin
    .from('profiles')
    .select('is_admin, is_developer')
    .eq('supabaseId', user.id)
    .maybeSingle();

  if (actorError) return NextResponse.json({ error: 'Berechtigung konnte nicht geprüft werden.' }, { status: 500 });
  if (!actor?.is_admin && !actor?.is_developer) return NextResponse.json({ error: 'Keine Admin-Berechtigung.' }, { status: 403 });

  const { data: match, error: matchError } = await admin
    .from('active_matches')
    .select('id, status')
    .eq('id', matchId)
    .maybeSingle();

  if (matchError) return NextResponse.json({ error: 'Match konnte nicht geladen werden.' }, { status: 500 });
  if (!match) return NextResponse.json({ error: 'Match wurde nicht gefunden.' }, { status: 404 });
  if (match.status === 'completed' || match.status === 'cancelled') {
    return NextResponse.json({ error: 'Dieses Match ist bereits abgeschlossen.' }, { status: 409 });
  }

  const { data: cancelled, error: cancelError } = await admin
    .from('active_matches')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', matchId)
    .in('status', ['pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed'])
    .select('id')
    .maybeSingle();

  if (cancelError) return NextResponse.json({ error: cancelError.message }, { status: 500 });
  if (!cancelled) return NextResponse.json({ error: 'Der Match-Status wurde gerade bereits geändert. Bitte aktualisiere die Seite.' }, { status: 409 });

  return NextResponse.json({ cancelled: true, matchId });
}
