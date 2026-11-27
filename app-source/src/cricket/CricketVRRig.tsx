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
import { ArticulatedHand } from '../scene/ArticulatedHand'
import { getAthleteProfile } from '../scene/HumanFace'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { HandSide } from '../types/game'
import { isXRControllerButtonPressed, pulseXRControllerHaptics } from '../xr/controllerButtons'
import {
  applyBowledDeliveryToBall,
  BowlingActionTracker,
  formatSpinKindLabel,
} from './bowlingMechanics'
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

  const spawn = getCricketSpawn(localRole, batterStance)

  const leftController = useXRInputSourceState('controller', 'left')
  const rightController = useXRInputSourceState('controller', 'right')
  const leftHand = useXRInputSourceState('hand', 'left')
  const rightHand = useXRInputSourceState('hand', 'right')

  const leftBowlTracker = useMemo(() => new BowlingActionTracker(), [])
  const rightBowlTracker = useMemo(() => new BowlingActionTracker(), [])
  const leftPoseBuf = useMemo(() => new Float32Array(XR_HAND_JOINTS.length * 16), [])
  const rightPoseBuf = useMemo(() => new Float32Array(XR_HAND_JOINTS.length * 16), [])

  const grabStateRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false })
  const handSelectRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false })
  const holdingBallHandRef = useRef<HandSide | null>(null)
  const prevLowerBtnRef = useRef(false)
  const prevBButtonRef = useRef(false)

  const localProfile = useMemo(
    () => getAthleteProfile(localPeerId || playerName || 'local'),
    [localPeerId, playerName]
  )

  useEffect(() => {
    voiceAudio.ensureListener(camera)
  }, [camera])

  // Keyboard 'B' fallback to toggle VR Main Menu during Meta Quest Emulator testing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyB' && useGameStore.getState().inXR) {
        useGameStore.getState().toggleVrMenu()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
      const tracker = side === 'left' ? leftBowlTracker : rightBowlTracker
      const poseBuf = side === 'left' ? leftPoseBuf : rightPoseBuf

      const wasGrabbing = grabStateRef.current[side]
      let posArr: [number, number, number] = side === 'left' ? lp.leftPos : lp.rightPos
      let quatArr: [number, number, number, number] = side === 'left' ? lp.leftQuat : lp.rightQuat
      let curls: [number, number, number, number, number] =
        side === 'left' ? lp.leftCurls : lp.rightCurls
      let isGrabbing = false
      let isHandTracking = false
      let activeInput: XRInputSource | undefined

      if (ctrl?.object) {
        activeInput = ctrl.inputSource
        ctrl.object.getWorldPosition(_worldPos)
        ctrl.object.getWorldQuaternion(_worldQuat)
        posArr = [_worldPos.x, _worldPos.y, _worldPos.z]
        quatArr = [_worldQuat.x, _worldQuat.y, _worldQuat.z, _worldQuat.w]

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
        tracker.push(posArr, quatArr, curls, false, nowSec)
      } else if (hand?.inputSource.hand && frame && refSpace) {
        activeInput = hand.inputSource
        isHandTracking = true
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
          tracker.push(posArr, quatArr, curls, true, nowSec)
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

      return { posArr, quatArr, isGrabbing, isHandTracking, activeInput, tracker }
    }

    const leftRes = readSide('left')
    const rightRes = readSide('right')
    lp.catchingActive = lp.leftGrabbing || lp.rightGrabbing

    // Track whether VR Touch controllers are active
    const usingControllers = Boolean(leftController?.object || rightController?.object)
    cricketRuntime.vrControllerActive = usingControllers

    // Pressing 'B' button on right controller toggles show/hide for the VR main menu
    const bPressedNow = isXRControllerButtonPressed(rightController, 'b-button', 5)
    if (bPressedNow && !prevBButtonRef.current) {
      useGameStore.getState().toggleVrMenu()
      pulseXRControllerHaptics(rightController?.inputSource, 0.25, 25)
    }
    prevBButtonRef.current = bPressedNow

    // Pressing lower controller button (A on right, X on left) requests AI bowler to bowl in batter mode
    const lowerRight = isXRControllerButtonPressed(rightController, 'a-button', 4)
    const lowerLeft = isXRControllerButtonPressed(leftController, 'x-button', 4)
    const lowerBtnNow = lowerRight || lowerLeft
    const lowerBtnJustPressed = lowerBtnNow && !prevLowerBtnRef.current
    prevLowerBtnRef.current = lowerBtnNow

    const crState = useCricketStore.getState()
    const ball = cricketRuntime.ball

    if (
      lowerBtnJustPressed &&
      usingControllers &&
      localRole === 'batter' &&
      ball.phase === 'ready' &&
      !crState.inningsOver &&
      crState.assignments.bowler === 'ai' &&
      !cricketRuntime.aiBowlRequested
    ) {
      cricketRuntime.aiBowlRequested = true
      cricketRuntime.aiBowlerWaiting = false
      cricketRuntime.aiBowlCooldownSec = 0.85
      cricketRuntime.aiBowlTotalSec = 0.85
      crState.setVrWaitingForBowlTrigger(false)
      pulseXRControllerHaptics(
        lowerRight ? rightController?.inputSource : leftController?.inputSource,
        0.4,
        35
      )
    }

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
      crState.setLivePalmSpinHint(null)
      if (catchAuraRef.current) catchAuraRef.current.visible = false
      return
    }

    cricketRuntime.bat.active = false
    if (ball.phase !== 'ready' || localRole !== 'bowler') {
      crState.setLivePalmSpinHint(null)
    }

    // 2. Bowler Role: real palm-read spin + observed throwing speed + calculated pitch drop + Caught & Bowled!
    if (localRole === 'bowler' && !crState.inningsOver) {
      if (ball.phase === 'ready') {
        // In hand-only mode: Right-Hand stance allows only right hand to bowl; Left-Hand stance allows only left hand
        const requiredHandSide: HandSide = batterStance === 'left' ? 'left' : 'right'
        const heldSide = holdingBallHandRef.current
        if (heldSide === null) {
          crState.setLivePalmSpinHint(null)
          ;(['right', 'left'] as HandSide[]).forEach((s) => {
            const res = s === 'left' ? leftRes : rightRes
            if (res.isHandTracking && s !== requiredHandSide) return
            if (res.isGrabbing) {
              holdingBallHandRef.current = s
              res.tracker.reset()
              pulseXRControllerHaptics(res.activeInput, 0.5, 45)
            }
          })
        } else {
          const res = heldSide === 'left' ? leftRes : rightRes
          if (res.isHandTracking && heldSide !== requiredHandSide) {
            holdingBallHandRef.current = null
            crState.setLivePalmSpinHint(null)
          } else if (res.isGrabbing) {
            ball.prevPos = [...ball.pos]
            ball.pos = [...res.posArr]
            if (bowlingStyle === 'spin') {
              const liveSpin = res.tracker.readPalmSpin(nowSec, bowlingStyle, heldSide, 2.2)
              crState.setLivePalmSpinHint(liveSpin.spinKind)
            } else {
              crState.setLivePalmSpinHint('fast')
            }
          } else {
            const delivery = res.tracker.analyzeDelivery(nowSec, res.posArr, bowlingStyle, heldSide)
            const releaseSpeed = applyBowledDeliveryToBall(ball, {
              ownerId: localPeerId || 'local',
              releasePos: res.posArr,
              vel: delivery.vel,
              spin: delivery.spin,
              bowlingStyle,
              spinDir: delivery.spinDir,
              spinKind: delivery.spinKind,
              spinRpm: delivery.spinRpm,
              dropPoint: delivery.dropPoint,
              pitchLengthLabel: delivery.pitchLengthLabel,
            })

            const spinDetail =
              bowlingStyle === 'spin' && delivery.spinRpm > 0
                ? `${formatSpinKindLabel(delivery.spinKind)} (${delivery.spinRpm} RPM)`
                : formatSpinKindLabel(delivery.spinKind)
            crState.setEventBanner(
              `${delivery.releaseSpeedKmh} KM/H • ${spinDetail} • DROP: ${delivery.pitchLengthLabel}`
            )

            holdingBallHandRef.current = null
            playThrowSfx(releaseSpeed)
            pulseXRControllerHaptics(res.activeInput, 0.55, 55)
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
            pulseXRControllerHaptics(res.activeInput, 0.95, 95)
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
            pulseXRControllerHaptics(res.activeInput, 0.9, 85)

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
