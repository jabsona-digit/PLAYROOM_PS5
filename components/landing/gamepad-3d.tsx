'use client'

import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, RoundedBox } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

const CYAN = '#22d3ee'
const MAGENTA = '#d946ef'
const BODY = '#1d212b'

function bodyMat() {
  return <meshStandardMaterial color={BODY} metalness={0.75} roughness={0.28} />
}

function Gamepad() {
  const g = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!g.current) return
    const { x, y } = state.pointer
    g.current.rotation.y = THREE.MathUtils.lerp(g.current.rotation.y, x * 0.6, 0.06)
    g.current.rotation.x = THREE.MathUtils.lerp(g.current.rotation.x, -y * 0.35, 0.06)
  })

  return (
    <group ref={g} scale={1.15}>
      {/* main body */}
      <RoundedBox args={[2.5, 0.55, 1.2]} radius={0.26} smoothness={5}>
        {bodyMat()}
      </RoundedBox>

      {/* grips */}
      {[-1, 1].map((s) => (
        <RoundedBox
          key={s}
          args={[0.6, 0.5, 1.45]}
          radius={0.24}
          smoothness={5}
          position={[s * 1.0, -0.22, 0.28]}
          rotation={[0.32, s * 0.38, s * 0.12]}
        >
          {bodyMat()}
        </RoundedBox>
      ))}

      {/* thumbsticks */}
      {[-0.58, 0.58].map((x) => (
        <group key={x} position={[x, 0.34, 0.22]}>
          <mesh>
            <cylinderGeometry args={[0.19, 0.21, 0.1, 28]} />
            <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={2.4} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <sphereGeometry args={[0.16, 28, 28]} />
            <meshStandardMaterial color="#0b0e12" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* d-pad */}
      <group position={[-0.58, 0.33, -0.28]}>
        <mesh>
          <boxGeometry args={[0.42, 0.08, 0.15]} />
          <meshStandardMaterial color={MAGENTA} emissive={MAGENTA} emissiveIntensity={1.8} toneMapped={false} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.15, 0.08, 0.42]} />
          <meshStandardMaterial color={MAGENTA} emissive={MAGENTA} emissiveIntensity={1.8} toneMapped={false} />
        </mesh>
      </group>

      {/* face buttons */}
      {[
        [0.58, 0.34, -0.5],
        [0.8, 0.34, -0.28],
        [0.36, 0.34, -0.28],
        [0.58, 0.34, -0.06],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <sphereGeometry args={[0.085, 20, 20]} />
          <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
      ))}

      {/* glowing center light bar */}
      <mesh position={[0, 0.31, -0.05]}>
        <boxGeometry args={[0.55, 0.05, 0.05]} />
        <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={3.5} toneMapped={false} />
      </mesh>
    </group>
  )
}

export default function Gamepad3D() {
  return (
    <Canvas
      camera={{ position: [0, 0.6, 4.2], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.7} />
      <pointLight position={[3, 3, 3]} intensity={60} color={CYAN} />
      <pointLight position={[-3, -2, 2]} intensity={45} color={MAGENTA} />
      <pointLight position={[0, 2, -3]} intensity={30} color="#ffffff" />
      <Float speed={2.2} rotationIntensity={0.45} floatIntensity={0.9}>
        <Gamepad />
      </Float>
      <EffectComposer>
        <Bloom intensity={1.25} luminanceThreshold={0.25} luminanceSmoothing={0.9} mipmapBlur />
      </EffectComposer>
    </Canvas>
  )
}
