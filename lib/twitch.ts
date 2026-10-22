const TWITCH_CHANNEL_PATTERN = /^[a-z0-9_]{4,25}$/i;

export function getTwitchChannel(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || (hostname !== 'twitch.tv' && hostname !== 'www.twitch.tv')) return null;

    const [channel, ...rest] = parsed.pathname.split('/').filter(Boolean);
    if (!channel || rest.length > 0 || !TWITCH_CHANNEL_PATTERN.test(channel)) return null;

    return channel.toLowerCase();
  } catch {
    return null;
  }
}

export function getTwitchEmbedUrl(channel: string, parent: string | string[]): string {
  const params = new URLSearchParams({ channel, autoplay: 'false', muted: 'false' });
  for (const hostname of Array.isArray(parent) ? parent : [parent]) params.append('parent', hostname);

  return `https://player.twitch.tv/?${params.toString()}`;
}
