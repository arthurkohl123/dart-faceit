import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getTwitchChannel } from '@/lib/twitch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TwitchTokenCache = {
  accessToken: string;
  expiresAt: number;
};

type StreamerProfile = {
  username: string;
  elo: number | null;
  gamesPlayed: number | null;
  wins: number | null;
  twitch_url: string | null;
};

type TwitchStreamResponse = {
  data?: Array<{ user_login?: string }>;
};

let twitchTokenCache: TwitchTokenCache | null = null;

async function getTwitchAccessToken() {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  if (twitchTokenCache && twitchTokenCache.expiresAt > Date.now()) return { clientId, accessToken: twitchTokenCache.accessToken };

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Twitch token request failed with ${response.status}`);

  const token = await response.json() as { access_token?: string; expires_in?: number };
  if (!token.access_token || !token.expires_in) throw new Error('Twitch token response was incomplete');

  twitchTokenCache = {
    accessToken: token.access_token,
    expiresAt: Date.now() + Math.max(token.expires_in - 60, 60) * 1_000,
  };
  return { clientId, accessToken: token.access_token };
}

async function getLiveTwitchChannels(channels: string[]) {
  if (channels.length === 0) return { liveChannels: new Set<string>(), configured: true };

  const credentials = await getTwitchAccessToken();
  if (!credentials) return { liveChannels: new Set<string>(), configured: false };

  const params = new URLSearchParams();
  for (const channel of channels) params.append('user_login', channel);

  const response = await fetch(`https://api.twitch.tv/helix/streams?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Client-Id': credentials.clientId,
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Twitch stream request failed with ${response.status}`);

  const payload = await response.json() as TwitchStreamResponse;
  return {
    liveChannels: new Set((payload.data ?? []).flatMap((stream) => stream.user_login ? [stream.user_login.toLowerCase()] : [])),
    configured: true,
  };
}

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .select('username, elo, gamesPlayed, wins, twitch_url')
      .eq('is_streamer', true)
      .not('twitch_url', 'is', null)
      .order('elo', { ascending: false });

    if (error) throw error;

    const profiles = (data ?? []) as StreamerProfile[];
    const twitchChannels = profiles.flatMap((profile) => {
      const channel = getTwitchChannel(profile.twitch_url);
      return channel ? [channel] : [];
    });
    const { liveChannels, configured } = await getLiveTwitchChannels(twitchChannels);

    const streamers = profiles.map((profile) => {
      const twitchChannel = getTwitchChannel(profile.twitch_url);
      const streamStatus = twitchChannel
        ? configured ? (liveChannels.has(twitchChannel) ? 'live' : 'offline') : 'unavailable'
        : 'unavailable';

      return {
        ...profile,
        twitch_channel: twitchChannel,
        stream_status: streamStatus,
      };
    });

    return NextResponse.json({ streamers, twitchStatusConfigured: configured }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error) {
    console.error('Streamer live status could not be loaded', error);
    return NextResponse.json({ error: 'Streamer-Status ist gerade nicht verfügbar.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
