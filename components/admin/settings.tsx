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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayroom } from '@/lib/store'
import { useFiscal } from '@/lib/fiscal'
import { statusMeta } from '@/lib/ui'
import type { ConsoleUnit } from '@/lib/types'
import { supabase } from '@/lib/supabase/client'
import { Modal } from './modal'
import { MarketplaceSettings } from './marketplace-settings'

// Bookable resource types — a coupe/VIP is a separate capacity pool (0039).
const CTYPES = ['standard', 'coupe', 'vip']
const CTYPE_LABEL: Record<string, string> = { standard: 'PS5', coupe: 'კუპე', vip: 'VIP' }

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
            title="ტიპის შეცვლა (PS5 / კუპე / VIP)"
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

export function Settings() {
  const { settings, updateSettings, consoles, addConsole, resetSettings } =
    usePlayroom()
  const [addOpen, setAddOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [newName, setNewName] = useState('')

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

      <FiscalSettings />

      <MarketplaceSettings />

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
    </div>
  )
}
