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
import { playBoundaryCrowdSfx, playCricketCatchSfx } from '../audio/cricketSfx'
import { playThrowSfx } from '../audio/sfx'
import { voiceAudio } from '../net/voiceAudio'
import { segmentSphereIntersects } from '../physics/ballPhysics'
import { analyzeXRHandFrame, XR_HAND_JOINTS } from '../physics/handGesture'
import { ThrowVelocityEstimator } from '../physics/throwEstimator'
import { ArticulatedHand } from '../scene/ArticulatedHand'
import { getAthleteProfile } from '../scene/HumanFace'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { HandSide } from '../types/game'
import { computeDeliveryVelocity } from './cricketPhysics'
import { CricketBatMesh, CricketGloveMesh } from './PlayerGear'
import { CRICKET_BALL_RADIUS, getCricketSpawn, WIDE_HALF_W } from './types'
import { cricketRuntime, useCricketStore } from './useCricketStore'

const _worldPos = new THREE.Vector3()
const _worldQuat = new THREE.Quaternion()
const _batDir = new THREE.Vector3()
const _batNormal = new THREE.Vector3()
const _prevBatCenter = new THREE.Vector3()
const _currBatCenter = new THREE.Vector3()
const _batTiltQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * 0.35)

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
    // ignore
  }
}

export function CricketVRRig() {
  const originRef = useRef<THREE.Group>(null)
  const leftHandGroupRef = useRef<THREE.Group>(null)
  const rightHandGroupRef = useRef<THREE.Group>(null)
  const catchAuraRef = useRef<THREE.Mesh>(null)

  const camera = useThree((s) => s.camera)
  const referenceSpace = useXR((s) => s.originReferenceSpace)
  const localPeerId = useGameStore((s) => s.localPeerId)
  const playerName = useGameStore((s) => s.playerName)

  const localRole = useCricketStore((s) => s.localCricketRole)
  const batterStance = useCricketStore((s) => s.batterStance)
  const bowlingStyle = useCricketStore((s) => s.bowlingStyle)
  const spinDir = useCricketStore((s) => s.spinDir)

  const spawn = getCricketSpawn(localRole, batterStance)

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
  const holdingBallHandRef = useRef<HandSide | null>(null)

  const localProfile = useMemo(
    () => getAthleteProfile(localPeerId || playerName || 'local'),
    [localPeerId, playerName]
  )

  useEffect(() => {
    voiceAudio.ensureListener(camera)
  }, [camera])

  useXRControllerLocomotion(originRef, { speed: 2.5 }, { type: 'snap', degrees: 45 }, 'left')

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

  useFrame((state, delta, frame) => {
    const nowSec = performance.now() / 1000
    const lp = runtimeState.localPose
    const refSpace = referenceSpace ?? state.gl.xr.getReferenceSpace() ?? undefined

    camera.getWorldPosition(_worldPos)
    camera.getWorldQuaternion(_worldQuat)
    lp.headPos = [_worldPos.x, _worldPos.y, _worldPos.z]
    lp.headQuat = [_worldQuat.x, _worldQuat.y, _worldQuat.z, _worldQuat.w]

    const readSide = (side: HandSide) => {
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
      let activeInput: XRInputSource | undefined

      if (ctrl?.object) {
        activeInput = ctrl.inputSource
        ctrl.object.getWorldPosition(_worldPos)
        ctrl.object.getWorldQuaternion(_worldQuat)
        posArr = [_worldPos.x, _worldPos.y, _worldPos.z]
        quatArr = [_worldQuat.x, _worldQuat.y, _worldQuat.z, _worldQuat.w]
        estimator.push(_worldPos.x, _worldPos.y, _worldPos.z, nowSec)

        const sq = ctrl.gamepad['xr-standard-squeeze']?.button ?? 0
        const tr = ctrl.gamepad['xr-standard-trigger']?.button ?? 0
        isGrabbing =
          ctrl.gamepad['xr-standard-squeeze']?.state === 'pressed' ||
          ctrl.gamepad['xr-standard-trigger']?.state === 'pressed' ||
          sq > 0.5 ||
          tr > 0.5 ||
          handSelectRef.current[side]
        const c = isGrabbing ? 0.9 : 0.1
        curls = [c * 0.8, c, c, c, c]
      } else if (hand?.inputSource.hand && frame && refSpace) {
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
        if (leftHandGroupRef.current) {
          leftHandGroupRef.current.position.set(posArr[0], posArr[1], posArr[2])
          leftHandGroupRef.current.quaternion.set(quatArr[0], quatArr[1], quatArr[2], quatArr[3])
        }
      } else {
        lp.rightPos = posArr
        lp.rightQuat = quatArr
        lp.rightCurls = curls
        lp.rightGrabbing = isGrabbing
        if (rightHandGroupRef.current) {
          rightHandGroupRef.current.position.set(posArr[0], posArr[1], posArr[2])
          rightHandGroupRef.current.quaternion.set(quatArr[0], quatArr[1], quatArr[2], quatArr[3])
        }
      }

      return { posArr, quatArr, isGrabbing, activeInput, estimator }
    }

    const leftRes = readSide('left')
    const rightRes = readSide('right')
    lp.catchingActive = lp.leftGrabbing || lp.rightGrabbing

    const crState = useCricketStore.getState()
    const ball = cricketRuntime.ball

    // 1. Batter Role: swept MRF Cricket Bat collision (no obstructive body mesh!)
    if (localRole === 'batter') {
      const batHand = batterStance === 'left' ? leftRes : rightRes
      const q = _worldQuat.set(
        batHand.quatArr[0],
        batHand.quatArr[1],
        batHand.quatArr[2],
        batHand.quatArr[3]
      )
      q.multiply(_batTiltQuat)

      _batDir.set(0, -1, 0).applyQuaternion(q).normalize()
      _batNormal.set(0, 0, -1).applyQuaternion(q).normalize()

      const bat = cricketRuntime.bat
      bat.prevBase = [...bat.currBase]
      bat.prevTip = [...bat.currTip]
      bat.currBase = [
        batHand.posArr[0] + _batDir.x * 0.2,
        batHand.posArr[1] + _batDir.y * 0.2,
        batHand.posArr[2] + _batDir.z * 0.2,
      ]
      bat.currTip = [
        batHand.posArr[0] + _batDir.x * 0.84,
        batHand.posArr[1] + _batDir.y * 0.84,
        batHand.posArr[2] + _batDir.z * 0.84,
      ]

      _prevBatCenter.set(
        (bat.prevBase[0] + bat.prevTip[0]) * 0.5,
        (bat.prevBase[1] + bat.prevTip[1]) * 0.5,
        (bat.prevBase[2] + bat.prevTip[2]) * 0.5
      )
      _currBatCenter.set(
        (bat.currBase[0] + bat.currTip[0]) * 0.5,
        (bat.currBase[1] + bat.currTip[1]) * 0.5,
        (bat.currBase[2] + bat.currTip[2]) * 0.5
      )

      const dt = Math.max(0.004, Math.min(0.05, delta))
      bat.vel = [
        (_currBatCenter.x - _prevBatCenter.x) / dt,
        (_currBatCenter.y - _prevBatCenter.y) / dt,
        (_currBatCenter.z - _prevBatCenter.z) / dt,
      ]
      bat.faceNormal = [_batNormal.x, _batNormal.y, _batNormal.z]
      bat.active = true
      if (catchAuraRef.current) catchAuraRef.current.visible = false
      return
    }

    cricketRuntime.bat.active = false

    // 2. Bowler Role: effortless grip + pitch-aim-assisted overarm delivery + Caught & Bowled!
    if (localRole === 'bowler' && !crState.inningsOver) {
      if (ball.phase === 'ready') {
        const heldSide = holdingBallHandRef.current
        if (heldSide === null) {
          ;(['right', 'left'] as HandSide[]).forEach((s) => {
            const res = s === 'left' ? leftRes : rightRes
            if (res.isGrabbing) {
              holdingBallHandRef.current = s
              res.estimator.reset()
              pulseHaptics(res.activeInput, 0.5, 45)
            }
          })
        } else {
          const res = heldSide === 'left' ? leftRes : rightRes
          if (res.isGrabbing) {
            ball.prevPos = [...ball.pos]
            ball.pos = [...res.posArr]
          } else {
            // Compute real arm motion + map onto authentic 22-yard pitch corridor so every VR bowl hits the strip cleanly!
            const rawVel = res.estimator.computeVelocity(nowSec, 1.35, 28)
            const rawSpeed = Math.hypot(rawVel[0], rawVel[1], rawVel[2])
            const power01 = Math.max(0.25, Math.min(1, rawSpeed / 14))
            const forwardZ = Math.max(4.0, rawVel[2])
            const aimX = Math.max(-0.85, Math.min(0.85, (rawVel[0] / forwardZ) * 10))
            // Slightly downward release aims fuller (yorker), higher release pitches shorter
            const elevFactor = Math.max(-0.35, Math.min(0.35, rawVel[1] / forwardZ))
            const targetZ = Math.max(2.6, Math.min(8.3, 5.4 - elevFactor * 7.5))

            const { vel, spin } = computeDeliveryVelocity(
              res.posArr,
              aimX,
              targetZ,
              bowlingStyle,
              spinDir,
              power01
            )

            ball.phase = 'bowled'
            ball.ownerId = localPeerId || 'local'
            ball.pos = [...res.posArr]
            ball.prevPos = [...res.posArr]
            ball.vel = vel
            ball.spin = spin
            ball.bowlingStyle = bowlingStyle
            ball.spinDir = spinDir
            ball.bouncedOnPitch = false
            ball.bouncedAfterHit = false
            ball.hitByBat = false
            ball.edgeContact = false
            ball.epoch += 1
            ball.timestamp = Date.now()
            holdingBallHandRef.current = null
            playThrowSfx(Math.hypot(vel[0], vel[1], vel[2]))
            pulseHaptics(res.activeInput, 0.5, 50)
            cricketRuntime.onCricketBallSend?.(ball)
          }
        }
      } else if (ball.phase === 'hit' && !ball.bouncedAfterHit) {
        ;(['right', 'left'] as HandSide[]).forEach((s) => {
          const res = s === 'left' ? leftRes : rightRes
          if (!res.isGrabbing) return
          const caught = segmentSphereIntersects(
            ball.prevPos[0],
            ball.prevPos[1],
            ball.prevPos[2],
            ball.pos[0],
            ball.pos[1],
            ball.pos[2],
            res.posArr[0],
            res.posArr[1],
            res.posArr[2],
            CRICKET_BALL_RADIUS + 0.4
          )
          if (caught) {
            ball.phase = 'dead'
            ball.vel = [0, 0, 0]
            ball.epoch += 1
            playCricketCatchSfx()
            playBoundaryCrowdSfx(true)
            pulseHaptics(res.activeInput, 0.95, 95)
            crState.recordDeliveryOutcome({
              runsScored: 0,
              isWicket: true,
              isLegalBall: true,
              label: 'W',
              banner: 'OUT! CAUGHT & BOWLED!',
            })
            cricketRuntime.onCricketBallSend?.(ball)
            cricketRuntime.onCricketStateSend?.(useCricketStore.getState().getSyncPayload())
          }
        })
      }
      if (catchAuraRef.current) {
        catchAuraRef.current.visible = ball.phase === 'hit' && !ball.bouncedAfterHit
        catchAuraRef.current.position.set(rightRes.posArr[0], rightRes.posArr[1], rightRes.posArr[2])
      }
      return
    }

    // 3. Wicketkeeper Role: catch missed deliveries & Caught Behind edges!
    if (localRole === 'wicketkeeper' && !crState.inningsOver) {
      const canCatch = ball.phase === 'bowled' || (ball.phase === 'hit' && !ball.bouncedAfterHit)
      if (canCatch) {
        ;(['right', 'left'] as HandSide[]).forEach((s) => {
          const res = s === 'left' ? leftRes : rightRes
          if (!res.isGrabbing) return
          const caught = segmentSphereIntersects(
            ball.prevPos[0],
            ball.prevPos[1],
            ball.prevPos[2],
            ball.pos[0],
            ball.pos[1],
            ball.pos[2],
            res.posArr[0],
            res.posArr[1],
            res.posArr[2],
            CRICKET_BALL_RADIUS + 0.45
          )
          if (caught) {
            const isCaughtBehind = ball.phase === 'hit' && !ball.bouncedAfterHit
            const isWide = ball.phase === 'bowled' && !ball.hitByBat && Math.abs(ball.pos[0]) > WIDE_HALF_W
            ball.phase = 'dead'
            ball.vel = [0, 0, 0]
            ball.epoch += 1
            playCricketCatchSfx()
            pulseHaptics(res.activeInput, 0.9, 85)

            if (isCaughtBehind) {
              playBoundaryCrowdSfx(true)
              crState.recordDeliveryOutcome({
                runsScored: 0,
                isWicket: true,
                isLegalBall: true,
                label: 'W',
                banner: 'OUT! CAUGHT BEHIND BY KEEPER!',
              })
            } else if (isWide) {
              crState.recordDeliveryOutcome({
                runsScored: 1,
                isWicket: false,
                isLegalBall: false,
                label: 'WD',
                banner: 'WIDE BALL (+1)',
              })
            } else {
              crState.recordDeliveryOutcome({
                runsScored: 0,
                isWicket: false,
                isLegalBall: true,
                label: '0',
                banner: 'KEEPER COLLECTED (DOT)',
              })
            }
            cricketRuntime.onCricketBallSend?.(ball)
            cricketRuntime.onCricketStateSend?.(useCricketStore.getState().getSyncPayload())
          }
        })
      }
      if (catchAuraRef.current) {
        catchAuraRef.current.visible = canCatch
        catchAuraRef.current.position.set(rightRes.posArr[0], rightRes.posArr[1], rightRes.posArr[2])
      }
    }
  })

  const gloveVariant =
    localRole === 'batter' ? 'batting' : localRole === 'wicketkeeper' ? 'keeper' : 'bowler'
  const jerseyColor = localRole === 'batter' ? '#1d4ed8' : '#047857'
  const batOnLeft = localRole === 'batter' && batterStance === 'left'
  const batOnRight = localRole === 'batter' && batterStance === 'right'

  return (
    <>
      <XROrigin ref={originRef} position={spawn.position} rotation={[0, spawn.yaw, 0]}>
        {!leftController?.object && leftHand && (
          <ArticulatedHand side="left" isGrabbingRef={grabStateRef} />
        )}
        {!rightController?.object && rightHand && (
          <ArticulatedHand side="right" isGrabbingRef={grabStateRef} />
        )}
      </XROrigin>

      {/* Unobstructed First-Person Gloves & MRF Cricket Bat */}
      <group ref={leftHandGroupRef}>
        <CricketGloveMesh
          variant={gloveVariant}
          accent={jerseyColor}
          skinColor={localProfile.skinColor}
          catching={grabStateRef.current.left}
        />
        {batOnLeft && (
          <group rotation={[Math.PI * 0.35, 0, 0]}>
            <CricketBatMesh highlight />
          </group>
        )}
      </group>
      <group ref={rightHandGroupRef}>
        <CricketGloveMesh
          variant={gloveVariant}
          accent={jerseyColor}
          skinColor={localProfile.skinColor}
          catching={grabStateRef.current.right}
        />
        {batOnRight && (
          <group rotation={[Math.PI * 0.35, 0, 0]}>
            <CricketBatMesh highlight />
          </group>
        )}
      </group>

      {/* Bowler / Keeper catch pocket indicator */}
      <mesh ref={catchAuraRef} visible={false}>
        <sphereGeometry args={[0.38, 16, 12]} />
        <meshBasicMaterial color="#34d399" transparent opacity={0.18} wireframe />
      </mesh>
    </>
  )
}
