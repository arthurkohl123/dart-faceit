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
  'client_runtime_error',
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

    const serializedContext = JSON.stringify(body.context ?? {});
    const source = body.eventType === 'client_runtime_error' ? 'frontend' : 'matchmaking';
    await recordMonitoringEvent({
      source,
      eventType: body.eventType,
      severity: 'error',
      message: monitoringErrorMessage(body.message),
      fingerprint: `${source}:${body.eventType}`,
      context: serializedContext.length <= 2_000 ? body.context : {},
    });

    return NextResponse.json({ accepted: true });
  } catch (error) {
    console.error('Client monitoring endpoint failed:', error);
    return NextResponse.json({ accepted: false }, { status: 503 });
  }
}
