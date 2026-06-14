import type { MetadataRoute } from 'next'

const BASE = 'https://martelounge.ge'

export const dynamic = 'force-static'

// martelounge.ge is the public B2B marketing site (static export). Index the
// landing; keep the gated app (/app) and the In-Seat portal (/p — needs QR
// params, no SEO value) out of the index. Block heavy AI scrapers.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/app', '/p'] },
      {
        userAgent: [
          'GPTBot', 'CCBot', 'ClaudeBot', 'anthropic-ai', 'Claude-Web',
          'Google-Extended', 'PerplexityBot', 'Bytespider', 'Amazonbot', 'Applebot-Extended',
        ],
        disallow: '/',
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  }
}
