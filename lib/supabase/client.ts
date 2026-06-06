'use client'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

// Single browser client. The app is fully client-side ('use client'), so a
// localStorage-backed session is enough; if server components / route handlers
// are added later, switch to @supabase/ssr's createBrowserClient + middleware.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error(
    'Missing Supabase env. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
  )
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
