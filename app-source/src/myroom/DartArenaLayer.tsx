import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { playMaterialActionSfx } from '../audio/myroomSfx'
import { TextLabel } from '../scene/TextLabel'
import { useGameStore } from '../store/useGameStore'
import { createDartboardCanvasTexture, stepFlightDart } from './dartEngine'
import { DARTBOARD_RADIUS, DARTS_PER_PLAYER } from './types'
import { myRoomRuntime, useMyRoomStore } from './useMyRoomStore'

/**
 * Renders a realistic steel-tip fletched dart (needle point facing -Z, knurled brass barrel, shaft & 4 flight fins).
 */
export function SteelTipDartMesh({
  color,
  glowReady = false,
}: {
  color: string
  glowReady?: boolean
}) {
  return (
    <group>
      {/* Sharp Steel Tip pointing -Z */}
      <mesh position={[0, 0, -0.056]} rotation={[-Math.PI * 0.5, 0, 0]}>
        <coneGeometry args={[0.0022, 0.028, 10]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.94} roughness={0.14} />
      </mesh>
      {/* Knurled Brass / Tungsten Barrel */}
      <mesh position={[0, 0, -0.022]} rotation={[Math.PI * 0.5, 0, 0]}>
        <cylinderGeometry args={[0.0046, 0.0038, 0.044, 12]} />
        <meshStandardMaterial
          color="#d97706"
          metalness={0.82}
          roughness={0.28}
          emissive={glowReady ? color : '#000000'}
          emissiveIntensity={glowReady ? 0.55 : 0}
        />
      </mesh>
      {/* Nylon/Aluminum Shaft */}
      <mesh position={[0, 0, 0.022]} rotation={[Math.PI * 0.5, 0, 0]}>
        <cylinderGeometry args={[0.0024, 0.0036, 0.045, 10]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* 4 Metallic Cross Flights */}
      <mesh position={[0, 0, 0.055]}>
        <boxGeometry args={[0.036, 0.0016, 0.034]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={glowReady ? 0.65 : 0.25}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[0, 0, 0.055]} rotation={[0, 0, Math.PI * 0.5]}>
        <boxGeometry args={[0.036, 0.0016, 0.034]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={glowReady ? 0.65 : 0.25}
          roughness={0.35}
        />
      </mesh>
    </group>
  )
}

function LiveFlightDartView({ dartId }: { dartId: string }) {
  const grpRef = useRef<THREE.Group>(null)
  const dart = myRoomRuntime.darts.flyingDarts.find((d) => d.id === dartId)

  useFrame(() => {
    const live = myRoomRuntime.darts.flyingDarts.find((d) => d.id === dartId)
    if (!live || !grpRef.current) return
    grpRef.current.position.set(live.pos[0], live.pos[1], live.pos[2])
    grpRef.current.quaternion.set(live.quat[0], live.quat[1], live.quat[2], live.quat[3])
    grpRef.current.visible = live.inFlight
  })

  if (!dart) return null
  return (
    <group ref={grpRef}>
      <SteelTipDartMesh color={dart.thrower === 'local' ? '#38bdf8' : '#fb7185'} />
    </group>
  )
}

function ReadyHandDartView() {
  const grpRef = useRef<THREE.Group>(null)
  useFrame(() => {
    const ready = myRoomRuntime.darts.readyDart
    if (!grpRef.current) return
    if (!ready || ready.inFlight || ready.settled) {
      grpRef.current.visible = false
      return
    }
    grpRef.current.visible = true
    grpRef.current.position.set(ready.pos[0], ready.pos[1], ready.pos[2])
    grpRef.current.quaternion.set(ready.quat[0], ready.quat[1], ready.quat[2], ready.quat[3])
  })

  return (
    <group ref={grpRef} visible={false}>
      <SteelTipDartMesh color="#38bdf8" glowReady />
    </group>
  )
}

/**
 * AR Mixed-Reality 6-Dart Game Layer:
 * Renders wall/stand Bristle Dartboard, overhead live scoreboard, stuck darts,
 * aerodynamic in-flight darts, and coordinates hit detection + turn progression for AI or P2P Peer.
 */
export function DartArenaLayer() {
  const dartGame = useMyRoomStore((s) => s.dartGame)
  const showAiOpponent = useMyRoomStore((s) => s.showAiOpponent)
  const opponentMode = useMyRoomStore((s) => s.opponentMode)
  const peers = useGameStore((s) => s.peers)
  const localPeerId = useGameStore((s) => s.localPeerId)

  const [flightRenderIds, setFlightRenderIds] = useState<string[]>([])
  const lastIdsSigRef = useRef('')

  const boardTex = useMemo(() => createDartboardCanvasTexture(), [])
  useEffect(() => {
    return () => {
      boardTex.dispose()
    }
  }, [boardTex])

  useFrame((_, delta) => {
    const st = useMyRoomStore.getState()
    const dg = st.dartGame
    if (!dg.active) return

    const peerIds = Object.keys(useGameStore.getState().peers)
    const hasHumanPeers = peerIds.length > 0
    const aiPresent =
      st.showAiOpponent && (st.opponentMode === 'computer' || (st.opponentMode === 'auto' && !hasHumanPeers))
    const hasOpponent = hasHumanPeers || aiPresent
    const myId = useGameStore.getState().localPeerId || 'local'

    // Track flight IDs reactively only when list changes
    const curSig = myRoomRuntime.darts.flyingDarts.map((d) => `${d.id}:${d.inFlight ? 1 : 0}`).join('|')
    if (curSig !== lastIdsSigRef.current) {
      lastIdsSigRef.current = curSig
      setFlightRenderIds(myRoomRuntime.darts.flyingDarts.map((d) => d.id))
    }

    for (let i = myRoomRuntime.darts.flyingDarts.length - 1; i >= 0; i--) {
      const dart = myRoomRuntime.darts.flyingDarts[i]
      if (!dart.inFlight || dart.settled) continue

      const step = stepFlightDart(dart, dg.boardPose, myRoomRuntime.floorY, delta)
      if (step.status === 'flying') continue

      // Peer's remote dart visualization just finished locally; peer already owns the authoritative score message
      if (dart.throwerId !== myId && dart.throwerId !== 'ai') {
        myRoomRuntime.darts.flyingDarts.splice(i, 1)
        continue
      }

      const isHit = step.status === 'board-hit'
      const record = isHit
        ? {
            thrower: dart.thrower,
            throwerId: dart.throwerId,
            score: step.evalHit.score,
            label: step.evalHit.label,
            localX: step.localX,
            localY: step.localY,
            stuck: true,
          }
        : {
            thrower: dart.thrower,
            throwerId: dart.throwerId,
            score: 0,
            label: 'MISS',
            localX: 99,
            localY: 99,
            stuck: false,
          }

      if (isHit) {
        playMaterialActionSfx(
          'wood',
          step.evalHit.score >= 50 || step.evalHit.isHighValue ? 'dart_bullseye' : 'dart_hit'
        )
      } else {
        playMaterialActionSfx('wood', 'dart_miss')
      }

      // Compute next turn owner cleanly
      let nextTurn = dg.turnOwnerId
      if (hasHumanPeers) {
        const oppPeerId = peerIds[0]
        nextTurn = dart.throwerId === myId ? oppPeerId : myId
      } else if (aiPresent) {
        nextTurn = dart.throwerId === 'ai' ? myId : 'ai'
      } else {
        nextTurn = myId
      }

      const fin = st.recordDartThrow(record, nextTurn, hasOpponent)
      if (fin.finished) {
        playMaterialActionSfx('metal', 'dart_win')
        st.setStatusHint(fin.winnerLabel ?? '6-Dart Match Complete!')
      } else {
        st.setStatusHint(
          `${record.thrower === 'local' ? 'You' : 'Opponent'} hit ${record.label} (+${record.score})`
        )
      }

      // Broadcast throw record if it originated from local user
      if (dart.throwerId === myId) {
        myRoomRuntime.onDartThrowSend?.({
          matchId: dg.matchId,
          throwerId: myId,
          throwIndex: dart.throwIndex,
          startPos: [...dart.prevPos],
          vel: [...dart.vel],
          record,
          nextTurnOwnerId: nextTurn,
          finished: fin.finished,
          winnerLabel: fin.winnerLabel,
          timestamp: Date.now(),
        })
      }

      // Remove flying temp instance once logged onto board
      myRoomRuntime.darts.flyingDarts.splice(i, 1)
    }
  })

  if (!dartGame.active) return null

  const { boardPose, throws: dartThrows, finished, winnerLabel, lastCallout, turnOwnerId } = dartGame
  const localThrows = dartThrows.filter((t) => t.thrower === 'local')
  const oppThrows = dartThrows.filter((t) => t.thrower === 'opponent')
  const localScore = localThrows.reduce((s, r) => s + r.score, 0)
  const oppScore = oppThrows.reduce((s, r) => s + r.score, 0)

  const peerCount = Object.keys(peers).length
  const oppLabel =
    peerCount > 0
      ? 'PEER'
      : showAiOpponent && opponentMode !== 'peer'
        ? 'AI'
        : null
  const myId = localPeerId || 'local'
  const isMyTurn = turnOwnerId === myId || turnOwnerId === 'local'

  const standH = Math.max(0.6, boardPose.pos[1] - myRoomRuntime.floorY - 0.1)

  return (
    <group>
      {/* Bristle Dartboard + Optional Tripod Stand + Live Digital Scoreboard */}
      <group position={boardPose.pos} rotation={[0, boardPose.yaw, 0]}>
        {/* Wooden cork backing frame */}
        <mesh position={[0, 0, -0.014]} rotation={[Math.PI * 0.5, 0, 0]} castShadow>
          <cylinderGeometry args={[DARTBOARD_RADIUS + 0.018, DARTBOARD_RADIUS + 0.018, 0.026, 36]} />
          <meshStandardMaterial color="#0f172a" roughness={0.6} metalness={0.2} />
        </mesh>

        {/* Front 1024x1024 Bristle Face (local +Z faces toward thrower along boardPose.normal) */}
        <mesh position={[0, 0, 0.001]} receiveShadow>
          <circleGeometry args={[DARTBOARD_RADIUS, 40]} />
          <meshStandardMaterial map={boardTex} roughness={0.82} />
        </mesh>

        {/* Stuck Darts pinned accurately at exact hit offsets */}
        {dartThrows.map((rec, idx) =>
          rec.stuck ? (
            <group
              key={`${rec.throwerId}_${idx}`}
              position={[rec.localX, rec.localY, 0.068]}
              rotation={[0.04, Math.PI, 0]}
            >
              <SteelTipDartMesh color={rec.thrower === 'local' ? '#38bdf8' : '#fb7185'} />
            </group>
          ) : null
        )}

        {/* Portable Tripod Stand when not mounted directly against a scanned room wall */}
        {!boardPose.mountedOnWall && (
          <group position={[0, -0.1, -0.04]}>
            <mesh position={[0, -standH * 0.5, 0]}>
              <cylinderGeometry args={[0.018, 0.024, standH, 10]} />
              <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.35} />
            </mesh>
            {[0, 2.09, 4.18].map((ang, k) => (
              <mesh
                key={k}
                position={[Math.cos(ang) * 0.16, -standH + 0.12, Math.sin(ang) * 0.16]}
                rotation={[Math.sin(ang) * 0.45, 0, -Math.cos(ang) * 0.45]}
              >
                <cylinderGeometry args={[0.012, 0.012, 0.36, 8]} />
                <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.4} />
              </mesh>
            ))}
          </group>
        )}

        {/* Overhead Floating Digital 6-Dart Scoreboard */}
        <group position={[0, DARTBOARD_RADIUS + 0.19, 0.01]}>
          <mesh>
            <boxGeometry args={[0.66, 0.24, 0.02]} />
            <meshStandardMaterial color="#090f1d" transparent opacity={0.92} roughness={0.45} />
          </mesh>
          <TextLabel position={[0, 0.078, 0.015]} fontSize={0.027} color="#38bdf8">
            {finished
              ? winnerLabel || 'MATCH COMPLETE!'
              : oppLabel
                ? `6-DART MATCH  •  ${isMyTurn ? 'YOUR TURN!' : `${oppLabel}'S TURN`}`
                : `SOLO 6-DART PRACTICE  •  THROW ${localThrows.length + 1}/${DARTS_PER_PLAYER}`}
          </TextLabel>
          <TextLabel position={[0, 0.025, 0.015]} fontSize={0.032} color="#f8fafc">
            {oppLabel
              ? `YOU: ${localScore} (${localThrows.length}/6)    |    ${oppLabel}: ${oppScore} (${oppThrows.length}/6)`
              : `TOTAL: ${localScore}  (${localThrows.length}/6 DARTS)`}
          </TextLabel>
          <TextLabel position={[0, -0.028, 0.015]} fontSize={0.021} color="#fde047">
            {lastCallout}
          </TextLabel>
          <TextLabel position={[0, -0.072, 0.015]} fontSize={0.018} color="#94a3b8">
            {`YOU: [${localThrows.map((t) => t.label).join(', ') || '-'}]${
              oppLabel ? `   •   ${oppLabel}: [${oppThrows.map((t) => t.label).join(', ') || '-'}]` : ''
            }`}
          </TextLabel>
        </group>
      </group>

      {/* Active Ready Dart & All Flying Darts */}
      <ReadyHandDartView />
      {flightRenderIds.map((id) => (
        <LiveFlightDartView key={id} dartId={id} />
      ))}
    </group>
  )
}
