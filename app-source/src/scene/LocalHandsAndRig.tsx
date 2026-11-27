import { useFrame, useThree } from '@react-three/fiber'
import {
  useXR,
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
import { analyzeXRHandFrame, XR_HAND_JOINTS } from '../physics/handGesture'
import { ThrowVelocityEstimator } from '../physics/throwEstimator'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { BALL_RADIUS, getSpawnForSlot, HandSide } from '../types/game'
import { ArticulatedHand } from './ArticulatedHand'

const VR_CATCH_RADIUS = 0.28
const THROW_RECATCH_COOLDOWN_SEC = 0.28

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
  const referenceSpace = useXR((s) => s.originReferenceSpace)
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
  const leftPoseBuf = useMemo(() => new Float32Array(XR_HAND_JOINTS.length * 16), [])
  const rightPoseBuf = useMemo(() => new Float32Array(XR_HAND_JOINTS.length * 16), [])

  const grabStateRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false })
  const handSelectRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false })
  const lastThrowAtRef = useRef<{ left: number; right: number }>({ left: -10, right: -10 })
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

  // WebXR pinch/select & squeeze event listeners
  useXRInputSourceEvent(
    'all',
    'selectstart',
    (e) => {
      if (e.inputSource.handedness === 'left') handSelectRef.current.left = true
      if (e.inputSource.handedness === 'right') handSelectRef.current.right = true
    },
    []
  )
  useXRInputSourceEvent(
    'all',
    'selectend',
    (e) => {
      if (e.inputSource.handedness === 'left') handSelectRef.current.left = false
      if (e.inputSource.handedness === 'right') handSelectRef.current.right = false
    },
    []
  )
  useXRInputSourceEvent(
    'all',
    'squeezestart',
    (e) => {
      if (e.inputSource.handedness === 'left') handSelectRef.current.left = true
      if (e.inputSource.handedness === 'right') handSelectRef.current.right = true
    },
    []
  )
  useXRInputSourceEvent(
    'all',
    'squeezeend',
    (e) => {
      if (e.inputSource.handedness === 'left') handSelectRef.current.left = false
      if (e.inputSource.handedness === 'right') handSelectRef.current.right = false
    },
    []
  )

  useFrame((state, _delta, frame) => {
    const nowSec = performance.now() / 1000
    const lp = runtimeState.localPose
    const refSpace = referenceSpace ?? state.gl.xr.getReferenceSpace() ?? undefined

    // Sync head pose
    camera.getWorldPosition(_worldPos)
    camera.getWorldQuaternion(_worldQuat)
    lp.headPos = [_worldPos.x, _worldPos.y, _worldPos.z]
    lp.headQuat = [_worldQuat.x, _worldQuat.y, _worldQuat.z, _worldQuat.w]

    const processHand = (side: HandSide) => {
      const ctrl = side === 'left' ? leftController : rightController
      const hand = side === 'left' ? leftHand : rightHand
      const estimator = side === 'left' ? leftEstimator : rightEstimator
      const poseBuf = side === 'left' ? leftPoseBuf : rightPoseBuf

      const wasGrabbing = grabStateRef.current[side]
      let posArr: [number, number, number] = side === 'left' ? lp.leftPos : lp.rightPos
      let quatArr: [number, number, number, number] = side === 'left' ? lp.leftQuat : lp.rightQuat
      let curls: [number, number, number, number, number] =
        side === 'left' ? lp.leftCurls : lp.rightCurls
      let isGrabbing = false
      let usingRealHand = false
      let activeInput: XRInputSource | undefined

      if (ctrl?.object) {
        // Motion controller mode
        activeInput = ctrl.inputSource
        ctrl.object.getWorldPosition(_worldPos)
        ctrl.object.getWorldQuaternion(_worldQuat)
        posArr = [_worldPos.x, _worldPos.y, _worldPos.z]
        quatArr = [_worldQuat.x, _worldQuat.y, _worldQuat.z, _worldQuat.w]
        estimator.push(_worldPos.x, _worldPos.y, _worldPos.z, nowSec)

        const squeezeVal = ctrl.gamepad['xr-standard-squeeze']?.button ?? 0
        const triggerVal = ctrl.gamepad['xr-standard-trigger']?.button ?? 0
        isGrabbing =
          ctrl.gamepad['xr-standard-squeeze']?.state === 'pressed' ||
          ctrl.gamepad['xr-standard-trigger']?.state === 'pressed' ||
          squeezeVal > 0.5 ||
          triggerVal > 0.5 ||
          handSelectRef.current[side]

        const gripCurl = Math.max(squeezeVal, isGrabbing ? 0.9 : 0.1)
        const trigCurl = Math.max(triggerVal, isGrabbing ? 0.9 : 0.1)
        curls = [gripCurl * 0.75, trigCurl, gripCurl, gripCurl, gripCurl]
      } else if (hand?.inputSource.hand && frame && refSpace) {
        // Bare real-hand tracking mode (25 WebXR hand joints)
        activeInput = hand.inputSource
        const analysis = analyzeXRHandFrame(
          hand.inputSource.hand,
          frame,
          refSpace,
          poseBuf,
          originRef.current,
          wasGrabbing,
          handSelectRef.current[side]
        )
        if (analysis.valid) {
          usingRealHand = true
          posArr = analysis.palmWorldPos
          quatArr = analysis.palmWorldQuat
          curls = analysis.curls
          isGrabbing = analysis.isGrabbing
          estimator.push(posArr[0], posArr[1], posArr[2], nowSec)
        }
      }

      grabStateRef.current[side] = isGrabbing

      if (side === 'left') {
        lp.leftPos = posArr
        lp.leftQuat = quatArr
        lp.leftCurls = curls
        lp.leftGrabbing = isGrabbing
        _leftRingPos.set(posArr[0], posArr[1], posArr[2])
      } else {
        lp.rightPos = posArr
        lp.rightQuat = quatArr
        lp.rightCurls = curls
        lp.rightGrabbing = isGrabbing
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
          if (isGrabbing) {
            ball.prevPos = [...ball.pos]
            ball.pos = [...posArr]
          } else {
            // Hand opened / released -> Throw!
            const gain = usingRealHand ? 1.28 : 1.18
            const vel = estimator.computeVelocity(nowSec, gain)
            throwBallLocally(heldId, posArr, vel)
            heldByHandRef.current[side] = null
            lastThrowAtRef.current[side] = nowSec
            estimator.reset()
            pulseHaptics(activeInput, 0.45, 45)
          }
        }
        return
      }

      // Prevent instant accidental re-catch right after opening hand to throw
      if (nowSec - lastThrowAtRef.current[side] < THROW_RECATCH_COOLDOWN_SEC) {
        return
      }

      // Grab/catch any ball entering the hand catch sphere while pinching or making a fist
      if (isGrabbing) {
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
      leftAuraRef.current.visible = Boolean(leftController?.object || leftHand?.inputSource.hand)
      const mat = leftAuraRef.current.material as THREE.MeshBasicMaterial
      mat.color.set(grabStateRef.current.left ? '#34d399' : '#38bdf8')
    }
    if (rightAuraRef.current) {
      rightAuraRef.current.position.copy(_rightRingPos)
      rightAuraRef.current.visible = Boolean(rightController?.object || rightHand?.inputSource.hand)
      const mat = rightAuraRef.current.material as THREE.MeshBasicMaterial
      mat.color.set(grabStateRef.current.right ? '#34d399' : '#fb923c')
    }
  })

  return (
    <>
      <XROrigin ref={originRef} position={spawn.position} rotation={[0, spawn.yaw, 0]}>
        {/* Full 25-joint articulated hand visuals rendered locally in XROrigin space */}
        {!leftController?.object && leftHand && (
          <ArticulatedHand side="left" isGrabbingRef={grabStateRef} />
        )}
        {!rightController?.object && rightHand && (
          <ArticulatedHand side="right" isGrabbingRef={grabStateRef} />
        )}
      </XROrigin>

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
