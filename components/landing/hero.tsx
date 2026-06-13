'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate } from 'motion/react'
import { CreditCard } from 'lucide-react'

const HEADLINE = ['მართე', 'შენი', 'გეიმინგ', 'ბარი', 'ავტოპილოტზე.']

const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } } }
const word = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
}

type Phase = 'idle' | 'cardIn' | 'tap' | 'success' | 'receipt' | 'hold' | 'reset'
const STEPS: { phase: Phase; dur: number }[] = [
  { phase: 'idle', dur: 1000 },
  { phase: 'cardIn', dur: 1000 },
  { phase: 'tap', dur: 650 },
  { phase: 'success', dur: 850 },
  { phase: 'receipt', dur: 1200 },
  { phase: 'hold', dur: 1900 },
  { phase: 'reset', dur: 800 },
]

function useSessionTimer() {
  const [secs, setSecs] = useState(6312)
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function useSequence() {
  const [phase, setPhase] = useState<Phase>('idle')
  useEffect(() => {
    let i = 0
    let to: ReturnType<typeof setTimeout>
    const run = () => {
      setPhase(STEPS[i].phase)
      to = setTimeout(() => {
        i = (i + 1) % STEPS.length
        run()
      }, STEPS[i].dur)
    }
    run()
    return () => clearTimeout(to)
  }, [])
  return phase
}

const RECEIPT_LINES: Record<Phase, { y: string; opacity: number }> = {
  idle: { y: '-100%', opacity: 0 },
  cardIn: { y: '-100%', opacity: 0 },
  tap: { y: '-100%', opacity: 0 },
  success: { y: '-100%', opacity: 0 },
  receipt: { y: '4%', opacity: 1 },
  hold: { y: '4%', opacity: 1 },
  reset: { y: '-100%', opacity: 0 },
}
const BANK: Record<Phase, { opacity: number; x: number; y: number; scale: number }> = {
  idle: { opacity: 0, x: 130, y: -10, scale: 0.85 },
  cardIn: { opacity: 1, x: 0, y: -6, scale: 1 },
  tap: { opacity: 1, x: 0, y: 8, scale: 0.9 },
  success: { opacity: 0, x: 0, y: -70, scale: 1.05 },
  receipt: { opacity: 0, x: 130, y: -10, scale: 0.85 },
  hold: { opacity: 0, x: 130, y: -10, scale: 0.85 },
  reset: { opacity: 0, x: 130, y: -10, scale: 0.85 },
}

// Premium obsidian payment card (adapted from a Uiverse design) — used as the
// tap-to-pay card in the hero sequence. Branded for Martelounge / TBC · BOG.
function BankCard3D() {
  return (
    <div className="ml-card">
      <div className="ml-card-face">
        <div className="ml-card-sheen" />
        <div className="ml-card-front">
          <div className="ml-card-row ml-card-row-top">
            <svg width="46" viewBox="0 0 100 70" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
              <rect x="4" y="4" width="92" height="62" rx="14" fill="#E8E8E8" stroke="#D1D1D1" strokeWidth="6" />
              <rect x="30" y="30" width="40" height="10" rx="5" fill="#4A4A4A" />
              <path d="M 96 35 C 75 35 65 45 65 66 L 82 66 C 89.7 66 96 59.7 96 52 Z" fill="#F27800" />
            </svg>
            <svg className="ml-nfc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: 'rotate(90deg)' }}>
              <path d="M12 2v20M17 5c2.5 3 2.5 11 0 14M21 2c4 4 4 16 0 20M7 5c-2.5 3-2.5 11 0 14M3 2c-4 4-4 16 0 20" />
            </svg>
          </div>

          <div className="ml-card-row">
            <div className="ml-chip">
              <div className="ml-chip-line" />
              <div className="ml-chip-line" />
              <div className="ml-chip-line" />
              <div className="ml-chip-main" />
            </div>
            <div className="ml-card-type">TBC · BOG</div>
          </div>

          <div className="ml-card-numbers ml-embossed">
            <span>••••</span>
            <span>••••</span>
            <span>••••</span>
            <span>4242</span>
          </div>

          <div className="ml-card-row">
            <div>
              <div className="ml-label">CARDHOLDER</div>
              <div className="ml-value ml-embossed">MARTELOUNGE</div>
            </div>
            <div>
              <div className="ml-label">VALID THRU</div>
              <div className="ml-value ml-embossed">12/30</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null)
  const timer = useSessionTimer()
  const phase = useSequence()

  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)
  const sx = useSpring(mx, { stiffness: 150, damping: 15, mass: 0.1 })
  const sy = useSpring(my, { stiffness: 150, damping: 15, mass: 0.1 })
  const rotateY = useTransform(sx, [0, 1], [-13, 13])
  const rotateX = useTransform(sy, [0, 1], [10, -10])

  const gx = useSpring(useMotionValue(0), { stiffness: 120, damping: 20 })
  const gy = useSpring(useMotionValue(0), { stiffness: 120, damping: 20 })
  const glow = useMotionTemplate`radial-gradient(560px circle at ${gx}px ${gy}px, color-mix(in oklch, var(--primary) 16%, transparent), transparent 62%)`

  function onMove(e: React.MouseEvent) {
    const el = sectionRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width)
    my.set((e.clientY - r.top) / r.height)
    gx.set(e.clientX - r.left)
    gy.set(e.clientY - r.top)
  }

  return (
    <section
      ref={sectionRef}
      onMouseMove={onMove}
      className="relative mx-auto grid max-w-6xl items-center gap-8 px-5 pb-12 pt-10 lg:grid-cols-2 lg:pt-20"
    >
      <motion.div className="pointer-events-none absolute inset-0 -z-10" style={{ background: glow }} />

      {/* left */}
      <div>
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="nm-raised-sm inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-primary"
        >
          <span className="size-1.5 rounded-full bg-[var(--status-free)] shadow-[0_0_8px_var(--status-free)]" />
          Gaming Lounge OS
        </motion.span>

        <motion.h1
          variants={container}
          initial="hidden"
          animate="show"
          className="mt-5 flex flex-wrap gap-x-3 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl"
        >
          {HEADLINE.map((w, i) => (
            <motion.span
              key={i}
              variants={word}
              className={i === HEADLINE.length - 1 ? 'bg-gradient-to-r from-[#00f2fe] to-[#4facfe] bg-clip-text text-transparent' : undefined}
            >
              {w}
            </motion.span>
          ))}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-5 max-w-lg text-lg text-muted-foreground"
        >
          სესიები, ბარი, გადახდები და <span className="text-foreground">RS.GE ფისკალი</span> — ავტომატურად,
          Excel-ის გარეშე.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.75 }}
          className="mt-8 flex flex-wrap gap-3"
        >
          <motion.a
            href="/app"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className="rounded-xl bg-primary px-6 py-3 font-bold text-[var(--primary-foreground)] shadow-[0_0_32px_color-mix(in_oklch,var(--primary)_50%,transparent)]"
          >
            დაიწyე უფასოდ
          </motion.a>
          <motion.a
            href="#features"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className="nm-btn rounded-xl px-6 py-3 font-semibold text-muted-foreground"
          >
            ნახე როგორ მუშაობს
          </motion.a>
        </motion.div>
      </div>

      {/* right: 3D stage */}
      <div className="relative mx-auto w-full max-w-md" style={{ perspective: 1200 }}>
        {/* fiscal receipt — slides down from behind the card */}
        <motion.div
          className="absolute left-1/2 top-full z-0 -mt-16 w-40 overflow-hidden rounded-t-md bg-white font-mono text-[9px] leading-tight text-neutral-900 shadow-2xl"
          style={{
            clipPath:
              'polygon(0 0,100% 0,100% 96%,92% 100%,84% 96%,76% 100%,68% 96%,60% 100%,52% 96%,44% 100%,36% 96%,28% 100%,20% 96%,12% 100%,4% 96%,0 100%)',
          }}
          animate={{ x: '-50%', ...RECEIPT_LINES[phase] }}
          transition={{ duration: phase === 'receipt' ? 1.0 : 0.5, ease: 'easeInOut' }}
        >
          <div className="p-3 pb-6 text-center">
            <p className="text-[11px] font-bold tracking-widest">RS.GE</p>
            <p className="mt-0.5 text-neutral-500">GE-20260613-001042</p>
            <div className="my-1.5 border-t border-dashed border-neutral-400" />
            <div className="flex justify-between"><span>სესია VIP01</span><span>₾32.00</span></div>
            <div className="flex justify-between"><span>კოკა-კოლა ×2</span><span>₾7.00</span></div>
            <div className="flex justify-between"><span>სნიკერსი</span><span>₾3.50</span></div>
            <div className="my-1.5 border-t border-dashed border-neutral-400" />
            <div className="flex justify-between text-[11px] font-bold"><span>სულ</span><span>₾42.50</span></div>
            <div className="mt-2 h-7 w-full" style={{ background: 'repeating-linear-gradient(90deg,#111 0,#111 2px,#fff 2px,#fff 4px)' }} />
            <p className="mt-1 text-neutral-500">გმადლობთ!</p>
          </div>
        </motion.div>

        {/* main dashboard card (tilts) */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
          className="relative z-10 w-full rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-[var(--surface-2)] to-[var(--background)] p-7 shadow-2xl"
        >
          <div className="pointer-events-none absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-white/[0.06] to-transparent" />

          {/* top */}
          <div className="flex items-center justify-between" style={{ transform: 'translateZ(30px)' }}>
            <div>
              <p className="text-xs text-muted-foreground">კონსოლი</p>
              <p className="text-lg font-bold">PS5 · VIP 01</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklch,var(--status-free)_18%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--status-free)]">
              <span className="size-1.5 animate-pulse rounded-full bg-[var(--status-free)] shadow-[0_0_8px_var(--status-free)]" />
              აქტიური
            </span>
          </div>

          {/* revenue + timer */}
          <div className="mt-6" style={{ transform: 'translateZ(55px)' }}>
            <p className="text-xs text-muted-foreground">მიმდინარე ანგარიში</p>
            <p className="font-mono text-5xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-[#00f2fe] to-[#4facfe] bg-clip-text text-transparent">₾42.50</span>
            </p>
            <p className="mt-2 font-mono text-sm text-muted-foreground">⏱ {timer}</p>
          </div>

          {/* bar order — persistent */}
          <div className="mt-6 rounded-2xl border border-white/5 bg-black/20 p-4" style={{ transform: 'translateZ(20px)' }}>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <CreditCard className="size-3.5" /> ბარის შეკვეთა
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span>🥤 კოკა-კოლა × 2</span><span className="font-mono text-muted-foreground">₾7.00</span></div>
              <div className="flex justify-between"><span>🍫 სნიკერსი × 1</span><span className="font-mono text-muted-foreground">₾3.50</span></div>
            </div>
          </div>

          {/* success ripple */}
          {phase === 'success' && (
            <motion.div
              className="pointer-events-none absolute left-1/2 top-1/2 size-24 rounded-full border-2 border-[var(--status-free)]"
              initial={{ x: '-50%', y: '-50%', scale: 0.4, opacity: 0.7 }}
              animate={{ x: '-50%', y: '-50%', scale: 2.4, opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          )}

          {/* bank card — centered wrapper, animated child (premium obsidian card) */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ transformStyle: 'preserve-3d' }}>
            <motion.div
              animate={{ ...BANK[phase], z: 70 }}
              transition={{ type: 'spring', stiffness: 130, damping: 16 }}
            >
              {/* 380×240 card scaled to ~176×111 to fit the payment animation */}
              <div style={{ width: 176, height: 111 }}>
                <div style={{ transform: 'scale(0.463)', transformOrigin: 'top left' }}>
                  <BankCard3D />
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
