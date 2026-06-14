'use client'

import { useEffect, useRef, useState } from 'react'
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  useInView,
  type Variants,
} from 'motion/react'
import {
  QrCode,
  Sparkles,
  Calculator,
  Globe,
  ArrowRight,
  ChevronDown,
  Gamepad2,
} from 'lucide-react'
import { AiCore } from '@/components/landing/ai-core'

// ─── animated number that counts up when scrolled into view (skips when reduced) ───
function CountUp({ to, suffix = '', duration = 1200 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const reduce = useReducedMotion()
  const [n, setN] = useState(0)

  useEffect(() => {
    if (!inView) return
    if (reduce) { setN(to); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
      setN(Math.round(eased * to))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, reduce, to, duration])

  return <span ref={ref}>{n}{suffix}</span>
}

const FEATURES = [
  { icon: QrCode, t: 'In-Seat Ordering', d: 'სტუმარი მაგიდიდან QR-ით უკვეთავს — ოპერატორთან ცოცხალი inbox ხმოვანი სიგნალით. ფასს სერვერი ითვლის, შემოსავალი არ იკარგება.', from: '#f472b6', to: '#db2777' },
  { icon: Sparkles, t: 'AI არსენალი', d: 'ხმოვანი AI ასისტენტი, ჩეკის სკანერი (OCR), ანტი-თაღლითობა Trust Score-ით და RevPACH-ის ჭკვიანი რეკომენდაციები.', from: '#c084fc', to: '#7c3aed' },
  { icon: Calculator, t: 'ბუღალტერია & კასა', d: 'P&L, დღგ 18%, COGS, ხელფასები, Z-რეპორტი და ბიუჯეტები — ავტომატურად, ერთ ადგილას.', from: '#34d399', to: '#059669' },
  { icon: Globe, t: 'Marketplace', d: 'შენი კლუბი play.martelounge.ge-ზე — ცოცხალი ხელმისაწვდომობა, ონლაინ ჯავშნები და QR check-in.', from: '#22d3ee', to: '#2563eb' },
]

const STATS = [
  { to: 12, suffix: '', label: 'მოდული ერთ პანელში' },
  { to: 5, suffix: ' წთ', label: 'გაშვება წუთებში' },
  { to: 24, suffix: '/7', label: 'AI დახმარება' },
  { to: 14, suffix: ' დღე', label: 'უფასო ცდა' },
]

const headline: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
}
const line: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 26 } },
}

export default function TourPage() {
  const reduce = useReducedMotion()
  const heroRef = useRef<HTMLDivElement>(null)

  // subtle parallax: hero content drifts up + fades as you scroll past (disabled on reduced-motion)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -90])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, reduce ? 1 : 0.15])

  // whileInView reveal props, gated by reduced-motion
  const rise = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 44 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-90px' },
        transition: { type: 'spring' as const, stiffness: 200, damping: 28 },
      }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* aurora background (shared brand) */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="aurora aurora-1" />
        <div className="aurora aurora-2" />
        <div className="aurora aurora-3" />
      </div>

      {/* minimal top bar with skip (immersive pattern → always offer an exit) */}
      <header className="sticky top-0 z-40 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href="/" className="text-lg font-extrabold tracking-tight text-glow">
            MARTE<span className="text-primary">LOUNGE</span>
          </a>
          <a href="/app" className="nm-btn rounded-xl px-4 py-2 text-sm font-bold text-primary">
            გამოტოვება → პანელი
          </a>
        </div>
      </header>

      {/* ── HERO ── */}
      <section ref={heroRef} className="relative mx-auto flex min-h-[92vh] max-w-5xl flex-col items-center justify-center px-5 text-center">
        <motion.div style={{ y: heroY, opacity: heroOpacity }}>
          <motion.div
            variants={headline}
            initial={reduce ? undefined : 'hidden'}
            animate={reduce ? undefined : 'show'}
          >
            <motion.p variants={line} className="mb-5 inline-flex items-center gap-2 rounded-full nm-raised-sm px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary">
              <Gamepad2 className="size-4" /> Gaming Lounge OS
            </motion.p>
            <motion.h1 variants={line} className="text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              მართე შენი კლუბი
            </motion.h1>
            <motion.h1 variants={line} className="mt-1 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              <span className="text-primary text-glow">ერთ სისტემაში</span>
            </motion.h1>
            <motion.p variants={line} className="mx-auto mt-6 max-w-xl text-pretty text-lg text-muted-foreground">
              სესიები, ბარი, კასა, ბუღალტერია, AI და ონლაინ ჯავშნები — Excel-ის გარეშე.
              გადაახვიე ქვემოთ და ნახე, როგორ.
            </motion.p>
            <motion.div variants={line} className="mt-9 flex items-center justify-center">
              <a href="/app" className="nm-glow inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-lg font-bold">
                დაიწყე უფასოდ <ArrowRight className="size-5" />
              </a>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* scroll cue */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-muted-foreground"
          animate={reduce ? undefined : { y: [0, 10, 0] }}
          transition={reduce ? undefined : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronDown className="size-7" />
        </motion.div>
      </section>

      {/* ── AI CORE (interactive 3D + mouse spotlight) ── */}
      <AiCore />

      {/* ── GUIDED FEATURE REVEAL ── */}
      <section className="mx-auto max-w-5xl space-y-24 px-5 py-24 sm:space-y-32">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.t}
            {...rise}
            className="grid items-center gap-8 sm:grid-cols-2"
          >
            {/* visual tile (parallax accent) */}
            <div className={i % 2 ? 'sm:order-2' : ''}>
              <div className="nm-raised relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[2rem]">
                <div
                  className="pointer-events-none absolute -right-12 -top-12 size-44 rounded-full opacity-40 blur-3xl"
                  style={{ background: f.from }}
                />
                <div
                  className="relative flex size-24 items-center justify-center rounded-3xl"
                  style={{ background: `linear-gradient(135deg, ${f.from}, ${f.to})`, boxShadow: `0 16px 50px ${f.from}55` }}
                >
                  <f.icon className="size-12 text-white drop-shadow" />
                </div>
              </div>
            </div>
            {/* copy */}
            <div className={i % 2 ? 'sm:order-1' : ''}>
              <span className="text-sm font-black uppercase tracking-widest text-primary/70">0{i + 1}</span>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight">{f.t}</h2>
              <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{f.d}</p>
            </div>
          </motion.div>
        ))}
      </section>

      {/* ── STATS (count-up) ── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <motion.div {...rise} className="nm-raised grid grid-cols-2 gap-6 rounded-[2.5rem] p-8 sm:grid-cols-4 sm:p-12">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-mono text-4xl font-black text-primary sm:text-5xl">
                <CountUp to={s.to} suffix={s.suffix} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="mx-auto max-w-3xl px-5 py-24 text-center">
        <motion.div {...rise}>
          <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            მზად ხარ? <span className="text-primary text-glow">დაიწყე დღესვე</span>
          </h2>
          <p className="mt-4 text-muted-foreground">14 დღე უფასოდ. ბარათი არ სჭირდება.</p>
          <a href="/app" className="nm-glow mt-8 inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-lg font-bold">
            დაიწყე უფასოდ <ArrowRight className="size-5" />
          </a>
        </motion.div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
          <span className="font-bold text-foreground">MARTELOUNGE</span>
          <a href="/" className="transition-colors hover:text-primary">← მთავარი</a>
        </div>
      </footer>
    </div>
  )
}
