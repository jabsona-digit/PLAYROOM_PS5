'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useReducedMotion } from 'motion/react'
import { Sparkles, ShieldCheck, BarChart3, ScanLine } from 'lucide-react'
import { SplineScene } from './spline-scene'

// Lightweight, always-safe visual for mobile / reduced-motion (no heavy 3D).
function FallbackOrb() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="absolute size-48 rounded-full bg-primary/25 blur-3xl" />
      <div className="nm-raised relative flex size-40 items-center justify-center rounded-full">
        <div className="absolute inset-3 rounded-full border border-primary/30" />
        <Sparkles className="size-14 text-primary" />
      </div>
    </div>
  )
}

export function AiCore() {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const [show3d, setShow3d] = useState(false)

  // Only stream the heavy 3D scene on wide, motion-friendly screens.
  useEffect(() => {
    if (reduce) return
    if (window.matchMedia('(min-width: 768px)').matches) setShow3d(true)
  }, [reduce])

  // Mouse-following spotlight (springy → feels "alive").
  const mx = useMotionValue(-1000)
  const my = useMotionValue(-1000)
  const sx = useSpring(mx, { stiffness: 140, damping: 22, mass: 0.4 })
  const sy = useSpring(my, { stiffness: 140, damping: 22, mass: 0.4 })

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    mx.set(e.clientX - r.left)
    my.set(e.clientY - r.top)
  }

  return (
    <section className="mx-auto max-w-6xl px-5 py-14">
      <div
        ref={ref}
        onMouseMove={reduce ? undefined : onMove}
        className="nm-raised relative h-[480px] overflow-hidden rounded-[2.5rem] bg-[#0a0d13] sm:h-[540px]"
      >
        {/* mouse-follow glow */}
        {!reduce && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute z-10 size-[440px] rounded-full"
            style={{
              left: sx,
              top: sy,
              translateX: '-50%',
              translateY: '-50%',
              background:
                'radial-gradient(circle, color-mix(in oklch, var(--primary) 38%, transparent), transparent 60%)',
              filter: 'blur(44px)',
            }}
          />
        )}

        <div className="relative z-20 flex h-full flex-col md:flex-row">
          {/* left: copy */}
          <div className="flex flex-1 flex-col justify-center p-8 sm:p-12">
            <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full nm-raised-sm px-3 py-1.5 text-xs font-black uppercase tracking-widest text-primary">
              <Sparkles className="size-3.5" /> AI Core
            </span>
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              AI მართავს <span className="text-primary text-glow">პროცესებს</span>
            </h2>
            <p className="mt-4 max-w-md text-pretty text-muted-foreground">
              შენი ლაუნჯის ციფრული ტვინი — ცოცხლობს, ადევნებს თვალს და სწავლობს.
              გადაატარე მაუსი და დაინახე. 👆
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                { icon: BarChart3, t: 'RevPACH' },
                { icon: ShieldCheck, t: 'ანტი-თაღლითობა' },
                { icon: ScanLine, t: 'OCR' },
                { icon: Sparkles, t: 'ასისტენტი' },
              ].map((c) => (
                <span key={c.t} className="nm-inset inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-muted-foreground">
                  <c.icon className="size-3.5 text-primary" /> {c.t}
                </span>
              ))}
            </div>
          </div>

          {/* right: live 3D (desktop/motion) or fallback orb */}
          <div className="relative min-h-[220px] flex-1">
            {show3d ? (
              <SplineScene
                scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                className="h-full w-full"
              />
            ) : (
              <FallbackOrb />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
