import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

// Admin subdomain (app.martelounge.ge) is fully noindexed — no public sitemap.
// (Public SEO lives on the marketing site repo `martelounge-site`.)
export default function sitemap(): MetadataRoute.Sitemap {
  return []
}
