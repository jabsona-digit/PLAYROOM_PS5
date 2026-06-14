import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

// Single-page marketing site → one canonical URL. (The app at /app and the
// In-Seat portal at /p are intentionally excluded — see robots.ts.)
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://martelounge.ge', changeFrequency: 'weekly', priority: 1 },
  ]
}
