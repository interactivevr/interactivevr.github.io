import { useFrame, useThree } from '@react-three/fiber'
import {
  useXRControllerLocomotion,
  useXRInputSourceEvent,
  useXRInputSourceState,
  XROrigin,
} from '@react-three/xr'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { voiceAudio } from '../net/voiceAudio'
import { segmentSphereIntersects } from '../physics/ballPhysics'
import { claimBallLocally, throwBallLocally } from '../physics/ballActions'
import { ThrowVelocityEstimator } from '../physics/throwEstimator'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { BALL_RADIUS, getSpawnForSlot, HandSide } from '../types/game'

const VR_CATCH_RADIUS = 0.27

const _worldPos = new THREE.Vector3()
const _worldQuat = new THREE.Quaternion()
const _leftRingPos = new THREE.Vector3()
const _rightRingPos = new THREE.Vector3()

function pulseHaptics(inputSource: XRInputSource | undefined, intensity: number, durationMs: number): void {
  if (!inputSource?.gamepad) return
  try {
    const actuators = (inputSource.gamepad as Gamepad & {
      hapticActuators?: Array<{ pulse?: (v: number, d: number) => Promise<boolean> }>
    }).hapticActuators
    if (actuators && typeof actuators[0]?.pulse === 'function') {
      void actuators[0].pulse(intensity, durationMs)
    }
  } catch {
    // Ignore on browsers without WebXR Gamepad hapticActuators
  }
}

function VRSessionRig() {
  const originRef = useRef<THREE.Group>(null)
  const leftAuraRef = useRef<THREE.Mesh>(null)
  const rightAuraRef = useRef<THREE.Mesh>(null)

  const camera = useThree((s) => s.camera)
  const gameMode = useGameStore((s) => s.gameMode)
  const localSlot = useGameStore((s) => s.localSlot)
  const localPeerId = useGameStore((s) => s.localPeerId)

  const spawn = getSpawnForSlot(gameMode, localSlot)

  const leftController = useXRInputSourceState('controller', 'left')
  const rightController = useXRInputSourceState('controller', 'right')
  const leftHand = useXRInputSourceState('hand', 'left')
  const rightHand = useXRInputSourceState('hand', 'right')

  const leftEstimator = useMemo(() => new ThrowVelocityEstimator(), [])
  const rightEstimator = useMemo(() => new ThrowVelocityEstimator(), [])

  const grabStateRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false })
  const handPinchRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false })
  const heldByHandRef = useRef<{ left: number | null; right: number | null }>({
    left: null,
    right: null,
  })

  useEffect(() => {
    voiceAudio.ensureListener(camera)
  }, [camera])

  useXRControllerLocomotion(
    originRef,
    { speed: 2.8 },
    { type: 'snap', degrees: 45 },
    'left'
  )

  // Hand-tracking pinch & controller select events
  useXRInputSourceEvent(
    'all',
    'selectstart',
    (e) => {
      if (e.inputSource.handedness === 'left') handPinchRef.current.left = true
      if (e.inputSource.handedness === 'right') handPinchRef.current.right = true
    },
    []
  )
  useXRInputSourceEvent(
    'all',
    'selectend',
    (e) => {
      if (e.inputSource.handedness === 'left') handPinchRef.current.left = false
      if (e.inputSource.handedness === 'right') handPinchRef.current.right = false
    },
    []
  )
  useXRInputSourceEvent(
    'all',
    'squeezestart',
    (e) => {
      if (e.inputSource.handedness === 'left') handPinchRef.current.left = true
      if (e.inputSource.handedness === 'right') handPinchRef.current.right = true
    },
    []
  )
  useXRInputSourceEvent(
    'all',
    'squeezeend',
    (e) => {
      if (e.inputSource.handedness === 'left') handPinchRef.current.left = false
      if (e.inputSource.handedness === 'right') handPinchRef.current.right = false
    },
    []
  )

  useFrame(() => {
    const nowSec = performance.now() / 1000
    const lp = runtimeState.localPose

    // Sync head pose
    camera.getWorldPosition(_worldPos)
    camera.getWorldQuaternion(_worldQuat)
    lp.headPos = [_worldPos.x, _worldPos.y, _worldPos.z]
    lp.headQuat = [_worldQuat.x, _worldQuat.y, _worldQuat.z, _worldQuat.w]

    const processHand = (side: HandSide) => {
      const ctrl = side === 'left' ? leftController : rightController
      const hand = side === 'left' ? leftHand : rightHand
      const estimator = side === 'left' ? leftEstimator : rightEstimator
      const activeObj = ctrl?.object ?? hand?.object
      const activeInput = ctrl?.inputSource ?? hand?.inputSource

      const squeezePressed =
        ctrl?.gamepad['xr-standard-squeeze']?.state === 'pressed' ||
        ctrl?.gamepad['xr-standard-trigger']?.state === 'pressed' ||
        handPinchRef.current[side]

      const wasGrabbing = grabStateRef.current[side]
      grabStateRef.current[side] = Boolean(squeezePressed)

      let posArr: [number, number, number] = side === 'left' ? lp.leftPos : lp.rightPos
      let quatArr: [number, number, number, number] = side === 'left' ? lp.leftQuat : lp.rightQuat

      if (activeObj) {
        activeObj.getWorldPosition(_worldPos)
        activeObj.getWorldQuaternion(_worldQuat)
        posArr = [_worldPos.x, _worldPos.y, _worldPos.z]
        quatArr = [_worldQuat.x, _worldQuat.y, _worldQuat.z, _worldQuat.w]
        estimator.push(_worldPos.x, _worldPos.y, _worldPos.z, nowSec)
      }

      if (side === 'left') {
        lp.leftPos = posArr
        lp.leftQuat = quatArr
        lp.leftGrabbing = Boolean(squeezePressed)
        _leftRingPos.set(posArr[0], posArr[1], posArr[2])
      } else {
        lp.rightPos = posArr
        lp.rightQuat = quatArr
        lp.rightGrabbing = Boolean(squeezePressed)
        _rightRingPos.set(posArr[0], posArr[1], posArr[2])
      }

      // Check if our held ball was stolen or reset externally
      let heldId = heldByHandRef.current[side]
      if (heldId !== null) {
        const b = runtimeState.balls[heldId]
        if (!b || b.state !== 'held' || (b.ownerId !== (localPeerId || 'local') && b.ownerId !== 'local')) {
          heldByHandRef.current[side] = null
          heldId = null
        }
      }

      // Holding & releasing
      if (heldId !== null) {
        const ball = runtimeState.balls[heldId]
        if (ball) {
          if (squeezePressed) {
            ball.prevPos = [...ball.pos]
            ball.pos = [...posArr]
          } else {
            // Released -> Throw!
            const vel = estimator.computeVelocity(nowSec)
            throwBallLocally(heldId, posArr, vel)
            heldByHandRef.current[side] = null
            estimator.reset()
            pulseHaptics(activeInput, 0.45, 45)
          }
        }
        return
      }

      // Not holding: if squeezing (or newly pinched), attempt swept-sphere catch/pickup
      if (squeezePressed) {
        for (const ball of runtimeState.balls) {
          if (ball.state === 'held') continue
          const hit = segmentSphereIntersects(
            ball.prevPos[0],
            ball.prevPos[1],
            ball.prevPos[2],
            ball.pos[0],
            ball.pos[1],
            ball.pos[2],
            posArr[0],
            posArr[1],
            posArr[2],
            BALL_RADIUS + VR_CATCH_RADIUS
          )
          if (hit) {
            if (claimBallLocally(ball.id, side)) {
              heldByHandRef.current[side] = ball.id
              estimator.reset()
              pulseHaptics(activeInput, wasGrabbing ? 0.9 : 0.65, 85)
              break
            }
          }
        }
      }
    }

    processHand('left')
    processHand('right')
    lp.catchingActive = lp.leftGrabbing || lp.rightGrabbing

    if (leftAuraRef.current) {
      leftAuraRef.current.position.copy(_leftRingPos)
      leftAuraRef.current.visible = Boolean(leftController?.object || leftHand?.object)
      const mat = leftAuraRef.current.material as THREE.MeshBasicMaterial
      mat.color.set(grabStateRef.current.left ? '#34d399' : '#38bdf8')
    }
    if (rightAuraRef.current) {
      rightAuraRef.current.position.copy(_rightRingPos)
      rightAuraRef.current.visible = Boolean(rightController?.object || rightHand?.object)
      const mat = rightAuraRef.current.material as THREE.MeshBasicMaterial
      mat.color.set(grabStateRef.current.right ? '#34d399' : '#fb923c')
    }
  })

  return (
    <>
      <XROrigin ref={originRef} position={spawn.position} rotation={[0, spawn.yaw, 0]} />
      <mesh ref={leftAuraRef} visible={false}>
        <sphereGeometry args={[VR_CATCH_RADIUS, 16, 12]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.14} wireframe />
      </mesh>
      <mesh ref={rightAuraRef} visible={false}>
        <sphereGeometry args={[VR_CATCH_RADIUS, 16, 12]} />
        <meshBasicMaterial color="#fb923c" transparent opacity={0.14} wireframe />
      </mesh>
    </>
  )
}

function DesktopMittAndArc() {
  const mittMeshRef = useRef<THREE.Mesh>(null)
  const arcDotsRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const desktopCatchActive = useGameStore((s) => s.desktopCatchActive)
  const joined = useGameStore((s) => s.joined)
  const heldBallCount = useGameStore((s) => s.heldBallCount)

  useFrame(() => {
    if (mittMeshRef.current) {
      const rp = runtimeState.localPose.rightPos
      mittMeshRef.current.position.set(rp[0], rp[1], rp[2])
      mittMeshRef.current.visible = joined && (desktopCatchActive || heldBallCount > 0)
    }

    if (arcDotsRef.current) {
      const pts = runtimeState.trajectoryPoints
      arcDotsRef.current.count = pts.length
      for (let i = 0; i < pts.length; i++) {
        dummy.position.set(pts[i][0], pts[i][1], pts[i][2])
        const scale = 1 - (i / Math.max(1, pts.length)) * 0.55
        dummy.scale.setScalar(scale)
        dummy.updateMatrix()
        arcDotsRef.current.setMatrixAt(i, dummy.matrix)
      }
      arcDotsRef.current.instanceMatrix.needsUpdate = true
      arcDotsRef.current.visible = pts.length > 1
    }
  })

  return (
    <>
      <mesh ref={mittMeshRef} visible={false}>
        <sphereGeometry args={[0.16, 18, 14]} />
        <meshStandardMaterial
          color={desktopCatchActive ? '#34d399' : '#38bdf8'}
          emissive={desktopCatchActive ? '#10b981' : '#0284c7'}
          emissiveIntensity={0.45}
          transparent
          opacity={0.42}
          roughness={0.25}
        />
      </mesh>
      <instancedMesh ref={arcDotsRef} args={[undefined, undefined, 24]} visible={false}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.85} />
      </instancedMesh>
    </>
  )
}

export function LocalHandsAndRig() {
  const inXR = useGameStore((s) => s.inXR)
  return inXR ? <VRSessionRig /> : <DesktopMittAndArc />
}
