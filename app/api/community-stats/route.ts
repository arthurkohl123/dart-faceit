import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CommunityStats = {
  players: number;
  matches: number;
  cups: number;
  liveCups: number;
  onlinePlayers: number;
  queuePlayers: number;
  livePlayers: number;
};

let cache: { expiresAt: number; stats: CommunityStats } | null = null;

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json(cache.stats, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  }

  try {
    const admin = createAdminClient();
    const now = Date.now();
    const [playersResult, matchesResult, cupsResult, liveCupsResult, onlinePlayersResult, queueResult, liveMatchesResult] = await Promise.all([
      admin.from('profiles').select('*', { count: 'exact', head: true }),
      admin.from('active_matches').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      admin.from('tournaments').select('*', { count: 'exact', head: true }),
      admin.from('tournaments').select('*', { count: 'exact', head: true }).eq('status', 'live'),
      admin.from('user_presence').select('*', { count: 'exact', head: true }).gte('last_seen_at', new Date(now - 2 * 60_000).toISOString()),
      admin.from('matchmaking_queue').select('user_id').gte('last_seen', new Date(now - 45_000).toISOString()),
      admin.from('active_matches').select('player1_id, player2_id').in('status', ['pending_result', 'awaiting_confirmation', 'disputed']),
    ]);

    const error = [playersResult.error, matchesResult.error, cupsResult.error, liveCupsResult.error, onlinePlayersResult.error, queueResult.error, liveMatchesResult.error].find(Boolean);
    if (error) throw error;

    // The public response intentionally contains aggregate counts only. Presence
    // is a short-lived signal and never exposes usernames, platforms or visits.
    const queuePlayers = new Set((queueResult.data ?? []).map((entry) => entry.user_id).filter(Boolean)).size;
    const livePlayerIds = new Set<string>();
    for (const match of liveMatchesResult.data ?? []) {
      if (match.player1_id) livePlayerIds.add(match.player1_id);
      if (match.player2_id) livePlayerIds.add(match.player2_id);
    }

    const stats: CommunityStats = {
      players: playersResult.count ?? 0,
      matches: matchesResult.count ?? 0,
      cups: cupsResult.count ?? 0,
      liveCups: liveCupsResult.count ?? 0,
      onlinePlayers: onlinePlayersResult.count ?? 0,
      queuePlayers,
      livePlayers: livePlayerIds.size,
    };
    cache = { expiresAt: Date.now() + 30_000, stats };

    return NextResponse.json(stats, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('Community stats could not be loaded', error);
    return NextResponse.json({ error: 'Statistiken sind gerade nicht verfügbar.' }, { status: 503 });
  }
}
