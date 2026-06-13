import type { MetadataRoute } from 'next'

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Martelounge',
    short_name: 'Martelounge',
    description: 'Martelounge-ის ადმინ პანელი — სესიები, კასა, ტარიფები, თანამშრომლები',
    start_url: '/app',
    display: 'standalone',
    background_color: '#1c1f27',
    theme_color: '#1c1f27',
    orientation: 'portrait',
    scope: '/',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
