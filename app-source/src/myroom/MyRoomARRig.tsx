import { useFrame, useThree } from '@react-three/fiber'
import {
  useXR,
  useXRInputSourceEvent,
  useXRInputSourceState,
  XROrigin,
} from '@react-three/xr'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { playThrowSfx } from '../audio/sfx'
import { voiceAudio } from '../net/voiceAudio'
import { analyzeXRHandFrame, XR_HAND_JOINTS } from '../physics/handGesture'
import { ThrowVelocityEstimator } from '../physics/throwEstimator'
import { ArticulatedHand } from '../scene/ArticulatedHand'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { HandSide } from '../types/game'
import { isXRControllerButtonPressed, pulseXRControllerHaptics } from '../xr/controllerButtons'
import {
  computeTearSplitDeforms,
  encodeDeformOffsets,
  squeezeCraftWithPalm,
} from './craftEngine'
import {
  deleteRuntimeCraftObject,
  myRoomRuntime,
  RuntimeCraftObject,
  spawnRuntimeCraftObject,
  stripToNetState,
  useMyRoomStore,
} from './useMyRoomStore'

const PALM_GRAB_RADIUS = 0.19
const PALM_SQUEEZE_RADIUS = 0.15

type CompanionHoldState =
  | { type: 'ai-hand'; aiSide: 'left' | 'right' }
  | { type: 'hair' }
  | null

const _worldPos = new THREE.Vector3()
const _worldQuat = new THREE.Quaternion()
const _palmNormal = new THREE.Vector3()
const _objQuat = new THREE.Quaternion()

export function MyRoomARRig() {
  const originRef = useRef<THREE.Group>(null)
  const leftAuraRef = useRef<THREE.Mesh>(null)
  const rightAuraRef = useRef<THREE.Mesh>(null)

  const camera = useThree((s) => s.camera)
  const referenceSpace = useXR((s) => s.originReferenceSpace)
  const localPeerId = useGameStore((s) => s.localPeerId)

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
  const heldByHandRef = useRef<{ left: string | null; right: string | null }>({
    left: null,
    right: null,
  })
  const companionHoldRef = useRef<{ left: CompanionHoldState; right: CompanionHoldState }>({
    left: null,
    right: null,
  })
  const dualRestSpanRef = useRef<number | null>(null)
  const prevBButtonRef = useRef(false)
  const lastDeformNetSyncRef = useRef(0)
  const lastTouchHapticRef = useRef(0)
  const prevPalmPosRef = useRef<{ left: [number, number, number]; right: [number, number, number] }>({
    left: [0, 1.2, 0],
    right: [0, 1.2, 0],
  })

  useEffect(() => {
    voiceAudio.ensureListener(camera)
  }, [camera])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyB' && useGameStore.getState().inXR) {
        useGameStore.getState().toggleVrMenu()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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

  useFrame((state, delta, frame) => {
    const cDt = Math.min(delta, 0.05)
    const nowSec = performance.now() / 1000
    const lp = runtimeState.localPose
    const refSpace = referenceSpace ?? state.gl.xr.getReferenceSpace() ?? undefined

    camera.getWorldPosition(_worldPos)
    camera.getWorldQuaternion(_worldQuat)
    lp.headPos = [_worldPos.x, _worldPos.y, _worldPos.z]
    lp.headQuat = [_worldQuat.x, _worldQuat.y, _worldQuat.z, _worldQuat.w]

    const readHand = (side: HandSide) => {
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
      let pinchDist = 1
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
        const squeezeVal = Math.max(sq, isGrabbing ? 0.85 : 0.1)
        curls = [squeezeVal * 0.75, tr, squeezeVal, squeezeVal, squeezeVal]
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
          pinchDist = analysis.pinchDist
          isGrabbing = analysis.isGrabbing
          estimator.push(posArr[0], posArr[1], posArr[2], nowSec)
        }
      }

      grabStateRef.current[side] = isGrabbing

      // Inward palm vector pointing out of palm into held clay/paper
      _objQuat.set(quatArr[0], quatArr[1], quatArr[2], quatArr[3])
      if (ctrl?.object) {
        _palmNormal.set(side === 'right' ? -1 : 1, 0, 0).applyQuaternion(_objQuat).normalize()
      } else {
        _palmNormal.set(0, -1, 0).applyQuaternion(_objQuat).normalize()
      }
      const palmNormal: [number, number, number] = [_palmNormal.x, _palmNormal.y, _palmNormal.z]

      // Full-hand fist closure strength vs gentle pinch carry
      const fingerAvg = (curls[1] + curls[2] + curls[3]) / 3
      const palmSqueezeStrength = fingerAvg * 0.72 + curls[0] * 0.28

      if (side === 'left') {
        lp.leftPos = posArr
        lp.leftQuat = quatArr
        lp.leftCurls = curls
        lp.leftGrabbing = isGrabbing
      } else {
        lp.rightPos = posArr
        lp.rightQuat = quatArr
        lp.rightCurls = curls
        lp.rightGrabbing = isGrabbing
      }

      return {
        side,
        posArr,
        quatArr,
        palmNormal,
        isGrabbing,
        pinchDist,
        palmSqueezeStrength,
        activeInput,
        estimator,
      }
    }

    const leftRes = readHand('left')
    const rightRes = readHand('right')
    lp.catchingActive = lp.leftGrabbing || lp.rightGrabbing

    // B button toggles AR menu visibility cleanly
    const bPressedNow = isXRControllerButtonPressed(rightController, 'b-button', 5)
    if (bPressedNow && !prevBButtonRef.current) {
      useGameStore.getState().toggleVrMenu()
      pulseXRControllerHaptics(rightController?.inputSource, 0.25, 25)
    }
    prevBButtonRef.current = bPressedNow

    const myId = localPeerId || 'local'
    const syncDirtyObject = (obj: RuntimeCraftObject, finalRelease = false) => {
      if (finalRelease) {
        myRoomRuntime.onCraftObjectSend?.(stripToNetState(obj))
        obj.dirtyNetwork = false
        return
      }
      if (obj.dirtyNetwork && nowSec - lastDeformNetSyncRef.current > 0.11) {
        lastDeformNetSyncRef.current = nowSec
        obj.dirtyNetwork = false
        myRoomRuntime.onCraftDeformSend?.({
          id: obj.id,
          ownerId: obj.ownerId,
          epoch: obj.epoch,
          pos: [...obj.pos],
          quat: [...obj.quat],
          crumpleFactor: obj.crumpleFactor,
          deformQ: [...obj.deformQ],
          timestamp: Date.now(),
        })
      }
    }

    // 1. Acquire / release grabs on left and right hands independently
    const handleGrabLifecycle = (handRes: ReturnType<typeof readHand>) => {
      const heldId = heldByHandRef.current[handRes.side]
      if (heldId !== null) {
        const obj = myRoomRuntime.objects.get(heldId)
        if (!obj) {
          heldByHandRef.current[handRes.side] = null
          return
        }
        if (!handRes.isGrabbing) {
          // Released object into real AR room physics!
          heldByHandRef.current[handRes.side] = null
          const otherHeld = heldByHandRef.current[handRes.side === 'left' ? 'right' : 'left']
          if (otherHeld !== heldId) {
            const vel = handRes.estimator.computeVelocity(nowSec, 1.05, 8.5)
            obj.isHeldByLocal = false
            obj.ownerId = null
            obj.vel = vel
            obj.epoch += 1
            obj.timestamp = Date.now()
            syncDirtyObject(obj, true)
            playThrowSfx(Math.hypot(vel[0], vel[1], vel[2]))
          }
          dualRestSpanRef.current = null
          handRes.estimator.reset()
        }
      } else if (handRes.isGrabbing) {
        // Check if grabbing a craft object first; if none in reach, check AI companion's hand or hair!
        let bestObj: RuntimeCraftObject | null = null
        let bestDist = Infinity
        myRoomRuntime.objects.forEach((candidate) => {
          const d = Math.hypot(
            candidate.pos[0] - handRes.posArr[0],
            candidate.pos[1] - handRes.posArr[1],
            candidate.pos[2] - handRes.posArr[2]
          )
          const reach = candidate.meshData.approxRadius + PALM_GRAB_RADIUS
          if (d <= reach && d < bestDist) {
            bestDist = d
            bestObj = candidate
          }
        })

        if (bestObj) {
          const picked: RuntimeCraftObject = bestObj
          heldByHandRef.current[handRes.side] = picked.id
          picked.isHeldByLocal = true
          picked.ownerId = myId
          picked.epoch += 1
          picked.vel = [0, 0, 0]
          picked.timestamp = Date.now()
          handRes.estimator.reset()
          pulseXRControllerHaptics(handRes.activeInput, 0.4, 30)
          myRoomRuntime.onCraftObjectSend?.(stripToNetState(picked))
        } else if (
          companionHoldRef.current[handRes.side] === null &&
          useGameStore.getState().peers &&
          (useMyRoomStore.getState().opponentMode === 'computer' ||
            (useMyRoomStore.getState().opponentMode === 'auto' &&
              Object.keys(useGameStore.getState().peers).length === 0))
        ) {
          const ai = myRoomRuntime.ai
          const dHair = Math.hypot(
            handRes.posArr[0] - ai.hairWorldPos[0],
            handRes.posArr[1] - ai.hairWorldPos[1],
            handRes.posArr[2] - ai.hairWorldPos[2]
          )
          const dLeftHand = Math.hypot(
            handRes.posArr[0] - ai.leftHand[0],
            handRes.posArr[1] - ai.leftHand[1],
            handRes.posArr[2] - ai.leftHand[2]
          )
          const dRightHand = Math.hypot(
            handRes.posArr[0] - ai.rightHand[0],
            handRes.posArr[1] - ai.rightHand[1],
            handRes.posArr[2] - ai.rightHand[2]
          )
          if (dHair < 0.18) {
            companionHoldRef.current[handRes.side] = { type: 'hair' }
            pulseXRControllerHaptics(handRes.activeInput, 0.35, 30)
            useMyRoomStore.getState().setStatusHint('Holding companion hair')
          } else if (dLeftHand < 0.19) {
            companionHoldRef.current[handRes.side] = { type: 'ai-hand', aiSide: 'left' }
            pulseXRControllerHaptics(handRes.activeInput, 0.35, 30)
            useMyRoomStore.getState().setStatusHint('Holding companion hand')
          } else if (dRightHand < 0.19) {
            companionHoldRef.current[handRes.side] = { type: 'ai-hand', aiSide: 'right' }
            pulseXRControllerHaptics(handRes.activeInput, 0.35, 30)
            useMyRoomStore.getState().setStatusHint('Holding companion hand')
          }
        }
      }
    }

    handleGrabLifecycle(leftRes)
    handleGrabLifecycle(rightRes)

    // Update tactile Computer Companion interactions (hand-holding, hair-holding, head pet, shoulder touch)
    const ai = myRoomRuntime.ai
    ai.heldHandByUser = null
    ai.hairPullTarget = null
    ai.touchedShoulderSide = null

    ;[leftRes, rightRes].forEach((hRes) => {
      const hold = companionHoldRef.current[hRes.side]
      if (hold) {
        if (!hRes.isGrabbing) {
          companionHoldRef.current[hRes.side] = null
        } else if (hold.type === 'ai-hand') {
          ai.heldHandByUser = hold.aiSide
          if (hold.aiSide === 'left') ai.leftHand = [...hRes.posArr]
          else ai.rightHand = [...hRes.posArr]
        } else if (hold.type === 'hair') {
          ai.hairPullTarget = [...hRes.posArr]
          const pdx = hRes.posArr[0] - ai.hairWorldPos[0]
          const pdy = hRes.posArr[1] - ai.hairWorldPos[1]
          const cosY = Math.cos(ai.yaw)
          const sinY = Math.sin(ai.yaw)
          const localSide = pdx * cosY - (hRes.posArr[2] - ai.hairWorldPos[2]) * sinY
          ai.headReactRoll = Math.max(-0.32, Math.min(0.32, -localSide * 1.4))
          ai.headReactPitch = Math.max(-0.28, Math.min(0.28, -pdy * 1.2))
        }
      }

      // Open palm / hand touch on Head or Full Body Torso Capsule interacts & pushes smoothly
      const prevPalm = prevPalmPosRef.current[hRes.side]
      const palmVelX = (hRes.posArr[0] - prevPalm[0]) / Math.max(0.008, cDt)
      const palmVelZ = (hRes.posArr[2] - prevPalm[2]) / Math.max(0.008, cDt)
      prevPalmPosRef.current[hRes.side] = [...hRes.posArr]

      if (heldByHandRef.current[hRes.side] === null && !companionHoldRef.current[hRes.side]) {
        const dHead = Math.hypot(
          hRes.posArr[0] - ai.headWorldPos[0],
          hRes.posArr[1] - ai.headWorldPos[1],
          hRes.posArr[2] - ai.headWorldPos[2]
        )
        if (dHead < 0.24) {
          const cosY = Math.cos(ai.yaw)
          const sinY = Math.sin(ai.yaw)
          const hx = hRes.posArr[0] - ai.headWorldPos[0]
          const hy = hRes.posArr[1] - ai.headWorldPos[1]
          const hz = hRes.posArr[2] - ai.headWorldPos[2]
          const sideOff = hx * cosY - hz * sinY
          ai.headReactRoll = Math.max(-0.28, Math.min(0.28, sideOff * 1.4))
          ai.headReactPitch = Math.max(-0.24, Math.min(0.24, (0.1 - hy) * 1.1))
        } else {
          // Check full body torso column (pelvis -> chest -> shoulders) for hand push & touch sensing
          const pelvisY = ai.pos[1] + 0.42 - ai.sitBlend * 0.22
          const chestTopY = ai.pos[1] + 1.42 - ai.sitBlend * 0.39
          const withinTorsoHeight = hRes.posArr[1] >= pelvisY && hRes.posArr[1] <= chestTopY
          const dHoriz = Math.hypot(hRes.posArr[0] - ai.pos[0], hRes.posArr[2] - ai.pos[2])
          if (withinTorsoHeight && dHoriz < 0.31) {
            ai.touchedShoulderSide = hRes.side
            const pLen = dHoriz > 1e-4 ? dHoriz : 1
            const pushDirX = (ai.pos[0] - hRes.posArr[0]) / pLen
            const pushDirZ = (ai.pos[2] - hRes.posArr[2]) / pLen
            const pushSpeed = Math.max(0.6, (0.31 - dHoriz) * 12 + Math.max(0, palmVelX * pushDirX + palmVelZ * pushDirZ) * 0.65)
            ai.velXZ[0] = Math.max(-2.6, Math.min(2.6, ai.velXZ[0] + pushDirX * pushSpeed * cDt * 6))
            ai.velXZ[1] = Math.max(-2.6, Math.min(2.6, ai.velXZ[1] + pushDirZ * pushSpeed * cDt * 6))
            ai.torsoReactPitch = Math.max(-0.26, ai.torsoReactPitch - 0.14)
            ai.torsoReactRoll = Math.max(-0.22, Math.min(0.22, (hRes.side === 'left' ? -0.14 : 0.14)))
            if (nowSec - lastTouchHapticRef.current > 0.28) {
              lastTouchHapticRef.current = nowSec
              pulseXRControllerHaptics(hRes.activeInput, 0.24, 18)
              useMyRoomStore.getState().setStatusHint('Companion sensed your body/hand touch')
            }
          }
        }
      }
    })

    const leftId = heldByHandRef.current.left
    const rightId = heldByHandRef.current.right

    // 2. Bimanual Two-Hand Manipulation: Squeeze Together OR Tear Down / Rip Apart!
    if (leftId !== null && leftId === rightId) {
      const obj = myRoomRuntime.objects.get(leftId)
      if (obj) {
        const span = Math.hypot(
          rightRes.posArr[0] - leftRes.posArr[0],
          rightRes.posArr[1] - leftRes.posArr[1],
          rightRes.posArr[2] - leftRes.posArr[2]
        )
        if (dualRestSpanRef.current === null) {
          dualRestSpanRef.current = Math.max(0.08, span)
        }

        // Tear Check: pulling both palms strongly apart rips Paper or splits Artificial Clay!
        const tearThreshold = Math.max(obj.meshData.approxRadius * 1.6, dualRestSpanRef.current * 1.48) + 0.12
        if (span > tearThreshold) {
          const split = computeTearSplitDeforms(
            obj.meshData,
            obj.kind,
            obj.pos,
            obj.quat,
            leftRes.posArr,
            rightRes.posArr,
            obj.deformSeed,
            obj.tearGeneration
          )
          if (split.canTear) {
            const basePos: [number, number, number] = [...obj.pos]
            const baseQuat: [number, number, number, number] = [...obj.quat]
            const baseKind = obj.kind
            const basePreset = obj.preset
            const baseColor = obj.color
            const nextScale = obj.scale * split.childScale
            const nextGen = obj.tearGeneration + 1

            deleteRuntimeCraftObject(obj.id, true)

            const pieceLeft = spawnRuntimeCraftObject({
              ownerId: myId,
              creatorId: myId,
              kind: baseKind,
              preset: basePreset,
              color: baseColor,
              pos: [
                basePos[0] + split.leftOffsetWorld[0],
                basePos[1] + split.leftOffsetWorld[1],
                basePos[2] + split.leftOffsetWorld[2],
              ],
              quat: baseQuat,
              scale: nextScale,
              tearGeneration: nextGen,
              deformQ: split.leftDeformQ,
              broadcast: true,
            })
            const pieceRight = spawnRuntimeCraftObject({
              ownerId: myId,
              creatorId: myId,
              kind: baseKind,
              preset: basePreset,
              color: baseColor,
              pos: [
                basePos[0] + split.rightOffsetWorld[0],
                basePos[1] + split.rightOffsetWorld[1],
                basePos[2] + split.rightOffsetWorld[2],
              ],
              quat: baseQuat,
              scale: nextScale,
              tearGeneration: nextGen,
              deformQ: split.rightDeformQ,
              broadcast: true,
            })

            pieceLeft.isHeldByLocal = true
            pieceRight.isHeldByLocal = true
            heldByHandRef.current.left = pieceLeft.id
            heldByHandRef.current.right = pieceRight.id
            dualRestSpanRef.current = null
            useMyRoomStore.getState().setStatusHint(
              baseKind === 'paper' ? 'Tore Paper into two scraps!' : 'Ripped Clay into two pieces!'
            )
            pulseXRControllerHaptics(leftRes.activeInput, 0.9, 85)
            pulseXRControllerHaptics(rightRes.activeInput, 0.9, 85)
            return
          }
        }

        // Center between both palms while squeezing
        obj.pos = [
          (leftRes.posArr[0] + rightRes.posArr[0]) * 0.5,
          (leftRes.posArr[1] + rightRes.posArr[1]) * 0.5,
          (leftRes.posArr[2] + rightRes.posArr[2]) * 0.5,
        ]
        obj.quat = [...rightRes.quatArr]

        const compress = Math.max(0, (dualRestSpanRef.current - span) / 0.14)
        const squeezeIntensity = Math.min(
          1,
          Math.max(
            compress,
            (leftRes.palmSqueezeStrength + rightRes.palmSqueezeStrength) * 0.5
          )
        )

        if (squeezeIntensity > 0.32) {
          const rA = squeezeCraftWithPalm(
            obj.meshData,
            obj.kind,
            obj.pos,
            obj.quat,
            leftRes.posArr,
            leftRes.palmNormal,
            squeezeIntensity,
            obj.deformSeed,
            obj.crumpleFactor,
            cDt
          )
          const rB = squeezeCraftWithPalm(
            obj.meshData,
            obj.kind,
            obj.pos,
            obj.quat,
            rightRes.posArr,
            rightRes.palmNormal,
            squeezeIntensity,
            obj.deformSeed,
            rA.nextCrumple,
            cDt
          )
          if (rA.dirty || rB.dirty) {
            obj.crumpleFactor = rB.nextCrumple
            obj.deformQ = encodeDeformOffsets(
              obj.meshData.restPositions,
              obj.meshData.currPositions
            )
            obj.dirtyNetwork = true
            syncDirtyObject(obj, false)
          }
        }
      }
    } else {
      dualRestSpanRef.current = null

      // Single-hand carry + optional fist/palm squeeze when fingers close tightly
      const processSingleHeld = (handRes: ReturnType<typeof readHand>, objId: string | null) => {
        if (!objId) return
        const obj = myRoomRuntime.objects.get(objId)
        if (!obj) return
        obj.pos = [...handRes.posArr]
        obj.quat = [...handRes.quatArr]

        // Firm fist closure (> 0.62) squeezes Clay / crumples Paper in palm; light pinch (< 0.55) carries gently!
        if (handRes.palmSqueezeStrength > 0.6) {
          const squeezeAmt = (handRes.palmSqueezeStrength - 0.52) * 2.0
          const res = squeezeCraftWithPalm(
            obj.meshData,
            obj.kind,
            obj.pos,
            obj.quat,
            handRes.posArr,
            handRes.palmNormal,
            squeezeAmt,
            obj.deformSeed,
            obj.crumpleFactor,
            cDt
          )
          if (res.dirty) {
            obj.crumpleFactor = res.nextCrumple
            obj.deformQ = encodeDeformOffsets(
              obj.meshData.restPositions,
              obj.meshData.currPositions
            )
            obj.dirtyNetwork = true
            syncDirtyObject(obj, false)
          }
        }
      }

      processSingleHeld(leftRes, leftId)
      processSingleHeld(rightRes, rightId)
    }

    // 3. Direct Open-Palm Press Deformation on Any Unheld Table/Floor Object (Bare Palm Sculpting!)
    const applyFreePalmSculpt = (handRes: ReturnType<typeof readHand>, heldId: string | null) => {
      if (heldId !== null) return
      myRoomRuntime.objects.forEach((obj) => {
        if (obj.isHeldByLocal) return
        const d = Math.hypot(
          obj.pos[0] - handRes.posArr[0],
          obj.pos[1] - handRes.posArr[1],
          obj.pos[2] - handRes.posArr[2]
        )
        if (d <= obj.meshData.approxRadius + PALM_SQUEEZE_RADIUS && handRes.palmSqueezeStrength > 0.3) {
          const res = squeezeCraftWithPalm(
            obj.meshData,
            obj.kind,
            obj.pos,
            obj.quat,
            handRes.posArr,
            handRes.palmNormal,
            handRes.palmSqueezeStrength,
            obj.deformSeed,
            obj.crumpleFactor,
            cDt
          )
          if (res.dirty) {
            obj.crumpleFactor = res.nextCrumple
            obj.deformQ = encodeDeformOffsets(
              obj.meshData.restPositions,
              obj.meshData.currPositions
            )
            obj.dirtyNetwork = true
            syncDirtyObject(obj, false)
          }
        }
      })
    }

    applyFreePalmSculpt(leftRes, leftId)
    applyFreePalmSculpt(rightRes, rightId)

    // Visual hand aura indicators
    if (leftAuraRef.current) {
      leftAuraRef.current.position.set(leftRes.posArr[0], leftRes.posArr[1], leftRes.posArr[2])
      leftAuraRef.current.visible = Boolean(leftController?.object || leftHand?.inputSource.hand)
    }
    if (rightAuraRef.current) {
      rightAuraRef.current.position.set(rightRes.posArr[0], rightRes.posArr[1], rightRes.posArr[2])
      rightAuraRef.current.visible = Boolean(rightController?.object || rightHand?.inputSource.hand)
    }
  })

  return (
    <>
      {/* Exact [0,0,0] origin keeps real Quest AR scanned room planes & walls aligned 1:1 with user hands */}
      <XROrigin ref={originRef} position={[0, 0, 0]} rotation={[0, 0, 0]}>
        {!leftController?.object && leftHand && (
          <ArticulatedHand side="left" isGrabbingRef={grabStateRef} />
        )}
        {!rightController?.object && rightHand && (
          <ArticulatedHand side="right" isGrabbingRef={grabStateRef} />
        )}
      </XROrigin>

      <mesh ref={leftAuraRef} visible={false}>
        <ringGeometry args={[0.045, 0.058, 16]} />
        <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.45} />
      </mesh>
      <mesh ref={rightAuraRef} visible={false}>
        <ringGeometry args={[0.045, 0.058, 16]} />
        <meshBasicMaterial color="#fb923c" side={THREE.DoubleSide} transparent opacity={0.45} />
      </mesh>
    </>
  )
}
