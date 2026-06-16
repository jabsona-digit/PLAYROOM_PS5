'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plug, Power, Settings2, Zap, AlertTriangle, Cloud, Wrench } from 'lucide-react'
import { Modal } from './modal'
import { usePlayroom } from '@/lib/store'
import { useOrg } from '@/lib/org'
import { supabase } from '@/lib/supabase/client'
import { planErrorText } from '@/lib/ui'
import { cn } from '@/lib/utils'
import type { ConsoleUnit } from '@/lib/types'

// console_hardware isn't in the generated DB types until the post-deploy regen.
const hwTable = () => supabase.from('console_hardware' as never) as any

const MODE_LABEL: Record<string, string> = { manual: 'Manual', cloud: 'Cloud', agent: 'Agent' }
const TARGET_LABEL: Record<string, string> = { tv: 'TV', hdmi: 'HDMI', console: 'კონსოლი', network: 'ქსელი', light: 'შუქი' }
// driver options per control mode
const DRIVERS: Record<string, { v: string; t: string }[]> = {
  manual: [{ v: 'none', t: 'მოწყობილობის გარეშე (მხოლოდ აღრიცხვა)' }],
  cloud: [
    { v: 'shelly_cloud', t: 'Shelly Cloud (სმარტ-როზეტი)' },
    { v: 'tuya', t: 'Tuya / Smart Life' },
  ],
  agent: [
    { v: 'relay_modbus', t: 'Ethernet Relay — Modbus TCP (USR/Waveshare)' },
    { v: 'relay_tcp', t: 'Ethernet Relay — TCP Socket (USR-R8)' },
    { v: 'shelly_lan', t: 'Shelly — LAN (HTTP)' },
    { v: 'hdmi_rs232', t: 'HDMI Matrix — RS232/HTTP' },
    { v: 'unifi', t: 'UniFi — MAC block' },
  ],
}

function StatusDot({ unit }: { unit: ConsoleUnit }) {
  const hw = unit.hardware
  let color = 'var(--muted-foreground)'
  let label = 'არ არის'
  if (hw) {
    if (hw.last_known_state === 'on') { color = 'var(--status-free)'; label = 'ჩართული' }
    else if (hw.last_known_state === 'off') { color = 'var(--muted-foreground)'; label = 'გამორთული' }
    else { color = 'var(--status-warning5)'; label = 'უცნობი' }
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
      <span className="size-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      {label}
    </span>
  )
}

// Owner toggle: require a configured control method before a session can start.
function RequireToggle() {
  const { hardwareRequired, refreshLive, pushToast } = usePlayroom()
  const { currentVenueId } = useOrg()
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    if (!currentVenueId) return
    setBusy(true)
    const { error } = await (supabase.from('venues') as any)
      .update({ hardware_required: !hardwareRequired })
      .eq('id', currentVenueId)
    setBusy(false)
    if (error) return pushToast('danger', planErrorText(error.message))
    pushToast('success', !hardwareRequired ? 'ჩაირთო — სესია მოითხოვს Hardware-ს' : 'გამოირთო')
    await refreshLive()
  }

  return (
    <div className="nm-inset mb-4 flex items-center justify-between gap-3 rounded-2xl p-4">
      <div className="min-w-0">
        <p className="text-sm font-bold">სესია მხოლოდ კონფიგურირებულ კონსოლზე</p>
        <p className="text-xs text-muted-foreground">
          ჩართვისას ოპერატორი სესიას ვერ დაიწყებს კონსოლზე, რომელსაც Hardware კონტროლი არ აქვს (anti-fraud). გამორთულზე — ყველაფერი ჩვეულებრივ მუშაობს.
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={busy}
        role="switch"
        aria-checked={hardwareRequired}
        className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50',
          hardwareRequired ? 'bg-primary' : 'bg-muted-foreground/30')}
      >
        <span className={cn('absolute top-1 size-5 rounded-full bg-white transition-all', hardwareRequired ? 'left-6' : 'left-1')} />
      </button>
    </div>
  )
}

// Venue-level Shelly Cloud account (server + auth_key). The key is write-only:
// saved to Vault, never read back to the client (see migration 0065).
function ShellyAccountCard() {
  const { pushToast } = usePlayroom()
  const { currentVenueId } = useOrg()
  const [server, setServer] = useState('')
  const [authKey, setAuthKey] = useState('')
  const [configured, setConfigured] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!currentVenueId) return
    const { data } = await (supabase.rpc as any)('get_hardware_settings', { p_venue_id: currentVenueId })
    const sh = (data?.providers ?? []).find((p: any) => p.provider === 'shelly')
    setConfigured(!!sh?.configured)
    if (sh?.server) setServer(sh.server)
  }, [currentVenueId])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!currentVenueId) return
    setSaving(true)
    const { error } = await (supabase.rpc as any)('save_hardware_credentials', {
      p_venue_id: currentVenueId, p_provider: 'shelly', p_server: server, p_auth_key: authKey || null,
    })
    setSaving(false)
    if (error) return pushToast('danger', planErrorText(error.message))
    setAuthKey('')
    pushToast('success', 'Shelly account შენახულია')
    load()
  }

  return (
    <div className="nm-inset mb-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Cloud className="size-4 text-primary" />
        <p className="text-sm font-extrabold">Shelly Cloud account</p>
        {configured && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-[var(--status-free)]">დაკავშირებულია ✅</span>
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Cloud რეჟიმისთვის: Shelly აპში → Settings → <b>Authorization Cloud Key</b> (server + key). გასაღები ინახება დაშიფრულად.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="shelly-XX-eu.shelly.cloud"
          className="nm-inset rounded-xl px-3 py-2.5 text-sm font-mono outline-none" />
        <input value={authKey} onChange={(e) => setAuthKey(e.target.value)} type="password"
          placeholder={configured ? '•••••• (შესაცვლელად შეიყვანე ახალი)' : 'auth_key'}
          className="nm-inset rounded-xl px-3 py-2.5 text-sm font-mono outline-none" />
      </div>
      <button onClick={save} disabled={saving || !server}
        className="nm-btn mt-3 rounded-xl px-5 py-2.5 text-xs font-bold text-primary disabled:opacity-50">
        {saving ? 'ინახება...' : 'შენახვა'}
      </button>
    </div>
  )
}

export function HardwareSettings() {
  const { consoles, forceConsolePower, refreshLive, pushToast } = usePlayroom()
  const [editId, setEditId] = useState<number | null>(null)
  const editUnit = consoles.find((c) => c.id === editId) ?? null

  const service = async (id: number) => {
    const { error } = await (supabase.rpc as any)('mark_controller_serviced', { p_console_id: id })
    if (error) return pushToast('danger', error.message)
    pushToast('success', 'ჯოისტიკი გამოცვლილად მონიშნულია — ცვეთა განულდა 🔧')
    await refreshLive()
  }

  return (
    <section className="nm-raised rounded-3xl p-6 lg:col-span-2">
      <div className="mb-5 flex items-center gap-3">
        <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
          <Plug className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">🔌 Hardware კონტროლი</h2>
          <p className="text-xs text-muted-foreground">
            სესია ფიზიკურ ჩართვა/გამორთვას უბამს — TV/სიგნალი ითიშება, <b>არა კონსოლი</b> (SSD-ის დასაცავად).
          </p>
        </div>
      </div>

      <RequireToggle />

      <ShellyAccountCard />

      {consoles.length === 0 ? (
        <p className="nm-inset rounded-2xl p-6 text-center text-sm text-muted-foreground">კონსოლები არ არის.</p>
      ) : (
        <div className="space-y-2.5">
          {consoles.map((c) => (
            <div key={c.id} className="nm-inset flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
              <div className="min-w-32 flex-1">
                <p className="font-bold leading-tight">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.hardware
                    ? `${MODE_LABEL[c.hardware.control_mode] ?? c.hardware.control_mode} · ${c.hardware.driver} · ${TARGET_LABEL[c.hardware.target] ?? c.hardware.target}`
                    : 'არ არის კონფიგურირებული'}
                </p>
                {typeof c.health_score === 'number' && (
                  <p
                    className="mt-0.5 text-[11px] font-bold"
                    style={{ color: c.health_score <= 20 ? 'var(--status-expired)' : c.health_score <= 50 ? 'var(--status-warning5)' : 'var(--muted-foreground)' }}
                  >
                    🔧 ჯანმრთელობა {c.health_score}% · {c.total_sessions_count ?? 0} სესია
                  </p>
                )}
              </div>
              <StatusDot unit={c} />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => forceConsolePower(c.id, true)}
                  className="nm-btn rounded-xl px-3 py-2 text-xs font-bold text-[var(--status-free)] active:scale-95"
                  title="Force ON"
                >
                  <Power className="size-4" />
                </button>
                <button
                  onClick={() => forceConsolePower(c.id, false)}
                  className="nm-btn rounded-xl px-3 py-2 text-xs font-bold text-[var(--status-expired)] active:scale-95"
                  title="Force OFF"
                >
                  <Power className="size-4" />
                </button>
                <button
                  onClick={() => service(c.id)}
                  className="nm-btn rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground active:scale-95"
                  title="ჯოისტიკი შევცვალე (ცვეთის განულება)"
                >
                  <Wrench className="size-4" />
                </button>
                <button
                  onClick={() => setEditId(c.id)}
                  className="nm-btn rounded-xl px-3 py-2 text-xs font-bold text-primary active:scale-95"
                  title="კონფიგურაცია"
                >
                  <Settings2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editUnit && <HardwareEditModal unit={editUnit} onClose={() => setEditId(null)} />}
    </section>
  )
}

function HardwareEditModal({ unit, onClose }: { unit: ConsoleUnit; onClose: () => void }) {
  const { refreshLive, pushToast, forceConsolePower } = usePlayroom()
  const { currentOrgId, currentVenueId } = useOrg()
  const hw = unit.hardware
  const cfg = (hw?.config ?? {}) as Record<string, unknown>

  const [mode, setMode] = useState<string>(hw?.control_mode ?? 'manual')
  const [driver, setDriver] = useState<string>(hw?.driver ?? 'none')
  const [target, setTarget] = useState<string>(hw?.target ?? 'tv')
  const [graceSec, setGraceSec] = useState<string>(hw?.off_delay_seconds != null ? String(hw.off_delay_seconds) : '')
  const [ip, setIp] = useState<string>((cfg.ip as string) ?? '')
  const [port, setPort] = useState<string>(cfg.port != null ? String(cfg.port) : '')
  const [channel, setChannel] = useState<string>(cfg.channel != null ? String(cfg.channel) : '')
  const [deviceId, setDeviceId] = useState<string>((cfg.device_id as string) ?? '')
  const [saving, setSaving] = useState(false)

  const driverOpts = DRIVERS[mode] ?? DRIVERS.manual
  const needsNet = mode === 'agent' || driver === 'shelly_lan' || driver === 'relay_modbus' || driver === 'relay_tcp' || driver === 'hdmi_rs232'
  const needsDevice = driver === 'shelly_cloud' || driver === 'tuya'

  const onModeChange = (m: string) => {
    setMode(m)
    setDriver((DRIVERS[m] ?? DRIVERS.manual)[0].v) // reset driver to a valid one for the mode
  }

  const onTargetChange = (t: string) => {
    setTarget(t)
    if (t === 'light' && !graceSec) setGraceSec('90') // sensible default grace for a billiard lamp
  }

  const save = async () => {
    if (!currentOrgId || !currentVenueId) return
    setSaving(true)
    const { error } = await hwTable().upsert(
      {
        org_id: currentOrgId,
        venue_id: currentVenueId,
        console_id: unit.id,
        control_mode: mode,
        driver,
        target,
        is_active: true,
        off_delay_seconds: Number(graceSec) || 0,
        config: {
          ...(ip ? { ip } : {}),
          ...(port ? { port: Number(port) } : {}),
          ...(channel ? { channel: Number(channel) } : {}),
          ...(deviceId ? { device_id: deviceId } : {}),
        },
      },
      { onConflict: 'console_id' },
    )
    setSaving(false)
    if (error) return pushToast('danger', planErrorText(error.message))
    pushToast('success', 'Hardware შენახულია')
    await refreshLive()
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`🔌 ${unit.name} — Hardware`}>
      <div className="space-y-4">
        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">რეჟიმი</span>
          <select value={mode} onChange={(e) => onModeChange(e.target.value)}
            className="nm-inset mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-semibold outline-none">
            <option value="manual">Manual — მოწყობილობის გარეშე (აღრიცხვა + Force)</option>
            <option value="cloud">Cloud — სმარტ-როზეტი (vendor ღრუბელი)</option>
            <option value="agent">Agent — LAN relay (ლოკალური bridge)</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">მოწყობილობა (driver)</span>
          <select value={driver} onChange={(e) => setDriver(e.target.value)}
            className="nm-inset mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-semibold outline-none">
            {driverOpts.map((d) => <option key={d.v} value={d.v}>{d.t}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">რას თიშავს</span>
          <select value={target} onChange={(e) => onTargetChange(e.target.value)}
            className="nm-inset mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-semibold outline-none">
            <option value="tv">TV — ტელევიზორის კვება (რეკომ.)</option>
            <option value="hdmi">HDMI — სიგნალი</option>
            <option value="network">ქსელი — MAC block</option>
            <option value="console">კონსოლი — პირდაპირ კვება</option>
            <option value="light">შუქი — ბილიარდის ლამპა 🎱</option>
          </select>
        </label>

        {target === 'console' && (
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs font-bold"
            style={{ background: 'color-mix(in oklch, var(--status-expired) 12%, transparent)', color: 'var(--status-expired)' }}>
            <AlertTriangle className="size-4 shrink-0" />
            კონსოლის პირდაპირ გამორთვამ შეიძლება SSD დააზიანოს — სჯობს TV ან HDMI.
          </div>
        )}

        {target === 'light' && (
          <>
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs font-bold"
              style={{ background: 'color-mix(in oklch, var(--status-free) 12%, transparent)', color: 'var(--status-free)' }}>
              <Zap className="size-4 shrink-0" />
              ბილიარდის ლამპა — სტარტზე ავტომატურად ინთება, სესიის ბოლოს ქრება. ლამპა უსაფრთხოა, პირდაპირ ვთიშავთ (SSD-ის რისკი არ არის).
            </div>
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">Grace — შუქი ქრება სესიის დასრულებიდან (წამი)</span>
              <input value={graceSec} onChange={(e) => setGraceSec(e.target.value.replace(/\D/g, ''))} placeholder="90"
                inputMode="numeric"
                className="nm-inset mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-mono outline-none" />
              <span className="mt-1 block text-[11px] text-muted-foreground">0 = მყისიერი. რეკომ. 60–90წმ (გადახდა/მაგიდის აწყობა).</span>
            </label>
          </>
        )}

        {(needsNet || needsDevice) && (
          <div className="grid grid-cols-2 gap-3">
            {needsNet && (
              <>
                <label className="block col-span-2">
                  <span className="text-xs font-bold text-muted-foreground">IP მისამართი</span>
                  <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.50"
                    className="nm-inset mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-mono outline-none" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-muted-foreground">Port</span>
                  <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} placeholder="502"
                    className="nm-inset mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-mono outline-none" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-muted-foreground">Channel</span>
                  <input value={channel} onChange={(e) => setChannel(e.target.value.replace(/\D/g, ''))} placeholder="0"
                    className="nm-inset mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-mono outline-none" />
                </label>
              </>
            )}
            {needsDevice && (
              <>
                <label className="block">
                  <span className="text-xs font-bold text-muted-foreground">Device ID</span>
                  <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="Shelly device id"
                    className="nm-inset mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-mono outline-none" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-muted-foreground">Channel</span>
                  <input value={channel} onChange={(e) => setChannel(e.target.value.replace(/\D/g, ''))} placeholder="0"
                    className="nm-inset mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-mono outline-none" />
                </label>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => forceConsolePower(unit.id, true)}
            className="nm-btn flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-[var(--status-free)]">
            <Zap className="size-4" /> Test ON
          </button>
          <button onClick={() => forceConsolePower(unit.id, false)}
            className="nm-btn flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-[var(--status-expired)]">
            <Power className="size-4" /> Test OFF
          </button>
        </div>

        <button onClick={save} disabled={saving}
          className="nm-daylight w-full rounded-2xl py-3.5 text-sm font-black text-primary disabled:opacity-50">
          {saving ? 'ინახება...' : 'შენახვა'}
        </button>
      </div>
    </Modal>
  )
}
