import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  // Caddy appends the direct client address. Reading the last value prevents a
  // spoofed leading value from becoming a security signal.
  if (forwarded) return forwarded.split(',').at(-1)?.trim() || null;
  return request.headers.get('x-real-ip')?.trim()
    || request.headers.get('cf-connecting-ip')?.trim()
    || null;
}

function getSignalSecret() {
  // A dedicated key may be configured later. The established server-only cron
  // secret is a safe fallback and keeps this zero-cost safeguard deployable.
  return process.env.IP_SIGNAL_HMAC_SECRET?.trim() || process.env.CRON_SECRET?.trim() || null;
}

export async function POST(request: Request) {
  const secret = getSignalSecret();
  const ip = getClientIp(request);
  if (!secret || !ip) return NextResponse.json({ recorded: false });

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Bitte melde dich an.' }, { status: 401 });

  const signalHash = createHmac('sha256', secret)
    .update(`rankeddarts:network-signal:v1:${ip}`)
    .digest('hex');

  const { error } = await createAdminClient().rpc('record_account_network_signal', {
    p_user_id: user.id,
    p_signal_hash: signalHash,
  });
  if (error) {
    console.error('Could not record account security signal:', error.message);
    return NextResponse.json({ error: 'Sicherheitssignal konnte nicht gespeichert werden.' }, { status: 503 });
  }

  return NextResponse.json({ recorded: true });
}
