import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createSignedState, getDiscordConfig } from '@/lib/discord';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// v2 deliberately uses a new name and the root path. Older deployments used
// /api/discord, which can leave a second cookie with the same name in the
// browser and make the callback read a stale state value.
const STATE_COOKIE = 'rankeddarts_discord_oauth_state_v2';

function safeReturnTo(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/profile';
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get('returnTo'));
  const redirect = new URL(returnTo, request.url);

  if (!user) {
    redirect.pathname = '/auth/login';
    redirect.searchParams.set('redirectTo', returnTo);
    return NextResponse.redirect(redirect);
  }

  const config = getDiscordConfig();
  const stateSecret = process.env.DISCORD_OAUTH_STATE_SECRET?.trim();
  if (!config || !stateSecret) {
    redirect.searchParams.set('discord', 'not-configured');
    return NextResponse.redirect(redirect);
  }

  const state = createSignedState({
    userId: user.id,
    returnTo,
    expiresAt: Date.now() + 10 * 60 * 1000,
  }, stateSecret);
  const authorizeUrl = new URL('https://discord.com/oauth2/authorize');
  authorizeUrl.searchParams.set('client_id', config.clientId);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('redirect_uri', config.redirectUri);
  authorizeUrl.searchParams.set('scope', 'identify');
  authorizeUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60,
    path: '/',
    ...(process.env.NODE_ENV === 'production' ? { domain: '.rankeddarts.de' } : {}),
  });
  return response;
}
