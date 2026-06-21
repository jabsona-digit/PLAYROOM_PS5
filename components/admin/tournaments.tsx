'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  Trophy,
  Plus,
  ArrowLeft,
  UserPlus,
  Trash2,
  Play,
  Tv,
  Crown,
  X,
  Gamepad2,
  Users,
  ScanLine,
  Dices,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'
import { gel } from '@/lib/ui'
import { Modal } from './modal'

const BarcodeScanner = dynamic(() => import('./barcode-scanner'), { ssr: false })

interface Tournament {
  id: string
  org_id: string
  venue_id: string
  name: string
  game: string | null
  status: 'registration' | 'active' | 'completed' | 'cancelled'
  entry_fee: number
  prize_pool: number
  starts_at: string | null
  bracket_size: number | null
  winner_participant_id: string | null
  created_at: string
  format: 'single_elim' | 'groups_knockout'
  phase: 'groups' | 'knockout' | null
  group_size: number
  advance_per_group: number
  creator_scope?: string
  is_public?: boolean
  promotion_status?: 'pending' | 'approved' | 'rejected' | null
  proposed_commission_pct?: number | null
  commission_pct?: number | null
  rejected_reason?: string | null
  min_participants?: number | null
  prize_second?: number
  prize_third_minutes?: number
  participants?: { count: number }[]
}
interface Registration {
  id: string
  display_name: string
  phone: string | null
  status: 'registered' | 'checked_in' | 'cancelled'
  paid_amount: number | null
  paid_method: string | null
  checked_in_at: string | null
}
interface Participant {
  id: string
  name: string
  phone: string | null
}
interface Match {
  id: string
  round: number
  position: number
  p1_id: string | null
  p2_id: string | null
  winner_id: string | null
  score1: number | null
  score2: number | null
  status: 'pending' | 'live' | 'done'
  group_id?: string | null
  stage?: 'group' | 'knockout'
}

interface StandRow {
  participant_id: string; participant: string
  played: number; won: number; drawn: number; lost: number; gd: number; points: number
}
interface GroupStanding { group: string; group_id: string; rows: StandRow[] }

const STATUS: Record<string, { label: string; color: string }> = {
  registration: { label: 'რეგისტრაცია', color: 'var(--status-warning10)' },
  active: { label: 'მიმდინარე', color: 'var(--status-active)' },
  completed: { label: 'დასრულებული', color: 'var(--status-free)' },
  cancelled: { label: 'გაუქმებული', color: 'var(--status-expired)' },
}

function roundLabel(round: number, total: number) {
  if (round === total) return 'ფინალი'
  if (round === total - 1) return 'ნახევარფინალი'
  if (round === total - 2) return '1/4 ფინალი'
  return `რაუნდი ${round}`
}

// ── Match card (display + score entry) ──────────────────────────────────────
function MatchCard({
  match,
  names,
  onReport,
}: {
  match: Match
  names: Map<string, string>
  onReport: (id: string, s1: number, s2: number) => void
}) {
  const [s1, setS1] = useState('')
  const [s2, setS2] = useState('')
  const p1 = match.p1_id ? names.get(match.p1_id) ?? '—' : 'TBD'
  const p2 = match.p2_id ? names.get(match.p2_id) ?? '—' : 'TBD'
  const ready = !!match.p1_id && !!match.p2_id
  const done = match.status === 'done'
  const w1 = done && match.winner_id === match.p1_id
  const w2 = done && match.winner_id === match.p2_id

  const Side = ({ name, win, score }: { name: string; win: boolean; score: number | null }) => (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm',
        win ? 'bg-[color-mix(in_oklch,var(--status-free)_18%,transparent)] font-bold' : '',
      )}
    >
      <span className="truncate">
        {win && '🏆 '}
        {name}
      </span>
      {score != null && <span className="font-mono font-bold">{score}</span>}
    </div>
  )

  return (
    <div className="nm-raised-sm w-44 shrink-0 rounded-xl p-2">
      {done ? (
        <>
          <Side name={p1} win={w1} score={match.score1} />
          <Side name={p2} win={w2} score={match.score2} />
        </>
      ) : (
        <>
          <Side name={p1} win={false} score={null} />
          <Side name={p2} win={false} score={null} />
          {ready && (
            <div className="mt-1.5 flex items-center gap-1.5 border-t border-border pt-1.5">
              <input
                type="number"
                value={s1}
                onChange={(e) => setS1(e.target.value)}
                placeholder="0"
                className="nm-inset w-9 rounded-md px-1 py-1 text-center text-sm outline-none"
              />
              <span className="text-xs text-muted-foreground">:</span>
              <input
                type="number"
                value={s2}
                onChange={(e) => setS2(e.target.value)}
                placeholder="0"
                className="nm-inset w-9 rounded-md px-1 py-1 text-center text-sm outline-none"
              />
              <button
                onClick={() => onReport(match.id, Number(s1 || 0), Number(s2 || 0))}
                className="nm-btn ml-auto rounded-md px-2 py-1 text-xs font-bold text-primary"
              >
                ✓
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Bracket (rounds as columns) ─────────────────────────────────────────────
function Bracket({
  matches,
  names,
  total,
  onReport,
  big,
}: {
  matches: Match[]
  names: Map<string, string>
  total: number
  onReport: (id: string, s1: number, s2: number) => void
  big?: boolean
}) {
  const rounds = Array.from({ length: total }, (_, i) => i + 1)
  return (
    <div className={cn('flex gap-6 overflow-x-auto pb-3', big && 'gap-10')}>
      {rounds.map((r) => {
        const ms = matches.filter((m) => m.round === r).sort((a, b) => a.position - b.position)
        return (
          <div key={r} className="flex min-w-44 flex-col justify-around gap-3">
            <p className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {roundLabel(r, total)}
            </p>
            {ms.map((m) => (
              <MatchCard key={m.id} match={m} names={names} onReport={onReport} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Groups view (standings tables + group matches) ──────────────────────────
function GroupsView({
  tId, matches, names, advance, onReport, onStartKnockout,
}: {
  tId: string
  matches: Match[]
  names: Map<string, string>
  advance: number
  onReport: (id: string, s1: number, s2: number) => void
  onStartKnockout: () => void
}) {
  const [groups, setGroups] = useState<GroupStanding[]>([])
  const groupMatches = matches.filter((m) => m.stage === 'group')
  const done = groupMatches.filter((m) => m.status === 'done').length
  const allDone = groupMatches.length > 0 && done === groupMatches.length

  useEffect(() => {
    ;(supabase as any).rpc('get_group_standings', { p_tournament: tId }).then(({ data }: { data: unknown }) => {
      if (Array.isArray(data)) setGroups(data as GroupStanding[])
    })
  }, [tId, done])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">ჯგუფური ეტაპი · {done}/{groupMatches.length} მატჩი</p>
        <button
          onClick={onStartKnockout}
          disabled={!allDone}
          className={cn('nm-daylight rounded-2xl px-4 py-2.5 text-sm font-bold text-primary', !allDone && 'cursor-not-allowed opacity-40')}
        >
          🏆 ნოკაუტის დაწყება
        </button>
      </div>

      {groups.map((g) => {
        const gm = groupMatches.filter((m) => m.group_id === g.group_id)
        return (
          <div key={g.group_id} className="nm-raised rounded-3xl p-5">
            <h3 className="mb-3 font-extrabold">ჯგუფი {g.group}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase text-muted-foreground">
                    <th className="w-6 text-left font-semibold">#</th>
                    <th className="text-left font-semibold">მოთამაშე</th>
                    <th className="w-8 text-center font-semibold" title="თამაში">თ</th>
                    <th className="w-8 text-center font-semibold" title="მოგება">მ</th>
                    <th className="w-8 text-center font-semibold" title="ფრე">ფ</th>
                    <th className="w-8 text-center font-semibold" title="წაგება">წ</th>
                    <th className="w-10 text-center font-semibold" title="სხვაობა">+/−</th>
                    <th className="w-9 text-center font-semibold text-primary" title="ქულა">ქ</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr
                      key={r.participant_id}
                      className={cn('border-t border-border', i < advance && 'bg-[color-mix(in_oklch,var(--status-free)_10%,transparent)]')}
                    >
                      <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="font-semibold">{i < advance && '🟢 '}{r.participant}</td>
                      <td className="text-center">{r.played}</td>
                      <td className="text-center">{r.won}</td>
                      <td className="text-center">{r.drawn}</td>
                      <td className="text-center">{r.lost}</td>
                      <td className="text-center">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                      <td className="text-center font-mono font-black text-primary">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">🟢 ზედა {advance} გადადის ნოკაუტში · მოგება 3 ქ · ფრე 1 ქ</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {gm.map((m) => <MatchCard key={m.id} match={m} names={names} onReport={onReport} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tournament detail (registration + bracket) ──────────────────────────────
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="nm-inset rounded-xl px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-extrabold', accent ? 'text-[var(--status-free)]' : 'text-foreground')}>{value}</p>
    </div>
  )
}

interface DrawData {
  format: string
  groups?: { group: string; players: string[] }[]
  players?: string[]
}

function DrawReveal({ draw, onClose }: { draw: DrawData; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[110] flex flex-col items-center overflow-auto bg-background/95 p-6 backdrop-blur-sm md:p-10">
      <style>{`@keyframes mtl-fadeup{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}`}</style>
      <div className="mb-8 flex items-center gap-3">
        <Dices className="size-8 text-primary" />
        <h1 className="text-3xl font-extrabold text-primary text-glow md:text-4xl">ვირტუალური დოლორა</h1>
      </div>
      {draw.format === 'groups_knockout' && draw.groups ? (
        <div className="grid w-full max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {draw.groups.map((g, gi) => (
            <div
              key={g.group}
              className="nm-raised rounded-3xl p-5"
              style={{ animation: 'mtl-fadeup .5s ease-out both', animationDelay: `${gi * 280}ms` }}
            >
              <h2 className="mb-3 text-center text-lg font-extrabold text-primary">ჯგუფი {g.group}</h2>
              <div className="space-y-2">
                {g.players.map((p, pi) => (
                  <div
                    key={p}
                    className="nm-inset rounded-xl px-4 py-2.5 text-center text-sm font-semibold"
                    style={{ animation: 'mtl-fadeup .4s ease-out both', animationDelay: `${gi * 280 + pi * 140 + 220}ms` }}
                  >
                    {p}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="w-full max-w-md space-y-2">
          {(draw.players ?? []).map((p, pi) => (
            <div
              key={p}
              className="nm-inset rounded-xl px-4 py-2.5 text-center text-sm font-semibold"
              style={{ animation: 'mtl-fadeup .4s ease-out both', animationDelay: `${pi * 140}ms` }}
            >
              {p}
            </div>
          ))}
        </div>
      )}
      <button onClick={onClose} className="nm-btn mt-10 rounded-2xl px-8 py-3 text-sm font-bold text-primary">
        დახურვა და ცხრილზე გადასვლა
      </button>
    </div>
  )
}

function RegistrationsPanel({
  tId,
  format,
  min,
  onDrawn,
}: {
  tId: string
  format: string
  min: number
  onDrawn: () => void
}) {
  const { pushToast } = usePlayroom()
  const { currentOrgId } = useOrg()
  const [regs, setRegs] = useState<Registration[]>([])
  const [walkIns, setWalkIns] = useState<Participant[]>([])
  const [wName, setWName] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draw, setDraw] = useState<DrawData | null>(null)

  const load = useCallback(async () => {
    const [{ data: rs }, { data: ps }] = await Promise.all([
      (supabase as any).rpc('get_tournament_registrations', { p_tournament: tId }),
      (supabase as any).from('tournament_participants').select('id, name, phone').eq('tournament_id', tId).order('created_at'),
    ])
    setRegs((rs ?? []) as Registration[])
    setWalkIns((ps ?? []) as Participant[])
  }, [tId])
  useEffect(() => {
    load()
  }, [load])

  const checkedIn = regs.filter((r) => r.status === 'checked_in').length
  const registered = regs.filter((r) => r.status !== 'cancelled').length
  const collected = regs.reduce((s, r) => s + (r.status === 'checked_in' ? Number(r.paid_amount ?? 0) : 0), 0)
  const drawCount = checkedIn + walkIns.length
  const minPlayers = format === 'groups_knockout' ? 3 : 2
  const need = Math.max(minPlayers, min || 0)

  const addWalkIn = async () => {
    if (!wName.trim() || !currentOrgId) return
    const { error } = await (supabase as any).from('tournament_participants').insert({
      tournament_id: tId,
      org_id: currentOrgId,
      name: wName.trim(),
    })
    if (error) return pushToast('danger', error.message)
    setWName('')
    load()
  }

  const removeWalkIn = async (id: string) => {
    await (supabase as any).from('tournament_participants').delete().eq('id', id)
    load()
  }

  const checkin = async (regId: string) => {
    const { data, error } = await (supabase as any).rpc('checkin_tournament_registration', {
      p_registration: regId,
      p_method: 'cash',
      p_amount: null,
    })
    if (error) {
      const m = /not_found/.test(error.message)
        ? 'QR ვერ მოიძებნა — არასწორი ან სხვა ტურნირის'
        : /not_authorized/.test(error.message)
          ? 'არ გაქვს უფლება'
          : error.message
      return pushToast('danger', m)
    }
    const d = data as { display_name: string; already: boolean; paid_amount: number }
    pushToast(
      'success',
      d.already ? `${d.display_name} — უკვე გავლილია ✓` : `✅ ${d.display_name} — შემოწმდა (${gel(d.paid_amount)})`,
    )
    load()
  }

  const handleScan = (raw: string) => {
    const id = raw.startsWith('MTLT:') ? raw.slice(5) : raw
    setScanOpen(false)
    checkin(id)
  }

  const runDraw = async () => {
    setBusy(true)
    const { data, error } = await (supabase as any).rpc('draw_tournament_groups', { p_tournament: tId })
    setBusy(false)
    if (error) {
      const below = error.message.match(/below_minimum:(\d+):(\d+)/)
      const m = below
        ? `მინიმუმი ვერ შესრულდა — საჭიროა ${below[2]} მონაწილე, ახლა ${below[1]}. ტურნირი ვერ ეწყობა.`
        : /already_drawn/.test(error.message)
          ? 'გათამაშება უკვე ჩატარდა'
          : /need_two|need_three/.test(error.message)
            ? 'საჭიროა მეტი დადასტურებული მონაწილე'
            : error.message
      return pushToast('danger', m)
    }
    setDraw(data as DrawData)
  }

  return (
    <section className="nm-raised rounded-3xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-primary" />
          <h3 className="font-bold">ონლაინ რეგისტრაციები</h3>
        </div>
        <button
          onClick={() => setScanOpen(true)}
          className="nm-btn flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-primary"
        >
          <ScanLine className="size-4" /> QR სკანირება
        </button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="რეგისტრ." value={String(registered)} />
        <Stat label="გავლილი" value={String(checkedIn)} accent />
        <Stat label="შემოსული" value={gel(collected)} />
      </div>

      <div className="space-y-2">
        {regs.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            ჯერ რეგისტრაცია არ არის — გაუზიარე ტურნირის ბმული play.martelounge.ge/tournaments
          </p>
        )}
        {regs.map((r) => (
          <div key={r.id} className="nm-raised-sm flex items-center justify-between gap-2 rounded-xl px-4 py-2.5">
            <span className="min-w-0 text-sm">
              <span className="font-semibold">{r.display_name}</span>
              {r.phone && <span className="ml-2 text-xs text-muted-foreground">{r.phone}</span>}
            </span>
            {r.status === 'checked_in' ? (
              <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--status-free)]">
                <Check className="size-4" /> გავლილი
              </span>
            ) : r.status === 'cancelled' ? (
              <span className="shrink-0 text-xs text-muted-foreground">გაუქმდა</span>
            ) : (
              <button
                onClick={() => checkin(r.id)}
                className="nm-btn shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-primary"
              >
                ✓ check-in
              </button>
            )}
          </div>
        ))}
      </div>

      {/* walk-ins — added at the venue, no online registration */}
      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <p className="mb-2 text-xs font-bold text-muted-foreground">ადგილზე დამატება (walk-in) · {walkIns.length}</p>
        <div className="mb-2 flex gap-2">
          <input
            value={wName}
            onChange={(e) => setWName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addWalkIn()}
            placeholder="სახელი / ნიკი"
            className="nm-inset min-w-32 flex-1 rounded-xl px-4 py-2 text-sm outline-none"
          />
          <button onClick={addWalkIn} className="nm-btn flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold text-primary">
            <UserPlus className="size-4" /> დამატება
          </button>
        </div>
        {walkIns.map((p) => (
          <div key={p.id} className="nm-raised-sm mb-1.5 flex items-center justify-between rounded-xl px-4 py-2">
            <span className="text-sm font-semibold">{p.name}</span>
            <button onClick={() => removeWalkIn(p.id)} className="text-[var(--status-expired)]">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={runDraw}
        disabled={busy || drawCount < need}
        className={cn(
          'nm-daylight mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-primary',
          (busy || drawCount < need) && 'cursor-not-allowed opacity-40',
        )}
      >
        <Dices className="size-4" /> ვირტუალური დოლორა — გათამაშება და დაწყება ({drawCount}/{need})
      </button>
      {drawCount < need && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {min > 0 ? `საჭიროა მინ. ${need} მონაწილე — ზარალისგან დაცვა` : `საჭიროა მინ. ${need} მონაწილე (გავლილი + walk-in)`}
        </p>
      )}

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />
      {draw && (
        <DrawReveal
          draw={draw}
          onClose={() => {
            setDraw(null)
            onDrawn()
          }}
        />
      )}
    </section>
  )
}

function Detail({ t, onBack, onChanged }: { t: Tournament; onBack: () => void; onChanged: () => void }) {
  const { currentOrgId } = useOrg()
  const { pushToast } = usePlayroom()
  const [tournament, setTournament] = useState<Tournament>(t)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [pName, setPName] = useState('')
  const [pPhone, setPPhone] = useState('')
  const [tv, setTv] = useState(false)

  const names = new Map(participants.map((p) => [p.id, p.name]))
  const total = tournament.bracket_size ? Math.log2(tournament.bracket_size) : 0
  const champion = tournament.winner_participant_id
    ? names.get(tournament.winner_participant_id)
    : null

  const load = useCallback(async () => {
    const [{ data: tt }, { data: ps }, { data: ms }] = await Promise.all([
      (supabase as any).from('tournaments').select('*').eq('id', t.id).single(),
      (supabase as any).from('tournament_participants')
        .select('id, name, phone')
        .eq('tournament_id', t.id)
        .order('created_at'),
      (supabase as any).from('tournament_matches')
        .select('id, round, position, p1_id, p2_id, winner_id, score1, score2, status, group_id, stage')
        .eq('tournament_id', t.id)
        .order('round')
        .order('position'),
    ])
    if (tt) setTournament(tt as Tournament)
    setParticipants((ps ?? []) as Participant[])
    setMatches((ms ?? []) as Match[])
  }, [t.id])

  useEffect(() => {
    load()
  }, [load])

  // keep TV mode live
  useEffect(() => {
    if (!tv) return
    const iv = setInterval(load, 5000)
    return () => clearInterval(iv)
  }, [tv, load])

  const addParticipant = async () => {
    if (!pName.trim() || !currentOrgId) return
    const { error } = await (supabase as any).from('tournament_participants').insert({
      tournament_id: t.id,
      org_id: currentOrgId,
      name: pName.trim(),
      phone: pPhone.trim() || null,
    })
    if (error) return pushToast('danger', error.message)
    setPName('')
    setPPhone('')
    load()
  }

  const removeParticipant = async (id: string) => {
    await (supabase as any).from('tournament_participants').delete().eq('id', id)
    load()
  }

  const isGroups = tournament.format === 'groups_knockout'
  const promoPending = tournament.promotion_status === 'pending'

  const seed = async () => {
    if (tournament.min_participants && participants.length < tournament.min_participants) {
      return pushToast('danger', `საჭიროა მინ. ${tournament.min_participants} მონაწილე — ახლა ${participants.length}. ტურნირი ვერ ეწყობა.`)
    }
    const { error } = await (supabase as any).rpc(isGroups ? 'seed_group_stage' : 'seed_tournament', { p_tournament: t.id })
    if (error) {
      const m = /need_two|need_three/.test(error.message)
        ? `საჭიროა მინიმუმ ${isGroups ? 3 : 2} მონაწილე`
        : /already_seeded/.test(error.message)
          ? 'უკვე დაწყებულია'
          : error.message
      return pushToast('danger', m)
    }
    pushToast('success', isGroups ? 'ჯგუფები გენერირდა — ტურნირი დაიწყო!' : 'ბადე გენერირდა — ტურნირი დაიწყო!')
    load()
    onChanged()
  }

  const startKnockout = async () => {
    const { error } = await (supabase as any).rpc('start_knockout_from_groups', { p_tournament: t.id })
    if (error) {
      const m = /group_stage_incomplete/.test(error.message)
        ? 'ჯერ ყველა ჯგუფური მატჩი უნდა დასრულდეს'
        : /knockout_already/.test(error.message)
          ? 'ნოკაუტი უკვე დაწყებულია'
          : error.message
      return pushToast('danger', m)
    }
    pushToast('success', '🏆 ნოკაუტი დაიწყო!')
    load()
    onChanged()
  }

  const report = async (id: string, s1: number, s2: number) => {
    const isGroupMatch = matches.find((m) => m.id === id)?.stage === 'group'
    if (!isGroupMatch && s1 === s2) return pushToast('danger', 'ფრე არ შეიძლება — ნოკაუტში ვინმემ უნდა მოიგოს')
    const { error } = await (supabase as any).rpc('report_match', {
      p_match: id,
      p_score1: s1,
      p_score2: s2,
    })
    if (error) return pushToast('danger', error.message)
    load()
    onChanged()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="nm-btn flex size-10 items-center justify-center rounded-xl">
            <ArrowLeft className="size-5 text-muted-foreground" />
          </button>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">{tournament.name}</h2>
            <p className="text-xs text-muted-foreground">
              {tournament.game} · <span style={{ color: STATUS[tournament.status]?.color }}>{STATUS[tournament.status]?.label}</span>
            </p>
          </div>
        </div>
        {tournament.status !== 'registration' && (
          <button onClick={() => setTv(true)} className="nm-btn flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-primary">
            <Tv className="size-4" /> TV რეჟიმი
          </button>
        )}
      </div>

      {(Number(tournament.prize_pool) > 0 ||
        Number(tournament.prize_second) > 0 ||
        Number(tournament.prize_third_minutes) > 0 ||
        tournament.min_participants) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {Number(tournament.entry_fee) > 0 && (
            <span className="nm-inset rounded-full px-3 py-1.5">💰 საწევრო {gel(tournament.entry_fee)}</span>
          )}
          {Number(tournament.prize_pool) > 0 && (
            <span className="nm-inset rounded-full px-3 py-1.5">🥇 {gel(tournament.prize_pool)}</span>
          )}
          {Number(tournament.prize_second) > 0 && (
            <span className="nm-inset rounded-full px-3 py-1.5">🥈 {gel(tournament.prize_second ?? 0)}</span>
          )}
          {Number(tournament.prize_third_minutes) > 0 && (
            <span className="nm-inset rounded-full px-3 py-1.5">🥉 {tournament.prize_third_minutes} წთ უფასო</span>
          )}
          {tournament.min_participants ? (
            <span className="nm-inset rounded-full px-3 py-1.5">👥 მინ. {tournament.min_participants}</span>
          ) : null}
        </div>
      )}

      {champion && (
        <div className="nm-daylight flex items-center justify-center gap-3 rounded-3xl p-6 text-center">
          <Crown className="size-7 text-primary" />
          <span className="text-xl font-extrabold text-primary text-glow">ჩემპიონი: {champion}</span>
        </div>
      )}

      {tournament.promotion_status && (
        <div
          className="nm-inset rounded-2xl p-4 text-sm"
          style={{
            color:
              tournament.promotion_status === 'approved'
                ? 'var(--status-free)'
                : tournament.promotion_status === 'rejected'
                  ? 'var(--status-expired)'
                  : 'var(--status-active)',
          }}
        >
          {tournament.promotion_status === 'pending' &&
            `⏳ Global მოთხოვნა გაგზავნილია — დაელოდე პლატფორმის დადასტურებას (შემოთავაზებული კომისია ${tournament.proposed_commission_pct ?? 0}%)`}
          {tournament.promotion_status === 'approved' &&
            `🌍 Global — დადასტურდა, marketplace-ზეა (კომისია ${tournament.commission_pct ?? 0}%)`}
          {tournament.promotion_status === 'rejected' &&
            `❌ Global უარყოფილია${tournament.rejected_reason ? `: ${tournament.rejected_reason}` : ''} — ლოკალურად ჩატარება შესაძლებელია`}
        </div>
      )}

      {tournament.status === 'registration' && tournament.is_public ? (
        <RegistrationsPanel
          tId={t.id}
          format={tournament.format}
          min={tournament.min_participants ?? 0}
          onDrawn={() => {
            load()
            onChanged()
          }}
        />
      ) : tournament.status === 'registration' ? (
        <section className="nm-raised rounded-3xl p-6">
          <div className="mb-4 flex items-center gap-2">
            <Users className="size-5 text-primary" />
            <h3 className="font-bold">მონაწილეები ({participants.length})</h3>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addParticipant()}
              placeholder="სახელი"
              className="nm-inset min-w-40 flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
            />
            <input
              value={pPhone}
              onChange={(e) => setPPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addParticipant()}
              placeholder="ტელეფონი (არასავალდებულო)"
              className="nm-inset w-44 rounded-xl px-4 py-2.5 text-sm outline-none"
            />
            <button onClick={addParticipant} className="nm-btn flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-primary">
              <UserPlus className="size-4" /> დამატება
            </button>
          </div>
          <div className="space-y-2">
            {participants.map((p, i) => (
              <div key={p.id} className="nm-raised-sm flex items-center justify-between rounded-xl px-4 py-2.5">
                <span className="text-sm">
                  <span className="mr-2 font-mono text-muted-foreground">{i + 1}.</span>
                  <span className="font-semibold">{p.name}</span>
                  {p.phone && <span className="ml-2 text-xs text-muted-foreground">{p.phone}</span>}
                </span>
                <button onClick={() => removeParticipant(p.id)} className="text-[var(--status-expired)]">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            {participants.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">დაამატე მონაწილეები</p>
            )}
          </div>
          <button
            onClick={seed}
            disabled={participants.length < 2 || promoPending}
            className={cn(
              'nm-daylight mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-primary',
              (participants.length < 2 || promoPending) && 'cursor-not-allowed opacity-40',
            )}
          >
            <Play className="size-4" /> {promoPending ? 'დაელოდე დადასტურებას' : 'ბადის გენერაცია და დაწყება'}
          </button>
        </section>
      ) : isGroups && tournament.phase === 'groups' ? (
        <GroupsView
          tId={t.id}
          matches={matches}
          names={names}
          advance={tournament.advance_per_group}
          onReport={report}
          onStartKnockout={startKnockout}
        />
      ) : (
        <section className="nm-raised rounded-3xl p-6">
          <Bracket matches={matches.filter((m) => m.stage !== 'group')} names={names} total={total} onReport={report} />
        </section>
      )}

      {/* TV mode — full-screen live bracket */}
      {tv && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-background p-6 md:p-10">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="size-8 text-primary" />
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight md:text-4xl">{tournament.name}</h1>
                <p className="text-sm text-muted-foreground">{tournament.game} · LIVE</p>
              </div>
            </div>
            <button onClick={() => setTv(false)} className="nm-btn flex size-12 items-center justify-center rounded-2xl">
              <X className="size-6 text-muted-foreground" />
            </button>
          </div>
          {champion && (
            <div className="nm-daylight mb-6 flex items-center justify-center gap-3 rounded-3xl p-5">
              <Crown className="size-8 text-primary" />
              <span className="text-3xl font-extrabold text-primary text-glow">ჩემპიონი: {champion}</span>
            </div>
          )}
          <div className="flex-1 overflow-auto">
            <div className="scale-100 md:scale-125 md:origin-top-left">
              <Bracket matches={matches.filter((m) => m.stage !== 'group')} names={names} total={total} onReport={report} big />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main module ─────────────────────────────────────────────────────────────
interface Opportunity {
  id: string
  name: string
  game: string | null
  format: string
  entry_fee: number | null
  prize_pool: number | null
  starts_at: string | null
  group_size: number
  advance_per_group: number
  my_offer: {
    id: string
    status: string
    venue_id: string
    proposed_amount: number | null
    agreed_amount: number | null
  } | null
}

function HostingOpportunities({ orgId }: { orgId: string }) {
  const { pushToast } = usePlayroom()
  const [ops, setOps] = useState<Opportunity[]>([])
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([])
  const [draft, setDraft] = useState<Record<string, { venue: string; amount: string; note: string }>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await (supabase as any).rpc('list_hosting_opportunities', {})
    setOps((data ?? []) as Opportunity[])
  }, [])

  useEffect(() => {
    load()
    ;(supabase as any)
      .from('venues')
      .select('id,name')
      .eq('org_id', orgId)
      .then(({ data }: { data: { id: string; name: string }[] | null }) => setVenues(data ?? []))
  }, [load, orgId])

  const offer = async (opId: string) => {
    const d = draft[opId] || { venue: '', amount: '', note: '' }
    const venueId = d.venue || venues[0]?.id
    if (!venueId) return pushToast('danger', 'ჯერ შექმენი ფილიალი')
    setBusy(true)
    const { error } = await (supabase as any).rpc('submit_host_offer', {
      p_tournament: opId,
      p_venue_id: venueId,
      p_note: d.note || '',
      p_proposed: d.amount ? Number(d.amount) : null,
    })
    setBusy(false)
    if (error) return pushToast('danger', error.message)
    pushToast('success', '✅ შემოთავაზება გაიგზავნა — დაელოდე პლატფორმის პასუხს')
    load()
  }

  if (ops.length === 0) return null

  return (
    <section className="nm-raised rounded-3xl p-6">
      <h2 className="flex items-center gap-2 text-lg font-extrabold">🏆 ჰოსტინგის შესაძლებლობები</h2>
      <p className="mt-1 text-xs text-muted-foreground text-pretty">
        პლატფორმის ტურნირები ეძებენ ჰოსტს — შემოთავაზე შენი სივრცე და თანხა, რომელშიც უმასპინძლებ.
      </p>
      <div className="mt-4 space-y-3">
        {ops.map((op) => {
          const d = draft[op.id] || { venue: '', amount: '', note: '' }
          const mine = op.my_offer
          return (
            <div key={op.id} className="nm-inset rounded-2xl p-4">
              <div>
                <p className="font-bold">
                  {op.name}
                  {op.game && <span className="text-muted-foreground"> · {op.game}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  💰 {gel(op.entry_fee ?? 0)} · 🏆 {gel(op.prize_pool ?? 0)}
                  {op.starts_at && ` · 📅 ${new Date(op.starts_at).toLocaleString('ka-GE', { dateStyle: 'short', timeStyle: 'short' })}`}
                </p>
              </div>

              {mine ? (
                <p
                  className="mt-3 text-sm font-semibold"
                  style={{
                    color:
                      mine.status === 'accepted'
                        ? 'var(--status-free)'
                        : mine.status === 'declined'
                          ? 'var(--status-expired)'
                          : 'var(--status-active)',
                  }}
                >
                  {mine.status === 'offered' && '⏳ შემოთავაზება გაგზავნილია — დაელოდე პასუხს'}
                  {mine.status === 'accepted' && `✅ შენ შეგირჩიეს! შეთანხმება ${gel(mine.agreed_amount ?? 0)}`}
                  {mine.status === 'declined' && '❌ ამ ტურნირზე სხვა ვენიუ შეირჩა'}
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  {venues.length > 1 && (
                    <select
                      value={d.venue || venues[0]?.id || ''}
                      onChange={(e) => setDraft({ ...draft, [op.id]: { ...d, venue: e.target.value } })}
                      className="nm-inset rounded-xl px-3 py-2 text-sm outline-none"
                    >
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="number"
                    placeholder="თანხა ₾"
                    value={d.amount}
                    onChange={(e) => setDraft({ ...draft, [op.id]: { ...d, amount: e.target.value } })}
                    className="nm-inset w-28 rounded-xl px-3 py-2 text-sm outline-none"
                  />
                  <input
                    placeholder="შენიშვნა (არჩევითი)"
                    value={d.note}
                    onChange={(e) => setDraft({ ...draft, [op.id]: { ...d, note: e.target.value } })}
                    className="nm-inset min-w-[8rem] flex-1 rounded-xl px-3 py-2 text-sm outline-none"
                  />
                  <button
                    disabled={busy}
                    onClick={() => offer(op.id)}
                    className="nm-btn shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-primary disabled:opacity-50"
                  >
                    შემოთავაზება
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function Tournaments() {
  const { currentOrgId, currentVenueId } = useOrg()
  const { pushToast } = usePlayroom()
  const [list, setList] = useState<Tournament[]>([])
  const [selected, setSelected] = useState<Tournament | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ name: '', game: '', starts_at: '', entry_fee: '', prize_pool: '', format: 'groups_knockout', group_size: '4', advance_per_group: '2', scope: 'local', commission: '10', min_enabled: false, min: '8', prize_second: '', prize_third_minutes: '' })

  const load = useCallback(async () => {
    if (!currentOrgId) return
    // disambiguate the embed: tournaments↔tournament_participants has TWO FKs
    // (participants.tournament_id AND tournaments.winner_participant_id) → without the
    // !tournament_id hint PostgREST returns 300 Multiple Choices → the whole list is empty.
    const { data } = await (supabase as any).from('tournaments')
      .select('*, participants:tournament_participants!tournament_id(count)')
      .eq('org_id', currentOrgId)
      .order('created_at', { ascending: false })
    setList((data ?? []) as Tournament[])
  }, [currentOrgId])

  useEffect(() => {
    load()
  }, [load])

  const create = async () => {
    if (!form.name.trim() || !currentOrgId || !currentVenueId) {
      return pushToast('danger', 'შეავსე სახელი (და აირჩიე ფილიალი)')
    }
    const { data, error } = await (supabase as any).from('tournaments')
      .insert({
        org_id: currentOrgId,
        venue_id: currentVenueId,
        name: form.name.trim(),
        game: form.game.trim() || null,
        format: form.format,
        group_size: Number(form.group_size || 4),
        advance_per_group: Number(form.advance_per_group || 2),
        entry_fee: Number(form.entry_fee || 0),
        prize_pool: Number(form.prize_pool || 0),
        prize_second: Number(form.prize_second || 0),
        prize_third_minutes: Number(form.prize_third_minutes || 0),
        min_participants: form.min_enabled ? Number(form.min || 0) : null,
        starts_at: form.starts_at || null,
      })
      .select('*')
      .single()
    if (error) return pushToast('danger', error.message)
    if (form.scope === 'global' && data) {
      const { error: pErr } = await (supabase as any).rpc('submit_tournament_for_promotion', {
        p_tournament: (data as Tournament).id,
        p_commission: Number(form.commission || 0),
      })
      if (pErr) pushToast('danger', `ტურნირი შეიქმნა, მაგრამ მოთხოვნა ვერ გაიგზავნა: ${pErr.message}`)
      else pushToast('success', '🌍 Global მოთხოვნა გაიგზავნა — დაელოდე დადასტურებას')
    } else {
      pushToast('success', 'ტურნირი შეიქმნა')
    }
    setCreateOpen(false)
    setForm({ name: '', game: '', starts_at: '', entry_fee: '', prize_pool: '', format: 'groups_knockout', group_size: '4', advance_per_group: '2', scope: 'local', commission: '10', min_enabled: false, min: '8', prize_second: '', prize_third_minutes: '' })
    load()
    setSelected(data as Tournament)
  }

  const del = async (id: string) => {
    await (supabase as any).from('tournaments').delete().eq('id', id)
    pushToast('info', 'ტურნირი წაიშალა')
    setSelected(null)
    load()
  }

  if (selected) {
    return (
      <div>
        <div className="mb-3 flex justify-end">
          <button onClick={() => del(selected.id)} className="text-xs font-bold text-[var(--status-expired)]">
            ტურნირის წაშლა
          </button>
        </div>
        <Detail t={selected} onBack={() => { setSelected(null); load() }} onChanged={load} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {currentOrgId && <HostingOpportunities orgId={currentOrgId} />}

      <section className="nm-raised rounded-3xl p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
              <Trophy className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">ტურნირები</h2>
              <p className="text-xs text-muted-foreground">PS5 ტურნირები — ბადე, მატჩები, გამარჯვებული</p>
            </div>
          </div>
          <button onClick={() => setCreateOpen(true)} className="nm-btn flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-primary">
            <Plus className="size-4" /> <span className="hidden sm:inline">ახალი ტურნირი</span>
          </button>
        </div>

        {list.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">ჯერ ტურნირი არ არის — შექმენი პირველი 🏆</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((t) => {
              const s = STATUS[t.status] ?? { label: t.status, color: 'var(--muted-foreground)' }
              const count = t.participants?.[0]?.count ?? 0
              return (
                <button key={t.id} onClick={() => setSelected(t)} className="nm-btn rounded-2xl p-4 text-left">
                  <div className="flex items-center justify-between">
                    <Gamepad2 className="size-5 text-primary" />
                    <span className="text-xs font-bold" style={{ color: s.color }}>{s.label}</span>
                  </div>
                  <h3 className="mt-2 font-bold">{t.name}</h3>
                  {t.game && <p className="text-xs text-muted-foreground">{t.game}</p>}
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="size-3.5" /> {count}</span>
                    {Number(t.prize_pool) > 0 && <span>🏆 {gel(t.prize_pool)}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="ახალი ტურნირი">
        <div className="space-y-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ტურნირის სახელი (მაგ. FIFA 25 Cup)" className="nm-inset w-full rounded-xl px-4 py-2.5 text-sm outline-none" />
          <input value={form.game} onChange={(e) => setForm({ ...form, game: e.target.value })} placeholder="თამაში (მაგ. EA FC 25, Mortal Kombat)" className="nm-inset w-full rounded-xl px-4 py-2.5 text-sm outline-none" />
          <div>
            <span className="text-xs text-muted-foreground">ტიპი</span>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => setForm({ ...form, scope: 'local' })} className={cn('flex-1 rounded-xl px-3 py-2 text-xs font-bold', form.scope === 'local' ? 'nm-daylight text-primary' : 'nm-inset text-muted-foreground')}>🏠 ლოკალური</button>
              <button type="button" onClick={() => setForm({ ...form, scope: 'global' })} className={cn('flex-1 rounded-xl px-3 py-2 text-xs font-bold', form.scope === 'global' ? 'nm-daylight text-primary' : 'nm-inset text-muted-foreground')}>🌍 Global (marketplace)</button>
            </div>
            {form.scope === 'global' && (
              <div className="mt-2">
                <p className="mb-1 text-[11px] text-muted-foreground">Global = play.martelounge.ge-ზე გამოჩნდება პლატფორმის დადასტურების შემდეგ (ონლაინ რეგისტრაცია + QR). შემოთავაზე კომისიის %:</p>
                <div className="flex items-center gap-2">
                  <input type="number" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })} className="nm-inset w-24 rounded-xl px-4 py-2.5 text-sm outline-none" />
                  <span className="text-sm text-muted-foreground">% კომისია პლატფორმას</span>
                </div>
              </div>
            )}
          </div>
          <div>
            <span className="text-xs text-muted-foreground">ფორმატი</span>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => setForm({ ...form, format: 'groups_knockout' })} className={cn('flex-1 rounded-xl px-3 py-2 text-xs font-bold', form.format === 'groups_knockout' ? 'nm-daylight text-primary' : 'nm-inset text-muted-foreground')}>⚽ ჯგუფები + ნოკაუტი</button>
              <button type="button" onClick={() => setForm({ ...form, format: 'single_elim' })} className={cn('flex-1 rounded-xl px-3 py-2 text-xs font-bold', form.format === 'single_elim' ? 'nm-daylight text-primary' : 'nm-inset text-muted-foreground')}>🏆 პირდაპირი ნოკაუტი</button>
            </div>
          </div>
          {form.format === 'groups_knockout' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-muted-foreground">ჯგუფში მოთამაშე</span>
                <input type="number" value={form.group_size} onChange={(e) => setForm({ ...form, group_size: e.target.value })} className="nm-inset mt-1 w-full rounded-xl px-4 py-2.5 text-sm outline-none" />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">გადადის ნოკაუტში</span>
                <input type="number" value={form.advance_per_group} onChange={(e) => setForm({ ...form, advance_per_group: e.target.value })} className="nm-inset mt-1 w-full rounded-xl px-4 py-2.5 text-sm outline-none" />
              </label>
            </div>
          )}
          <label className="block">
            <span className="text-xs text-muted-foreground">შესვლის ფასი (საწევრო ₾)</span>
            <input type="number" value={form.entry_fee} onChange={(e) => setForm({ ...form, entry_fee: e.target.value })} placeholder="0" className="nm-inset mt-1 w-full rounded-xl px-4 py-2.5 text-sm outline-none" />
          </label>

          <div>
            <span className="text-xs text-muted-foreground">საპრიზო სტრუქტურა</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-[11px] text-muted-foreground">🥇 1 ადგ. (₾)</span>
                <input type="number" value={form.prize_pool} onChange={(e) => setForm({ ...form, prize_pool: e.target.value })} placeholder="0" className="nm-inset mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none" />
              </label>
              <label className="block">
                <span className="text-[11px] text-muted-foreground">🥈 2 ადგ. (₾)</span>
                <input type="number" value={form.prize_second} onChange={(e) => setForm({ ...form, prize_second: e.target.value })} placeholder="0" className="nm-inset mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none" />
              </label>
              <label className="block">
                <span className="text-[11px] text-muted-foreground">🥉 3 ადგ. (წთ)</span>
                <input type="number" value={form.prize_third_minutes} onChange={(e) => setForm({ ...form, prize_third_minutes: e.target.value })} placeholder="0" className="nm-inset mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none" />
              </label>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">🥉 = უფასო სათამაშო წუთები</p>
          </div>

          <div className="nm-inset rounded-xl p-3">
            <label className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">მინიმალური მონაწილეები</span>
              <input type="checkbox" checked={form.min_enabled} onChange={(e) => setForm({ ...form, min_enabled: e.target.checked })} className="size-4 accent-[var(--primary)]" />
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground text-pretty">
              თუ ნაკლები მოვა, გათამაშება დაიბლოკება — ზარალისგან დაცვა (მაგ. 4×20₾=80₾ &lt; 200₾ პრიზი).
            </p>
            {form.min_enabled && (
              <label className="mt-2 block">
                <span className="text-[11px] text-muted-foreground">საჭირო მონაწილეთა მინიმუმი</span>
                <input type="number" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} placeholder="8" className="nm-inset mt-1 w-full rounded-xl px-4 py-2.5 text-sm outline-none" />
              </label>
            )}
          </div>

          <label className="block">
            <span className="text-xs text-muted-foreground">დაწყება (არასავალდებულო)</span>
            <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className="nm-inset mt-1 w-full rounded-xl px-4 py-2.5 text-sm outline-none" />
          </label>
          <button onClick={create} className="nm-daylight mt-2 w-full rounded-2xl px-4 py-3 text-sm font-bold text-primary">
            შექმნა
          </button>
        </div>
      </Modal>
    </div>
  )
}
