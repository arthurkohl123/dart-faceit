import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { isDiscordStreamerRoleConfigured, syncDiscordPremiumRole, syncDiscordStreamerRole } from '@/lib/discord';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authorization = (await headers()).get('authorization');
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('supabaseId, discord_user_id, "isPremium", is_streamer')
    .not('discord_user_id', 'is', null)
    .limit(1000);
  if (error) return NextResponse.json({ error: 'Discord-Synchronisierung konnte nicht geladen werden.' }, { status: 500 });

  // Keep the reconciliation sequential so a larger member base does not burst
  // through Discord's per-route rate limits every fifteen minutes.
  const results = [];
  const shouldSyncStreamerRole = isDiscordStreamerRoleConfigured();
  for (const profile of profiles ?? []) {
    results.push(await syncDiscordPremiumRole(profile.discord_user_id as string, Boolean(profile.isPremium)));
    if (shouldSyncStreamerRole) {
      results.push(await syncDiscordStreamerRole(profile.discord_user_id as string, Boolean(profile.is_streamer)));
    }
  }
  const failed = results.filter((result) => !result.ok);
  const failedByCode = failed.reduce<Record<string, number>>((summary, result) => {
    const code = result.code ?? 'UNKNOWN';
    summary[code] = (summary[code] ?? 0) + 1;
    return summary;
  }, {});

  return NextResponse.json({
    ok: true,
    checked: results.length,
    failed: failed.length,
    failedByCode,
  });
}
