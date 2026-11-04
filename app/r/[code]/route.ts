import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REFERRAL_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params;
  const code = rawCode.trim().toLowerCase();
  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.rankeddarts.de';
  const destination = new URL('/auth/register', publicAppUrl);

  if (!REFERRAL_CODE_PATTERN.test(code) || code.length > 64) {
    return NextResponse.redirect(destination);
  }

  try {
    const admin = createAdminClient();
    const { data: referral } = await admin
      .from('creator_referral_codes')
      .select('streamer_profile_id')
      .eq('code', code)
      .maybeSingle<{ streamer_profile_id: string }>();

    if (!referral) return NextResponse.redirect(destination);

    const { data: streamer } = await admin
      .from('profiles')
      .select('is_streamer')
      .eq('id', referral.streamer_profile_id)
      .maybeSingle<{ is_streamer: boolean | null }>();

    if (streamer?.is_streamer) destination.searchParams.set('ref', code);
  } catch {
    // A referral link must never prevent someone from reaching registration.
  }

  return NextResponse.redirect(destination);
}
