import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CommunityStats = {
  players: number;
  matches: number;
  cups: number;
  liveCups: number;
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
    const [playersResult, matchesResult, cupsResult, liveCupsResult] = await Promise.all([
      admin.from('profiles').select('*', { count: 'exact', head: true }),
      admin.from('active_matches').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      admin.from('tournaments').select('*', { count: 'exact', head: true }),
      admin.from('tournaments').select('*', { count: 'exact', head: true }).eq('status', 'live'),
    ]);

    const error = [playersResult.error, matchesResult.error, cupsResult.error, liveCupsResult.error].find(Boolean);
    if (error) throw error;

    const stats: CommunityStats = {
      players: playersResult.count ?? 0,
      matches: matchesResult.count ?? 0,
      cups: cupsResult.count ?? 0,
      liveCups: liveCupsResult.count ?? 0,
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
