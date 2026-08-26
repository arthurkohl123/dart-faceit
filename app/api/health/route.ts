import { NextResponse } from 'next/server';
import { getHealthHttpStatus, getOverallHealth, type HealthState } from '@/lib/health';
import { recordMonitoringEvent } from '@/lib/monitoring';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckResult = { status: HealthState; latencyMs: number; message?: string };
type HealthPayload = {
  status: HealthState;
  checkedAt: string;
  environment: string;
  region: string;
  commit: string | null;
  checks: { database: CheckResult; stripe: CheckResult; deployment: CheckResult };
};

let cache: { expiresAt: number; payload: HealthPayload } | null = null;

async function databaseCheck(): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    const { error } = await createAdminClient().from('monitoring_events').select('id').limit(1);
    if (error) throw error;
    return { status: 'ok', latencyMs: Date.now() - startedAt };
  } catch {
    return { status: 'down', latencyMs: Date.now() - startedAt, message: 'Datenbank nicht erreichbar' };
  }
}

async function stripeCheck(): Promise<CheckResult> {
  const startedAt = Date.now();
  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
  if (!secret || !priceId) {
    return { status: 'down', latencyMs: 0, message: 'Stripe-Konfiguration unvollständig' };
  }

  try {
    const response = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error(`Stripe status ${response.status}`);
    return { status: 'ok', latencyMs: Date.now() - startedAt };
  } catch {
    return { status: 'down', latencyMs: Date.now() - startedAt, message: 'Stripe nicht erreichbar' };
  }
}

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json(cache.payload, {
      status: getHealthHttpStatus(cache.payload.status),
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const [database, stripe] = await Promise.all([databaseCheck(), stripeCheck()]);
  const deployment: CheckResult = process.env.VERCEL
    ? { status: 'ok', latencyMs: 0 }
    : { status: 'degraded', latencyMs: 0, message: 'Außerhalb von Vercel ausgeführt' };
  const status = getOverallHealth([database.status, stripe.status, deployment.status]);
  const payload: HealthPayload = {
    status,
    checkedAt: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    region: process.env.VERCEL_REGION || 'local',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
    checks: { database, stripe, deployment },
  };
  cache = { expiresAt: Date.now() + 30_000, payload };

  if (status !== 'ok' && database.status === 'ok') {
    await recordMonitoringEvent({
      source: 'health',
      eventType: 'health_check_degraded',
      severity: status === 'down' ? 'critical' : 'warning',
      message: 'Der Produktions-Health-Check meldet einen beeinträchtigten Dienst.',
      fingerprint: `health:${status}:${stripe.status}:${deployment.status}`,
      context: { stripe: stripe.status, deployment: deployment.status },
    });
  }

  return NextResponse.json(payload, {
    status: getHealthHttpStatus(status),
    headers: { 'Cache-Control': 'no-store' },
  });
}

