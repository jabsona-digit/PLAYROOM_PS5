// Cloudflare Pages Function — POST /api/upload
// Uploads an image to the R2 bucket (binding: MEDIA) and returns its public URL.
// Security: verifies the caller's Supabase access token, so only a signed-in user
// can upload. The browser never gets R2 credentials — the write happens here via
// the binding. Reads are public over the CDN domain.
//
// Bindings/env (Pages project settings):
//   MEDIA                         -> R2 bucket martelounge-media
//   NEXT_PUBLIC_SUPABASE_URL      -> https://rvlkimzqzwizcivkxtnd.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY -> anon key

const CDN_BASE = 'https://cdn.martelounge.ge'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

export function onRequestOptions() {
  return new Response(null, { headers: cors })
}

export async function onRequestPost(context) {
  const { request, env } = context

  // 1. Verify the Supabase access token (only signed-in users may upload).
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401)

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return json({ ok: false, error: 'server_misconfigured' }, 500)

  const who = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  })
  if (!who.ok) return json({ ok: false, error: 'unauthorized' }, 401)

  // 2. Read the file from multipart form-data.
  let form
  try {
    form = await request.formData()
  } catch {
    return json({ ok: false, error: 'invalid_form' }, 400)
  }

  const file = form.get('file')
  const folderRaw = (form.get('folder') || 'products').toString()
  const folder = folderRaw.replace(/[^a-z0-9_-]/gi, '') || 'products'

  if (!file || typeof file === 'string') return json({ ok: false, error: 'no_file' }, 400)

  const type = file.type || ''
  const ext = ALLOWED[type]
  if (!ext) return json({ ok: false, error: 'unsupported_type' }, 415)
  if (file.size > MAX_BYTES) return json({ ok: false, error: 'file_too_large' }, 413)

  // 3. Store in R2 (immutable cache — the key is unique per upload).
  const key = `${folder}/${crypto.randomUUID()}.${ext}`
  await env.MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: type,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })

  // 4. Return the public CDN URL to store in bar_products.image_url.
  return json({ ok: true, url: `${CDN_BASE}/${key}`, key })
}
