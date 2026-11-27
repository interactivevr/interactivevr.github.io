import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { TextLabel } from '../scene/TextLabel'
import { cricketRuntime, useCricketStore } from './useCricketStore'

const PARTICLE_COUNT = 72

interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  rot: number
  color: string
}

export function CelebrationEffects() {
  const lastOutcomeKind = useCricketStore((s) => s.lastOutcomeKind)
  const eventBanner = useCricketStore((s) => s.eventBanner)
  const localRole = useCricketStore((s) => s.localCricketRole)

  const meshRef = useRef<THREE.InstancedMesh>(null)
  const bannerRef = useRef<THREE.Group>(null)
  const activeRef = useRef(false)
  const timerRef = useRef(0)

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const colorObj = useMemo(() => new THREE.Color(), [])

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, () => ({
        x: 0,
        y: -20,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rot: 0,
        color: '#fbbf24',
      })),
    []
  )

  const isCelebrating =
    lastOutcomeKind === 'wicket' || lastOutcomeKind === 'four' || lastOutcomeKind === 'six'

  useEffect(() => {
    if (!isCelebrating) {
      activeRef.current = false
      return
    }
    activeRef.current = true
    timerRef.current = 0

    const palette =
      lastOutcomeKind === 'wicket'
        ? ['#ef4444', '#fbbf24', '#ffffff', '#dc2626']
        : lastOutcomeKind === 'six'
          ? ['#fbbf24', '#f97316', '#34d399', '#38bdf8']
          : ['#38bdf8', '#ffffff', '#60a5fa', '#fbbf24']

    const baseZ = lastOutcomeKind === 'wicket' ? 10.0 : 0
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i]
      const angle = Math.random() * Math.PI * 2
      const spread = lastOutcomeKind === 'wicket' ? 3.5 : 14
      p.x = Math.cos(angle) * (Math.random() * spread)
      p.y = 0.6 + Math.random() * 1.4
      p.z = baseZ + Math.sin(angle) * (Math.random() * spread)
      p.vx = Math.cos(angle) * (2.5 + Math.random() * 6.5)
      p.vy = 6.5 + Math.random() * 9.5
      p.vz = Math.sin(angle) * (2.5 + Math.random() * 6.5)
      p.rot = Math.random() * Math.PI
      p.color = palette[i % palette.length]
    }
  }, [isCelebrating, lastOutcomeKind, eventBanner, particles])

  useFrame((state, delta) => {
    const cDt = Math.min(delta, 0.05)
    const mesh = meshRef.current
    const banner = bannerRef.current

    const show = activeRef.current && cricketRuntime.ball.phase === 'dead'
    if (mesh) mesh.visible = show
    if (banner) {
      banner.visible = show
      if (show) {
        banner.lookAt(state.camera.position)
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 10) * 0.06
        banner.scale.setScalar(pulse)
      }
    }

    if (!show || !mesh) return

    timerRef.current += cDt
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i]
      p.vy -= 9.2 * cDt
      p.x += p.vx * cDt
      p.y += p.vy * cDt
      p.z += p.vz * cDt
      p.rot += 7 * cDt
      if (p.y < 0.05) {
        p.y = 0.05
        p.vy = Math.abs(p.vy) * 0.35
      }

      dummy.position.set(p.x, p.y, p.z)
      dummy.rotation.set(p.rot, p.rot * 0.7, 0)
      dummy.scale.set(0.28, 0.28, 0.06)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      colorObj.set(p.color)
      mesh.setColorAt(i, colorObj)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  const calloutColor =
    lastOutcomeKind === 'wicket'
      ? '#ef4444'
      : lastOutcomeKind === 'six'
        ? '#fbbf24'
        : '#38bdf8'

  const bannerZ = localRole === 'bowler' ? 4.5 : -2.5

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]} visible={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>

      <group ref={bannerRef} position={[0, 4.4, bannerZ]} visible={false}>
        <mesh>
          <planeGeometry args={[7.2, 1.8]} />
          <meshBasicMaterial color="#09090b" transparent opacity={0.86} side={THREE.DoubleSide} />
        </mesh>
        <TextLabel
          position={[0, 0, 0.06]}
          fontSize={0.62}
          color={calloutColor}
          outlineColor="#ffffff"
          outlineWidth={0.01}
        >
          {eventBanner || (lastOutcomeKind === 'wicket' ? 'OUT!! WICKET!' : 'BOUNDARY!')}
        </TextLabel>
      </group>
    </group>
  )
}
