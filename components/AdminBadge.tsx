import { ShieldCheck } from 'lucide-react';

type AdminBadgeProps = {
  compact?: boolean;
  className?: string;
};

export function AdminBadge({ compact = false, className = '' }: AdminBadgeProps) {
  return (
    <span
      title="Offizielles RankedDarts-Teammitglied"
      className={`inline-flex shrink-0 items-center border border-violet-300/35 bg-gradient-to-r from-violet-400/15 via-fuchsia-400/10 to-cyan-400/10 font-black uppercase text-violet-100 shadow-[0_0_24px_rgba(167,139,250,0.14)] ${
        compact
          ? 'gap-1 rounded-full px-2 py-0.5 text-[8px] tracking-[0.12em] sm:text-[9px]'
          : 'gap-1.5 rounded-full px-3 py-1 text-[10px] tracking-[0.16em] sm:text-xs'
      } ${className}`}
    >
      <ShieldCheck className={compact ? 'h-3 w-3 text-violet-300' : 'h-3.5 w-3.5 text-violet-300'} />
      {compact ? 'Admin' : 'RankedDarts Admin'}
    </span>
  );
}
