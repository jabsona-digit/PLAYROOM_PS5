'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'

/**
 * Counts up from 0 → `target` on first non-zero value (easeOutQuart).
 * After the initial animation, subsequent target changes are applied instantly
 * so live-updating dashboards don't restart the counter on every tick.
 */
export function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0)
  const animated = useRef(false)

  useEffect(() => {
    if (animated.current) {
      setValue(target)
      return
    }
    if (target === 0) {
      setValue(0)
      return
    }
    animated.current = true
    const start = performance.now()
    let raf: number
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - t) ** 4
      setValue(target * eased)
      if (t < 1) raf = requestAnimationFrame(step)
      else setValue(target)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

/**
 * Returns event handlers + a style object for a subtle CSS 3-D perspective tilt on hover.
 * Attach `style`, `onMouseMove`, and `onMouseLeave` to the card element.
 */
export function use3dTilt(maxDeg = 6) {
  const [style, setStyle] = useState<React.CSSProperties>({})

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width - 0.5
      const y = (e.clientY - rect.top) / rect.height - 0.5
      setStyle({
        transform: `perspective(700px) rotateY(${x * maxDeg * 2}deg) rotateX(${-y * maxDeg}deg) scale3d(1.025, 1.025, 1.025)`,
        transition: 'transform 0.08s linear',
      })
    },
    [maxDeg],
  )

  const onMouseLeave = useCallback(() => {
    setStyle({
      transform: 'perspective(700px) rotateY(0deg) rotateX(0deg) scale3d(1, 1, 1)',
      transition: 'transform 0.55s cubic-bezier(0.23, 1, 0.32, 1)',
    })
  }, [])

  return { style, onMouseMove, onMouseLeave }
}
