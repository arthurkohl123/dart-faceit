export const FREE_DAILY_MATCH_LIMIT = 4;

export type DailyMatchQuota = {
  matches_used?: number;
  matches_started?: number;
  matches_played?: number;
  daily_limit?: number | null;
  is_premium: boolean;
};

export function getMaxEloDiff(seconds: number): number {
  // Start with a fair, close-Elo search, but expand promptly for the current
  // smaller player base. The database matcher still picks the closest valid
  // opponent, so a wider window never replaces a nearer opponent.
  if (seconds < 15) return 50;
  if (seconds < 30) return 100;
  if (seconds < 60) return 200;
  if (seconds < 90) return 300;
  if (seconds < 120) return 400;
  return 500;
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
