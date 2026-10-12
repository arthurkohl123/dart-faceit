import { NextResponse } from 'next/server';
import { monitoringErrorMessage, recordMonitoringEvent } from '@/lib/monitoring';
import { consumeRateLimit } from '@/lib/rate-limit';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedEvents = new Set([
  'matchmaking_accept_error',
  'matchmaking_decline_error',
  'matchmaking_queue_error',
  'matchmaking_cancel_error',
  'matchmaking_heartbeat_error',
  'matchmaking_activate_error',
  'matchmaking_result_submit_error',
  'matchmaking_expire_error',
  'client_runtime_error',
  'client_chunk_load_error',
]);

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rateLimit = await consumeRateLimit('monitoring', request, user.id);
    if (!rateLimit.allowed) return NextResponse.json({ accepted: false }, { status: 429 });

    const body = await request.json().catch(() => null) as {
      eventType?: string;
      message?: string;
      context?: Record<string, unknown>;
    } | null;
    if (!body?.eventType || !allowedEvents.has(body.eventType)) {
      return NextResponse.json({ error: 'Invalid monitoring event' }, { status: 400 });
    }

    const context = body.context && typeof body.context === 'object' && !Array.isArray(body.context)
      ? body.context
      : {};
    const serializedContext = JSON.stringify(context);
    const source = body.eventType.startsWith('client_') ? 'frontend' : 'matchmaking';
    const matchId = typeof context.match_id === 'string' ? context.match_id : 'global';
    await recordMonitoringEvent({
      source,
      eventType: body.eventType,
      severity: body.eventType === 'client_chunk_load_error' ? 'warning' : 'error',
      message: monitoringErrorMessage(body.message),
      fingerprint: `${source}:${body.eventType}:${matchId}`,
      context: serializedContext.length <= 2_000 ? context : {},
    });

    return NextResponse.json({ accepted: true });
  } catch (error) {
    console.error('Client monitoring endpoint failed:', error);
    return NextResponse.json({ accepted: false }, { status: 503 });
  }
}
