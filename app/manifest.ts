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
    icons: [
      { src: '/logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
