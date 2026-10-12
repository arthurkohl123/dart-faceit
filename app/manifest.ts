import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RankedDarts',
    short_name: 'RankedDarts',
    description: 'Faire Darts-Matches, Turniere und Elo-Ranking über Scolia, DartCounter und AutoDarts.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#050607',
    theme_color: '#050607',
    orientation: 'any',
    lang: 'de-DE',
    categories: ['sports', 'games'],
    // Keep the installed PWA icon aligned with the current RankedDarts mark.
    // The version query also nudges mobile browsers to refresh an icon that was
    // cached from an earlier installation.
    icons: [
      { src: '/rankeddarts-logo-mark.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/rankeddarts-logo-mark.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
