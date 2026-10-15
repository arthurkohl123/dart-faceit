export type EloPeriod = '24h' | '7d' | '30d';

export type EloPeriodMatch = {
  created_at: string;
  completed_at?: string | null;
  elo_change: number | null;
  match_mode?: 'ranked' | 'private' | null;
};

export const eloPeriodMeta: Record<EloPeriod, { label: string; hours: number; description: string }> = {
  '24h': { label: '24 Stunden', hours: 24, description: 'letzten 24 Stunden' },
  '7d': { label: '7 Tage', hours: 24 * 7, description: 'letzten 7 Tagen' },
  '30d': { label: '30 Tage', hours: 24 * 30, description: 'letzten 30 Tagen' },
};

export type EloPeriodSummary = {
  ratedMatches: number;
  gained: number;
  lost: number;
  net: number;
};

export function getEloPeriodSummary(matches: EloPeriodMatch[], period: EloPeriod, now = new Date()): EloPeriodSummary {
  const start = now.getTime() - eloPeriodMeta[period].hours * 60 * 60 * 1000;

  return matches.reduce<EloPeriodSummary>((summary, match) => {
    if (match.match_mode === 'private') return summary;

    const completedAt = new Date(match.completed_at ?? match.created_at).getTime();
    const eloChange = Number(match.elo_change ?? 0);
    if (!Number.isFinite(completedAt) || completedAt < start || completedAt > now.getTime() || !Number.isFinite(eloChange) || eloChange === 0) return summary;

    summary.ratedMatches += 1;
    summary.net += eloChange;
    if (eloChange > 0) summary.gained += eloChange;
    else summary.lost += Math.abs(eloChange);
    return summary;
  }, { ratedMatches: 0, gained: 0, lost: 0, net: 0 });
}

