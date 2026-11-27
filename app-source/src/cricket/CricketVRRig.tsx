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
import {
  CricketBatMesh,
  CricketGloveMesh,
  CricketHelmetMesh,
  CricketKitBody,
  KitAnimState,
} from './PlayerGear'
import { CRICKET_BALL_RADIUS, getCricketSpawn, WIDE_HALF_W } from './types'
import { cricketRuntime, useCricketStore } from './useCricketStore'

const _worldPos = new THREE.Vector3()
const _worldQuat = new THREE.Quaternion()
const _batDir = new THREE.Vector3()
const _batNormal = new THREE.Vector3()
const _prevBatCenter = new THREE.Vector3()
const _currBatCenter = new THREE.Vector3()
const _euler = new THREE.Euler()
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
  const helmetGroupRef = useRef<THREE.Group>(null)
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
  const bodyPosRef = useRef<[number, number, number]>([...spawn.position])
  const prevBodyPosRef = useRef<[number, number, number]>([...spawn.position])
  const bodyYawRef = useRef(spawn.yaw)
  const leftWristRef = useRef<[number, number, number]>([0, 1.0, 0])
  const rightWristRef = useRef<[number, number, number]>([0, 1.0, 0])
  const animRef = useRef<KitAnimState>({
    runPhase: 0,
    runSpeed: 0,
    squat: localRole === 'wicketkeeper' ? 0.55 : localRole === 'batter' ? 0.14 : 0,
    torsoLean: 0.06,
    diveTilt: 0,
  })
  const localProfile = useMemo(() => getAthleteProfile(localPeerId || playerName || 'local'), [localPeerId, playerName])

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

    prevBodyPosRef.current = [...bodyPosRef.current]
    bodyPosRef.current = [_worldPos.x, Math.max(0, _worldPos.y - 1.58), _worldPos.z]
    _euler.setFromQuaternion(_worldQuat, 'YXZ')
    const stanceSign = batterStance === 'right' ? 1 : -1
    bodyYawRef.current =
      localRole === 'batter' ? _euler.y - stanceSign * Math.PI * 0.4 : _euler.y

    const moveDist = Math.hypot(
      bodyPosRef.current[0] - prevBodyPosRef.current[0],
      bodyPosRef.current[2] - prevBodyPosRef.current[2]
    )
    const cDt = Math.max(0.004, Math.min(0.05, delta))
    animRef.current.runSpeed = Math.min(1, moveDist / cDt / 3.2)
    if (animRef.current.runSpeed > 0.08) {
      animRef.current.runPhase += cDt * 9 * animRef.current.runSpeed
    }
    animRef.current.squat = localRole === 'wicketkeeper' ? 0.55 : localRole === 'batter' ? 0.22 : 0
    animRef.current.stanceSpread = localRole === 'batter' ? 0.19 : 0
    animRef.current.torsoLean = localRole === 'batter' ? 0.2 : localRole === 'wicketkeeper' ? 0.25 : 0.05

    if (helmetGroupRef.current) {
      helmetGroupRef.current.position.copy(_worldPos)
      helmetGroupRef.current.quaternion.copy(_worldQuat)
    }

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
        leftWristRef.current = posArr
        if (leftHandGroupRef.current) {
          leftHandGroupRef.current.position.set(posArr[0], posArr[1], posArr[2])
          leftHandGroupRef.current.quaternion.set(quatArr[0], quatArr[1], quatArr[2], quatArr[3])
        }
      } else {
        lp.rightPos = posArr
        lp.rightQuat = quatArr
        lp.rightCurls = curls
        lp.rightGrabbing = isGrabbing
        rightWristRef.current = posArr
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

    // 1. Batter Role: sync swept 3D Cricket Bat segment
    if (localRole === 'batter') {
      const batHand = batterStance === 'left' ? leftRes : rightRes
      const q = _worldQuat.set(
        batHand.quatArr[0],
        batHand.quatArr[1],
        batHand.quatArr[2],
        batHand.quatArr[3]
      )
      // Bat is angled naturally forward along controller/hand grip (+Math.PI*0.35 around X)
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

    // 2. Bowler Role: grip ball -> release delivery + mid-air Caught & Bowled!
    if (localRole === 'bowler' && !crState.inningsOver) {
      if (ball.phase === 'ready') {
        const heldSide = holdingBallHandRef.current
        if (heldSide === null) {
          ;(['right', 'left'] as HandSide[]).forEach((s) => {
            const res = s === 'left' ? leftRes : rightRes
            if (res.isGrabbing && Math.hypot(ball.pos[0] - res.posArr[0], ball.pos[1] - res.posArr[1], ball.pos[2] - res.posArr[2]) < 0.45) {
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
            // Release delivery!
            const rawVel = res.estimator.computeVelocity(nowSec, 1.48, 27)
            // Ensure forward Z delivery toward batting stumps
            const vz = Math.max(bowlingStyle === 'fast' ? 16.5 : 10.5, rawVel[2])
            const vx = Math.max(-3.5, Math.min(3.5, rawVel[0]))
            const vy = Math.max(-1.0, Math.min(5.5, rawVel[1]))
            const spinSign = spinDir === 'off' ? 1 : -1
            const spinX = bowlingStyle === 'fast' ? spinSign * 0.65 : spinSign * 2.45

            ball.phase = 'bowled'
            ball.ownerId = localPeerId || 'local'
            ball.pos = [...res.posArr]
            ball.prevPos = [...res.posArr]
            ball.vel = [vx, vy, vz]
            ball.spin = [spinX, 0, 0]
            ball.bowlingStyle = bowlingStyle
            ball.spinDir = spinDir
            ball.bouncedOnPitch = false
            ball.bouncedAfterHit = false
            ball.hitByBat = false
            ball.edgeContact = false
            ball.epoch += 1
            ball.timestamp = Date.now()
            holdingBallHandRef.current = null
            playThrowSfx(vz)
            pulseHaptics(res.activeInput, 0.5, 50)
            cricketRuntime.onCricketBallSend?.(ball)
          }
        }
      } else if (ball.phase === 'hit' && !ball.bouncedAfterHit) {
        // CAUGHT & BOWLED check in VR ("comes from batter to bowler in airways")!
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
            CRICKET_BALL_RADIUS + 0.36
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
            CRICKET_BALL_RADIUS + 0.42
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

      {/* First-person Own Body (Torso with Name Front & Back, Legs, Pads, Jersey Arms) */}
      <CricketKitBody
        role={localRole}
        playerName={playerName}
        jerseyNumber="01"
        jerseyColor={jerseyColor}
        lookProfile={localProfile}
        hideHead
        getBodyAnchor={() => ({ pos: bodyPosRef.current, yaw: bodyYawRef.current })}
        getLeftWrist={() => leftWristRef.current}
        getRightWrist={() => rightWristRef.current}
        getAnimState={() => animRef.current}
      />

      {/* Subtle peripheral Helmet visor framing for Batter & Keeper */}
      {(localRole === 'batter' || localRole === 'wicketkeeper') && (
        <group ref={helmetGroupRef}>
          <CricketHelmetMesh jerseyColor={jerseyColor} firstPersonFraming />
        </group>
      )}

      {/* Gloves & Cricket Bat */}
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
        <sphereGeometry args={[0.36, 16, 12]} />
        <meshBasicMaterial color="#34d399" transparent opacity={0.18} wireframe />
      </mesh>
    </>
  )
}
