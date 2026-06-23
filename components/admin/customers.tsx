'use client'

import { useEffect, useState } from 'react'
import { Plus, Search, Star, Phone, Edit2, Gift, TrendingUp, Save, X, Trash2, QrCode } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { cn } from '@/lib/utils'
import { usePlayroom } from '@/lib/store'
import { useOrg } from '@/lib/org'
import { gel } from '@/lib/ui'
import { supabase } from '@/lib/supabase/client'
import { Modal } from './modal'

interface Customer {
  id: string
  name: string
  phone?: string
  points: number
  discount_pct: number
  total_spent: number
  visit_count: number
  created_at: string
}

export function Customers() {
  const { currentOrgId, currentRole } = useOrg()
  const { pushToast } = usePlayroom()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [qrCustomer, setQrCustomer] = useState<Customer | null>(null)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const isManager = currentRole === 'owner' || currentRole === 'admin' || currentRole === 'manager'

  const fetchCustomers = async () => {
    if (!currentOrgId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('customers')
      .select('*')
      .eq('org_id', currentOrgId)
      .order('total_spent', { ascending: false })
    if (data) setCustomers(data as any)
  }

  useEffect(() => { fetchCustomers() }, [currentOrgId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: string) => {
    const { error } = await supabase.rpc('delete_customer', { p_customer_id: id })
    if (error) {
      pushToast('danger', error.message)
    } else {
      pushToast('success', 'კლიენტი წაიშალა')
      setDeletingId(null)
      fetchCustomers()
    }
  }

  const filtered = customers.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  const tiers = (points: number) => {
    if (points >= 500) return { label: 'VIP', color: 'text-yellow-400' }
    if (points >= 200) return { label: 'Gold', color: 'text-amber-500' }
    if (points >= 50) return { label: 'Silver', color: 'text-slate-400' }
    return { label: 'Regular', color: 'text-muted-foreground' }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <Gift className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">ლოიალობის პროგრამა</h2>
            <p className="text-xs text-muted-foreground">{customers.length} რეგისტრირებული კლიენტი</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="nm-inset flex flex-1 items-center gap-2 rounded-2xl px-4 py-2.5 sm:flex-none">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              type="search"
              placeholder="სახელი ან ტელეფონი..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-sm outline-none w-40 placeholder:text-muted-foreground"
            />
          </label>
          <button
            onClick={() => { setEditing(null); setModalOpen(true) }}
            className="nm-btn flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-primary"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">კლიენტის დამატება</span>
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'სულ კლიენტი', value: String(customers.length), icon: Gift },
          { label: 'VIP კლიენტი', value: String(customers.filter(c => c.points >= 500).length), icon: Star },
          { label: 'სულ ქულები', value: String(customers.reduce((s, c) => s + c.points, 0)), icon: TrendingUp },
          { label: 'ჯამური შემოსავალი', value: gel(customers.reduce((s, c) => s + c.total_spent, 0)), icon: TrendingUp },
        ].map(item => (
          <div key={item.label} className="nm-raised flex items-center gap-3 rounded-3xl p-5">
            <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
              <item.icon className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="font-mono text-xl font-extrabold">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Customers Table */}
      <div className="nm-raised rounded-[2rem] p-5">
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">კლიენტები ვერ მოიძებნა</p>
          ) : (
            filtered.map(c => {
              const tier = tiers(c.points)
              return (
                <div key={c.id} className="nm-inset flex items-center justify-between rounded-2xl p-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="nm-raised flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold text-primary">
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-extrabold truncate">{c.name}</p>
                        <span className={cn('text-xs font-bold', tier.color)}>{tier.label}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                        {c.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="size-3" />{c.phone}
                          </span>
                        )}
                        <span>{c.visit_count} ვიზიტი</span>
                        <span>{gel(c.total_spent)} დახარჯული</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="hidden text-right sm:block">
                      <p className="text-xs text-muted-foreground">ქულები</p>
                      <p className="font-mono font-extrabold text-primary">{c.points} pts</p>
                    </div>
                    {c.discount_pct > 0 && (
                      <div className="hidden text-right sm:block">
                        <p className="text-xs text-muted-foreground">ფასდაკლება</p>
                        <p className="font-mono font-extrabold text-green-400">-{c.discount_pct}%</p>
                      </div>
                    )}
                    {deletingId === c.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground hidden sm:inline">დარწმუნებული ხარ?</span>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="nm-btn rounded-xl px-3 py-2 text-xs font-bold text-red-400"
                        >
                          წაშლა
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="nm-btn rounded-xl p-2 text-muted-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setQrCustomer(c)}
                          title="QR ბარათი"
                          className="nm-btn rounded-xl p-2 text-primary"
                        >
                          <QrCode className="size-4" />
                        </button>
                        <button
                          onClick={() => { setEditing(c); setModalOpen(true) }}
                          className="nm-btn rounded-xl p-2 text-muted-foreground"
                        >
                          <Edit2 className="size-4" />
                        </button>
                        {isManager && (
                          <button
                            onClick={() => setDeletingId(c.id)}
                            className="nm-btn rounded-xl p-2 text-muted-foreground hover:text-red-400"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <CustomerModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        customer={editing}
        onSaved={fetchCustomers}
      />

      {qrCustomer && (
        <Modal open onClose={() => setQrCustomer(null)} title={`${qrCustomer.name} — QR ბარათი`}>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="rounded-3xl bg-white p-5">
              <QRCodeSVG value={`MTLP:${qrCustomer.id}`} size={200} />
            </div>
            <p className="text-center text-sm text-muted-foreground text-pretty">
              ასკანერე „სესიის დაწყებისას" → კლიენტი მიება სესიას და ქულები ავტომატურად დაერიცხება.
              ბეჭდე ბარათად ან აჩვენე ეკრანიდან.
            </p>
            <button
              onClick={() => window.print()}
              className="nm-btn rounded-2xl px-5 py-2.5 text-sm font-bold text-primary"
            >
              🖨️ ბეჭდვა
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function CustomerModal({ open, onClose, customer, onSaved }: {
  open: boolean
  onClose: () => void
  customer: Customer | null
  onSaved: () => void
}) {
  const { pushToast } = usePlayroom()
  const { currentOrgId } = useOrg()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [points, setPoints] = useState('0')
  const [discountPct, setDiscountPct] = useState('0')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && customer) {
      setName(customer.name)
      setPhone(customer.phone ?? '')
      setPoints(String(customer.points))
      setDiscountPct(String(customer.discount_pct))
    } else if (open && !customer) {
      setName(''); setPhone(''); setPoints('0'); setDiscountPct('0')
    }
  }, [open, customer])

  // Map the 0129 server-side validation errors to friendly Georgian.
  const custErr = (m: string) =>
    m.includes('invalid_phone') ? 'ტელეფონი არასწორია — ქართული მობილური (5XX XXX XXX)'
      : m.includes('customer_name_required') ? 'სახელი სავალდებულოა'
      : m

  const handleSave = async () => {
    if (!name.trim()) return pushToast('danger', 'სახელი სავალდებულოა')
    if (!phone.trim()) return pushToast('danger', 'ტელეფონი სავალდებულოა')
    setSaving(true)
    if (customer) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('customers')
        .update({ name: name.trim(), phone: phone || null, points: +points, discount_pct: +discountPct })
        .eq('id', customer.id)
      if (error) pushToast('danger', custErr(error.message))
      else { pushToast('success', 'კლიენტი განახლდა'); onSaved(); onClose() }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('customers')
        .insert({ org_id: currentOrgId, name: name.trim(), phone: phone || null, points: +points, discount_pct: +discountPct, total_spent: 0, visit_count: 0 })
      if (error) pushToast('danger', custErr(error.message))
      else { pushToast('success', 'კლიენტი დაემატა'); onSaved(); onClose() }
    }
    setSaving(false)
  }

  return (
    <Modal open={open} onClose={onClose} title={customer ? 'კლიენტის რედაქტირება' : 'ახალი კლიენტი'}>
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-muted-foreground">სახელი *</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="მაგ: გიორგი ბერიძე"
            className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm outline-none" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-muted-foreground">ტელეფონი *</span>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+995 5XX XXX XXX"
            className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm outline-none" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">ქულები (Points)</span>
            <input type="number" min="0" value={points} onChange={e => setPoints(e.target.value)}
              className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm outline-none text-primary font-mono" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">ფასდაკლება (%)</span>
            <input type="number" min="0" max="100" value={discountPct} onChange={e => setDiscountPct(e.target.value)}
              className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm outline-none text-green-400 font-mono" />
          </label>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="nm-daylight mt-2 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-primary disabled:opacity-50"
        >
          <Save className="size-4" />
          {saving ? 'ინახება...' : 'შენახვა'}
        </button>
      </div>
    </Modal>
  )
}
