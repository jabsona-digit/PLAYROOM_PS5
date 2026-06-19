'use client'

import { useState } from 'react'
import { ShieldAlert, ScanSearch, CheckCircle2, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { OperatorIntegrity } from './operator-integrity'

export function FraudAuditDashboard() {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<string | null>(null)
  
  // Date selection (default 7 days)
  const [days, setDays] = useState(7)

  const runAudit = async () => {
    setLoading(true)
    setReport(null)

    const to = new Date()
    const from = new Date(Date.now() - days * 86400000)

    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'run_fraud_audit',
          from: from.toISOString(),
          to: to.toISOString()
        }
      })

      if (error) throw error
      
      setReport(data.text || data.error)
    } catch (err: any) {
      setReport('შეცდომა განხორციელებისას: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // A super basic markdown-to-html renderer specifically for Gemini's output
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n')
    return lines.map((line, i) => {
      if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-black mt-6 mb-3">{line.replace('# ', '')}</h1>
      if (line.startsWith('## ')) return <h2 key={i} className="text-xl font-black mt-5 mb-2">{line.replace('## ', '')}</h2>
      if (line.startsWith('### ')) return <h3 key={i} className="text-lg font-bold mt-4 mb-2">{line.replace('### ', '')}</h3>
      if (line.startsWith('- ')) return <li key={i} className="ml-4 mb-1 text-muted-foreground list-disc">{line.replace('- ', '')}</li>
      if (line.startsWith('* ')) return <li key={i} className="ml-4 mb-1 text-muted-foreground list-disc">{line.replace('* ', '')}</li>
      if (line.trim() === '') return <br key={i} />
      
      // Parse bold **text**
      const parts = line.split(/(\*\*.*?\*\*)/g)
      return (
        <p key={i} className="mb-2 text-muted-foreground">
          {parts.map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={j} className="font-black text-foreground">{part.slice(2, -2)}</strong>
            }
            return part
          })}
        </p>
      )
    })
  }

  return (
    <div className="space-y-6">
      <div className="nm-raised rounded-3xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-bl-full pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-primary">
              <ShieldAlert className="size-6 text-red-400" />
              AI უსაფრთხოების აუდიტორი
            </h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-xl">
              გაანალიზეთ თანამშრომლების აქტივობები, აღმოაჩინეთ საეჭვო გაუქმებები (voids) და გამოთვალეთ ნდობის ინდექსი (Trust Score) ბაზის ლოგების საფუძველზე.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
             <div className="nm-inset flex items-center px-4 py-2 rounded-2xl gap-2">
                <Calendar className="size-4 text-muted-foreground" />
                <select 
                  className="bg-transparent text-sm font-bold outline-none text-foreground"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                >
                  <option value={1}>ბოლო 24 საათი</option>
                  <option value={7}>ბოლო 7 დღე</option>
                  <option value={30}>ბოლო 30 დღე</option>
                </select>
             </div>

            <button
              onClick={runAudit}
              disabled={loading}
              className="nm-btn flex items-center justify-center gap-2 rounded-2xl px-6 py-3 font-bold text-red-500 min-w-[180px] hover:text-red-600 transition-colors"
            >
              <ScanSearch className={cn("size-5", loading && "animate-spin")} />
              {loading ? "სკანირება მიმდინარეობს..." : "აუდიტის გაშვება"}
            </button>
          </div>
        </div>
      </div>

      {/* Statistical anti-fraud — operator joystick integrity (no hardware, migration 0095) */}
      <OperatorIntegrity />

      {loading && (
        <div className="nm-inset rounded-3xl p-12 flex flex-col items-center justify-center text-center animate-pulse">
          <ScanSearch className="size-16 text-red-400/50 mb-4 animate-spin" />
          <h3 className="text-lg font-black text-red-500">AI აანალიზებს ჟურნალებს...</h3>
          <p className="text-sm text-muted-foreground mt-2">ვამოწმებთ გაუქმებულ ოპერაციებს და ავთენტურობას</p>
        </div>
      )}

      {report && !loading && (
        <div className="nm-daylight rounded-3xl p-6 md:p-8 animate-in fade-in duration-500">
           <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border">
             <div className="nm-inset p-3 rounded-2xl">
               <CheckCircle2 className="size-8 text-green-500" />
             </div>
             <div>
                <h3 className="text-lg font-black">აუდიტის ანგარიში</h3>
                <p className="text-xs text-muted-foreground font-bold tracking-widest uppercase">დასრულდა წარმატებით</p>
             </div>
           </div>
           
           <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-p:leading-relaxed">
             {renderMarkdown(report)}
           </div>
        </div>
      )}
    </div>
  )
}
