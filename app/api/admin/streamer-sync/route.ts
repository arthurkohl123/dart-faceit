import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { syncDiscordStreamerRole } from '@/lib/discord';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { profileId?: unknown } | null;
  if (!body || typeof body.profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.profileId)) {
    return NextResponse.json({ error: 'Ungültiger Spieler.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: requester, error: requesterError } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('supabaseId', user.id)
    .maybeSingle();
  if (requesterError || !requester?.is_admin) {
    return NextResponse.json({ error: 'Kein Admin-Zugriff.' }, { status: 403 });
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('discord_user_id, is_streamer')
    .eq('id', body.profileId)
    .maybeSingle();
  if (profileError || !profile) return NextResponse.json({ error: 'Spieler nicht gefunden.' }, { status: 404 });
  if (!profile.discord_user_id) {
    return NextResponse.json({ ok: true, message: 'Discord-Rolle wird gesetzt, sobald der Spieler sein Konto verbindet.' });
  }

  const sync = await syncDiscordStreamerRole(profile.discord_user_id, Boolean(profile.is_streamer));
  if (sync.ok) return NextResponse.json({ ok: true, message: 'Discord-Streamer-Rolle wurde synchronisiert.' });
  if (sync.code === 'ROLE_NOT_CONFIGURED') {
    return NextResponse.json({ ok: true, message: 'Website-Status aktiv. Die Discord-Streamer-Rolle muss noch in den Umgebungsvariablen hinterlegt werden.' });
  }

  return NextResponse.json({ error: sync.message || 'Discord-Streamer-Rolle konnte nicht synchronisiert werden.' }, { status: 502 });
}
