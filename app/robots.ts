import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

// This deployment now serves the ADMIN app at app.martelounge.ge (private,
// login-gated). Keep the whole subdomain out of search — public SEO is owned by
// the marketing site at martelounge.ge (separate repo `martelounge-site`).
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] }
}
