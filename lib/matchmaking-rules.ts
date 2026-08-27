export const FREE_DAILY_MATCH_LIMIT = 4;

export type DailyMatchQuota = {
  matches_used?: number;
  matches_started?: number;
  matches_played?: number;
  daily_limit?: number | null;
  is_premium: boolean;
};

export function getMaxEloDiff(seconds: number): number {
  // Keep the first minute deliberately tight; the matcher always prefers the
  // smallest Elo distance inside this radius. Expand slowly only when needed.
  if (seconds < 20) return 25;
  if (seconds < 40) return 50;
  if (seconds < 60) return 100;
  return 150;
}

export function getDailyMatchesUsed(quota: DailyMatchQuota | null): number {
  if (!quota) return 0;

  const value = quota.matches_used ?? quota.matches_started ?? quota.matches_played ?? 0;
  return Number.isFinite(Number(value)) ? Math.max(Number(value), 0) : 0;
}

export function hasReachedDailyMatchLimit(quota: DailyMatchQuota | null): boolean {
  if (!quota || quota.is_premium) return false;
  return getDailyMatchesUsed(quota) >= (quota.daily_limit ?? FREE_DAILY_MATCH_LIMIT);
}
