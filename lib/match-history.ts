import { eloPeriodMeta, type EloPeriod } from './elo-period-summary.ts';

export type MatchHistoryPlatform = 'scolia' | 'dartcounter' | 'autodarts';
export type MatchHistoryResultFilter = 'all' | 'wins' | 'losses';
export type MatchHistoryModeFilter = 'all' | 'ranked' | 'private';
export type MatchHistoryPeriod = 'all' | EloPeriod;

export type MatchHistoryEntry = {
  id: string;
  created_at: string;
  completed_at?: string | null;
  opponent_name: string | null;
  opponent_elo: number | null;
  is_win: boolean;
  result: string | null;
  legs_won: number | null;
  legs_lost: number | null;
  my_average: number | null;
  highest_checkout: number | null;
  elo_change: number | null;
  one_eighties?: number | null;
  app?: MatchHistoryPlatform | null;
  match_mode?: 'ranked' | 'private' | null;
};

export type MatchHistoryFilters = {
  result: MatchHistoryResultFilter;
  mode: MatchHistoryModeFilter;
  platform: 'all' | MatchHistoryPlatform;
  period: MatchHistoryPeriod;
  opponentQuery: string;
};

export function getMatchFinishedAt(match: Pick<MatchHistoryEntry, 'created_at' | 'completed_at'>) {
  return match.completed_at ?? match.created_at;
}

export function isMatchInPeriod(match: Pick<MatchHistoryEntry, 'created_at' | 'completed_at'>, period: MatchHistoryPeriod, now = new Date()) {
  const timestamp = new Date(getMatchFinishedAt(match)).getTime();
  const nowTimestamp = now.getTime();
  if (!Number.isFinite(timestamp) || timestamp > nowTimestamp) return false;
  if (period === 'all') return true;
  return timestamp >= nowTimestamp - eloPeriodMeta[period].hours * 60 * 60 * 1000;
}

export function filterMatchHistory(matches: MatchHistoryEntry[], filters: MatchHistoryFilters, now = new Date()) {
  const opponentQuery = filters.opponentQuery.trim().toLocaleLowerCase('de-DE');

  return matches.filter((match) => {
    if (!isMatchInPeriod(match, filters.period, now)) return false;
    if (filters.result === 'wins' && !match.is_win) return false;
    if (filters.result === 'losses' && match.is_win) return false;
    if (filters.mode !== 'all' && (match.match_mode === 'private' ? 'private' : 'ranked') !== filters.mode) return false;
    if (filters.platform !== 'all' && match.app !== filters.platform) return false;
    return !opponentQuery || (match.opponent_name || '').toLocaleLowerCase('de-DE').includes(opponentQuery);
  });
}

