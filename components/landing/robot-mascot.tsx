'use client'

import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, RoundedBox } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

const CYAN = '#22d3ee'
const WHITE = '#e8eef6'
const DARK = '#0b0e14'

// Original neon mascot robot (Astro-inspired, but our own design — IP-safe).
function Robot({ scroll }: { scroll: React.MutableRefObject<number> }) {
  const g = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!g.current) return
    const p = scroll.current // 0..1 scroll progress
    const targetY = THREE.MathUtils.lerp(1.7, -1.9, p)
    g.current.position.y = THREE.MathUtils.lerp(g.current.position.y, targetY, 0.08)
    // turn toward the cursor + a slow descent spin
    g.current.rotation.y = THREE.MathUtils.lerp(g.current.rotation.y, state.pointer.x * 0.5 + p * 0.6, 0.05)
    g.current.rotation.x = THREE.MathUtils.lerp(g.current.rotation.x, -state.pointer.y * 0.22, 0.05)
  })

  const shell = <meshStandardMaterial color={WHITE} metalness={0.35} roughness={0.4} />
  const neon = (i = 3.4) => <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={i} toneMapped={false} />

  return (
    <group ref={g} scale={1.05}>
      {/* body */}
      <RoundedBox args={[0.95, 1.0, 0.72]} radius={0.3} smoothness={5} position={[0, -0.55, 0]}>
        {shell}
      </RoundedBox>
      {/* chest core */}
      <mesh position={[0, -0.45, 0.37]}>
        <sphereGeometry args={[0.13, 24, 24]} />
        {neon(3)}
      </mesh>
      {/* arms */}
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[0.22, 0.55, 0.22]} radius={0.1} smoothness={4} position={[s * 0.64, -0.5, 0.06]} rotation={[0, 0, s * 0.22]}>
          {shell}
        </RoundedBox>
      ))}
      {/* feet */}
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[0.3, 0.22, 0.34]} radius={0.1} smoothness={4} position={[s * 0.28, -1.12, 0.06]}>
          <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={1.4} toneMapped={false} />
        </RoundedBox>
      ))}
      {/* head */}
      <RoundedBox args={[1.12, 0.96, 0.86]} radius={0.36} smoothness={5} position={[0, 0.52, 0]}>
        {shell}
      </RoundedBox>
      {/* visor */}
      <RoundedBox args={[0.88, 0.62, 0.18]} radius={0.24} smoothness={5} position={[0, 0.54, 0.43]}>
        <meshStandardMaterial color={DARK} metalness={0.5} roughness={0.18} />
      </RoundedBox>
      {/* eyes */}
      {[-0.2, 0.2].map((x) => (
        <mesh key={x} position={[x, 0.56, 0.55]} rotation={[0, 0, 0]}>
          <capsuleGeometry args={[0.06, 0.12, 8, 16]} />
          {neon(3.6)}
        </mesh>
      ))}
      {/* antenna */}
      <mesh position={[0, 1.07, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.32, 12]} />
        <meshStandardMaterial color={WHITE} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.28, 0]}>
        <sphereGeometry args={[0.085, 20, 20]} />
        {neon(4.2)}
      </mesh>
    </group>
  )
}

export default function RobotMascot() {
  const scroll = useRef(0)
  const [opacity, setOpacity] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      scroll.current = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      // hidden in the hero (gamepad lives there); fades in once you start scrolling
      setOpacity(Math.min(1, Math.max(0, (window.scrollY - 140) / 220)))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div
      className="pointer-events-none fixed inset-y-0 right-0 z-20 hidden w-[20rem] transition-opacity duration-300 lg:block xl:w-[24rem]"
      style={{ opacity }}
      aria-hidden
    >
      <Canvas camera={{ position: [0, 0, 6], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.85} />
        <pointLight position={[2, 3, 4]} intensity={55} color="#ffffff" />
        <pointLight position={[-3, -2, 2]} intensity={32} color={CYAN} />
        <Float speed={2} rotationIntensity={0.25} floatIntensity={0.6}>
          <Robot scroll={scroll} />
        </Float>
        <EffectComposer>
          <Bloom intensity={1.1} luminanceThreshold={0.3} luminanceSmoothing={0.9} mipmapBlur />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
