'use client'

import { supabase } from './supabase/client'

// Client-side image optimization: downscale to max 1200px + re-encode WebP @0.82.
// GIFs pass through; any failure falls back to the original file. (Same logic
// proven in inventory.tsx — keeps R2 uploads small without paid services.)
export async function optimizeImage(file: File): Promise<File> {
  if (file.type === 'image/gif') return file

  return new Promise((resolve) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { width, height } = img
      const MAX_SIZE = 1200
      if (width > MAX_SIZE || height > MAX_SIZE) {
        if (width > height) {
          height = Math.round((height * MAX_SIZE) / width)
          width = MAX_SIZE
        } else {
          width = Math.round((width * MAX_SIZE) / height)
          height = MAX_SIZE
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(file)
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file)
          resolve(new File([blob], 'photo.webp', { type: 'image/webp' }))
        },
        'image/webp',
        0.82,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(file)
    }
    img.src = objectUrl
  })
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// Validates, optimizes, and uploads an image to R2 via /api/upload. Returns the
// public CDN URL. Throws an Error whose message is the server/validation code.
export async function uploadImage(file: File, folder = 'products'): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error('unsupported_type')
  if (file.size > 5 * 1024 * 1024) throw new Error('file_too_large')

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('unauthorized')

  const optimized = await optimizeImage(file)
  const fd = new FormData()
  fd.append('file', optimized)
  fd.append('folder', folder)

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fd,
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error || 'upload_failed')
  return data.url as string
}

// Human-readable Georgian messages for upload error codes.
export const UPLOAD_ERRORS: Record<string, string> = {
  unauthorized: 'ავტორიზაცია ვერ მოხერხდა',
  no_file: 'ფაილი ვერ მოიძებნა',
  unsupported_type: 'მხოლოდ jpg/png/webp/gif ფორმატებია დაშვებული',
  file_too_large: 'ფაილის ზომა არ უნდა აღემატებოდეს 5MB-ს',
  upload_failed: 'ატვირთვა ვერ მოხერხდა',
}

// Unicode-aware slug (keeps Georgian letters) — mirrors the DB slugify().
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}
