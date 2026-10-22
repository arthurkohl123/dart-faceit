import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { isDiscordStreamerRoleConfigured, syncDiscordPremiumRole, syncDiscordStreamerRole } from '@/lib/discord';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('discord_user_id')
    .eq('supabaseId', user.id)
    .single();
  if (profileError) return NextResponse.json({ error: 'Discord-Verknüpfung konnte nicht geladen werden.' }, { status: 500 });

  let warning: string | undefined;
  if (profile?.discord_user_id) {
    const roleResults = [await syncDiscordPremiumRole(profile.discord_user_id, false)];
    if (isDiscordStreamerRoleConfigured()) roleResults.push(await syncDiscordStreamerRole(profile.discord_user_id, false));
    warning = roleResults.find((result) => !result.ok && result.code !== 'NOT_MEMBER')?.message;
  }

  const { error } = await admin.from('profiles').update({
    discord_user_id: null,
    discord_username: null,
    discord_avatar: null,
    discord_linked_at: null,
  }).eq('supabaseId', user.id);
  if (error) return NextResponse.json({ error: 'Discord-Verknüpfung konnte nicht entfernt werden.' }, { status: 500 });

  return NextResponse.json({ ok: true, warning });
}
