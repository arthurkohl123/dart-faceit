import type { MetadataRoute } from 'next';

const siteUrl = 'https://www.rankeddarts.de';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin/',
        '/api/',
        '/account/',
        '/auth/',
        '/developer/',
        '/friends/',
        '/history/',
        '/maintenance/',
        '/messages/',
        '/moderator/',
        '/notifications/',
        '/offline/',
        '/profile/',
        '/result/',
        '/showdown/',
        '/support/',
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

