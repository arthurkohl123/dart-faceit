import { createHmac, timingSafeEqual } from 'node:crypto';

export type DiscordConfig = {
  clientId: string;
  clientSecret: string;
  botToken: string;
  guildId: string;
  premiumRoleId: string;
  redirectUri: string;
};

export type DiscordSyncResult = {
  ok: boolean;
  code?: 'NOT_CONFIGURED' | 'NOT_MEMBER' | 'ROLE_UPDATE_FAILED';
  message?: string;
};

const DISCORD_API = 'https://discord.com/api/v10';

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function getDiscordConfig(): DiscordConfig | null {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const premiumRoleId = process.env.DISCORD_PREMIUM_ROLE_ID?.trim();

  if (!clientId || !clientSecret || !botToken || !guildId || !premiumRoleId) return null;

  return {
    clientId,
    clientSecret,
    botToken,
    guildId,
    premiumRoleId,
    redirectUri: (process.env.DISCORD_REDIRECT_URI?.trim() || `${appUrl()}/api/discord/callback`).replace(/\/$/, ''),
  };
}

export function createSignedState(payload: Record<string, unknown>, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifySignedState(value: string, secret: string): Record<string, unknown> | null {
  const [encoded, signature] = value.split('.');
  if (!encoded || !signature) return null;

  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function discordFetch(path: string, init: RequestInit, botToken: string) {
  return fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bot ${botToken}`,
      ...init.headers,
    },
    cache: 'no-store',
  });
}

export async function syncDiscordPremiumRole(discordUserId: string, shouldHavePremium: boolean): Promise<DiscordSyncResult> {
  const config = getDiscordConfig();
  if (!config) return { ok: false, code: 'NOT_CONFIGURED', message: 'Discord-Rollen-Synchronisierung ist noch nicht konfiguriert.' };

  const memberResponse = await discordFetch(`/guilds/${config.guildId}/members/${discordUserId}`, {}, config.botToken);
  if (memberResponse.status === 404) {
    return { ok: false, code: 'NOT_MEMBER', message: 'Der Discord-Account ist nicht Mitglied im RankedDarts-Server.' };
  }
  if (!memberResponse.ok) {
    return { ok: false, code: 'ROLE_UPDATE_FAILED', message: `Discord-Mitglied konnte nicht geprüft werden (HTTP ${memberResponse.status}).` };
  }

  const rolePath = `/guilds/${config.guildId}/members/${discordUserId}/roles/${config.premiumRoleId}`;
  const roleResponse = shouldHavePremium
    ? await discordFetch(rolePath, { method: 'PUT', body: JSON.stringify({}) }, config.botToken)
    : await discordFetch(rolePath, { method: 'DELETE' }, config.botToken);

  if (!roleResponse.ok && roleResponse.status !== 204) {
    return { ok: false, code: 'ROLE_UPDATE_FAILED', message: `Premium-Rolle konnte nicht aktualisiert werden (HTTP ${roleResponse.status}).` };
  }

  return { ok: true };
}

export async function getDiscordUserFromCode(code: string, config: DiscordConfig) {
  const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    }),
    cache: 'no-store',
  });

  if (!tokenResponse.ok) {
    throw new Error(`Discord OAuth-Token konnte nicht eingelöst werden (HTTP ${tokenResponse.status}).`);
  }

  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw new Error('Discord hat kein Zugriffstoken zurückgegeben.');

  const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: 'no-store',
  });
  if (!userResponse.ok) throw new Error(`Discord-Profil konnte nicht gelesen werden (HTTP ${userResponse.status}).`);

  return await userResponse.json() as {
    id: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
  };
}
