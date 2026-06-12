'use client'

import { useState, useEffect, useCallback } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'
import { gel } from '@/lib/ui'
import { Modal } from './modal'

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
  participants?: { count: number }[]
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
}

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

// ── Tournament detail (registration + bracket) ──────────────────────────────
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
        .select('id, round, position, p1_id, p2_id, winner_id, score1, score2, status')
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

  const seed = async () => {
    const { error } = await (supabase as any).rpc('seed_tournament', { p_tournament: t.id })
    if (error) {
      const m = /need_two/.test(error.message)
        ? 'საჭიროა მინიმუმ 2 მონაწილე'
        : /already_seeded/.test(error.message)
          ? 'ბადე უკვე გენერირებულია'
          : error.message
      return pushToast('danger', m)
    }
    pushToast('success', 'ბადე გენერირდა — ტურნირი დაიწყო!')
    load()
    onChanged()
  }

  const report = async (id: string, s1: number, s2: number) => {
    if (s1 === s2) return pushToast('danger', 'ფრე არ შეიძლება — ვინმემ უნდა მოიგოს')
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

      {champion && (
        <div className="nm-daylight flex items-center justify-center gap-3 rounded-3xl p-6 text-center">
          <Crown className="size-7 text-primary" />
          <span className="text-xl font-extrabold text-primary text-glow">ჩემპიონი: {champion}</span>
        </div>
      )}

      {tournament.status === 'registration' ? (
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
            disabled={participants.length < 2}
            className={cn(
              'nm-daylight mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-primary',
              participants.length < 2 && 'cursor-not-allowed opacity-40',
            )}
          >
            <Play className="size-4" /> ბადის გენერაცია და დაწყება
          </button>
        </section>
      ) : (
        <section className="nm-raised rounded-3xl p-6">
          <Bracket matches={matches} names={names} total={total} onReport={report} />
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
              <Bracket matches={matches} names={names} total={total} onReport={report} big />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main module ─────────────────────────────────────────────────────────────
export function Tournaments() {
  const { currentOrgId, currentVenueId } = useOrg()
  const { pushToast } = usePlayroom()
  const [list, setList] = useState<Tournament[]>([])
  const [selected, setSelected] = useState<Tournament | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ name: '', game: '', starts_at: '', entry_fee: '', prize_pool: '' })

  const load = useCallback(async () => {
    if (!currentOrgId) return
    const { data } = await (supabase as any).from('tournaments')
      .select('*, participants:tournament_participants(count)')
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
        entry_fee: Number(form.entry_fee || 0),
        prize_pool: Number(form.prize_pool || 0),
        starts_at: form.starts_at || null,
      })
      .select('*')
      .single()
    if (error) return pushToast('danger', error.message)
    setCreateOpen(false)
    setForm({ name: '', game: '', starts_at: '', entry_fee: '', prize_pool: '' })
    pushToast('success', 'ტურნირი შეიქმნა')
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
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">შესვლის ფასი</span>
              <input type="number" value={form.entry_fee} onChange={(e) => setForm({ ...form, entry_fee: e.target.value })} placeholder="0" className="nm-inset mt-1 w-full rounded-xl px-4 py-2.5 text-sm outline-none" />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">პრიზი</span>
              <input type="number" value={form.prize_pool} onChange={(e) => setForm({ ...form, prize_pool: e.target.value })} placeholder="0" className="nm-inset mt-1 w-full rounded-xl px-4 py-2.5 text-sm outline-none" />
            </label>
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
