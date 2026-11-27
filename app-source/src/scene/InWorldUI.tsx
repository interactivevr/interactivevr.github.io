import { useState } from 'react'
import { p2pClient } from '../net/p2pClient'
import { voiceAudio } from '../net/voiceAudio'
import { resetAllBallsToTees } from '../physics/ballActions'
import { useGameStore } from '../store/useGameStore'
import { GameMode } from '../types/game'
import { xrStore } from '../xr/xrStore'
import { TextLabel as Text } from './TextLabel'

function VRButton3D({
  position,
  label,
  color,
  onClick,
  width = 1.05,
}: {
  position: [number, number, number]
  label: string
  color: string
  onClick: () => void
  width?: number
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <group position={position}>
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[width, 0.28, 0.06]} />
        <meshStandardMaterial
          color={hovered ? '#ffffff' : color}
          emissive={color}
          emissiveIntensity={hovered ? 0.65 : 0.32}
          roughness={0.35}
        />
      </mesh>
      <Text
        position={[0, 0, 0.04]}
        fontSize={0.09}
        color={hovered ? '#0f172a' : '#f8fafc'}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  )
}

function ScoreboardPanel({
  position,
  rotationY = 0,
}: {
  position: [number, number, number]
  rotationY?: number
}) {
  const scores = useGameStore((s) => s.scores)
  const gameMode = useGameStore((s) => s.gameMode)
  const roomId = useGameStore((s) => s.roomId)
  const peers = useGameStore((s) => s.peers)

  const playerCount = 1 + Object.keys(peers).length

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh>
        <boxGeometry args={[4.4, 1.55, 0.14]} />
        <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0, 0.075]}>
        <planeGeometry args={[4.25, 1.4]} />
        <meshBasicMaterial color="#0b1224" />
      </mesh>
      <Text position={[0, 0.45, 0.09]} fontSize={0.18} color="#38bdf8" anchorX="center">
        {`ROOM ${roomId}  •  ${gameMode.toUpperCase()}  •  ${playerCount} PLAYER${playerCount > 1 ? 'S' : ''}`}
      </Text>
      <Text position={[-1.4, -0.05, 0.09]} fontSize={0.28} color="#34d399" anchorX="center">
        {`${scores.catches}`}
      </Text>
      <Text position={[-1.4, -0.38, 0.09]} fontSize={0.12} color="#94a3b8" anchorX="center">
        CATCHES
      </Text>

      <Text position={[-0.45, -0.05, 0.09]} fontSize={0.28} color="#fbbf24" anchorX="center">
        {`${scores.streak}`}
      </Text>
      <Text position={[-0.45, -0.38, 0.09]} fontSize={0.12} color="#94a3b8" anchorX="center">
        STREAK
      </Text>

      <Text position={[0.5, -0.05, 0.09]} fontSize={0.28} color="#fb923c" anchorX="center">
        {`${scores.bestStreak}`}
      </Text>
      <Text position={[0.5, -0.38, 0.09]} fontSize={0.12} color="#94a3b8" anchorX="center">
        BEST
      </Text>

      <Text position={[1.42, -0.05, 0.09]} fontSize={0.28} color="#fb7185" anchorX="center">
        {`${scores.drops}`}
      </Text>
      <Text position={[1.42, -0.38, 0.09]} fontSize={0.12} color="#94a3b8" anchorX="center">
        DROPS
      </Text>
    </group>
  )
}

export function InWorldUI() {
  const inXR = useGameStore((s) => s.inXR)
  const micEnabled = useGameStore((s) => s.micEnabled)
  const gameMode = useGameStore((s) => s.gameMode)
  const localRole = useGameStore((s) => s.localRole)

  const cycleMode = () => {
    const order: GameMode[] = ['twin-thrower', 'rally', 'solo']
    const next = order[(order.indexOf(gameMode) + 1) % order.length]
    useGameStore.getState().setGameMode(next)
    p2pClient.broadcastModeAndRoles()
    resetAllBallsToTees()
  }

  return (
    <group>
      {/* Dual stadium scoreboards facing both ends of the court */}
      <ScoreboardPanel position={[0, 4.1, -8.3]} rotationY={0} />
      <ScoreboardPanel position={[0, 4.1, 8.3]} rotationY={Math.PI} />

      {/* In-VR Diegetic Control Panel along side rail (clickable by XR laser pointer or pinch) */}
      {inXR && (
        <group position={[-4.5, 1.35, 0]} rotation={[0, Math.PI / 2, 0]}>
          <mesh>
            <boxGeometry args={[2.5, 1.4, 0.08]} />
            <meshStandardMaterial color="#0f172a" roughness={0.6} />
          </mesh>
          <Text position={[0, 0.5, 0.05]} fontSize={0.11} color="#7dd3fc" anchorX="center">
            {`VR CONTROLS • YOUR ROLE: ${localRole.toUpperCase()}`}
          </Text>
          <VRButton3D
            position={[-0.6, 0.16, 0.04]}
            label="RESET BALLS"
            color="#0284c7"
            onClick={() => resetAllBallsToTees()}
          />
          <VRButton3D
            position={[0.6, 0.16, 0.04]}
            label="ROTATE ROLES"
            color="#7c3aed"
            onClick={() => {
              useGameStore.getState().rotateRoles()
              p2pClient.broadcastModeAndRoles()
            }}
          />
          <VRButton3D
            position={[-0.6, -0.22, 0.04]}
            label={micEnabled ? 'MIC: ON' : 'MIC: MUTED'}
            color={micEnabled ? '#059669' : '#dc2626'}
            onClick={() => {
              voiceAudio.setMicEnabled(!micEnabled)
              p2pClient.broadcastProfile()
            }}
          />
          <VRButton3D
            position={[0.6, -0.22, 0.04]}
            label={`MODE: ${gameMode.toUpperCase()}`}
            color="#d97706"
            onClick={cycleMode}
          />
          <VRButton3D
            position={[0, -0.54, 0.04]}
            width={1.4}
            label="EXIT VR"
            color="#b91c1c"
            onClick={() => {
              void xrStore.getState().session?.end()
            }}
          />
        </group>
      )}
    </group>
  )
}
