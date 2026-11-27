import { useGameStore } from '../store/useGameStore'
import { COURT_HALF_L, COURT_HALF_W, COURT_WALL_H, getTeePositionForBall } from '../types/game'
import { TextLabel as Text } from './TextLabel'

function CourtPad({
  position,
  color,
  label,
}: {
  position: [number, number, number]
  color: string
  label: string
}) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[0.72, 0.88, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <circleGeometry args={[0.72, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.14} />
      </mesh>
      <Text
        position={[0, 0.03, 1.08]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.24}
        color={color}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  )
}

function BallTee({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={[position[0], 0, position[2]]}>
      <mesh position={[0, 0.46, 0]}>
        <cylinderGeometry args={[0.045, 0.09, 0.92, 16]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.93, 0]}>
        <torusGeometry args={[0.095, 0.018, 10, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} />
      </mesh>
    </group>
  )
}

export function ArenaEnvironment() {
  const gameMode = useGameStore((s) => s.gameMode)

  const tee0 = getTeePositionForBall(0, gameMode)
  const tee1 = getTeePositionForBall(1, gameMode)

  return (
    <group>
      {/* Sky & lighting tuned for crisp Quest 72-90 FPS */}
      <color attach="background" args={['#091020']} />
      <fog attach="fog" args={['#091020', 22, 48]} />
      <hemisphereLight args={['#93c5fd', '#1e293b', 0.95]} />
      <directionalLight position={[6, 14, 8]} intensity={1.35} color="#fff7ed" />
      <directionalLight position={[-6, 10, -8]} intensity={0.55} color="#38bdf8" />

      {/* Outer stadium dark floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#060b16" roughness={0.95} />
      </mesh>

      {/* Main Court Surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[COURT_HALF_W * 2, COURT_HALF_L * 2]} />
        <meshStandardMaterial color="#0f1b33" roughness={0.82} metalness={0.1} />
      </mesh>

      {/* Court Grid Lines */}
      <gridHelper
        args={[COURT_HALF_L * 2, 17, '#1e3a5f', '#172845']}
        position={[0, 0.004, 0]}
        scale={[COURT_HALF_W / COURT_HALF_L, 1, 1]}
      />

      {/* Midcourt divider */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[COURT_HALF_W * 2, 0.08]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.45} />
      </mesh>

      {/* Perimeter neon rails */}
      {[
        { pos: [0, 0.05, COURT_HALF_L] as [number, number, number], size: [COURT_HALF_W * 2, 0.1, 0.08] as [number, number, number] },
        { pos: [0, 0.05, -COURT_HALF_L] as [number, number, number], size: [COURT_HALF_W * 2, 0.1, 0.08] as [number, number, number] },
        { pos: [COURT_HALF_W, 0.05, 0] as [number, number, number], size: [0.08, 0.1, COURT_HALF_L * 2] as [number, number, number] },
        { pos: [-COURT_HALF_W, 0.05, 0] as [number, number, number], size: [0.08, 0.1, COURT_HALF_L * 2] as [number, number, number] },
      ].map((rail, i) => (
        <mesh key={i} position={rail.pos}>
          <boxGeometry args={rail.size} />
          <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.4} />
        </mesh>
      ))}

      {/* Subtle corner pillars for spatial grounding in VR */}
      {[
        [-COURT_HALF_W, COURT_WALL_H / 2, -COURT_HALF_L],
        [COURT_HALF_W, COURT_WALL_H / 2, -COURT_HALF_L],
        [-COURT_HALF_W, COURT_WALL_H / 2, COURT_HALF_L],
        [COURT_HALF_W, COURT_WALL_H / 2, COURT_HALF_L],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <boxGeometry args={[0.16, COURT_WALL_H, 0.16]} />
          <meshStandardMaterial color="#1e293b" emissive="#1d4ed8" emissiveIntensity={0.25} />
        </mesh>
      ))}

      {/* Mode-specific court pads and ball tees */}
      {gameMode === 'twin-thrower' && (
        <>
          <CourtPad position={[0, 0, 5.4]} color="#34d399" label="CATCHER ZONE" />
          <CourtPad position={[-2.3, 0, -5.4]} color="#fb923c" label="THROWER 1" />
          <CourtPad position={[2.3, 0, -5.4]} color="#22d3ee" label="THROWER 2" />
          <BallTee position={tee0} color="#ff6b2c" />
          <BallTee position={tee1} color="#22d3ee" />
        </>
      )}

      {gameMode === 'rally' && (
        <>
          <CourtPad position={[0, 0, 5.2]} color="#38bdf8" label="PLAYER 1" />
          <CourtPad position={[0, 0, -5.2]} color="#fb7185" label="PLAYER 2" />
          <BallTee position={tee0} color="#ff6b2c" />
        </>
      )}

      {gameMode === 'solo' && (
        <>
          <CourtPad position={[0, 0, 4.5]} color="#34d399" label="SOLO PAD" />
          <BallTee position={tee0} color="#ff6b2c" />
          <BallTee position={tee1} color="#22d3ee" />
          {/* Rebound target wall */}
          <group position={[0, 2.0, -5.45]}>
            <mesh>
              <boxGeometry args={[5.6, 3.6, 0.18]} />
              <meshStandardMaterial color="#172554" roughness={0.6} />
            </mesh>
            <mesh position={[0, -0.1, 0.1]}>
              <ringGeometry args={[1.15, 1.45, 36]} />
              <meshBasicMaterial color="#38bdf8" />
            </mesh>
            <mesh position={[0, -0.1, 0.11]}>
              <circleGeometry args={[0.62, 32]} />
              <meshBasicMaterial color="#fb923c" />
            </mesh>
            <Text position={[0, 1.35, 0.14]} fontSize={0.3} color="#e2e8f0" anchorX="center">
              REBOUND TARGET — HIT TO BOUNCE BACK
            </Text>
          </group>
        </>
      )}
    </group>
  )
}
