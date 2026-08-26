export type RankTier = {
  level: number;
  name: string;
  badge: string;
  min: number;
  color: string;
  accent: string;
  ringColor: string;
  glowColor: string;
};

/**
 * The single source of truth for the Season 01 RankedDarts ladder.
 * Thresholds are intentionally tighter around the 1,000 Elo starting point
 * so that every promotion remains visible after a seasonal soft reset.
 */
export const RANK_TIERS: readonly RankTier[] = [
  { level: 1, name: 'Rookie',     badge: 'R1', min: 0,    color: 'text-zinc-300',    accent: 'from-zinc-400/20 to-zinc-950',    ringColor: 'border-zinc-400/40',    glowColor: 'rgba(161,161,170,0.18)' },
  { level: 2, name: 'Prospect',    badge: 'P2', min: 850,  color: 'text-amber-300',   accent: 'from-amber-500/20 to-zinc-950',   ringColor: 'border-amber-400/40',   glowColor: 'rgba(251,191,36,0.18)' },
  { level: 3, name: 'Contender',   badge: 'C3', min: 925,  color: 'text-sky-300',     accent: 'from-sky-500/20 to-zinc-950',     ringColor: 'border-sky-400/40',     glowColor: 'rgba(56,189,248,0.18)' },
  { level: 4, name: 'Challenger',  badge: 'C4',  min: 1000, color: 'text-violet-300',  accent: 'from-violet-500/20 to-zinc-950',  ringColor: 'border-violet-400/40',  glowColor: 'rgba(167,139,250,0.20)' },
  { level: 5, name: 'Elite',       badge: 'E5',  min: 1150, color: 'text-cyan-200',    accent: 'from-cyan-400/20 to-zinc-950',    ringColor: 'border-cyan-300/40',    glowColor: 'rgba(103,232,249,0.20)' },
  { level: 6, name: 'Master',      badge: 'M6',  min: 1300, color: 'text-fuchsia-200', accent: 'from-fuchsia-400/20 to-zinc-950', ringColor: 'border-fuchsia-300/40', glowColor: 'rgba(240,171,252,0.22)' },
  { level: 7, name: 'Legend',      badge: 'L7',  min: 1450, color: 'text-emerald-200', accent: 'from-emerald-300/25 to-zinc-950', ringColor: 'border-emerald-300/40', glowColor: 'rgba(110,231,183,0.24)' },
  { level: 8, name: 'Grandmaster', badge: 'G8',  min: 1600, color: 'text-blue-200',    accent: 'from-blue-400/25 to-zinc-950',    ringColor: 'border-blue-300/45',    glowColor: 'rgba(147,197,253,0.24)' },
  { level: 9, name: 'Apex',        badge: 'A9',  min: 1800, color: 'text-rose-200',    accent: 'from-rose-400/25 to-zinc-950',    ringColor: 'border-rose-300/45',    glowColor: 'rgba(253,164,175,0.26)' },
  { level: 10, name: 'Immortal',   badge: 'I10', min: 2000, color: 'text-yellow-200',  accent: 'from-yellow-300/30 to-zinc-950',  ringColor: 'border-yellow-200/50',  glowColor: 'rgba(253,224,71,0.30)' },
] as const;

export function getRankForElo(elo: number): RankTier {
  return RANK_TIERS.reduce<RankTier>(
    (current, rank) => (elo >= rank.min ? rank : current),
    RANK_TIERS[0],
  );
}

export function getRankProgress(elo: number) {
  const currentIndex = RANK_TIERS.findIndex((rank) => rank === getRankForElo(elo));
  const current = RANK_TIERS[currentIndex];
  const upcoming = RANK_TIERS[currentIndex + 1] ?? null;
  const eloToNext = upcoming ? Math.max(upcoming.min - elo, 0) : 0;
  const progress = upcoming
    ? Math.min(Math.max(((elo - current.min) / (upcoming.min - current.min)) * 100, 0), 100)
    : 100;

  return { current, upcoming, eloToNext, progress };
}

export function getRankRangeLabel(rank: RankTier): string {
  const index = RANK_TIERS.findIndex((item) => item.level === rank.level);
  const upcoming = RANK_TIERS[index + 1];
  if (!upcoming) return `${rank.min}+`;
  if (rank.level === 1) return `< ${upcoming.min}`;
  return `${rank.min} – ${upcoming.min - 1}`;
}
