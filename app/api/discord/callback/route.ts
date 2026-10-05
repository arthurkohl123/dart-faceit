import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase-admin';
import { getDiscordConfig, getDiscordUserFromCode, syncDiscordPremiumRole, verifySignedState } from '@/lib/discord';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'rankeddarts_discord_oauth_state_v2';

function safeReturnTo(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/profile';
}

function redirectWith(request: Request, returnTo: string, status: string) {
  const url = new URL(safeReturnTo(returnTo), request.url);
  url.searchParams.set('discord', status);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const stateValue = requestUrl.searchParams.get('state');
  const error = requestUrl.searchParams.get('error');
  const stateSecret = process.env.DISCORD_OAUTH_STATE_SECRET?.trim();
  const config = getDiscordConfig();
  const cookieStore = await cookies();
  const state = stateValue && stateSecret ? verifySignedState(stateValue, stateSecret) : null;
  const returnTo = safeReturnTo(state?.returnTo);

  const response = (status: string) => {
    const redirect = redirectWith(request, returnTo, status);
    redirect.cookies.delete(STATE_COOKIE);
    return redirect;
  };

  const stateUserId = typeof state?.userId === 'string' ? state.userId : null;
  const stateCookieValue = cookieStore.get(STATE_COOKIE)?.value ?? null;
  const stateExpired = typeof state?.expiresAt !== 'number' || state.expiresAt < Date.now();
  const rejectionReasons = [
    !code ? 'missing-code' : null,
    !stateValue ? 'missing-state' : null,
    !stateSecret ? 'missing-state-secret' : null,
    !config ? 'missing-discord-config' : null,
    !state ? 'invalid-state-signature' : null,
    !stateUserId ? 'missing-state-user' : null,
    !stateCookieValue ? 'missing-state-cookie' : null,
    stateCookieValue && stateValue && stateCookieValue !== stateValue ? 'state-cookie-mismatch' : null,
    state && stateExpired ? 'state-expired' : null,
  ].filter((reason): reason is string => Boolean(reason));

  if (error === 'access_denied') return response('cancelled');
  if (rejectionReasons.length > 0) {
    console.warn('Discord OAuth callback rejected before token exchange', {
      host: requestUrl.host,
      reasons: rejectionReasons,
      hasCode: Boolean(code),
      hasState: Boolean(stateValue),
      hasStateCookie: Boolean(stateCookieValue),
      stateMatchesCookie: Boolean(stateCookieValue && stateValue && stateCookieValue === stateValue),
      hasStateSecret: Boolean(stateSecret),
      hasDiscordConfig: Boolean(config),
    });
    return response('failed');
  }

  const validCode = code as string;
  const validConfig = config as NonNullable<typeof config>;
  const linkedUserId = stateUserId as string;

  try {
    const discordUser = await getDiscordUserFromCode(validCode, validConfig);
    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin
      .from('profiles')
      .select('supabaseId')
      .eq('discord_user_id', discordUser.id)
      .neq('supabaseId', linkedUserId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return response('already-linked');

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('"isPremium", discord_user_id')
      .eq('supabaseId', linkedUserId)
      .single();
    if (profileError) throw profileError;

    const roleSync = await syncDiscordPremiumRole(discordUser.id, Boolean(profile?.isPremium));
    if (roleSync.code === 'NOT_MEMBER') return response('not-member');

    const { error: updateError } = await admin.from('profiles').update({
      discord_user_id: discordUser.id,
      discord_username: discordUser.global_name || discordUser.username || 'Discord Nutzer',
      discord_avatar: discordUser.avatar || null,
      discord_linked_at: new Date().toISOString(),
    }).eq('supabaseId', linkedUserId);
    if (updateError) throw updateError;

    return response(roleSync.ok ? 'connected' : 'role-error');
  } catch (callbackError) {
    console.error('Discord OAuth callback failed:', callbackError);
    return response('failed');
  }
}
