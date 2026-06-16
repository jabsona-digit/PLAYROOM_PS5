'use client'

import { useState } from 'react'
import { Moon, Sparkles, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/org'
import { Modal } from './modal'

// Minimal markdown → JSX for Gemini's output (headings, bullets, **bold**).
function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('### ')) return <h3 key={i} className="mt-4 mb-1.5 text-base font-black">{line.slice(4)}</h3>
    if (line.startsWith('## ')) return <h2 key={i} className="mt-4 mb-2 text-lg font-black">{line.slice(3)}</h2>
    if (line.startsWith('# ')) return <h1 key={i} className="mt-2 mb-2 text-xl font-black text-primary">{line.slice(2)}</h1>
    if (/^\s*[-*]\s/.test(line)) {
      const parts = line.replace(/^\s*[-*]\s/, '').split(/(\*\*.*?\*\*)/g)
      return (
        <li key={i} className="ml-4 mb-1 list-disc text-sm text-muted-foreground">
          {parts.map((p, j) => (p.startsWith('**') && p.endsWith('**') ? <strong key={j} className="font-bold text-foreground">{p.slice(2, -2)}</strong> : p))}
        </li>
      )
    }
    if (line.trim() === '') return <div key={i} className="h-2" />
    const parts = line.split(/(\*\*.*?\*\*)/g)
    return (
      <p key={i} className="mb-1.5 text-sm leading-relaxed text-muted-foreground">
        {parts.map((p, j) => (p.startsWith('**') && p.endsWith('**') ? <strong key={j} className="font-bold text-foreground">{p.slice(2, -2)}</strong> : p))}
      </p>
    )
  })
}

export function DailyBrief() {
  const { currentVenueId } = useOrg()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<string | null>(null)

  const run = async () => {
    setOpen(true)
    setLoading(true)
    setReport(null)
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'run_daily_brief', venue_id: currentVenueId },
      })
      if (error) throw error
      setReport((data as { text?: string; error?: string }).text || (data as { error?: string }).error || 'ანგარიში ვერ მომზადდა.')
    } catch (e) {
      setReport('შეცდომა: ' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={run}
        className="nm-btn flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-primary transition-transform active:scale-95"
      >
        <Moon className="size-4" />
        <span className="hidden sm:inline">ღამის ანგარიში</span>
        <Sparkles className="size-3.5 opacity-70" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="🌙 ღამის ანგარიში (AI)">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Loader2 className="size-10 animate-spin text-primary" />
            <p className="text-sm font-bold">AI აანალიზებს დღეს…</p>
            <p className="text-xs text-muted-foreground">შემოსავალი · კონსოლები · მარაგი · უსაფრთხოება</p>
          </div>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            {report ? renderMarkdown(report) : null}
            <button
              onClick={run}
              className="nm-btn mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-xs font-bold text-muted-foreground"
            >
              <Sparkles className="size-3.5" /> თავიდან გენერაცია
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}
