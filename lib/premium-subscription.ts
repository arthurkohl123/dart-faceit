export type PremiumSubscriptionData = {
  isPremium?: boolean | null;
  stripe_subscription_status?: string | null;
  stripe_current_period_end?: string | null;
  stripe_cancel_at_period_end?: boolean | null;
  premium_manual_granted_at?: string | null;
  premium_manual_until?: string | null;
};

export type PremiumSubscriptionState =
  | { kind: 'none' }
  | { kind: 'syncing' }
  | { kind: 'stale'; periodEnd: string }
  | { kind: 'renewing'; periodEnd: string }
  | { kind: 'ending'; periodEnd: string };

export type ManualPremiumState =
  | { kind: 'none' }
  | { kind: 'unlimited' }
  | { kind: 'ending'; periodEnd: string };

const ACTIVE_STRIPE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);
const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;

function hasFutureDate(value: string | null | undefined, now: Date) {
  if (!value) return false;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function getPremiumSubscriptionState(
  subscription: PremiumSubscriptionData | null | undefined,
  now = new Date(),
): PremiumSubscriptionState {
  if (!ACTIVE_STRIPE_SUBSCRIPTION_STATUSES.has(subscription?.stripe_subscription_status || '')) {
    return { kind: 'none' };
  }

  const periodEnd = subscription?.stripe_current_period_end;
  if (!periodEnd) {
    return { kind: 'syncing' };
  }

  const periodEndTimestamp = new Date(periodEnd).getTime();
  if (!Number.isFinite(periodEndTimestamp)) return { kind: 'syncing' };
  if (periodEndTimestamp <= now.getTime()) return { kind: 'stale', periodEnd };

  return subscription?.stripe_cancel_at_period_end
    ? { kind: 'ending', periodEnd }
    : { kind: 'renewing', periodEnd };
}

export function getManualPremiumState(
  subscription: PremiumSubscriptionData | null | undefined,
  now = new Date(),
): ManualPremiumState {
  if (!subscription?.isPremium || !subscription.premium_manual_granted_at) {
    return { kind: 'none' };
  }

  const periodEnd = subscription.premium_manual_until;
  if (!periodEnd) return { kind: 'unlimited' };
  if (!hasFutureDate(periodEnd, now)) return { kind: 'none' };

  return { kind: 'ending', periodEnd };
}

export function formatPremiumTimeRemaining(periodEnd: string, now = new Date()) {
  const remaining = new Date(periodEnd).getTime() - now.getTime();
  if (!Number.isFinite(remaining) || remaining <= 0) return null;

  const roundedUpMinutes = Math.ceil(remaining / MINUTE_IN_MS);
  const days = Math.floor(roundedUpMinutes / (DAY_IN_MS / MINUTE_IN_MS));
  const hours = Math.floor((roundedUpMinutes % (DAY_IN_MS / MINUTE_IN_MS)) / (HOUR_IN_MS / MINUTE_IN_MS));

  if (days > 0) {
    return hours > 0
      ? `noch ${days} ${days === 1 ? 'Tag' : 'Tage'}, ${hours} Std.`
      : `noch ${days} ${days === 1 ? 'Tag' : 'Tage'}`;
  }

  if (hours > 0) return `noch ${hours} Std.`;
  return `noch ${Math.max(1, roundedUpMinutes)} Min.`;
}

