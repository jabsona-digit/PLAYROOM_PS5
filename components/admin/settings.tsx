'use client'

import { useState, useEffect } from 'react'
import {
  Building2,
  Gamepad2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Check,
  X,
  FileText,
  Save,
  QrCode,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayroom } from '@/lib/store'
import { useOrg } from '@/lib/org'
import { useFiscal } from '@/lib/fiscal'
import { statusMeta } from '@/lib/ui'
import type { ConsoleUnit } from '@/lib/types'
import { supabase } from '@/lib/supabase/client'
import { Modal } from './modal'
import { MarketplaceSettings } from './marketplace-settings'
import { PaymentSettings } from './payment-settings'
import { TeamSettings } from './team-settings'
import { HardwareSettings } from './hardware-settings'
import { QrPrintModal } from './qr-print-modal'

// Bookable resource types — each is its own capacity pool (0039). Latin keys keep
// future console_type→category mapping clean (standard/coupe/vip = playroom,
// billiard/snooker = billiard). console_type is free-text in the DB.
const CTYPES = ['standard', 'coupe', 'vip', 'billiard', 'snooker']
const CTYPE_LABEL: Record<string, string> = {
  standard: 'PS5', coupe: 'კუპე', vip: 'VIP', billiard: 'ბილიარდი', snooker: 'სნუკერი',
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors',
        checked ? 'nm-daylight' : 'nm-inset',
      )}
    >
      <span
        className={cn(
          'absolute top-1 size-5 rounded-full transition-all',
          checked
            ? 'left-6 bg-primary shadow-[0_0_10px_var(--primary)]'
            : 'left-1 bg-muted-foreground',
        )}
      />
    </button>
  )
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="nm-inset flex items-center gap-1 rounded-xl px-3 py-2">
        <input
          type="number"
          min={1}
          value={value}
          onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
          className="w-14 bg-transparent text-right font-mono text-sm font-bold outline-none"
        />
        {suffix ? (
          <span className="text-xs text-muted-foreground">{suffix}</span>
        ) : null}
      </span>
    </label>
  )
}

function ConsoleRow({ unit }: { unit: ConsoleUnit }) {
  const { renameConsole, removeConsole, refreshLive } = usePlayroom()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(unit.name)
  const [ctype, setCtype] = useState<string>((unit as { console_type?: string }).console_type ?? 'standard')
  const meta = statusMeta[unit.status]
  const busy = !!unit.active_session

  const cycleType = async () => {
    const next = CTYPES[(CTYPES.indexOf(ctype) + 1) % CTYPES.length]
    setCtype(next)
    await (supabase.from('consoles') as unknown as {
      update: (v: Record<string, unknown>) => { eq: (c: string, id: number) => Promise<unknown> }
    }).update({ console_type: next }).eq('id', unit.id)
    refreshLive?.()
  }

  return (
    <div className="nm-raised-sm flex items-center gap-3 rounded-2xl p-3">
      <div className="nm-inset flex size-10 shrink-0 items-center justify-center rounded-xl">
        <Gamepad2 className="size-5 text-primary" />
      </div>

      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              renameConsole(unit.id, name)
              setEditing(false)
            }
            if (e.key === 'Escape') {
              setName(unit.name)
              setEditing(false)
            }
          }}
          className="nm-inset min-w-0 flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold outline-none"
        />
      ) : (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{unit.name}</p>
          <span
            className="text-xs"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
        </div>
      )}

      {editing ? (
        <>
          <button
            type="button"
            aria-label="შენახვა"
            onClick={() => {
              renameConsole(unit.id, name)
              setEditing(false)
            }}
            className="nm-btn flex size-9 items-center justify-center rounded-xl"
          >
            <Check className="size-4 text-primary" />
          </button>
          <button
            type="button"
            aria-label="გაუქმება"
            onClick={() => {
              setName(unit.name)
              setEditing(false)
            }}
            className="nm-btn flex size-9 items-center justify-center rounded-xl"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={cycleType}
            title="ტიპის შეცვლა (PS5 / კუპე / VIP / ბილიარდი / სნუკერი)"
            className={cn(
              'nm-btn rounded-xl px-2.5 py-1.5 text-xs font-bold',
              ctype === 'standard' ? 'text-muted-foreground' : 'text-primary',
            )}
          >
            {CTYPE_LABEL[ctype] ?? ctype}
          </button>
          <button
            type="button"
            aria-label="სახელის შეცვლა"
            onClick={() => setEditing(true)}
            className="nm-btn flex size-9 items-center justify-center rounded-xl"
          >
            <Pencil className="size-4 text-muted-foreground" />
          </button>
          <button
            type="button"
            aria-label="წაშლა"
            disabled={busy}
            onClick={() => removeConsole(unit.id)}
            className={cn(
              'nm-btn flex size-9 items-center justify-center rounded-xl',
              busy && 'cursor-not-allowed opacity-40',
            )}
            title={busy ? 'აქტიური სესიის წაშლა შეუძლებელია' : undefined}
          >
            <Trash2 className="size-4 text-[var(--status-expired)]" />
          </button>
        </>
      )}
    </div>
  )
}

function FiscalSettings() {
  const { plan, isPlatformAdmin } = useOrg()
  const { fiscalSettings, saveFiscalSettings, savingFiscal } = useFiscal()
  const [tin, setTin] = useState(fiscalSettings.fiscal_tin ?? '')
  const [bizName, setBizName] = useState(fiscalSettings.fiscal_business_name ?? '')
  const [address, setAddress] = useState(fiscalSettings.fiscal_address ?? '')
  const [saved, setSaved] = useState(false)

  // sync form when hook loads data async
  useEffect(() => {
    setTin(fiscalSettings.fiscal_tin ?? '')
    setBizName(fiscalSettings.fiscal_business_name ?? '')
    setAddress(fiscalSettings.fiscal_address ?? '')
  }, [fiscalSettings.fiscal_tin, fiscalSettings.fiscal_business_name, fiscalSettings.fiscal_address])

  // sync local state when hook loads data
  const loaded =
    fiscalSettings.fiscal_tin !== null ||
    fiscalSettings.fiscal_business_name !== null

  const handleSave = async () => {
    await saveFiscalSettings({
      fiscal_tin: tin.trim() || null,
      fiscal_business_name: bizName.trim() || null,
      fiscal_address: address.trim() || null,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // RS.GE fiscal is an ENTERPRISE feature (enforced for real by migration 0062's
  // venues.fiscal_enabled trigger). Show a locked card on lower plans.
  if (!isPlatformAdmin && plan !== 'enterprise') {
    return (
      <section className="nm-raised rounded-3xl p-6 lg:col-span-2">
        <div className="mb-4 flex items-center gap-3">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <FileText className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">ფისკალური ჩეკი</h2>
            <p className="text-xs text-muted-foreground">RS.GE — PDF/ამობეჭდვა (Phase B).</p>
          </div>
        </div>
        <div
          className="rounded-2xl p-4 text-sm"
          style={{ background: 'color-mix(in oklch, var(--primary) 10%, transparent)' }}
        >
          <p className="mb-1 font-bold">🔒 ENTERPRISE ფუნქცია</p>
          <p className="text-muted-foreground">
            RS.GE ფისკალი ხელმისაწვდომია მხოლოდ ENTERPRISE გეგმაზე. გასააქტიურებლად გადადი „გამოწერა"-ში.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="nm-raised rounded-3xl p-6 lg:col-span-2">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <FileText className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">ფისკალური ჩეკი</h2>
            <p className="text-xs text-muted-foreground">
              RS.GE — PDF/ამობეჭდვა (Phase B).
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-muted-foreground">ფისკალური</span>
            <Toggle
              checked={fiscalSettings.fiscal_enabled}
              onChange={(v) => saveFiscalSettings({ fiscal_enabled: v })}
              label="ფისკალური ჩეკი"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-muted-foreground mr-1">დღგ-ს გადამხდელი</span>
            <Toggle
              checked={fiscalSettings.is_vat_registered}
              onChange={(v) => saveFiscalSettings({ is_vat_registered: v })}
              label="დღგ-ს გადამხდელი"
            />
          </div>
        </div>
      </div>

      {fiscalSettings.fiscal_enabled && (
        <>
          {!loaded && (
            <div
              className="mb-5 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold"
              style={{
                color: 'var(--status-warning5)',
                background: 'color-mix(in oklch, var(--status-warning5) 12%, transparent)',
              }}
            >
              ⚠️ შეავსეთ ბიზნეს მონაცემები — ჩეკზე გამოჩნდება
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm text-muted-foreground">საიდენტიფიკაციო კოდი (ს/ნ)</span>
              <input
                value={tin}
                onChange={(e) => setTin(e.target.value)}
                placeholder="123456789"
                maxLength={11}
                className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-mono font-bold outline-none placeholder:text-muted-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm text-muted-foreground">ბიზნეს სახელი</span>
              <input
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                placeholder="შპს ფლეირუმი"
                className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-semibold outline-none placeholder:text-muted-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm text-muted-foreground">მისამართი</span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="თბილისი, რუსთაველის 1"
                className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-semibold outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={savingFiscal}
            onClick={handleSave}
            className={cn(
              'nm-btn mt-4 flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold',
              saved ? 'text-[var(--status-free)]' : 'text-primary',
            )}
          >
            {saved ? (
              <><Check className="size-4" /> შენახულია</>
            ) : (
              <><Save className="size-4" /> შენახვა</>
            )}
          </button>
        </>
      )}

      {!fiscalSettings.fiscal_enabled && (
        <p className="text-sm text-muted-foreground">
          გამორთულია — ჩართვისას ყოველ გაყიდვაზე / სესიის დასრულებისას ჩეკი ამოიწვება ავტომატურად.
        </p>
      )}
    </section>
  )
}

// Venue types an owner can register a new venue as (mirrors VenueType in lib/ui).
const VENUE_TYPES: { key: string; label: string }[] = [
  { key: 'billiard', label: '🎱 ბილიარდი' },
  { key: 'playroom', label: '🎮 კონსოლები' },
  { key: 'karaoke', label: '🎤 კარაოკე' },
  { key: 'vr', label: '🥽 VR' },
  { key: 'mixed', label: '🎯 შერეული' },
]
// Plan venue caps mirror plan_limit('venues') (migration 0062).
const VENUE_CAP: Record<string, string> = { trial: '1', pro: '3', enterprise: '∞' }

// Owner/admin self-serve venue management. A club running billiard on a SECOND
// physical cash register registers it here as its own venue → separate cash drawer,
// Z-Report, bar and P&L for free (see migration 0077 / create_venue).
function VenuesSettings() {
  const { currentOrgId, currentVenueId, currentRole, venues, setCurrentVenue, refresh, plan } =
    useOrg()
  const { pushToast } = usePlayroom()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [vtype, setVtype] = useState('billiard')
  const [busy, setBusy] = useState(false)

  if (currentRole !== 'owner' && currentRole !== 'admin') return null

  const create = async () => {
    if (!currentOrgId || busy) return
    const clean = name.trim()
    if (!clean) {
      pushToast('warning', 'შეიყვანე ფილიალის სახელი')
      return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('create_venue', {
      p_org_id: currentOrgId,
      p_name: clean,
      p_venue_type: vtype,
    })
    setBusy(false)
    if (error) {
      const m = error.message || ''
      pushToast(
        'danger',
        m.includes('plan_limit_reached')
          ? 'ფილიალების ლიმიტი ამოიწურა — გადადი PRO/ENTERPRISE-ზე მეტი ფილიალისთვის'
          : m.includes('unauthorized')
            ? 'მხოლოდ მფლობელს შეუძლია ფილიალის დამატება'
            : m,
      )
      return
    }
    await refresh()
    const created = data as { id?: string } | null
    if (created?.id) setCurrentVenue(created.id)
    pushToast('success', `ფილიალი „${clean}" დაემატა`)
    setName('')
    setVtype('billiard')
    setOpen(false)
  }

  return (
    <section className="nm-raised rounded-3xl p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <Building2 className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">ფილიალები</h2>
            <p className="text-xs text-muted-foreground">
              {venues.length} ფილიალი • ლიმიტი: {VENUE_CAP[plan] ?? '1'} ({plan.toUpperCase()})
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setName('')
            setVtype('billiard')
            setOpen(true)
          }}
          className="nm-btn flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-primary"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">ფილიალის დამატება</span>
        </button>
      </div>

      <div className="space-y-3">
        {venues.map((v) => {
          const active = v.id === currentVenueId
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setCurrentVenue(v.id)}
              className={cn(
                'flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition',
                active ? 'nm-daylight' : 'nm-inset',
              )}
            >
              <span className="truncate text-sm font-bold">{v.name}</span>
              <span
                className={cn(
                  'ml-3 shrink-0 text-[11px] font-bold',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {active ? 'მიმდინარე' : 'გადართვა'}
              </span>
            </button>
          )
        })}
      </div>

      <p className="mt-4 text-xs text-muted-foreground text-pretty">
        2 ფიზიკური კასა? დაარეგისტრირე ბილიარდი ცალკე ფილიალად — მიიღებ ცალკე Z-რეპორტს, ბარსა და ანგარიშგებას.
      </p>

      <Modal open={open} onClose={() => setOpen(false)} title="ახალი ფილიალი">
        <div className="space-y-5">
          <label className="block">
            <span className="text-sm text-muted-foreground">ფილიალის სახელი</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ბილიარდი"
              className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-semibold outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div>
            <span className="text-sm text-muted-foreground">ტიპი</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {VENUE_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setVtype(t.key)}
                  className={cn(
                    'rounded-xl px-3 py-2 text-sm font-bold transition',
                    vtype === t.key ? 'nm-daylight text-primary' : 'nm-inset text-muted-foreground',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="nm-btn flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-muted-foreground"
            >
              გაუქმება
            </button>
            <button
              type="button"
              onClick={create}
              disabled={busy}
              className="nm-daylight flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-primary disabled:opacity-50"
            >
              {busy ? '...' : 'დამატება'}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  )
}

export function Settings() {
  const { settings, updateSettings, consoles, addConsole, resetSettings } =
    usePlayroom()
  const [addOpen, setAddOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [newName, setNewName] = useState('')
  const [qrOpen, setQrOpen] = useState(false)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* General settings */}
      <section className="nm-raised rounded-3xl p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <Building2 className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">ზოგადი</h2>
            <p className="text-xs text-muted-foreground">
              დაწესებულების მონაცემები და გაფრთხილებები
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <label className="block">
            <span className="text-sm text-muted-foreground">დაწესებულების სახელი</span>
            <input
              value={settings.venue_name}
              onChange={(e) => updateSettings({ venue_name: e.target.value })}
              className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-semibold outline-none"
            />
          </label>

          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">ვალუტის სიმბოლო</span>
            <input
              value={settings.currency}
              maxLength={3}
              onChange={(e) => updateSettings({ currency: e.target.value })}
              className="nm-inset w-20 rounded-xl px-4 py-2 text-center text-sm font-bold outline-none"
            />
          </label>

          <NumberField
            label="პირველი გაფრთხილება"
            value={settings.warn_10_min}
            onChange={(v) => updateSettings({ warn_10_min: v })}
            suffix="წთ"
          />
          <NumberField
            label="ბოლო გაფრთხილება"
            value={settings.warn_5_min}
            onChange={(v) => updateSettings({ warn_5_min: v })}
            suffix="წთ"
          />

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">ავტო-დასრულება</p>
              <p className="text-xs text-muted-foreground">
                დროის ამოწურვისას სესია ავტომატურად დასრულდეს
              </p>
            </div>
            <Toggle
              checked={settings.auto_end_on_expire}
              onChange={(v) => updateSettings({ auto_end_on_expire: v })}
              label="ავტო-დასრულება"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">ხმოვანი სიგნალი</p>
              <p className="text-xs text-muted-foreground">
                გაფრთხილებისას გაისმას ხმა
              </p>
            </div>
            <Toggle
              checked={settings.sound_alerts}
              onChange={(v) => updateSettings({ sound_alerts: v })}
              label="ხმოვანი სიგნალი"
            />
          </div>

          {/* reset device settings (does not touch DB data) */}
          <div className="mt-2 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">პარამეტრების განულება</p>
                <p className="text-xs text-muted-foreground text-pretty">
                  ინტერფეისის პარამეტრები დაუბრუნდება ნაგულისხმევს — მონაცემები DB-ში არ იშლება.
                </p>
              </div>
              {confirmReset ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="nm-btn rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground"
                  >
                    გაუქმება
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetSettings()
                      setConfirmReset(false)
                    }}
                    className="nm-btn rounded-xl px-3 py-2 text-xs font-bold text-[var(--status-expired)]"
                  >
                    დადასტურება
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="nm-btn flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-[var(--status-expired)]"
                >
                  <RotateCcw className="size-3.5" />
                  განულება
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <VenuesSettings />

      {/* Console management */}
      <section className="nm-raised rounded-3xl p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
              <Gamepad2 className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">კონსოლები</h2>
              <p className="text-xs text-muted-foreground">
                {consoles.length} კონსოლი დარეგისტრირებულია
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              className="nm-btn flex items-center justify-center rounded-2xl px-3 py-2.5 text-sm font-bold text-muted-foreground"
              title="QR კოდების ბეჭდვა"
            >
              <QrCode className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">QR კოდები</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setNewName('')
                setAddOpen(true)
              }}
              className="nm-btn flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-primary"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">კონსოლის დამატება</span>
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {consoles.map((unit) => (
            <ConsoleRow key={unit.id} unit={unit} />
          ))}
          {consoles.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              კონსოლები არ არის. დაამატე პირველი.
            </p>
          ) : null}
        </div>
      </section>

      <TeamSettings />

      <FiscalSettings />

      <MarketplaceSettings />

      <PaymentSettings />

      <HardwareSettings />

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="ახალი კონსოლი">
        <div className="space-y-5">
          <label className="block">
            <span className="text-sm text-muted-foreground">კონსოლის სახელი</span>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`PS5 - ${consoles.length + 1}`}
              className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-semibold outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="nm-btn flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-muted-foreground"
            >
              გაუქმება
            </button>
            <button
              type="button"
              onClick={() => {
                addConsole(newName)
                setAddOpen(false)
              }}
              className="nm-daylight flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-primary"
            >
              დამატება
            </button>
          </div>
        </div>
      </Modal>

      <QrPrintModal open={qrOpen} onClose={() => setQrOpen(false)} />
    </div>
  )
}
