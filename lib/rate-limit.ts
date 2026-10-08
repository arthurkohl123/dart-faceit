import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase-admin';

export const RATE_LIMITS = {
  login: { limit: 8, windowSeconds: 15 * 60 },
  resend_confirmation: { limit: 3, windowSeconds: 15 * 60 },
  support: { limit: 8, windowSeconds: 10 * 60 },
  checkout: { limit: 3, windowSeconds: 15 * 60 },
  monitoring: { limit: 20, windowSeconds: 10 * 60 },
  account: { limit: 5, windowSeconds: 60 * 60 },
} as const;

export type RateLimitScope = keyof typeof RATE_LIMITS;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';

  return request.headers.get('x-real-ip')
    || request.headers.get('cf-connecting-ip')
    || 'unknown';
}

function hashRateLimitKey(scope: RateLimitScope, subject: string) {
  return createHash('sha256')
    .update(`rankeddarts:v2:${scope}:${subject}`)
    .digest('hex');
}
function getPrivacySafeDeviceSignal(request: Request) {
  const userAgent = request.headers.get('user-agent')?.trim();
  return userAgent ? `device:${getClientIp(request)}:${userAgent.slice(0, 256)}` : null;
}

export async function consumeRateLimit(
  scope: RateLimitScope,
  request: Request,
  identifier?: string,
): Promise<RateLimitResult> {
  const policy = RATE_LIMITS[scope];
  // An IP bucket blocks broad automated attacks; a second account/email bucket
  // prevents a user from simply changing networks to reset their attempts.
  const subjects = [`ip:${getClientIp(request)}`];
  if (identifier?.trim()) subjects.push(`account:${identifier.trim().toLowerCase()}`);
  // Login and confirmation resend requests can legitimately come from shared
  // networks. The account bucket remains strict, while the IP bucket gets a
  // higher ceiling so one household, club or office cannot block everyone.
  const deviceSignal = scope === 'login' || scope === 'resend_confirmation'
    ? null
    : getPrivacySafeDeviceSignal(request);
  if (deviceSignal) subjects.push(deviceSignal);

  const results = await Promise.all(subjects.map(async (subject) => {
    const subjectPolicy = (scope === 'login' || scope === 'resend_confirmation') && subject.startsWith('ip:')
      ? { ...policy, limit: scope === 'login' ? 30 : 15 }
      : policy;
    const { data, error } = await createAdminClient().rpc('consume_rate_limit', {
      p_key: hashRateLimitKey(scope, subject),
      p_limit: subjectPolicy.limit,
      p_window_seconds: subjectPolicy.windowSeconds,
    });

    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== 'boolean') throw new Error('Rate-limit response is invalid.');

    return {
      allowed: row.allowed,
      remaining: Number(row.remaining ?? 0),
      retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds ?? subjectPolicy.windowSeconds)),
    } satisfies RateLimitResult;
  }));

  return {
    allowed: results.every((result) => result.allowed),
    remaining: Math.min(...results.map((result) => result.remaining)),
    retryAfterSeconds: Math.max(...results.map((result) => result.retryAfterSeconds)),
  };
}
