import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { playBounceSfx, playDropSfx } from '../audio/sfx'
import { stepBallPhysics } from '../physics/ballPhysics'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { BALL_COLORS, BALL_RADIUS, getTeePositionForBall } from '../types/game'

const TRAIL_LEN = 8
const AUTO_RETURN_SEC = 2.6

function SingleBall({ ballId }: { ballId: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const spinMeshRef = useRef<THREE.Group>(null)
  const shadowRef = useRef<THREE.Mesh>(null)
  const trailRefs = useRef<Array<THREE.Mesh | null>>([])
  const trailHistory = useRef<Array<[number, number, number]>>(
    Array.from({ length: TRAIL_LEN }, () => [0, -10, 0] as [number, number, number])
  )
  const lastSyncRef = useRef(0)

  const gameMode = useGameStore((s) => s.gameMode)
  const color = BALL_COLORS[ballId % BALL_COLORS.length]

  const isVisible = useMemo(() => {
    if (gameMode === 'rally' && ballId === 1) return false
    return true
  }, [gameMode, ballId])

  useFrame((_, delta) => {
    const ball = runtimeState.balls[ballId]
    if (!ball) return

    const state = useGameStore.getState()
    const localId = state.localPeerId || 'local'
    const peers = state.peers

    // Determine who steps floor/reset authority when unowned (lowest peerId)
    const allSorted = [localId, ...Object.keys(peers)].sort()
    const isRoomAuthority = allSorted[0] === localId
    const isBallAuthority =
      ball.ownerId === localId ||
      ball.ownerId === null && isRoomAuthority ||
      (ball.ownerId !== null && !peers[ball.ownerId] && ball.ownerId !== localId && isRoomAuthority)

    if (isVisible && ball.state === 'flight') {
      ball.prevPos = [ball.pos[0], ball.pos[1], ball.pos[2]]
      const out = stepBallPhysics({
        pos: ball.pos,
        vel: ball.vel,
        bouncedFloor: ball.bouncedFloor,
        dt: delta,
        mode: state.gameMode,
      })

      if (out.hitFloorNow) {
        if (!ball.bouncedFloor) {
          ball.bouncedFloor = true
          if (isBallAuthority && ball.lastThrowerId !== null) {
            state.applyScoreEvent('drop')
            runtimeState.onScoreEventSend?.({ kind: 'drop' })
            playDropSfx()
          }
        } else {
          playBounceSfx(out.impactSpeed)
        }
      } else if (out.hitWallNow || out.hitTargetWallNow) {
        playBounceSfx(out.impactSpeed)
      }

      if (out.settled) {
        ball.settledSec += delta
      } else {
        ball.settledSec = 0
      }

      // Spin visual rotation
      if (spinMeshRef.current) {
        spinMeshRef.current.rotation.x += ball.angVel[0] * delta
        spinMeshRef.current.rotation.y += ball.angVel[1] * delta
        spinMeshRef.current.rotation.z += ball.angVel[2] * delta
      }

      // Periodic authoritative flight reconciliation (8 Hz)
      const now = performance.now()
      if (isBallAuthority && now - lastSyncRef.current > 125) {
        lastSyncRef.current = now
        runtimeState.onBallStateSend?.(ball)
      }

      // Auto-return ball to its thrower tee if left resting on the court floor
      if (isBallAuthority && ball.settledSec > AUTO_RETURN_SEC) {
        const tee = getTeePositionForBall(ballId, state.gameMode)
        ball.state = 'idle'
        ball.ownerId = null
        ball.heldHand = null
        ball.lastThrowerId = null
        ball.bouncedFloor = false
        ball.pos = [...tee]
        ball.prevPos = [...tee]
        ball.vel = [0, 0, 0]
        ball.settledSec = 0
        ball.epoch += 1
        ball.timestamp = Date.now()
        runtimeState.onBallStateSend?.(ball)
      }
    } else if (isVisible && ball.state === 'held' && ball.ownerId && ball.ownerId !== localId) {
      // Follow remote holder's interpolated hand smoothly
      const remotePose = runtimeState.remotePoses[ball.ownerId]
      if (remotePose) {
        const handPos =
          ball.heldHand === 'left' ? remotePose.current.leftPos : remotePose.current.rightPos
        ball.prevPos = [...ball.pos]
        ball.pos = [handPos[0], handPos[1], handPos[2]]
      }
    }

    if (groupRef.current) {
      groupRef.current.visible = isVisible
      groupRef.current.position.set(ball.pos[0], ball.pos[1], ball.pos[2])
    }

    // Dynamic ground drop shadow for depth perception in VR & PC
    if (shadowRef.current) {
      shadowRef.current.visible = isVisible
      shadowRef.current.position.set(ball.pos[0], 0.016, ball.pos[2])
      const heightFactor = Math.max(0.25, 1 - ball.pos[1] * 0.14)
      shadowRef.current.scale.setScalar(heightFactor)
      const mat = shadowRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.45 * heightFactor
    }

    // Motion trail while ball is flying
    const hist = trailHistory.current
    if (ball.state === 'flight' && isVisible) {
      hist.pop()
      hist.unshift([ball.pos[0], ball.pos[1], ball.pos[2]])
    } else {
      for (let i = 0; i < TRAIL_LEN; i++) {
        hist[i] = [ball.pos[0], ball.pos[1], ball.pos[2]]
      }
    }

    for (let i = 0; i < TRAIL_LEN; i++) {
      const m = trailRefs.current[i]
      if (!m) continue
      m.visible = isVisible && ball.state === 'flight'
      m.position.set(hist[i][0], hist[i][1], hist[i][2])
      const s = Math.max(0.15, 0.72 - i * 0.08)
      m.scale.setScalar(s)
    }
  })

  return (
    <>
      <group ref={groupRef}>
        <group ref={spinMeshRef}>
          <mesh>
            <sphereGeometry args={[BALL_RADIUS, 24, 18]} />
            <meshStandardMaterial
              color={color}
              roughness={0.32}
              metalness={0.08}
              emissive={color}
              emissiveIntensity={0.18}
            />
          </mesh>
          {/* High-contrast seam bands make ball spin clearly readable in VR */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[BALL_RADIUS * 0.99, 0.011, 8, 28]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.25} />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[BALL_RADIUS * 0.99, 0.008, 8, 28]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
        </group>
      </group>

      {/* Ground shadow disc */}
      <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[BALL_RADIUS * 1.25, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.4} depthWrite={false} />
      </mesh>

      {/* Flight motion trail */}
      {Array.from({ length: TRAIL_LEN }).map((_, idx) => (
        <mesh
          key={idx}
          ref={(el) => {
            trailRefs.current[idx] = el
          }}
          visible={false}
        >
          <sphereGeometry args={[BALL_RADIUS * 0.75, 10, 8]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={Math.max(0.04, 0.34 - idx * 0.04)}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  )
}

export function BallManager() {
  return (
    <>
      <SingleBall ballId={0} />
      <SingleBall ballId={1} />
    </>
  )
}
