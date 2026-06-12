'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Globe,
  Save,
  Check,
  ImagePlus,
  X,
  Plus,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'
import { uploadImage, UPLOAD_ERRORS, slugify } from '@/lib/upload'

const SITE = 'https://martelounge.ge'

interface VenuePublic {
  name: string
  slug: string
  is_published: boolean
  description: string
  city: string
  address: string
  public_phone: string
  cover_image_url: string
  gallery: string[]
  amenities: string[]
}

const EMPTY: VenuePublic = {
  name: '',
  slug: '',
  is_published: false,
  description: '',
  city: '',
  address: '',
  public_phone: '',
  cover_image_url: '',
  gallery: [],
  amenities: [],
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'nm-daylight' : 'nm-inset')}
    >
      <span
        className={cn(
          'absolute top-1 size-5 rounded-full transition-all',
          checked ? 'left-6 bg-primary shadow-[0_0_10px_var(--primary)]' : 'left-1 bg-muted-foreground',
        )}
      />
    </button>
  )
}

export function MarketplaceSettings() {
  const { currentVenueId } = useOrg()
  const { pushToast } = usePlayroom()

  const [form, setForm] = useState<VenuePublic>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadingGallery, setUploadingGallery] = useState(false)
  const [newAmenity, setNewAmenity] = useState('')

  const set = <K extends keyof VenuePublic>(k: K, v: VenuePublic[K]) =>
    setForm((p) => ({ ...p, [k]: v }))

  const load = useCallback(async () => {
    if (!currentVenueId) return
    const { data } = await (supabase.from('venues') as any)
      .select(
        'name, slug, is_published, description, city, address, public_phone, cover_image_url, gallery, amenities',
      )
      .eq('id', currentVenueId)
      .single()
    if (data) {
      setForm({
        name: data.name ?? '',
        slug: data.slug ?? '',
        is_published: !!data.is_published,
        description: data.description ?? '',
        city: data.city ?? '',
        address: data.address ?? '',
        public_phone: data.public_phone ?? '',
        cover_image_url: data.cover_image_url ?? '',
        gallery: Array.isArray(data.gallery) ? data.gallery : [],
        amenities: Array.isArray(data.amenities) ? data.amenities : [],
      })
    }
  }, [currentVenueId])

  useEffect(() => {
    load()
  }, [load])

  // Persist a partial patch immediately (used by the publish toggle).
  const patch = async (p: Record<string, unknown>) => {
    if (!currentVenueId) return
    const { error } = await (supabase.from('venues') as any).update(p).eq('id', currentVenueId)
    if (error) pushToast('danger', error.message)
  }

  const togglePublish = async (v: boolean) => {
    if (v && !form.slug.trim()) {
      // need a slug before going public — derive from the venue name
      const s = slugify(form.name) || 'venue'
      set('slug', s)
      set('is_published', true)
      await patch({ slug: s, is_published: true })
    } else {
      set('is_published', v)
      await patch({ is_published: v })
    }
    pushToast(v ? 'success' : 'info', v ? 'კლუბი გამოქვეყნდა marketplace-ზე' : 'კლუბი დაიმალა')
  }

  const saveAll = async () => {
    if (!currentVenueId) return
    setSaving(true)
    const slug = slugify(form.slug) || null
    const { error } = await (supabase.from('venues') as any)
      .update({
        slug,
        description: form.description.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        public_phone: form.public_phone.trim() || null,
        cover_image_url: form.cover_image_url || null,
        gallery: form.gallery,
        amenities: form.amenities,
      })
      .eq('id', currentVenueId)
    setSaving(false)
    if (error) {
      pushToast('danger', /duplicate|unique/i.test(error.message) ? 'ეს slug უკვე დაკავებულია' : error.message)
      return
    }
    if (slug) set('slug', slug)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    pushToast('success', 'პროფილი შენახულია')
  }

  const onCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingCover(true)
    try {
      const url = await uploadImage(file, 'venues')
      set('cover_image_url', url)
      pushToast('success', 'ფოტო აიტვირთა — დააჭირე შენახვას')
    } catch (err) {
      const code = err instanceof Error ? err.message : 'upload_failed'
      pushToast('danger', UPLOAD_ERRORS[code] ?? code)
    } finally {
      setUploadingCover(false)
    }
  }

  const onGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingGallery(true)
    try {
      const url = await uploadImage(file, 'venues')
      set('gallery', [...form.gallery, url])
      pushToast('success', 'გალერეას დაემატა — დააჭირე შენახვას')
    } catch (err) {
      const code = err instanceof Error ? err.message : 'upload_failed'
      pushToast('danger', UPLOAD_ERRORS[code] ?? code)
    } finally {
      setUploadingGallery(false)
    }
  }

  const addAmenity = () => {
    const a = newAmenity.trim()
    if (!a || form.amenities.includes(a)) return
    set('amenities', [...form.amenities, a])
    setNewAmenity('')
  }

  return (
    <section className="nm-raised rounded-3xl p-6 lg:col-span-2">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <Globe className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">Marketplace პროფილი</h2>
            <p className="text-xs text-muted-foreground">საჯარო გვერდი martelounge.ge-ზე</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-muted-foreground">გამოქვეყნება</span>
          <Toggle checked={form.is_published} onChange={togglePublish} label="გამოქვეყნება" />
        </div>
      </div>

      {form.is_published && form.slug && (
        <a
          href={`${SITE}/${form.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="nm-inset mb-5 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-primary"
        >
          <ExternalLink className="size-4" />
          {SITE}/{form.slug}
        </a>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Slug */}
        <label className="block sm:col-span-2">
          <span className="text-sm text-muted-foreground">მისამართი (slug)</span>
          <div className="nm-inset mt-2 flex items-center rounded-xl px-3">
            <span className="text-xs text-muted-foreground shrink-0">martelounge.ge/</span>
            <input
              value={form.slug}
              onChange={(e) => set('slug', e.target.value)}
              onBlur={() => set('slug', slugify(form.slug))}
              placeholder="varketili"
              className="w-full bg-transparent px-1 py-2.5 text-sm font-semibold outline-none"
            />
          </div>
        </label>

        {/* Description */}
        <label className="block sm:col-span-2">
          <span className="text-sm text-muted-foreground">აღწერა</span>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            placeholder="მოკლე აღწერა კლუბის შესახებ…"
            className="nm-inset mt-2 w-full resize-none rounded-xl px-4 py-2.5 text-sm outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm text-muted-foreground">ქალაქი</span>
          <input
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            placeholder="თბილისი"
            className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
          />
        </label>
        <label className="block">
          <span className="text-sm text-muted-foreground">მისამართი</span>
          <input
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="ვარკეთილი III მ/რ"
            className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm text-muted-foreground">საჯარო ტელეფონი</span>
          <input
            value={form.public_phone}
            onChange={(e) => set('public_phone', e.target.value)}
            placeholder="+995 5XX XX XX XX"
            className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
          />
        </label>
      </div>

      {/* Cover image */}
      <div className="mt-5">
        <span className="text-sm text-muted-foreground">მთავარი ფოტო</span>
        <div className="mt-2 flex items-center gap-4">
          <div className="nm-inset relative aspect-[16/10] w-40 shrink-0 overflow-hidden rounded-2xl">
            {form.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.cover_image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🎮</div>
            )}
            {form.cover_image_url && (
              <button
                type="button"
                onClick={() => set('cover_image_url', '')}
                className="absolute right-1.5 top-1.5 nm-btn flex size-7 items-center justify-center rounded-lg"
                aria-label="წაშლა"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <label className="nm-btn flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-primary">
            {uploadingCover ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            ატვირთვა
            <input type="file" accept="image/*" onChange={onCover} disabled={uploadingCover} className="hidden" />
          </label>
        </div>
      </div>

      {/* Gallery */}
      <div className="mt-5">
        <span className="text-sm text-muted-foreground">გალერეა</span>
        <div className="mt-2 flex flex-wrap gap-3">
          {form.gallery.map((url, i) => (
            <div key={i} className="nm-inset relative size-24 overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => set('gallery', form.gallery.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 nm-btn flex size-6 items-center justify-center rounded-md"
                aria-label="წაშლა"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          <label className="nm-btn flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl text-xs text-muted-foreground">
            {uploadingGallery ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
            დამატება
            <input type="file" accept="image/*" onChange={onGallery} disabled={uploadingGallery} className="hidden" />
          </label>
        </div>
      </div>

      {/* Amenities */}
      <div className="mt-5">
        <span className="text-sm text-muted-foreground">კეთილმოწყობა</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {form.amenities.map((a) => (
            <span key={a} className="nm-raised-sm flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm">
              {a}
              <button
                type="button"
                onClick={() => set('amenities', form.amenities.filter((x) => x !== a))}
                aria-label="წაშლა"
              >
                <X className="size-3.5 text-muted-foreground" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newAmenity}
            onChange={(e) => setNewAmenity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addAmenity()
              }
            }}
            placeholder="Wi-Fi, ბარი, პარკინგი…"
            className="nm-inset flex-1 rounded-xl px-4 py-2 text-sm outline-none"
          />
          <button type="button" onClick={addAmenity} className="nm-btn rounded-xl px-4 py-2 text-sm font-bold text-primary">
            დამატება
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={saveAll}
        className={cn(
          'nm-btn mt-6 flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold',
          saved ? 'text-[var(--status-free)]' : 'text-primary',
        )}
      >
        {saved ? (
          <>
            <Check className="size-4" /> შენახულია
          </>
        ) : (
          <>
            <Save className="size-4" /> შენახვა
          </>
        )}
      </button>
    </section>
  )
}
