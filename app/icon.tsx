import { ImageResponse } from 'next/og';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#07100d', borderRadius: 14 }}>
        <svg width="58" height="58" viewBox="0 0 64 64" fill="none">
          <defs>
            <linearGradient id="board" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
              <stop stopColor="#a3ff4e" /><stop offset=".46" stopColor="#35d787" /><stop offset="1" stopColor="#08765a" />
            </linearGradient>
            <linearGradient id="dart" x1="40" y1="8" x2="26" y2="43" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f7ffe8" /><stop offset=".45" stopColor="#c8ffc1" /><stop offset="1" stopColor="#58e59d" />
            </linearGradient>
          </defs>
          <circle cx="31" cy="33" r="24" fill="#05110d" stroke="url(#board)" strokeWidth="2.7" />
          <circle cx="31" cy="33" r="17.5" stroke="#35d787" strokeWidth="4.7" opacity=".76" />
          <circle cx="31" cy="33" r="9.4" stroke="#9cff58" strokeWidth="4.3" opacity=".86" />
          <circle cx="31" cy="33" r="3.8" fill="#baff6b" />
          <g stroke="#40d89a" strokeWidth="1.35" opacity=".58"><path d="M31 9v10.7M31 46.3V57M7 33h10.7M44.3 33H55" /><path d="m14 16 7.55 7.55M40.45 42.45 48 50M14 50l7.55-7.55M40.45 23.55 48 16" /></g>
          <g transform="rotate(23 34 29)"><path d="M34 8 39.6 18 36 21.6 31.5 17.1Z" fill="#9cff58" /><path d="m31.5 17.1 4.5 4.5-9.6 21.1-3.2-3.2Z" fill="url(#dart)" stroke="#d9ffd0" strokeWidth=".8" /><path d="m23.2 42.8 3.2-3.2-1.8 5.9Z" fill="#f4fff0" /></g>
        </svg>
      </div>
    ),
    size,
  );
}
