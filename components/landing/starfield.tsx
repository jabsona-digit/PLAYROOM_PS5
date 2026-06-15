'use client'

import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

// Lightweight canvas starfield: twinkling stars drifting upward. Capped count +
// DPR≤2 + rAF for performance; renders a single static frame on reduced-motion.
export function Starfield({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const canvas = ref.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let w = 0, h = 0, raf = 0, t = 0
    let stars: { x: number; y: number; r: number; a: number; tw: number; vy: number }[] = []

    const resize = () => {
      const rect = parent.getBoundingClientRect()
      w = rect.width; h = rect.height
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(160, Math.round((w * h) / 9000))
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.4 + 0.3,
        a: Math.random() * 0.6 + 0.2,
        tw: Math.random() * 0.02 + 0.005,
        vy: Math.random() * 0.15 + 0.03,
      }))
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) {
        const alpha = reduce ? s.a : Math.max(0, Math.min(1, s.a + Math.sin(t * s.tw + s.x) * 0.25))
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(186,230,255,${alpha})`
        ctx.fill()
        if (!reduce) {
          s.y -= s.vy
          if (s.y < -2) { s.y = h + 2; s.x = Math.random() * w }
        }
      }
    }

    resize()
    if (reduce) {
      draw()
    } else {
      const loop = () => { t++; draw(); raf = requestAnimationFrame(loop) }
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [reduce])

  return <canvas ref={ref} aria-hidden className={className} />
}
