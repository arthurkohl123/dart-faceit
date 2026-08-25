import { NextResponse } from 'next/server';
import { consumeRateLimit, type RateLimitScope } from '@/lib/rate-limit.ts/rate-limit';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const actions: Record<string, RateLimitScope> = {
  login: 'login',
  support: 'support',
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { action?: string; email?: string } | null;
    const scope = body?.action ? actions[body.action] : undefined;
    if (!scope) return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });

    let identifier: string | undefined;
    if (scope === 'support') {
      const supabase = await createServerSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Bitte melde dich zuerst an.' }, { status: 401 });
      identifier = user.id;
    } else {
      identifier = body?.email?.trim().toLowerCase();
    }

    const result = await consumeRateLimit(scope, request, identifier);
    if (!result.allowed) return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte versuche es in einigen Minuten erneut.' },
      { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
    );
    return NextResponse.json({ ok: true, remaining: result.remaining });
  } catch (error) {
    console.error('Rate-limit check failed:', error);
    return NextResponse.json({ error: 'Sicherheitsprüfung momentan nicht verfügbar.' }, { status: 503 });
  }
}
