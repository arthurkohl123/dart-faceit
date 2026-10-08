import Image from 'next/image';
import type { RankTier } from '@/lib/ranks';

type RankBadgeProps = {
  level: number | RankTier;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  priority?: boolean;
};

const sizeClasses = {
  xs: 'h-7 w-7',
  sm: 'h-10 w-10',
  md: 'h-14 w-14',
  lg: 'h-20 w-20',
  xl: 'h-28 w-28',
} as const;

function getLevel(level: RankBadgeProps['level']) {
  return typeof level === 'number' ? level : level.level;
}

export function RankBadge({ level, size = 'md', className = '', priority = false }: RankBadgeProps) {
  const safeLevel = Math.min(Math.max(Math.round(getLevel(level)), 1), 10);
  const label = `Rangabzeichen Level ${safeLevel}`;

  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${sizeClasses[size]} ${className}`}>
      <Image
        src={`/ranks/rank-${String(safeLevel).padStart(2, '0')}.png`}
        alt={label}
        width={112}
        height={144}
        priority={priority}
        className="h-full w-full object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,.4)]"
      />
    </span>
  );
}
