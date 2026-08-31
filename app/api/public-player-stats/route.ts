import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PlayerStats = {
  average: number | null;
  bestAverage: number | null;
  total180s: number;
  matchCount: number;
};

type MutablePlayerStats = PlayerStats & { totalAverage: number; averageCount: number };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Match rows stay protected by RLS; this deliberately returns public aggregates only. */
export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value, index, values) => UUID_PATTERN.test(value) && values.indexOf(value) === index)
    .slice(0, 100);

  if (ids.length === 0) return NextResponse.json({ stats: {} });

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('matches')
      .select('user_id, my_average, one_eighties')
      .in('user_id', ids);
    if (error) throw error;

    const totals: Record<string, MutablePlayerStats> = {};
    for (const id of ids) {
      totals[id] = { average: null, bestAverage: null, total180s: 0, matchCount: 0, totalAverage: 0, averageCount: 0 };
    }
    for (const match of data ?? []) {
      const entry = totals[String(match.user_id)];
      if (!entry) continue;
      entry.matchCount += 1;
      entry.total180s += Number(match.one_eighties ?? 0);
      const average = Number(match.my_average);
      if (Number.isFinite(average) && average >= 0) {
        entry.totalAverage += average;
        entry.averageCount += 1;
        entry.bestAverage = Math.max(entry.bestAverage ?? average, average);
      }
    }

    const stats: Record<string, PlayerStats> = {};
    for (const [id, entry] of Object.entries(totals)) {
      stats[id] = {
        average: entry.averageCount ? entry.totalAverage / entry.averageCount : null,
        bestAverage: entry.bestAverage,
        total180s: entry.total180s,
        matchCount: entry.matchCount,
      };
    }
    return NextResponse.json(
      { stats },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    );
  } catch (error) {
    console.error('Public player statistics could not be loaded', error);
    return NextResponse.json({ error: 'Statistiken sind gerade nicht verfügbar.' }, { status: 503 });
  }
}
