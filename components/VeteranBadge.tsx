import { Medal } from 'lucide-react';

type VeteranBadgeProps = {
  compact?: boolean;
  games?: number | null;
  className?: string;
};

export function VeteranBadge({ compact = false, games, className = '' }: VeteranBadgeProps) {
  const title = games && games > 0
    ? `Season-01-Veteran · ${games} bestätigte Ranked-Matches`
    : 'Season-01-Veteran · mindestens 150 bestätigte Ranked-Matches';

  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center border border-amber-200/45 bg-gradient-to-r from-amber-300/20 via-yellow-200/10 to-orange-300/10 font-black uppercase text-amber-100 shadow-[0_0_24px_rgba(252,211,77,0.16)] ${
        compact
          ? 'gap-1 rounded-full px-2 py-0.5 text-[8px] tracking-[0.12em] sm:text-[9px]'
          : 'gap-1.5 rounded-full px-3 py-1 text-[10px] tracking-[0.16em] sm:text-xs'
      } ${className}`}
    >
      <Medal className={compact ? 'h-3 w-3 text-amber-200' : 'h-3.5 w-3.5 text-amber-200'} />
      Veteran{compact ? '' : ' · S1'}
    </span>
  );
}
