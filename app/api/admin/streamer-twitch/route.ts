import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getTwitchChannel } from '@/lib/twitch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RequestBody = {
  profileId?: unknown;
  twitchUrl?: unknown;
};

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const body = await request.json().catch(() => null) as RequestBody | null;
  if (!body || typeof body.profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.profileId) || (body.twitchUrl !== null && typeof body.twitchUrl !== 'string')) {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const requestedUrl = typeof body.twitchUrl === 'string' ? body.twitchUrl.trim() : '';
  const channel = requestedUrl ? getTwitchChannel(requestedUrl) : null;
  if (requestedUrl && !channel) {
    return NextResponse.json({ error: 'Bitte verwende einen gültigen Twitch-Kanal, zum Beispiel https://www.twitch.tv/rankeddarts.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: actor, error: actorError } = await admin
    .from('profiles')
    .select('id, username, is_admin, is_developer')
    .eq('supabaseId', user.id)
    .maybeSingle();
  if (actorError) return NextResponse.json({ error: 'Berechtigung konnte nicht geprüft werden.' }, { status: 500 });
  if (!actor?.is_admin && !actor?.is_developer) return NextResponse.json({ error: 'Keine Admin-Berechtigung.' }, { status: 403 });

  const { data: target, error: targetError } = await admin
    .from('profiles')
    .select('id, username, is_streamer')
    .eq('id', body.profileId)
    .maybeSingle();
  if (targetError) return NextResponse.json({ error: 'Streamer konnte nicht geladen werden.' }, { status: 500 });
  if (!target) return NextResponse.json({ error: 'Spieler nicht gefunden.' }, { status: 404 });
  if (!target.is_streamer) return NextResponse.json({ error: 'Der Twitch-Kanal kann nur für aktive Streamer gepflegt werden.' }, { status: 409 });

  const twitchUrl = channel ? `https://www.twitch.tv/${channel}` : null;
  const { error: updateError } = await admin
    .from('profiles')
    .update({ twitch_url: twitchUrl })
    .eq('id', target.id);
  if (updateError) return NextResponse.json({ error: 'Twitch-Kanal konnte nicht gespeichert werden.' }, { status: 500 });

  const { error: logError } = await admin.from('admin_logs').insert({
    admin_id: user.id,
    admin_username: actor.username || 'Admin',
    action: 'STREAMER_TWITCH_UPDATED',
    target_type: 'PLAYER',
    target_id: target.id,
    target_label: target.username || 'Streamer',
    details: twitchUrl ? `Twitch-Kanal gesetzt: ${twitchUrl}` : 'Twitch-Kanal entfernt',
  });
  if (logError) console.error('Streamer Twitch audit log could not be written', logError);

  return NextResponse.json({ ok: true, twitchUrl });
}
