import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SubmitPayload = {
  myLegs?: unknown;
  opponentLegs?: unknown;
  myAverage?: unknown;
  opponentAverage?: unknown;
  myOneEighties?: unknown;
  opponentOneEighties?: unknown;
  bestOf?: unknown;
};

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  let body: SubmitPayload;
  try {
    body = await request.json() as SubmitPayload;
  } catch {
    return NextResponse.json({ error: 'Ungültige Ergebnisdaten.' }, { status: 400 });
  }

  const { myLegs, opponentLegs, myAverage, opponentAverage, myOneEighties, opponentOneEighties } = body;
  const bestOf = isIntegerInRange(body.bestOf, 3, 21) && body.bestOf % 2 === 1 ? body.bestOf : 7;
  const legsToWin = (bestOf + 1) / 2;

  if (!isIntegerInRange(myLegs, 0, legsToWin) || !isIntegerInRange(opponentLegs, 0, legsToWin)
    || !((myLegs === legsToWin && opponentLegs < legsToWin) || (opponentLegs === legsToWin && myLegs < legsToWin))) {
    return NextResponse.json({ error: `Ungültiges Best-of-${bestOf}-Ergebnis.` }, { status: 400 });
  }
  if (!isNumberInRange(myAverage, 0, 180) || !isNumberInRange(opponentAverage, 0, 180)
    || !isIntegerInRange(myOneEighties, 0, 100) || !isIntegerInRange(opponentOneEighties, 0, 100)) {
    return NextResponse.json({ error: 'Average und 180er müssen gültige Werte enthalten.' }, { status: 400 });
  }

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
    if (match.status !== 'pending_result') {
      return NextResponse.json({ error: 'Dieses Match kann nicht mehr eingereicht werden.' }, { status: 409 });
    }

    const iAmPlayer1 = match.player1_id === user.id;
    const winnerId = myLegs > opponentLegs
      ? user.id
      : (iAmPlayer1 ? match.player2_id : match.player1_id);
    const { data: updated, error: updateError } = await admin
      .from('active_matches')
      .update({
        status: 'awaiting_confirmation',
        submitted_by: user.id,
        submitted_winner_id: winnerId,
        submitted_player1_legs: iAmPlayer1 ? myLegs : opponentLegs,
        submitted_player2_legs: iAmPlayer1 ? opponentLegs : myLegs,
        submitted_player1_average: iAmPlayer1 ? myAverage : opponentAverage,
        submitted_player2_average: iAmPlayer1 ? opponentAverage : myAverage,
        submitted_player1_180s: iAmPlayer1 ? myOneEighties : opponentOneEighties,
        submitted_player2_180s: iAmPlayer1 ? opponentOneEighties : myOneEighties,
        submitted_player1_checkout: null,
        submitted_player2_checkout: null,
        confirmation_requested_at: new Date().toISOString(),
        dispute_reason: null,
        dispute_screenshot_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId)
      .eq('status', 'pending_result')
      .select('id')
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) return NextResponse.json({ error: 'Der Matchstatus wurde gerade geändert. Bitte aktualisiere die Seite.' }, { status: 409 });

    return NextResponse.json({
      result_status: 'awaiting_confirmation',
      result_message: 'Ergebnis und Statistiken wurden eingereicht. Warte auf Bestätigung.',
    });
  } catch (error) {
    console.error('Could not submit match result:', error);
    return NextResponse.json({ error: 'Ergebnis konnte nicht gespeichert werden.' }, { status: 503 });
  }
}
