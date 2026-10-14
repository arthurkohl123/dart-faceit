import type { MetadataRoute } from 'next';

const siteUrl = 'https://www.rankeddarts.de';

const publicRoutes: Array<{
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;
  priority: number;
}> = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/leaderboard', changeFrequency: 'daily', priority: 0.9 },
  { path: '/matchmaking', changeFrequency: 'daily', priority: 0.9 },
  { path: '/tournaments', changeFrequency: 'daily', priority: 0.9 },
  { path: '/updates', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/getting-started', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/premium', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/fairplay', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/turnierregeln', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/impressum', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/datenschutz', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/agb', changeFrequency: 'yearly', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map(({ path, changeFrequency, priority }) => ({
    url: `${siteUrl}${path}`,
    changeFrequency,
    priority,
  }));
}

