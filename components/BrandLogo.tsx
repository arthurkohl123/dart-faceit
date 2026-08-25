type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className = 'h-10 w-10' }: BrandLogoProps) {
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-emerald-300/25 bg-[#07100d] shadow-[0_0_30px_rgba(52,211,153,0.2)] ${className}`} aria-label="RankedDarts">
      <svg viewBox="0 0 64 64" className="h-full w-full p-[7%]" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="rd-board" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
            <stop stopColor="#a3ff4e" />
            <stop offset="0.46" stopColor="#35d787" />
            <stop offset="1" stopColor="#08765a" />
          </linearGradient>
          <linearGradient id="rd-dart" x1="40" y1="8" x2="26" y2="43" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f7ffe8" />
            <stop offset="0.45" stopColor="#c8ffc1" />
            <stop offset="1" stopColor="#58e59d" />
          </linearGradient>
          <filter id="rd-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx="31" cy="33" r="24" fill="#05110d" stroke="url(#rd-board)" strokeWidth="2.7" />
        <circle cx="31" cy="33" r="17.5" fill="none" stroke="#35d787" strokeOpacity=".76" strokeWidth="4.7" />
        <circle cx="31" cy="33" r="9.4" fill="none" stroke="#9cff58" strokeOpacity=".86" strokeWidth="4.3" />
        <circle cx="31" cy="33" r="3.8" fill="#baff6b" filter="url(#rd-glow)" />
        <g stroke="#40d89a" strokeOpacity=".58" strokeWidth="1.35">
          <path d="M31 9v10.7M31 46.3V57M7 33h10.7M44.3 33H55" />
          <path d="m14 16 7.55 7.55M40.45 42.45 48 50M14 50l7.55-7.55M40.45 23.55 48 16" />
        </g>
        <g transform="rotate(23 34 29)" filter="url(#rd-glow)">
          <path d="M34 8 39.6 18 36 21.6 31.5 17.1Z" fill="#9cff58" />
          <path d="m31.5 17.1 4.5 4.5-9.6 21.1-3.2-3.2Z" fill="url(#rd-dart)" stroke="#d9ffd0" strokeWidth=".8" />
          <path d="m23.2 42.8 3.2-3.2-1.8 5.9Z" fill="#f4fff0" />
        </g>
      </svg>
    </span>
  );
}
