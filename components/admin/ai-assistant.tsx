'use client'

import { useEffect, useRef, useState } from 'react'
import { Bot, Send, Sparkles, X, Check, Ban, LoaderCircle, Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase/client'
import { usePlayroom } from '@/lib/store'

type Role = 'user' | 'model'
interface ChatMsg {
  role: Role
  text: string
}
interface PendingAction {
  name: string
  args: Record<string, unknown>
}

// Human-readable summary of a proposed action for the confirm card.
function describeAction(a: PendingAction): string {
  const x = a.args
  switch (a.name) {
    case 'start_session':
      return `ახალი სესია: ${x.console_name ?? 'კონსოლი #' + x.console_id}, ${x.duration_min} წთ, ${x.payment_method}${x.customer_name ? `, ${x.customer_name}` : ''}`
    case 'end_session':
      return `სესიის დასრულება${x.tip ? ` + ჩაიანი ₾${x.tip}` : ''}`
    case 'create_bar_sale': {
      const items = Array.isArray(x.items) ? x.items.length : 0
      return `ბარის გაყიდვა: ${items} პოზიცია, ${x.payment_method}`
    }
    case 'restock_product':
      return `მარაგის შევსება: ${x.product_name ?? 'პროდუქტი #' + x.product_id} +${x.add_qty}`
    default:
      return a.name
  }
}

const SUGGESTIONS = [
  'რა ხდება ახლა კონსოლებზე?',
  'დღევანდელი შემოსავალი რამდენია?',
  'რომელ პროდუქტს უმცირდება მარაგი?',
]

export function AiAssistant() {
  const { pushToast, refreshLive } = usePlayroom()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [listening, setListening] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending, busy])

  const callFn = async (
    body: Record<string, unknown>,
  ): Promise<{ type: string; text?: string; action?: PendingAction } | null> => {
    const { data, error } = await supabase.functions.invoke('ai-assistant', { body })
    if (error) {
      pushToast('danger', 'AI შეცდომა: ' + error.message)
      return null
    }
    return data
  }

  const send = async (text: string) => {
    if (!text.trim() || busy) return
    const next = [...messages, { role: 'user' as Role, text: text.trim() }]
    setMessages(next)
    setInput('')
    setPending(null)
    setBusy(true)
    const res = await callFn({ messages: next })
    setBusy(false)
    if (!res) return
    if (res.type === 'confirm' && res.action) {
      setPending(res.action)
    } else if (res.text) {
      setMessages((m) => [...m, { role: 'model', text: res.text! }])
    }
  }

  const confirm = async () => {
    if (!pending || busy) return
    const action = pending
    setPending(null)
    setBusy(true)
    const res = await callFn({ messages, confirmedAction: action })
    setBusy(false)
    if (!res) return
    if (res.text) setMessages((m) => [...m, { role: 'model', text: res.text! }])
    // reflect any data change in the live dashboard
    await refreshLive()
    pushToast('success', 'შესრულდა')
  }

  // Voice input via the browser's Web Speech API (Georgian).
  const toggleMic = () => {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      pushToast('danger', 'ამ ბრაუზერს ხმოვანი შეტანა არ აქვს (სცადე Chrome)')
      return
    }
    const rec = new SR()
    rec.lang = 'ka-GE'
    rec.interimResults = true
    rec.continuous = false
    let finalText = ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalText += t
        else interim += t
      }
      setInput(finalText || interim)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => {
      setListening(false)
      const said = finalText.trim()
      if (said) send(said)
    }
    recognitionRef.current = rec
    setListening(true)
    rec.start()
  }

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="AI დამხმარე"
        className="nm-btn fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full text-primary"
        style={{
          boxShadow:
            '5px 5px 12px var(--nm-dark), -5px -5px 12px var(--nm-light), 0 0 22px 2px color-mix(in oklch, var(--primary) 40%, transparent)',
        }}
      >
        {open ? <X className="size-6" /> : <Sparkles className="size-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="nm-raised fixed bottom-24 right-5 z-50 flex h-[min(560px,75vh)] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[1.6rem]"
          style={{ animation: 'slide-in-up 0.25s ease-out both' }}
        >
          {/* header */}
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <div className="nm-inset flex size-10 items-center justify-center rounded-2xl">
              <Bot className="size-5 text-primary" />
            </div>
            <div>
              <p className="font-extrabold leading-tight">AI დამხმარე</p>
              <p className="text-[11px] text-muted-foreground">Playroom-ის ასისტენტი</p>
            </div>
          </div>

          {/* messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && !pending && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  გამარჯობა! დამეხმარები პანელის მართვაში. ჰკითხე ნებისმიერი რამ:
                </p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="nm-btn rounded-2xl px-4 py-2.5 text-left text-sm font-semibold"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm',
                    m.role === 'user'
                      ? 'nm-inset font-semibold'
                      : 'nm-raised-sm text-foreground',
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {/* confirm card */}
            {pending && (
              <div className="nm-inset rounded-2xl p-4">
                <p className="text-xs font-bold text-muted-foreground">დასადასტურებელი მოქმედება</p>
                <p className="mt-1.5 text-sm font-semibold">{describeAction(pending)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={confirm}
                    className="nm-btn flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-[var(--status-free)]"
                  >
                    <Check className="size-4" /> დადასტურება
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className="nm-btn flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-muted-foreground"
                  >
                    <Ban className="size-4" /> გაუქმება
                  </button>
                </div>
              </div>
            )}

            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                ვფიქრობ...
              </div>
            )}
          </div>

          {/* input */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? 'გისმენ...' : 'დაწერე ან ისაუბრე...'}
              disabled={busy}
              className="nm-inset flex-1 rounded-2xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={toggleMic}
              disabled={busy}
              aria-label="ხმოვანი შეტანა"
              className={cn(
                'nm-btn flex size-11 shrink-0 items-center justify-center rounded-2xl disabled:opacity-40',
                listening ? 'text-[var(--status-expired)]' : 'text-muted-foreground',
              )}
              style={
                listening
                  ? { boxShadow: '0 0 0 1px color-mix(in oklch, var(--status-expired) 60%, transparent), 0 0 16px 2px color-mix(in oklch, var(--status-expired) 45%, transparent)' }
                  : undefined
              }
            >
              <Mic className={cn('size-4', listening && 'animate-pulse')} />
            </button>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="nm-btn flex size-11 shrink-0 items-center justify-center rounded-2xl text-primary disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
