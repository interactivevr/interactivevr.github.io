import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { playBatHitSfx, playBoundaryCrowdSfx } from '../audio/cricketSfx'
import { p2pClient } from '../net/p2pClient'
import { voiceAudio } from '../net/voiceAudio'
import { TextLabel } from '../scene/TextLabel'
import { useGameStore } from '../store/useGameStore'
import { xrStore } from '../xr/xrStore'
import { CricketAvatars } from './CricketAvatars'
import { CricketDesktopRig } from './CricketDesktopRig'
import { CricketVRRig } from './CricketVRRig'
import { stepCricketAI } from './cricketAI'
import { checkBatHitBall, stepCricketBallPhysics } from './cricketPhysics'
import { StadiumEnvironment } from './StadiumEnvironment'
import { BATTING_STUMPS_Z, CRICKET_BALL_RADIUS, WIDE_HALF_W } from './types'
import { cricketRuntime, resetCricketBallToBowler, useCricketStore } from './useCricketStore'

const TRAIL_COUNT = 10

function CricketBallAndSim() {
  const ballGroupRef = useRef<THREE.Group>(null)
  const shadowRef = useRef<THREE.Mesh>(null)
  const trailRefs = useRef<Array<THREE.Mesh | null>>([])
  const trailHistory = useMemo<Array<[number, number, number]>>(
    () => Array.from({ length: TRAIL_COUNT }, () => [0, -10, 0] as [number, number, number]),
    []
  )
  const lastSyncRef = useRef(0)

  useFrame((_, delta) => {
    const gState = useGameStore.getState()
    const crState = useCricketStore.getState()
    const localId = gState.localPeerId || 'local'
    const ball = cricketRuntime.ball

    // Determine authoritative peer for ball physics & AI
    const humanIds = Object.values(crState.assignments).filter((v) => v !== 'ai')
    const sortedHumans = Array.from(new Set(humanIds)).sort()
    const isRoomAuthority = sortedHumans.length === 0 || sortedHumans[0] === localId || sortedHumans[0] === 'local'
    const isBallAuthority =
      ball.phase === 'hit'
        ? crState.assignments.batter === localId || (crState.assignments.batter === 'ai' && isRoomAuthority)
        : ball.ownerId === localId || (ball.ownerId === null && isRoomAuthority)

    // 1. Check local bat collision before stepping physics
    if (cricketRuntime.bat.active && ball.phase === 'bowled') {
      const hitOut = checkBatHitBall(ball, cricketRuntime.bat)
      if (hitOut.hit) {
        playBatHitSfx(hitOut.hitSpeed, hitOut.edge)
        cricketRuntime.onCricketBallSend?.(ball)
      }
    }

    // 2. Step ball physics while bowled or hit
    if (ball.phase === 'bowled' || ball.phase === 'hit') {
      const res = stepCricketBallPhysics(ball, crState.pitchMode, delta)

      if (isBallAuthority && res.hitStumpsNow && ball.phase === 'bowled') {
        ball.phase = 'dead'
        ball.epoch += 1
        playBoundaryCrowdSfx(true)
        crState.recordDeliveryOutcome({
          runsScored: 0,
          isWicket: true,
          isLegalBall: true,
          label: 'W',
          banner: 'OUT! CLEAN BOWLED!',
        })
        cricketRuntime.onCricketBallSend?.(ball)
        cricketRuntime.onCricketStateSend?.(useCricketStore.getState().getSyncPayload())
      } else if (isBallAuthority && res.crossedBoundaryNow && ball.phase === 'hit') {
        const isSix = !ball.bouncedAfterHit
        ball.phase = 'dead'
        ball.vel = [0, 0, 0]
        ball.epoch += 1
        playBoundaryCrowdSfx(isSix)
        crState.recordDeliveryOutcome({
          runsScored: isSix ? 6 : 4,
          isWicket: false,
          isLegalBall: true,
          label: isSix ? '6' : '4',
          banner: isSix ? 'MAXIMUM! SIX RUNS!!' : 'CRACKING FOUR!',
        })
        cricketRuntime.onCricketBallSend?.(ball)
        cricketRuntime.onCricketStateSend?.(useCricketStore.getState().getSyncPayload())
      } else if (isBallAuthority && ball.phase === 'bowled' && ball.pos[2] > BATTING_STUMPS_Z + 4.8) {
        // Missed ball went past keeper untouched
        const isWide = !ball.hitByBat && Math.abs(ball.pos[0]) > WIDE_HALF_W
        ball.phase = 'dead'
        ball.vel = [0, 0, 0]
        ball.epoch += 1
        crState.recordDeliveryOutcome({
          runsScored: isWide ? 1 : 0,
          isWicket: false,
          isLegalBall: !isWide,
          label: isWide ? 'WD' : '0',
          banner: isWide ? 'WIDE BALL (+1)' : 'DOT BALL',
        })
        cricketRuntime.onCricketBallSend?.(ball)
        cricketRuntime.onCricketStateSend?.(useCricketStore.getState().getSyncPayload())
      } else if (isBallAuthority && res.settled && ball.phase === 'hit') {
        ball.phase = 'dead'
        ball.epoch += 1
        const d = ball.maxDistanceFromPitch
        const runsScored = d > 31 ? 3 : d > 20 ? 2 : d > 9 ? 1 : 0
        crState.recordDeliveryOutcome({
          runsScored,
          isWicket: false,
          isLegalBall: true,
          label: `${runsScored}`,
          banner: runsScored === 0 ? 'DOT BALL' : `${runsScored} RUN${runsScored > 1 ? 'S' : ''}!`,
        })
        cricketRuntime.onCricketBallSend?.(ball)
        cricketRuntime.onCricketStateSend?.(useCricketStore.getState().getSyncPayload())
      }

      const now = performance.now()
      if (isBallAuthority && now - lastSyncRef.current > 110) {
        lastSyncRef.current = now
        cricketRuntime.onCricketBallSend?.(ball)
      }
    }

    // 3. Step Computer AI (Bowler / Batter / Keeper / 9 Outfielders)
    stepCricketAI(delta, localId)

    // 4. Update visuals
    if (ballGroupRef.current) {
      ballGroupRef.current.position.set(ball.pos[0], ball.pos[1], ball.pos[2])
      ballGroupRef.current.rotation.x += ball.vel[2] * delta * 1.4
      ballGroupRef.current.rotation.z -= ball.vel[0] * delta * 1.4
    }

    if (shadowRef.current) {
      shadowRef.current.position.set(ball.pos[0], 0.025, ball.pos[2])
      const s = Math.max(0.28, 1 - ball.pos[1] * 0.12)
      shadowRef.current.scale.setScalar(s)
    }

    const isMoving = ball.phase === 'bowled' || ball.phase === 'hit'
    if (isMoving) {
      trailHistory.pop()
      trailHistory.unshift([ball.pos[0], ball.pos[1], ball.pos[2]])
    } else {
      for (let i = 0; i < TRAIL_COUNT; i++) {
        trailHistory[i] = [ball.pos[0], ball.pos[1], ball.pos[2]]
      }
    }

    for (let i = 0; i < TRAIL_COUNT; i++) {
      const m = trailRefs.current[i]
      if (!m) continue
      m.visible = isMoving
      m.position.set(trailHistory[i][0], trailHistory[i][1], trailHistory[i][2])
      m.scale.setScalar(Math.max(0.18, 0.78 - i * 0.065))
    }
  })

  return (
    <group>
      <group ref={ballGroupRef}>
        <mesh>
          <sphereGeometry args={[CRICKET_BALL_RADIUS, 18, 14]} />
          <meshStandardMaterial color="#b91c1c" roughness={0.32} metalness={0.12} />
        </mesh>
        {/* White stitched seam */}
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[CRICKET_BALL_RADIUS * 0.99, 0.0045, 6, 20]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      </group>

      <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[CRICKET_BALL_RADIUS * 1.4, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.42} depthWrite={false} />
      </mesh>

      {Array.from({ length: TRAIL_COUNT }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            trailRefs.current[i] = el
          }}
          visible={false}
        >
          <sphereGeometry args={[CRICKET_BALL_RADIUS * 0.75, 8, 8]} />
          <meshBasicMaterial
            color="#f87171"
            transparent
            opacity={Math.max(0.05, 0.36 - i * 0.032)}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

function VRButton({
  position,
  label,
  color,
  onClick,
  width = 1.1,
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
          emissiveIntensity={hovered ? 0.6 : 0.28}
        />
      </mesh>
      <TextLabel position={[0, 0, 0.04]} fontSize={0.085} color={hovered ? '#0f172a' : '#f8fafc'}>
        {label}
      </TextLabel>
    </group>
  )
}

function InVRCricketPanel() {
  const inXR = useGameStore((s) => s.inXR)
  const peers = useGameStore((s) => s.peers)
  const localPeerId = useGameStore((s) => s.localPeerId)
  const micEnabled = useGameStore((s) => s.micEnabled)

  const localRole = useCricketStore((s) => s.localCricketRole)
  const format = useCricketStore((s) => s.format)
  const pitchMode = useCricketStore((s) => s.pitchMode)
  const bowlingStyle = useCricketStore((s) => s.bowlingStyle)
  const batterStance = useCricketStore((s) => s.batterStance)

  if (!inXR) return null

  const panelPos: [number, number, number] =
    localRole === 'bowler' ? [-3.4, 1.35, -9.8] : [-3.6, 1.35, 8.6]
  const panelRotY = localRole === 'bowler' ? Math.PI * 0.65 : Math.PI * 0.35

  const sync = () => {
    p2pClient.broadcastCricketState()
  }

  return (
    <group position={panelPos} rotation={[0, panelRotY, 0]}>
      <mesh>
        <boxGeometry args={[2.6, 1.75, 0.08]} />
        <meshStandardMaterial color="#0f172a" roughness={0.6} />
      </mesh>
      <TextLabel position={[0, 0.68, 0.05]} fontSize={0.095} color="#38bdf8">
        {`CRICKET • ROLE: ${localRole.toUpperCase()}`}
      </TextLabel>
      <VRButton
        position={[-0.62, 0.36, 0.04]}
        label={`PITCH: ${pitchMode.toUpperCase()}`}
        color={pitchMode === 'hard' ? '#d97706' : '#059669'}
        onClick={() => {
          useCricketStore.getState().setPitchMode(pitchMode === 'hard' ? 'wet' : 'hard')
          sync()
        }}
      />
      <VRButton
        position={[0.62, 0.36, 0.04]}
        label={`STYLE: ${bowlingStyle.toUpperCase()}`}
        color="#0284c7"
        onClick={() => {
          useCricketStore.getState().setBowlingStyle(bowlingStyle === 'fast' ? 'spin' : 'fast')
          sync()
        }}
      />
      <VRButton
        position={[-0.62, 0.0, 0.04]}
        label={`OVER: ${format.toUpperCase()}`}
        color="#7c3aed"
        onClick={() => {
          useCricketStore.getState().setFormat(format === '1-over' ? '10-over' : '1-over')
          sync()
        }}
      />
      <VRButton
        position={[0.62, 0.0, 0.04]}
        label={`STANCE: ${batterStance.toUpperCase()}`}
        color="#2563eb"
        onClick={() => {
          useCricketStore.getState().setBatterStance(batterStance === 'right' ? 'left' : 'right')
          sync()
        }}
      />
      <VRButton
        position={[-0.62, -0.36, 0.04]}
        label="SWAP ROLE"
        color="#0d9488"
        onClick={() => {
          useCricketStore.getState().rotateCricketRoles(localPeerId, Object.keys(peers))
          sync()
        }}
      />
      <VRButton
        position={[0.62, -0.36, 0.04]}
        label={micEnabled ? 'MIC: ON' : 'MIC: MUTED'}
        color={micEnabled ? '#059669' : '#dc2626'}
        onClick={() => {
          voiceAudio.setMicEnabled(!micEnabled)
          p2pClient.broadcastProfile()
        }}
      />
      <VRButton
        position={[-0.62, -0.68, 0.04]}
        label="NEXT BALL / RESET"
        color="#475569"
        onClick={() => resetCricketBallToBowler()}
      />
      <VRButton
        position={[0.62, -0.68, 0.04]}
        label="EXIT VR"
        color="#b91c1c"
        onClick={() => {
          void xrStore.getState().session?.end()
        }}
      />
    </group>
  )
}

export function CricketArena() {
  const inXR = useGameStore((s) => s.inXR)

  return (
    <group>
      <StadiumEnvironment />
      <CricketBallAndSim />
      <CricketAvatars />
      {inXR ? <CricketVRRig /> : <CricketDesktopRig />}
      <InVRCricketPanel />
    </group>
  )
}
