import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SeasonRow = {
  season_label: string;
  season_started_at: string;
  is_current: boolean;
};

type PublicPlayerRow = {
  username: string;
  supabase_id: string;
  elo: number;
};

type MatchRow = {
  id: string;
  user_id: string;
  elo_change: number | null;
  my_average: number | null;
  app: string | null;
  completed_at: string | null;
};

type WeeklyPlayer = {
  place: number;
  username: string;
  elo: number;
  weekly_elo: number;
  matches: number;
  average: number | null;
  platform: 'Scolia' | 'AutoDarts' | 'DartCounter' | '—';
};

type WeeklyLeaderboardResponse = {
  season_label: string;
  period_start: string;
  period_end: string;
  players: WeeklyPlayer[];
};

type PlayerAggregate = {
  username: string;
  elo: number;
  weeklyElo: number;
  matches: number;
  averageTotal: number;
  averageCount: number;
  platforms: Map<string, number>;
};

let cache: { expiresAt: number; data: WeeklyLeaderboardResponse } | null = null;

function platformLabel(value: string | null | undefined): WeeklyPlayer['platform'] {
  switch (value?.toLowerCase()) {
    case 'scolia': return 'Scolia';
    case 'autodarts': return 'AutoDarts';
    case 'dartcounter': return 'DartCounter';
    default: return '—';
  }
}

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json(cache.data, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  }

  try {
    const admin = createAdminClient();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { data: seasonRows, error: seasonError } = await admin.rpc('get_public_ranked_seasons');
    if (seasonError) throw seasonError;

    const seasons = (seasonRows ?? []) as SeasonRow[];
    const season = seasons.find((entry) => entry.is_current) ?? seasons[0];
    if (!season) {
      const empty: WeeklyLeaderboardResponse = {
        season_label: '',
        period_start: weekAgo.toISOString(),
        period_end: now.toISOString(),
        players: [],
      };
      cache = { expiresAt: Date.now() + 60_000, data: empty };
      return NextResponse.json(empty, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      });
    }

    const { data: publicRows, error: playersError } = await admin.rpc('get_public_season_leaderboard', {
      p_season_label: season.season_label,
      p_min_games: 10,
    });
    if (playersError) throw playersError;

    const publicPlayers = (publicRows ?? []) as PublicPlayerRow[];
    const playersById = new Map<string, PublicPlayerRow>(
      publicPlayers
        .filter((player) => player.supabase_id && player.username)
        .map((player): [string, PublicPlayerRow] => [player.supabase_id, player]),
    );
    const ids = [...playersById.keys()];
    const periodStart = new Date(Math.max(weekAgo.getTime(), new Date(season.season_started_at).getTime()));
    const aggregates = new Map<string, PlayerAggregate>();

    // Keep each PostgREST `in` filter small. These IDs come only from the public
    // leaderboard RPC, which already excludes hidden profiles.
    const idChunks: string[][] = [];
    for (let index = 0; index < ids.length; index += 100) idChunks.push(ids.slice(index, index + 100));

    await Promise.all(idChunks.map(async (idChunk) => {
      let offset = 0;
      const pageSize = 1000;
      const maxPages = 5;

      for (let page = 0; page < maxPages; page += 1) {
        const { data, error } = await admin
          .from('matches')
          .select('id, user_id, elo_change, my_average, app, completed_at')
          .in('user_id', idChunk)
          .eq('status', 'completed')
          .or('match_mode.eq.ranked,match_mode.is.null')
          .gte('completed_at', periodStart.toISOString())
          .lte('completed_at', now.toISOString())
          .order('completed_at', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;
        const rows = (data ?? []) as MatchRow[];

        for (const match of rows) {
          const player = playersById.get(match.user_id);
          if (!player) continue;

          const aggregate = aggregates.get(match.user_id) ?? {
            username: player.username,
            elo: Number(player.elo) || 0,
            weeklyElo: 0,
            matches: 0,
            averageTotal: 0,
            averageCount: 0,
            platforms: new Map<string, number>(),
          };

          aggregate.matches += 1;
          aggregate.weeklyElo += Number(match.elo_change) || 0;
          const average = Number(match.my_average);
          if (Number.isFinite(average) && average > 0) {
            aggregate.averageTotal += average;
            aggregate.averageCount += 1;
          }
          if (match.app) aggregate.platforms.set(match.app, (aggregate.platforms.get(match.app) ?? 0) + 1);
          aggregates.set(match.user_id, aggregate);
        }

        if (rows.length < pageSize) break;
        offset += pageSize;
      }
    }));

    const ordered = [...aggregates.values()]
      .sort((a, b) => b.weeklyElo - a.weeklyElo || b.elo - a.elo || b.matches - a.matches)
      .slice(0, 5)
      .map((player, index): WeeklyPlayer => {
        const mostPlayedPlatform = [...player.platforms.entries()]
          .sort((a, b) => b[1] - a[1])[0]?.[0];

        return {
          place: index + 1,
          username: player.username,
          elo: player.elo,
          weekly_elo: Math.round(player.weeklyElo),
          matches: player.matches,
          average: player.averageCount ? Number((player.averageTotal / player.averageCount).toFixed(2)) : null,
          platform: platformLabel(mostPlayedPlatform),
        };
      });

    const result: WeeklyLeaderboardResponse = {
      season_label: season.season_label,
      period_start: periodStart.toISOString(),
      period_end: now.toISOString(),
      players: ordered,
    };
    cache = { expiresAt: Date.now() + 60_000, data: result };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('Wöchentliche Rangliste konnte nicht geladen werden', error);
    return NextResponse.json({ error: 'Die Wochenrangliste ist gerade nicht verfügbar.' }, { status: 503 });
  }
}
