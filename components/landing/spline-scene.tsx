'use client'

import { Suspense, lazy } from 'react'
import { LoaderCircle } from 'lucide-react'

// Heavy 3D runtime — lazy so it never blocks initial load.
const Spline = lazy(() => import('@splinetool/react-spline'))

export function SplineScene({ scene, className }: { scene: string; className?: string }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center">
          <LoaderCircle className="size-8 animate-spin text-primary" />
        </div>
      }
    >
      <Spline scene={scene} className={className} />
    </Suspense>
  )
}
