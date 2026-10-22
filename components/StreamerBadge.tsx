import { Radio } from 'lucide-react';

type StreamerBadgeProps = {
  compact?: boolean;
  className?: string;
};

export function StreamerBadge({ compact = false, className = '' }: StreamerBadgeProps) {
  return (
    <span
      title="Offizieller RankedDarts-Streamer"
      className={`inline-flex shrink-0 items-center border border-rose-300/35 bg-gradient-to-r from-rose-400/15 via-fuchsia-400/10 to-violet-400/10 font-black uppercase text-rose-100 shadow-[0_0_24px_rgba(251,113,133,0.14)] ${
        compact
          ? 'gap-1 rounded-full px-2 py-0.5 text-[8px] tracking-[0.12em] sm:text-[9px]'
          : 'gap-1.5 rounded-full px-3 py-1 text-[10px] tracking-[0.16em] sm:text-xs'
      } ${className}`}
    >
      <Radio className={compact ? 'h-3 w-3 text-rose-300' : 'h-3.5 w-3.5 text-rose-300'} />
      Streamer
    </span>
  );
}
