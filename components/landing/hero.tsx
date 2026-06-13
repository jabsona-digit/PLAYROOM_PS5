'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate } from 'motion/react'

const HEADLINE = ['მართე', 'შენი', 'გეიმინგ', 'ბარი', 'ავტოპილოტზე.']

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
}
const word = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
}

function useSessionTimer() {
  const [secs, setSecs] = useState(6312) // 01:45:12
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null)
  const timer = useSessionTimer()

  // 0..1 mouse position over the section → card tilt
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)
  const sx = useSpring(mx, { stiffness: 150, damping: 15, mass: 0.1 })
  const sy = useSpring(my, { stiffness: 150, damping: 15, mass: 0.1 })
  const rotateY = useTransform(sx, [0, 1], [-14, 14])
  const rotateX = useTransform(sy, [0, 1], [11, -11])

  // px mouse position → glow that follows the cursor
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
      {/* cursor-following glow */}
      <motion.div className="pointer-events-none absolute inset-0 -z-10" style={{ background: glow }} />

      {/* left: copy + CTA */}
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
              className={
                i === HEADLINE.length - 1
                  ? 'bg-gradient-to-r from-cyan-300 to-sky-500 bg-clip-text text-transparent'
                  : undefined
              }
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
          სესიები, ბარი, კასა, ბუღალტერია, ტურნირები და{' '}
          <span className="text-foreground">ონლაინ ჯავშნები</span> — ერთ სისტემაში, Excel-ის გარეშე.
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
            className="rounded-xl bg-primary px-6 py-3 font-bold text-[var(--primary-foreground)] shadow-[0_0_30px_color-mix(in_oklch,var(--primary)_45%,transparent)]"
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

      {/* right: the 3D "Digital Twin" live dashboard card */}
      <div className="flex justify-center" style={{ perspective: 1100 }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
          className="relative w-full max-w-md rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-[var(--surface-2)] to-[var(--background)] p-7 shadow-2xl backdrop-blur-xl"
        >
          {/* soft inner sheen */}
          <div className="pointer-events-none absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-white/[0.06] to-transparent" />

          {/* top row */}
          <div className="flex items-center justify-between" style={{ transform: 'translateZ(30px)' }}>
            <div>
              <p className="text-xs text-muted-foreground">კონსოლი</p>
              <p className="text-lg font-bold">PS5 · VIP 01</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklch,var(--status-free)_18%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--status-free)]">
              <span className="size-1.5 animate-pulse rounded-full bg-[var(--status-free)] shadow-[0_0_8px_var(--status-free)]" />
              აქტიური სესია
            </span>
          </div>

          {/* middle: revenue + timer */}
          <div className="mt-7" style={{ transform: 'translateZ(55px)' }}>
            <p className="text-xs text-muted-foreground">მიმდინარე ანგარიში</p>
            <p className="font-mono text-5xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-cyan-300 to-sky-500 bg-clip-text text-transparent">₾42.50</span>
            </p>
            <p className="mt-2 font-mono text-sm text-muted-foreground">⏱ {timer}</p>
          </div>

          {/* progress bar */}
          <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/10" style={{ transform: 'translateZ(35px)' }}>
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-sky-500"
              initial={{ width: '0%' }}
              animate={{ width: '72%' }}
              transition={{ duration: 1.4, delay: 0.8, ease: 'easeOut' }}
            />
          </div>

          {/* bottom: mini POS */}
          <div className="mt-6 rounded-2xl border border-white/5 bg-black/20 p-4" style={{ transform: 'translateZ(20px)' }}>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">ბარის შეკვეთა</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span>🥤 კოკა-კოლა × 2</span>
                <span className="font-mono text-muted-foreground">₾7.00</span>
              </div>
              <div className="flex justify-between">
                <span>🍫 სნიკერსი × 1</span>
                <span className="font-mono text-muted-foreground">₾3.50</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
