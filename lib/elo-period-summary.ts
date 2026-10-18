export type EloPeriod = '24h' | '7d' | '30d' | '90d';
export type EloRange = EloPeriod | 'all';

export type EloPeriodMatch = {
  id?: string;
  created_at: string;
  completed_at?: string | null;
  elo_change: number | null;
  match_mode?: 'ranked' | 'private' | null;
  opponent_name?: string | null;
};

export const eloPeriodMeta: Record<EloPeriod, { label: string; hours: number; description: string }> = {
  '24h': { label: '24 Stunden', hours: 24, description: 'letzten 24 Stunden' },
  '7d': { label: '7 Tage', hours: 24 * 7, description: 'letzten 7 Tagen' },
  '30d': { label: '30 Tage', hours: 24 * 30, description: 'letzten 30 Tagen' },
  '90d': { label: '90 Tage', hours: 24 * 90, description: 'letzten 90 Tagen' },
};

export type EloPeriodSummary = {
  ratedMatches: number;
  gained: number;
  lost: number;
  net: number;
};

export type EloTrendPoint = {
  timestamp: string;
  cumulative: number;
  eloChange: number;
};

export type EloHighlight = {
  value: number;
  opponentName: string | null;
  timestamp: string;
};

export type EloPeriodInsights = {
  summary: EloPeriodSummary;
  points: EloTrendPoint[];
  startAt: string;
  endAt: string;
  largestGain: EloHighlight | null;
  largestLoss: EloHighlight | null;
};

type RatedEloMatch = {
  timestamp: number;
  timestampValue: string;
  change: number;
  opponentName: string | null;
  order: number;
};

function getEligibleEloMatches(matches: EloPeriodMatch[], period: EloRange, now: Date): RatedEloMatch[] {
  const nowTimestamp = now.getTime();
  const periodStart = period === 'all' ? Number.NEGATIVE_INFINITY : nowTimestamp - eloPeriodMeta[period].hours * 60 * 60 * 1000;

  return matches.reduce<RatedEloMatch[]>((events, match, order) => {
    if (match.match_mode === 'private') return events;

    const timestampValue = match.completed_at ?? match.created_at;
    const timestamp = new Date(timestampValue).getTime();
    const change = Number(match.elo_change ?? 0);
    if (!Number.isFinite(timestamp) || timestamp < periodStart || timestamp > nowTimestamp || !Number.isFinite(change) || change === 0) return events;

    events.push({ timestamp, timestampValue, change, opponentName: match.opponent_name ?? null, order });
    return events;
  }, []).sort((left, right) => left.timestamp - right.timestamp || left.order - right.order);
}

export function getEloPeriodInsights(matches: EloPeriodMatch[], period: EloRange, now = new Date()): EloPeriodInsights {
  const nowTimestamp = now.getTime();
  const events = getEligibleEloMatches(matches, period, now);
  const startTimestamp = period === 'all'
    ? events[0]?.timestamp ?? nowTimestamp
    : nowTimestamp - eloPeriodMeta[period].hours * 60 * 60 * 1000;
  const summary: EloPeriodSummary = { ratedMatches: 0, gained: 0, lost: 0, net: 0 };
  const points: EloTrendPoint[] = [{ timestamp: new Date(startTimestamp).toISOString(), cumulative: 0, eloChange: 0 }];
  let largestGain: EloHighlight | null = null;
  let largestLoss: EloHighlight | null = null;

  for (const event of events) {
    summary.ratedMatches += 1;
    summary.net += event.change;
    if (event.change > 0) {
      summary.gained += event.change;
      if (!largestGain || event.change > largestGain.value) largestGain = { value: event.change, opponentName: event.opponentName, timestamp: event.timestampValue };
    } else {
      const loss = Math.abs(event.change);
      summary.lost += loss;
      if (!largestLoss || loss > largestLoss.value) largestLoss = { value: loss, opponentName: event.opponentName, timestamp: event.timestampValue };
    }
    points.push({ timestamp: event.timestampValue, cumulative: summary.net, eloChange: event.change });
  }

  if (points[points.length - 1].timestamp !== now.toISOString()) points.push({ timestamp: now.toISOString(), cumulative: summary.net, eloChange: 0 });

  return {
    summary,
    points,
    startAt: new Date(startTimestamp).toISOString(),
    endAt: now.toISOString(),
    largestGain,
    largestLoss,
  };
}

export function getEloPeriodSummary(matches: EloPeriodMatch[], period: EloRange, now = new Date()): EloPeriodSummary {
  return getEloPeriodInsights(matches, period, now).summary;
}

