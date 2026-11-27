import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { TextLabel } from '../scene/TextLabel'
import { stepStumpsAndBails } from './cricketPhysics'
import {
  BATTING_CREASE_Z,
  BATTING_STUMPS_Z,
  BOUNDARY_RX,
  BOUNDARY_RZ,
  BOWLING_CREASE_Z,
  BOWLING_STUMPS_Z,
  PITCH_HALF_W,
  PITCH_LENGTH,
  STUMP_HEIGHT,
  STUMP_SPREAD,
} from './types'
import { cricketRuntime, useCricketStore } from './useCricketStore'

const CROWD_COUNT = 420
const CROWD_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#e2e8f0', '#ec4899', '#38bdf8']

function StumpsSet({
  z,
  animated = false,
}: {
  z: number
  animated?: boolean
}) {
  const stumpRefs = useRef<Array<THREE.Mesh | null>>([])
  const bailRefs = useRef<Array<THREE.Mesh | null>>([])

  useFrame((_, delta) => {
    if (!animated) return
    stepStumpsAndBails(delta)
    const st = cricketRuntime.stumps
    for (let i = 0; i < 3; i++) {
      const m = stumpRefs.current[i]
      if (!m) continue
      const off = st.offsets[i]
      const baseX = (i - 1) * STUMP_SPREAD
      m.position.set(baseX + off.pos[0], STUMP_HEIGHT / 2 + off.pos[1], off.pos[2])
      m.rotation.set(off.rot[0], off.rot[1], off.rot[2])
    }
    for (let i = 0; i < 2; i++) {
      const bm = bailRefs.current[i]
      if (!bm) continue
      const b = st.bails[i]
      bm.position.set(b.pos[0], b.pos[1], b.pos[2])
      bm.rotation.set(b.rot[0], b.rot[1], b.rot[2])
    }
  })

  return (
    <group position={[0, 0, z]}>
      {[-1, 0, 1].map((idx, i) => (
        <mesh
          key={i}
          ref={(el) => {
            stumpRefs.current[i] = el
          }}
          position={[idx * STUMP_SPREAD, STUMP_HEIGHT / 2, 0]}
        >
          <cylinderGeometry args={[0.019, 0.019, STUMP_HEIGHT, 10]} />
          <meshStandardMaterial color="#f5e6c8" roughness={0.45} />
        </mesh>
      ))}
      {[-0.055, 0.055].map((bx, i) => (
        <mesh
          key={i}
          ref={(el) => {
            bailRefs.current[i] = el
          }}
          position={[bx, STUMP_HEIGHT + 0.012, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.01, 0.01, 0.1, 8]} />
          <meshStandardMaterial color="#fde68a" roughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

function InstancedStadiumCrowd() {
  const crowdRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const mesh = crowdRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()

    for (let i = 0; i < CROWD_COUNT; i++) {
      const angle = (i / CROWD_COUNT) * Math.PI * 2 + (i % 3) * 0.015
      const tier = i % 4
      const rx = BOUNDARY_RX + 6.5 + tier * 2.4
      const rz = BOUNDARY_RZ + 6.5 + tier * 2.4
      const x = Math.cos(angle) * rx
      const z = Math.sin(angle) * rz
      const y = 2.4 + tier * 1.45

      dummy.position.set(x, y, z)
      dummy.lookAt(0, y, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      color.set(CROWD_COLORS[(i * 7) % CROWD_COLORS.length])
      mesh.setColorAt(i, color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  return (
    <instancedMesh ref={crowdRef} args={[undefined, undefined, CROWD_COUNT]}>
      <boxGeometry args={[0.55, 0.95, 0.4]} />
      <meshStandardMaterial roughness={0.85} />
    </instancedMesh>
  )
}

function StadiumScoreboard() {
  const runs = useCricketStore((s) => s.runs)
  const wickets = useCricketStore((s) => s.wickets)
  const legalBalls = useCricketStore((s) => s.legalBalls)
  const format = useCricketStore((s) => s.format)
  const pitchMode = useCricketStore((s) => s.pitchMode)
  const bowlingStyle = useCricketStore((s) => s.bowlingStyle)
  const targetScore = useCricketStore((s) => s.targetScore)

  const oversStr = `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`
  const maxOversStr = format === '1-over' ? '1.0' : '10.0'

  return (
    <group position={[0, 12.8, -(BOUNDARY_RZ + 7.2)]}>
      <mesh>
        <boxGeometry args={[18, 6.2, 0.6]} />
        <meshStandardMaterial color="#0f172a" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.35]}>
        <planeGeometry args={[17.2, 5.5]} />
        <meshBasicMaterial color="#071126" />
      </mesh>
      <TextLabel position={[0, 1.85, 0.45]} fontSize={0.72} color="#38bdf8">
        {`CRICKET ARENA • ${format.toUpperCase()} MATCH • ${pitchMode.toUpperCase()} PITCH`}
      </TextLabel>
      <TextLabel position={[-4.2, 0.05, 0.45]} fontSize={1.45} color="#34d399">
        {`${runs} / ${wickets}`}
      </TextLabel>
      <TextLabel position={[-4.2, -1.55, 0.45]} fontSize={0.52} color="#94a3b8">
        RUNS / WICKETS
      </TextLabel>
      <TextLabel position={[4.2, 0.05, 0.45]} fontSize={1.35} color="#fbbf24">
        {`${oversStr} / ${maxOversStr}`}
      </TextLabel>
      <TextLabel position={[4.2, -1.55, 0.45]} fontSize={0.52} color="#94a3b8">
        {targetScore !== null ? `TARGET ${targetScore} • ${bowlingStyle.toUpperCase()}` : `OVERS • ${bowlingStyle.toUpperCase()} BOWLER`}
      </TextLabel>
    </group>
  )
}

export function StadiumEnvironment() {
  const pitchMode = useCricketStore((s) => s.pitchMode)
  const isWet = pitchMode === 'wet'

  return (
    <group>
      {/* Crisp daylight stadium sky & lighting */}
      <color attach="background" args={['#60a5fa']} />
      <fog attach="fog" args={['#93c5fd', 55, 135]} />
      <hemisphereLight args={['#eff6ff', '#166534', 1.15]} />
      <directionalLight position={[22, 38, 18]} intensity={1.65} color="#fffbeb" />
      <directionalLight position={[-18, 24, -22]} intensity={0.6} color="#bae6fd" />

      {/* Outer Grass Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[72, 64]} />
        <meshStandardMaterial color="#15803d" roughness={0.92} />
      </mesh>

      {/* Mowed Outfield Concentric Grass Rings */}
      {[42, 34, 26, 18].map((r, i) => (
        <mesh
          key={r}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.002 + i * 0.001, 0]}
          scale={[1, BOUNDARY_RZ / BOUNDARY_RX, 1]}
        >
          <circleGeometry args={[r, 56]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#16a34a' : '#22c55e'} roughness={0.9} />
        </mesh>
      ))}

      {/* 30-yard Inner Circle & Crisp Boundary Rope */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} scale={[1, 26 / 23, 1]}>
        <ringGeometry args={[22.92, 23.08, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.65} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.018, 0]}
        scale={[1, BOUNDARY_RZ / BOUNDARY_RX, 1]}
      >
        <ringGeometry args={[BOUNDARY_RX - 0.16, BOUNDARY_RX + 0.16, 72]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* 22-Yard Cricket Pitch Strip (Hard vs Wet visual appearance) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <planeGeometry args={[PITCH_HALF_W * 2, PITCH_LENGTH + 2.4]} />
        <meshStandardMaterial
          color={isWet ? '#3f5f45' : '#d6b482'}
          roughness={isWet ? 0.24 : 0.92}
          metalness={isWet ? 0.16 : 0.02}
        />
      </mesh>

      {/* White Crease Markings */}
      {[BATTING_CREASE_Z, BATTING_STUMPS_Z, BOWLING_CREASE_Z, BOWLING_STUMPS_Z].map((cz, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, cz]}>
          <planeGeometry args={[PITCH_HALF_W * 2 + 0.6, 0.055]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
      {/* Wide guidelines */}
      {[-1.32, 1.32].map((wx, idx) => (
        <group key={idx}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[wx, 0.02, (BATTING_CREASE_Z + BATTING_STUMPS_Z) / 2]}>
            <planeGeometry args={[0.045, 1.28]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[wx, 0.02, (BOWLING_CREASE_Z + BOWLING_STUMPS_Z) / 2]}>
            <planeGeometry args={[0.045, 1.28]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      ))}

      {/* Stumps & Bails at both ends */}
      <StumpsSet z={BATTING_STUMPS_Z} animated />
      <StumpsSet z={BOWLING_STUMPS_Z} />

      {/* White Sightscreen behind Bowler's End so incoming red ball pops sharply in VR */}
      <group position={[0, 3.2, -24.5]}>
        <mesh>
          <boxGeometry args={[10.5, 5.8, 0.35]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.7} />
        </mesh>
        <mesh position={[0, -2.9, 0.2]}>
          <boxGeometry args={[10.8, 0.25, 0.45]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
      </group>

      {/* Stadium Advertising Perimeter Boards */}
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i / 24) * Math.PI * 2
        const x = Math.cos(a) * (BOUNDARY_RX + 2.4)
        const z = Math.sin(a) * (BOUNDARY_RZ + 2.4)
        return (
          <mesh
            key={i}
            position={[x, 0.65, z]}
            rotation={[0, Math.atan2(-x, -z), 0]}
          >
            <boxGeometry args={[10.2, 1.2, 0.35]} />
            <meshStandardMaterial color={i % 2 === 0 ? '#1e3a8a' : '#0f172a'} roughness={0.6} />
          </mesh>
        )
      })}

      {/* Multi-tiered Stadium Seating Bowl */}
      <mesh position={[0, 4.2, 0]} scale={[1, 1, BOUNDARY_RZ / BOUNDARY_RX]}>
        <cylinderGeometry args={[BOUNDARY_RX + 16, BOUNDARY_RX + 5, 8.5, 48, 1, true]} />
        <meshStandardMaterial color="#1e293b" side={THREE.BackSide} roughness={0.85} />
      </mesh>
      <mesh position={[0, 10.0, 0]} scale={[1, 1, BOUNDARY_RZ / BOUNDARY_RX]}>
        <cylinderGeometry args={[BOUNDARY_RX + 20, BOUNDARY_RX + 16, 4.2, 48, 1, true]} />
        <meshStandardMaterial color="#334155" side={THREE.BackSide} roughness={0.85} />
      </mesh>

      {/* 4 Towering Floodlight Pylons */}
      {[
        [-38, -40],
        [38, -40],
        [-38, 42],
        [38, 42],
      ].map(([fx, fz], idx) => (
        <group key={idx} position={[fx, 0, fz]} rotation={[0, Math.atan2(-fx, -fz), 0]}>
          <mesh position={[0, 16, 0]}>
            <cylinderGeometry args={[0.55, 0.95, 32, 10]} />
            <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, 32, 0.6]}>
            <boxGeometry args={[7.2, 3.4, 0.5]} />
            <meshStandardMaterial color="#f8fafc" emissive="#fef9c3" emissiveIntensity={0.95} />
          </mesh>
        </group>
      ))}

      <InstancedStadiumCrowd />
      <StadiumScoreboard />
    </group>
  )
}
