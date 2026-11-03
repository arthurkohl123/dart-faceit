import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function integer(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export async function GET() {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authorization = (await headers()).get('authorization');
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: confirmed, error: confirmationError } = await admin.rpc('finalize_expired_match_confirmations');
  if (confirmationError) {
    return NextResponse.json({ error: 'Abgelaufene Ergebnisbestätigungen konnten nicht verarbeitet werden.' }, { status: 500 });
  }

  const { data: noShows, error: noShowError } = await admin.rpc('finalize_expired_no_shows');
  if (noShowError) {
    return NextResponse.json({ error: 'Abgelaufene No-Show-Meldungen konnten nicht verarbeitet werden.' }, { status: 500 });
  }

  const { data: tournamentsStarted, error: tournamentStartError } = await admin.rpc('auto_start_due_tournaments');
  if (tournamentStartError) {
    return NextResponse.json({ error: 'Fällige Turniere konnten nicht automatisch gestartet werden.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    finalizedConfirmations: integer(confirmed),
    finalizedNoShows: integer(noShows),
    autoStartedTournaments: integer(tournamentsStarted),
  });
}
