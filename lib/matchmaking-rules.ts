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

export type NextEloSearchExpansion = {
  atSeconds: number;
  range: number;
};

/**
 * Returns the next point at which the ranked search window widens. Keeping
 * this next to getMaxEloDiff prevents the UI from promising a different
 * search cadence than the database matcher actually uses.
 */
export function getNextEloSearchExpansion(seconds: number): NextEloSearchExpansion | null {
  const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const nextAt = [15, 30, 60, 90, 120].find((boundary) => elapsed < boundary);

  if (nextAt === undefined) return null;

  return {
    atSeconds: nextAt,
    range: getMaxEloDiff(nextAt),
  };
}

export function getDailyMatchesUsed(quota: DailyMatchQuota | null): number {
  if (!quota) return 0;

  const value = quota.matches_used ?? quota.matches_started ?? quota.matches_played ?? 0;
  return Number.isFinite(Number(value)) ? Math.max(Number(value), 0) : 0;
}

export function hasReachedDailyMatchLimit(quota: DailyMatchQuota | null): boolean {
  // A null limit is the server's explicit "unlimited" signal. This is used
  // both for Premium and for the active Wednesday Showdown; never turn it
  // back into four matches on the client or Free users would be blocked even
  // though the database correctly allows the match.
  if (!quota || quota.is_premium || quota.daily_limit === null) return false;
  return getDailyMatchesUsed(quota) >= (quota.daily_limit ?? FREE_DAILY_MATCH_LIMIT);
}
