import { useFrame, useThree } from '@react-three/fiber'
import {
  useXR,
  useXRInputSourceEvent,
  useXRInputSourceState,
  XROrigin,
} from '@react-three/xr'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { playMaterialActionSfx } from '../audio/myroomSfx'
import { playThrowSfx } from '../audio/sfx'
import { voiceAudio } from '../net/voiceAudio'
import { analyzeXRHandFrame, XR_HAND_JOINTS } from '../physics/handGesture'
import { ThrowVelocityEstimator } from '../physics/throwEstimator'
import { ArticulatedHand } from '../scene/ArticulatedHand'
import { UnityLocalVRCharacter } from '../scene/UnityLocalVRCharacter'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { HandSide } from '../types/game'
import { isXRControllerButtonPressed, pulseXRControllerHaptics } from '../xr/controllerButtons'
import {
  computeBladeCutDeforms,
  computeTearSplitDeforms,
  encodeDeformOffsets,
  foldCraftWithHands,
  projectWorldTipOntoPaperUV,
  squeezeCraftWithPalm,
} from './craftEngine'
import { computeRightToolWorldTransform } from './LeftWristSmartWatch'
import { snapHandDartboardPose } from './dartEngine'
import { clampInsideRoomWalls, computeWorldObjectBox, findSupportingSurfaceY } from './roomPhysics'
import { snapDecorNearWallIfClose } from './RoomShowcaseLayer'
import { DARTBOARD_RADIUS, DARTS_PER_PLAYER, MATERIAL_PHYSICS, ROOM_DECOR_CATALOG } from './types'
import {
  deleteRuntimeCraftObject,
  getCombinedRoomSurfaces,
  myRoomRuntime,
  RuntimeCraftObject,
  RuntimeRoomDecor,
  spawnRuntimeCraftObject,
  stripDecorToNetState,
  stripToNetState,
  useMyRoomStore,
} from './useMyRoomStore'

const PALM_GRAB_RADIUS = 0.19
const PALM_SQUEEZE_RADIUS = 0.15

type CompanionHoldState =
  | { type: 'ai-hand'; aiSide: 'left' | 'right' }
  | { type: 'hair' }
  | { type: 'ai-body'; offsetXZ: [number, number] }
  | null

const _worldPos = new THREE.Vector3()
const _worldQuat = new THREE.Quaternion()
const _palmNormal = new THREE.Vector3()
const _objQuat = new THREE.Quaternion()
const _dartHeadQ = new THREE.Quaternion()
const _dartFwd = new THREE.Vector3()
const _dartRight = new THREE.Vector3()
const _dartDir = new THREE.Vector3()
const _dartAimQ = new THREE.Quaternion()
const _dartZeroFwd = new THREE.Vector3(0, 0, -1)
const _dartBarrelFwd = new THREE.Vector3()
const _boardPullPos = new THREE.Vector3()

export function MyRoomARRig() {
  const originRef = useRef<THREE.Group>(null)

  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const referenceSpace = useXR((s) => s.originReferenceSpace)
  const localPeerId = useGameStore((s) => s.localPeerId)
  const inXR = useGameStore((s) => s.inXR)
  const showSelfBody = useMyRoomStore((s) => s.showSelfBody)

  const desktopKeysRef = useRef<Set<string>>(new Set())
  const desktopPosRef = useRef(new THREE.Vector3(0, 1.02, 2.28))
  const desktopYawRef = useRef(0)
  const desktopPitchRef = useRef(-0.025)
  const desktopDragRef = useRef<null | 'look' | 'model'>(null)
  const desktopEulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const desktopFwdRef = useRef(new THREE.Vector3())
  const desktopRightRef = useRef(new THREE.Vector3())

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
  const heldDecorByHandRef = useRef<{ left: string | null; right: string | null }>({
    left: null,
    right: null,
  })
  const heldDartHandRef = useRef<HandSide | null>(null)
  const heldBoardHandRef = useRef<HandSide | null>(null)
  const boardGrabOffsetRef = useRef(new THREE.Vector3())
  const lastBoardDragSyncMsRef = useRef(0)
  const pullingStuckDartRef = useRef<{
    handSide: HandSide
    throwIndex: number
    practiceId: string | null
    startHandPos: [number, number, number]
    boardNormal: [number, number, number]
  } | null>(null)
  const companionHoldRef = useRef<{ left: CompanionHoldState; right: CompanionHoldState }>({
    left: null,
    right: null,
  })
  const dualRestSpanRef = useRef<number | null>(null)
  const prevBButtonRef = useRef(false)
  const lastDeformNetSyncRef = useRef(0)
  const lastTouchHapticRef = useRef(0)
  const lastToolCutMsRef = useRef(0)
  const lastObjPullMsRef = useRef(0)
  const lastTesterContactMsRef = useRef(0)
  const activeStrokePaperIdRef = useRef<string | null>(null)
  const prevToolTipRef = useRef<[number, number, number]>([0, 1.2, 0])
  const prevPalmPosRef = useRef<{ left: [number, number, number]; right: [number, number, number] }>({
    left: [0, 1.2, 0],
    right: [0, 1.2, 0],
  })

  useEffect(() => {
    voiceAudio.ensureListener(camera)
  }, [camera])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyB' || e.code === 'KeyM') {
        useGameStore.getState().toggleVrMenu()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Desktop 3D Preview walk-around & 360° camera look when not inside WebXR headset
  useEffect(() => {
    if (inXR) return
    desktopPosRef.current.set(0, 1.02, 2.28)
    desktopYawRef.current = 0
    desktopPitchRef.current = -0.025
    desktopEulerRef.current.set(-0.025, 0, 0, 'YXZ')
    camera.position.copy(desktopPosRef.current)
    camera.quaternion.setFromEuler(desktopEulerRef.current)
    runtimeState.localPose.headPos = [0, 1.02, 2.28]
    runtimeState.localPose.headQuat = [
      camera.quaternion.x,
      camera.quaternion.y,
      camera.quaternion.z,
      camera.quaternion.w,
    ]

    const canvas = gl.domElement
    const onKeyDown = (e: KeyboardEvent) => {
      desktopKeysRef.current.add(e.code)
      if (e.code === 'KeyR') {
        const st = useMyRoomStore.getState()
        st.setAiAutoRotate(!st.aiAutoRotate)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => desktopKeysRef.current.delete(e.code)
    const onBlur = () => {
      desktopKeysRef.current.clear()
      desktopDragRef.current = null
      myRoomRuntime.ai.desktopRotateDrag = false
      document.body.style.cursor = ''
    }
    const onMouseDown = (e: MouseEvent) => {
      if (myRoomRuntime.ai.desktopRotateDrag || e.button === 2 || (e.button === 0 && e.shiftKey)) {
        desktopDragRef.current = 'model'
        document.body.style.cursor = 'grabbing'
      } else if (e.button === 0) {
        desktopDragRef.current = 'look'
      }
    }
    const onMouseUp = () => {
      desktopDragRef.current = null
      myRoomRuntime.ai.desktopRotateDrag = false
      document.body.style.cursor = ''
    }
    const onMouseMove = (e: MouseEvent) => {
      if (myRoomRuntime.ai.desktopRotateDrag || desktopDragRef.current === 'model') {
        document.body.style.cursor = 'grabbing'
        useMyRoomStore.getState().rotateAiModelBy(e.movementX * 0.0085)
        return
      }
      if (desktopDragRef.current === 'look') {
        desktopYawRef.current -= e.movementX * 0.0032
        desktopPitchRef.current = Math.max(
          -1.35,
          Math.min(1.25, desktopPitchRef.current - e.movementY * 0.0032)
        )
      }
    }
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }
    const onWheel = (e: WheelEvent) => {
      desktopFwdRef.current
        .set(-Math.sin(desktopYawRef.current), 0, -Math.cos(desktopYawRef.current))
        .normalize()
      desktopPosRef.current.addScaledVector(desktopFwdRef.current, -e.deltaY * 0.0018)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.addEventListener('wheel', onWheel, { passive: true })

    return () => {
      document.body.style.cursor = ''
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [inXR, camera, gl])

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

    // Desktop 3D Preview walk-around & camera look when not inside WebXR
    if (!state.gl.xr.isPresenting && !useGameStore.getState().inXR) {
      const keys = desktopKeysRef.current
      const fwd = desktopFwdRef.current
        .set(-Math.sin(desktopYawRef.current), 0, -Math.cos(desktopYawRef.current))
        .normalize()
      const right = desktopRightRef.current
        .set(Math.cos(desktopYawRef.current), 0, -Math.sin(desktopYawRef.current))
        .normalize()
      const moveSpeed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3.8 : 2.3) * cDt
      if (keys.has('KeyW') || keys.has('ArrowUp')) desktopPosRef.current.addScaledVector(fwd, moveSpeed)
      if (keys.has('KeyS') || keys.has('ArrowDown')) desktopPosRef.current.addScaledVector(fwd, -moveSpeed)
      if (keys.has('KeyA') || keys.has('ArrowLeft')) desktopPosRef.current.addScaledVector(right, -moveSpeed)
      if (keys.has('KeyD') || keys.has('ArrowRight')) desktopPosRef.current.addScaledVector(right, moveSpeed)
      if (keys.has('KeyE') || keys.has('Space')) desktopPosRef.current.y += 1.4 * cDt
      if (keys.has('KeyQ') || keys.has('KeyC')) desktopPosRef.current.y -= 1.4 * cDt
      if (keys.has('KeyJ') || keys.has('BracketLeft')) {
        useMyRoomStore.getState().rotateAiModelBy(-1.85 * cDt)
      }
      if (keys.has('KeyL') || keys.has('BracketRight')) {
        useMyRoomStore.getState().rotateAiModelBy(1.85 * cDt)
      }

      const b = myRoomRuntime.roomBoundsXZ
      desktopPosRef.current.x = Math.max(b.minX + 0.25, Math.min(b.maxX - 0.25, desktopPosRef.current.x))
      desktopPosRef.current.z = Math.max(b.minZ + 0.25, Math.min(b.maxZ - 0.25, desktopPosRef.current.z))
      desktopPosRef.current.y = Math.max(
        myRoomRuntime.floorY + 0.45,
        Math.min(myRoomRuntime.floorY + 2.15, desktopPosRef.current.y)
      )

      desktopEulerRef.current.set(desktopPitchRef.current, desktopYawRef.current, 0, 'YXZ')
      camera.position.copy(desktopPosRef.current)
      camera.quaternion.setFromEuler(desktopEulerRef.current)

      // Keep virtual local hands cleanly tucked below portrait center on desktop so HUD stays unobstructed
      const handY = Math.max(myRoomRuntime.floorY + 0.35, desktopPosRef.current.y - 0.56)
      lp.leftPos = [
        desktopPosRef.current.x - right.x * 0.22 + fwd.x * 0.28,
        handY,
        desktopPosRef.current.z - right.z * 0.22 + fwd.z * 0.28,
      ]
      lp.rightPos = [
        desktopPosRef.current.x + right.x * 0.22 + fwd.x * 0.28,
        handY,
        desktopPosRef.current.z + right.z * 0.22 + fwd.z * 0.28,
      ]
    } else {
      // In Meta Quest VR/AR, right controller thumbstick X smoothly rotates the opponent avatar 360°
      const axes = rightController?.inputSource?.gamepad?.axes
      const stickX = axes && axes.length >= 3 ? axes[2] : (axes?.[0] ?? 0)
      if (Math.abs(stickX) > 0.24) {
        useMyRoomStore.getState().rotateAiModelBy(stickX * 2.2 * cDt)
      }
    }

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
      let dartGripPos: [number, number, number] = posArr
      let dartAimQuat: [number, number, number, number] = quatArr
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
        _dartBarrelFwd.set(0, 0, -0.028).applyQuaternion(_worldQuat)
        dartGripPos = [posArr[0] + _dartBarrelFwd.x, posArr[1] + _dartBarrelFwd.y, posArr[2] + _dartBarrelFwd.z]
        dartAimQuat = quatArr
        estimator.push(_worldPos.x, _worldPos.y, _worldPos.z, nowSec)
        if (side === 'left') {
          myRoomRuntime.leftWristPose.valid = false
        } else {
          myRoomRuntime.rightIndexTip.valid = false
        }

        const sq = ctrl.gamepad['xr-standard-squeeze']?.button ?? 0
        const tr = ctrl.gamepad['xr-standard-trigger']?.button ?? 0
        isGrabbing =
          ctrl.gamepad['xr-standard-squeeze']?.state === 'pressed' ||
          ctrl.gamepad['xr-standard-trigger']?.state === 'pressed' ||
          sq > 0.5 ||
          tr > 0.5 ||
          handSelectRef.current[side]
        // Trigger = carry gently; Squeeze/Grip button (or Grip+Trigger) = firm squeeze intensity!
        const gripSqueeze = ctrl.gamepad['xr-standard-squeeze']?.state === 'pressed' ? 0.92 : sq
        const squeezeVal = Math.max(gripSqueeze, (tr > 0.5 && sq > 0.4) ? 0.95 : isGrabbing ? 0.35 : 0.08)
        curls = [squeezeVal * 0.85, tr, gripSqueeze, gripSqueeze, gripSqueeze]
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
          dartGripPos = analysis.dartGripPos ?? posArr
          dartAimQuat = analysis.dartAimQuat ?? quatArr
          curls = analysis.curls
          pinchDist = analysis.pinchDist
          isGrabbing = analysis.isGrabbing
          estimator.push(posArr[0], posArr[1], posArr[2], nowSec)
          if (side === 'left' && analysis.wristWorldPos && analysis.wristWorldQuat) {
            myRoomRuntime.leftWristPose.pos = [...analysis.wristWorldPos]
            myRoomRuntime.leftWristPose.quat = [...analysis.wristWorldQuat]
            myRoomRuntime.leftWristPose.valid = true
          } else if (side === 'right' && analysis.indexTipWorldPos) {
            myRoomRuntime.rightIndexTip.pos = [...analysis.indexTipWorldPos]
            myRoomRuntime.rightIndexTip.valid = true
          }
        }
      }

      // Authentic 3-finger dart pinch posture when actively holding a dart in this hand
      if (heldDartHandRef.current === side) {
        curls = [0.85, 0.78, 0.72, 0.24, 0.18]
      }

      grabStateRef.current[side] = isGrabbing

      // Inward palm vector pointing out of palm into held clay/paper/cloth
      _objQuat.set(quatArr[0], quatArr[1], quatArr[2], quatArr[3])
      if (ctrl?.object) {
        _palmNormal.set(side === 'right' ? -1 : 1, 0, 0).applyQuaternion(_objQuat).normalize()
      } else {
        _palmNormal.set(0, -1, 0).applyQuaternion(_objQuat).normalize()
      }
      const palmNormal: [number, number, number] = [_palmNormal.x, _palmNormal.y, _palmNormal.z]

      // Noticeable bare-hand fist strength (or controller squeeze grip)
      const fistCurlAvg = (curls[1] + curls[2] + curls[3] + curls[4]) / 4
      const palmSqueezeStrength = ctrl?.object
        ? Math.max(curls[2], curls[0] * 0.9)
        : fistCurlAvg * 0.78 + curls[0] * 0.22

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
        dartGripPos,
        dartAimQuat,
        palmNormal,
        isGrabbing,
        pinchDist,
        palmSqueezeStrength,
        hasController: Boolean(ctrl?.object),
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
          foldFactor: obj.foldFactor,
          deformQ: [...obj.deformQ],
          strokes: obj.strokes.map((s) => ({ color: s.color, points: s.points.map((p) => [p[0], p[1]]) })),
          timestamp: Date.now(),
        })
      }
    }

    const myRoomSt = useMyRoomStore.getState()
    const equippedRightTool = myRoomSt.activeTool
    const dg = myRoomSt.dartGame
    const localThrowsCount = dg.throws.filter((t) => t.thrower === 'local').length
    const hasLocalFlyingDart = myRoomRuntime.darts.flyingDarts.some(
      (d) => d.thrower === 'local' && !d.settled
    )
    const isMyDartTurn =
      dg.active &&
      !dg.finished &&
      (dg.turnOwnerId === myId || dg.turnOwnerId === 'local') &&
      localThrowsCount < DARTS_PER_PLAYER &&
      !hasLocalFlyingDart &&
      nowSec - myRoomRuntime.darts.lastThrowAtSec > 0.42

    if (isMyDartTurn) {
      _dartHeadQ.set(lp.headQuat[0], lp.headQuat[1], lp.headQuat[2], lp.headQuat[3])
      _dartFwd.set(0, 0, -1).applyQuaternion(_dartHeadQ).setY(0).normalize()
      _dartRight.set(1, 0, 0).applyQuaternion(_dartHeadQ).setY(0).normalize()
      const caddyPos: [number, number, number] = [
        lp.headPos[0] + _dartFwd.x * 0.42 + _dartRight.x * 0.22,
        Math.max(myRoomRuntime.floorY + 0.55, lp.headPos[1] - 0.16),
        lp.headPos[2] + _dartFwd.z * 0.42 + _dartRight.z * 0.22,
      ]
      if (!myRoomRuntime.darts.readyDart) {
        _dartDir
          .set(
            dg.boardPose.pos[0] - caddyPos[0],
            dg.boardPose.pos[1] - caddyPos[1],
            dg.boardPose.pos[2] - caddyPos[2]
          )
          .normalize()
        _dartAimQ.setFromUnitVectors(_dartZeroFwd, _dartDir)
        myRoomRuntime.darts.readyDart = {
          id: `ready_dart_${dg.matchId}_${localThrowsCount}`,
          thrower: 'local',
          throwerId: myId,
          throwIndex: localThrowsCount,
          inFlight: false,
          settled: false,
          flightTimeSec: 0,
          pos: caddyPos,
          prevPos: [...caddyPos],
          vel: [0, 0, 0],
          quat: [_dartAimQ.x, _dartAimQ.y, _dartAimQ.z, _dartAimQ.w],
        }
      } else if (heldDartHandRef.current === null) {
        myRoomRuntime.darts.readyDart.pos = caddyPos
      }
    } else if (heldDartHandRef.current === null) {
      myRoomRuntime.darts.readyDart = null
    }

    // 1. Acquire / release grabs on left and right hands independently (Stuck/Ready/Fallen Darts, Dartboard, Crafts, Decor, Companion)
    const handleGrabLifecycle = (handRes: ReturnType<typeof readHand>) => {
      // A) Actively holding a dart with 3 fingers (sharp tip pointed forward)
      if (heldDartHandRef.current === handRes.side) {
        const rd = myRoomRuntime.darts.readyDart
        if (!rd) {
          heldDartHandRef.current = null
          return
        }
        if (handRes.isGrabbing) {
          rd.pos = [...handRes.dartGripPos]
          rd.quat = [...handRes.dartAimQuat]
        } else {
          const throwVel = handRes.estimator.computeVelocity(nowSec, 1.5, 12.0)
          const speed = Math.hypot(throwVel[0], throwVel[1], throwVel[2])
          heldDartHandRef.current = null
          handRes.estimator.reset()
          if (speed > 1.15 || rd.isPractice) {
            rd.inFlight = true
            rd.settled = false
            rd.flightTimeSec = 0
            rd.prevPos = [...handRes.dartGripPos]
            rd.pos = [...handRes.dartGripPos]
            rd.quat = [...handRes.dartAimQuat]
            rd.vel =
              speed > 1.15
                ? [...throwVel]
                : [throwVel[0] * 0.45, Math.min(-0.18, throwVel[1]), throwVel[2] * 0.45]
            myRoomRuntime.darts.flyingDarts.push(rd)
            myRoomRuntime.darts.readyDart = null
            if (!rd.isPractice) {
              myRoomRuntime.darts.lastThrowAtSec = nowSec
            }
            if (speed > 1.15) {
              playThrowSfx(speed)
              pulseXRControllerHaptics(handRes.activeInput, 0.55, 40)
            }
          }
        }
        return
      }

      // B) Actively carrying & placing the Dartboard by hand
      if (heldBoardHandRef.current === handRes.side) {
        const curBoard = useMyRoomStore.getState().dartGame.boardPose
        const desiredPos: [number, number, number] = [
          handRes.posArr[0] + boardGrabOffsetRef.current.x,
          handRes.posArr[1] + boardGrabOffsetRef.current.y,
          handRes.posArr[2] + boardGrabOffsetRef.current.z,
        ]
        if (handRes.isGrabbing) {
          myRoomRuntime.darts.boardGrabbedByLocal = true
          const nx = lp.headPos[0] - desiredPos[0]
          const nz = lp.headPos[2] - desiredPos[2]
          const nLen = Math.hypot(nx, nz) || 1
          const ux = nx / nLen
          const uz = nz / nLen
          const nowMs = performance.now()
          if (
            nowMs - lastBoardDragSyncMsRef.current > 40 ||
            Math.hypot(desiredPos[0] - curBoard.pos[0], desiredPos[2] - curBoard.pos[2]) > 0.015
          ) {
            lastBoardDragSyncMsRef.current = nowMs
            useMyRoomStore.getState().relocateDartboard(
              {
                pos: [desiredPos[0], Math.max(myRoomRuntime.floorY + 0.48, desiredPos[1]), desiredPos[2]],
                normal: [ux, 0, uz],
                yaw: Math.atan2(ux, uz),
                mountedOnWall: false,
              },
              false
            )
          }
        } else {
          heldBoardHandRef.current = null
          myRoomRuntime.darts.boardGrabbedByLocal = false
          const placed = snapHandDartboardPose(
            desiredPos,
            lp.headPos,
            getCombinedRoomSurfaces(),
            myRoomRuntime.floorY,
            myRoomRuntime.roomBoundsXZ
          )
          useMyRoomStore.getState().relocateDartboard(placed, true)
          playMaterialActionSfx('wood', 'watch_tap')
          pulseXRControllerHaptics(handRes.activeInput, 0.5, 35)
        }
        return
      }

      // C) Physically pulling a stuck dart straight out of the dartboard cork
      if (pullingStuckDartRef.current?.handSide === handRes.side) {
        const pull = pullingStuckDartRef.current
        if (!handRes.isGrabbing) {
          pullingStuckDartRef.current = null
          myRoomRuntime.darts.pullingVisual = null
          return
        }
        const dx = handRes.posArr[0] - pull.startHandPos[0]
        const dy = handRes.posArr[1] - pull.startHandPos[1]
        const dz = handRes.posArr[2] - pull.startHandPos[2]
        const alongNormal = dx * pull.boardNormal[0] + dy * pull.boardNormal[1] + dz * pull.boardNormal[2]
        const pullDist = Math.max(0, Math.min(0.085, alongNormal))
        myRoomRuntime.darts.pullingVisual = { throwIndex: pull.throwIndex, pullOffsetM: pullDist }

        if (pullDist >= 0.062 || Math.hypot(dx, dy, dz) >= 0.125) {
          pullingStuckDartRef.current = null
          myRoomRuntime.darts.pullingVisual = null
          if (pull.practiceId) {
            const idx = myRoomRuntime.darts.practiceDarts.findIndex((d) => d.id === pull.practiceId)
            if (idx >= 0) myRoomRuntime.darts.practiceDarts.splice(idx, 1)
          } else {
            useMyRoomStore.getState().pullDartRecord(pull.throwIndex, true)
          }
          myRoomRuntime.darts.readyDart = {
            id: `pulled_dart_${dg.matchId}_${Date.now()}`,
            thrower: 'local',
            throwerId: myId,
            throwIndex: localThrowsCount,
            isPractice: true,
            inFlight: false,
            settled: false,
            flightTimeSec: 0,
            pos: [...handRes.dartGripPos],
            prevPos: [...handRes.dartGripPos],
            vel: [0, 0, 0],
            quat: [...handRes.dartAimQuat],
          }
          heldDartHandRef.current = handRes.side
          handRes.estimator.reset()
          playMaterialActionSfx('wood', 'dart_hit')
          pulseXRControllerHaptics(handRes.activeInput, 0.65, 45)
        }
        return
      }

      const heldDecorId = heldDecorByHandRef.current[handRes.side]
      if (heldDecorId !== null) {
        const decor = myRoomRuntime.decorItems.get(heldDecorId)
        if (!decor) {
          heldDecorByHandRef.current[handRes.side] = null
          return
        }
        if (handRes.isGrabbing) {
          decor.pos = [...handRes.posArr]
        } else {
          heldDecorByHandRef.current[handRes.side] = null
          decor.isHeldByLocal = false
          decor.ownerId = null
          const combined = getCombinedRoomSurfaces()
          const spec = ROOM_DECOR_CATALOG[decor.kind]
          const snappedWall = snapDecorNearWallIfClose(decor, combined, 0.36)
          if (!snappedWall) {
            if (spec.mount === 'floor') {
              const [cx, cz] = clampInsideRoomWalls(
                decor.pos[0],
                decor.pos[2],
                Math.min(spec.halfExtents[0], spec.halfExtents[2]) * decor.scale,
                combined,
                myRoomRuntime.roomBoundsXZ
              )
              decor.pos = [cx, myRoomRuntime.floorY + spec.halfExtents[1] * decor.scale, cz]
            } else if (spec.mount === 'tabletop') {
              const sup = findSupportingSurfaceY(
                decor.pos[0],
                decor.pos[2],
                combined,
                myRoomRuntime.floorY,
                decor.pos[1] + 0.12
              )
              decor.pos[1] = sup.y + spec.halfExtents[1] * decor.scale
            }
          }
          decor.epoch += 1
          decor.timestamp = Date.now()
          useMyRoomStore.getState().setSelectedDecorId(decor.id)
          useMyRoomStore.getState().bumpDecorVersion()
          myRoomRuntime.onDecorSend?.(stripDecorToNetState(decor))
        }
        return
      }

      const heldId = heldByHandRef.current[handRes.side]
      if (heldId !== null) {
        const obj = myRoomRuntime.objects.get(heldId)
        if (!obj) {
          heldByHandRef.current[handRes.side] = null
          return
        }
        if (!handRes.isGrabbing) {
          // Released object into real AR room physics weighted by real material mass & drag!
          heldByHandRef.current[handRes.side] = null
          const otherHeld = heldByHandRef.current[handRes.side === 'left' ? 'right' : 'left']
          if (otherHeld !== heldId) {
            const spec = MATERIAL_PHYSICS[obj.kind]
            const vel = handRes.estimator.computeVelocity(nowSec, spec.throwGain, spec.maxThrowSpeed)
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
      } else if (handRes.isGrabbing && !(handRes.side === 'right' && equippedRightTool !== 'none')) {
        // 1) Grab stuck dart on dartboard first so user can pull darts cleanly off the cork
        if (dg.active && heldDartHandRef.current === null && !pullingStuckDartRef.current) {
          const bp = dg.boardPose
          const rightX = bp.normal[2]
          const rightZ = -bp.normal[0]
          const rLen = Math.hypot(rightX, rightZ) || 1
          const rx = rightX / rLen
          const rz = rightZ / rLen

          let bestStuckIdx = -1
          let bestPracticeId: string | null = null
          let bestStuckDist = 0.105

          dg.throws.forEach((rec, idx) => {
            if (!rec.stuck || rec.pulled) return
            const wx = bp.pos[0] + rx * rec.localX + bp.normal[0] * 0.068
            const wy = bp.pos[1] + rec.localY
            const wz = bp.pos[2] + rz * rec.localX + bp.normal[2] * 0.068
            const d = Math.hypot(handRes.posArr[0] - wx, handRes.posArr[1] - wy, handRes.posArr[2] - wz)
            if (d < bestStuckDist) {
              bestStuckDist = d
              bestStuckIdx = idx
              bestPracticeId = null
            }
          })
          myRoomRuntime.darts.practiceDarts.forEach((pd) => {
            if (!pd.stuckOnBoardLocal) return
            const wx = bp.pos[0] + rx * pd.stuckOnBoardLocal[0] + bp.normal[0] * 0.068
            const wy = bp.pos[1] + pd.stuckOnBoardLocal[1]
            const wz = bp.pos[2] + rz * pd.stuckOnBoardLocal[0] + bp.normal[2] * 0.068
            const d = Math.hypot(handRes.posArr[0] - wx, handRes.posArr[1] - wy, handRes.posArr[2] - wz)
            if (d < bestStuckDist) {
              bestStuckDist = d
              bestStuckIdx = -1
              bestPracticeId = pd.id
            }
          })

          if (bestStuckIdx >= 0 || bestPracticeId) {
            pullingStuckDartRef.current = {
              handSide: handRes.side,
              throwIndex: bestStuckIdx,
              practiceId: bestPracticeId,
              startHandPos: [...handRes.posArr],
              boardNormal: [...bp.normal],
            }
            pulseXRControllerHaptics(handRes.activeInput, 0.35, 24)
            return
          }
        }

        // 2) Pick up hovering Ready Dart if your Dart Turn is active!
        const rd = myRoomRuntime.darts.readyDart
        if (rd && heldDartHandRef.current === null && isMyDartTurn) {
          const dDart = Math.hypot(
            rd.pos[0] - handRes.posArr[0],
            rd.pos[1] - handRes.posArr[1],
            rd.pos[2] - handRes.posArr[2]
          )
          if (dDart < 0.25) {
            heldDartHandRef.current = handRes.side
            handRes.estimator.reset()
            pulseXRControllerHaptics(handRes.activeInput, 0.4, 28)
            return
          }
        }

        // 3) Pick up a fallen dart resting on the floor or supporting plane!
        if (dg.active && heldDartHandRef.current === null) {
          let pickedFloorThrowIdx = -1
          let pickedFloorPracticeIdx = -1
          let bestFloorDist = 0.16
          dg.throws.forEach((rec, idx) => {
            if (rec.stuck || rec.pulled || !rec.worldPos) return
            const d = Math.hypot(
              handRes.posArr[0] - rec.worldPos[0],
              handRes.posArr[1] - rec.worldPos[1],
              handRes.posArr[2] - rec.worldPos[2]
            )
            if (d < bestFloorDist) {
              bestFloorDist = d
              pickedFloorThrowIdx = idx
            }
          })
          myRoomRuntime.darts.practiceDarts.forEach((pd, idx) => {
            if (pd.stuckOnBoardLocal) return
            const d = Math.hypot(
              handRes.posArr[0] - pd.pos[0],
              handRes.posArr[1] - pd.pos[1],
              handRes.posArr[2] - pd.pos[2]
            )
            if (d < bestFloorDist) {
              bestFloorDist = d
              pickedFloorThrowIdx = -1
              pickedFloorPracticeIdx = idx
            }
          })

          if (pickedFloorThrowIdx >= 0 || pickedFloorPracticeIdx >= 0) {
            if (pickedFloorThrowIdx >= 0) {
              useMyRoomStore.getState().pullDartRecord(pickedFloorThrowIdx, true)
            } else {
              myRoomRuntime.darts.practiceDarts.splice(pickedFloorPracticeIdx, 1)
            }
            myRoomRuntime.darts.readyDart = {
              id: `picked_dart_${dg.matchId}_${Date.now()}`,
              thrower: 'local',
              throwerId: myId,
              throwIndex: localThrowsCount,
              isPractice: true,
              inFlight: false,
              settled: false,
              flightTimeSec: 0,
              pos: [...handRes.dartGripPos],
              prevPos: [...handRes.dartGripPos],
              vel: [0, 0, 0],
              quat: [...handRes.dartAimQuat],
            }
            heldDartHandRef.current = handRes.side
            handRes.estimator.reset()
            pulseXRControllerHaptics(handRes.activeInput, 0.4, 28)
            return
          }
        }

        // Check if grabbing a craft object first; if none in reach, check Decor, Dartboard, or AI Companion!
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
        } else {
          // Check nearby Room Redesign Decor items (Wallmate, Table Lamp, TV, Table, Showcase, Plant, Clock)
          let bestDecor: RuntimeRoomDecor | null = null
          let bestDecorDist = Infinity
          myRoomRuntime.decorItems.forEach((cand) => {
            const spec = ROOM_DECOR_CATALOG[cand.kind]
            const reach = Math.max(spec.halfExtents[0], spec.halfExtents[1], spec.halfExtents[2]) * cand.scale + 0.16
            const d = Math.hypot(
              cand.pos[0] - handRes.posArr[0],
              cand.pos[1] - handRes.posArr[1],
              cand.pos[2] - handRes.posArr[2]
            )
            if (d <= reach && d < bestDecorDist) {
              bestDecorDist = d
              bestDecor = cand
            }
          })

          if (bestDecor) {
            const pickedDecor: RuntimeRoomDecor = bestDecor
            heldDecorByHandRef.current[handRes.side] = pickedDecor.id
            pickedDecor.isHeldByLocal = true
            pickedDecor.ownerId = myId
            pickedDecor.epoch += 1
            pickedDecor.timestamp = Date.now()
            useMyRoomStore.getState().setSelectedDecorId(pickedDecor.id)
            pulseXRControllerHaptics(handRes.activeInput, 0.4, 28)
            myRoomRuntime.onDecorSend?.(stripDecorToNetState(pickedDecor))
          } else if (
            dg.active &&
            heldBoardHandRef.current === null &&
            Math.hypot(
              handRes.posArr[0] - dg.boardPose.pos[0],
              handRes.posArr[1] - dg.boardPose.pos[1],
              handRes.posArr[2] - dg.boardPose.pos[2]
            ) < DARTBOARD_RADIUS + 0.14
          ) {
            // Grab/Catch Dartboard directly by hand to reposition & snap on wall or place cleanly anywhere
            heldBoardHandRef.current = handRes.side
            myRoomRuntime.darts.boardGrabbedByLocal = true
            boardGrabOffsetRef.current.set(
              dg.boardPose.pos[0] - handRes.posArr[0],
              dg.boardPose.pos[1] - handRes.posArr[1],
              dg.boardPose.pos[2] - handRes.posArr[2]
            )
            pulseXRControllerHaptics(handRes.activeInput, 0.45, 32)
            useMyRoomStore.getState().setStatusHint('Carrying Dartboard — release near wall or in room to place!')
          } else if (
            myRoomSt.showAiOpponent &&
            companionHoldRef.current[handRes.side] === null &&
            useGameStore.getState().peers &&
            (myRoomSt.opponentMode === 'computer' ||
              (myRoomSt.opponentMode === 'auto' &&
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
            const dBodyXZ = Math.hypot(handRes.posArr[0] - ai.pos[0], handRes.posArr[2] - ai.pos[2])
            const inBodyY =
              handRes.posArr[1] >= myRoomRuntime.floorY + 0.65 &&
              handRes.posArr[1] <= myRoomRuntime.floorY + 1.56
            if (dHair < 0.18) {
              companionHoldRef.current[handRes.side] = { type: 'hair' }
              pulseXRControllerHaptics(handRes.activeInput, 0.35, 30)
              useMyRoomStore.getState().setStatusHint('Holding companion hair — pull to guide her')
            } else if (dLeftHand < 0.19) {
              companionHoldRef.current[handRes.side] = { type: 'ai-hand', aiSide: 'left' }
              pulseXRControllerHaptics(handRes.activeInput, 0.35, 30)
              useMyRoomStore.getState().setStatusHint('Holding companion hand — lead where you pull')
            } else if (dRightHand < 0.19) {
              companionHoldRef.current[handRes.side] = { type: 'ai-hand', aiSide: 'right' }
              pulseXRControllerHaptics(handRes.activeInput, 0.35, 30)
              useMyRoomStore.getState().setStatusHint('Holding companion hand — lead where you pull')
            } else if (dBodyXZ < 0.3 && inBodyY) {
              companionHoldRef.current[handRes.side] = {
                type: 'ai-body',
                offsetXZ: [ai.pos[0] - handRes.posArr[0], ai.pos[2] - handRes.posArr[2]],
              }
              pulseXRControllerHaptics(handRes.activeInput, 0.42, 32)
              useMyRoomStore.getState().setStatusHint('Holding companion — move hand to guide her')
            }
          }
        }
      }
    }

    handleGrabLifecycle(leftRes)
    handleGrabLifecycle(rightRes)

    // Update tactile Computer Companion interactions & live Pull-Follow locomotion
    const ai = myRoomRuntime.ai
    ai.heldHandByUser = null
    ai.hairPullTarget = null
    ai.touchedShoulderSide = null
    ai.followPullTargetXZ = null

    ;[leftRes, rightRes].forEach((hRes) => {
      const hold = companionHoldRef.current[hRes.side]
      if (hold) {
        if (!hRes.isGrabbing) {
          companionHoldRef.current[hRes.side] = null
        } else if (hold.type === 'ai-hand') {
          ai.heldHandByUser = hold.aiSide
          if (hold.aiSide === 'left') ai.leftHand = [...hRes.posArr]
          else ai.rightHand = [...hRes.posArr]
          // Pull companion gently along behind your hand once extended beyond natural 30cm arm slack
          const dxA = ai.pos[0] - hRes.posArr[0]
          const dzA = ai.pos[2] - hRes.posArr[2]
          const dXZ = Math.hypot(dxA, dzA)
          if (dXZ > 0.3) {
            ai.followPullTargetXZ = [
              hRes.posArr[0] + (dxA / dXZ) * 0.28,
              hRes.posArr[2] + (dzA / dXZ) * 0.28,
            ]
          }
        } else if (hold.type === 'ai-body') {
          _boardPullPos.set(
            hRes.posArr[0] + hold.offsetXZ[0],
            ai.pos[1],
            hRes.posArr[2] + hold.offsetXZ[1]
          )
          ai.followPullTargetXZ = [_boardPullPos.x, _boardPullPos.z]
        } else if (hold.type === 'hair') {
          ai.hairPullTarget = [...hRes.posArr]
          const pdx = hRes.posArr[0] - ai.hairWorldPos[0]
          const pdy = hRes.posArr[1] - ai.hairWorldPos[1]
          const cosY = Math.cos(ai.yaw)
          const sinY = Math.sin(ai.yaw)
          const localSide = pdx * cosY - (hRes.posArr[2] - ai.hairWorldPos[2]) * sinY
          ai.headReactRoll = Math.max(-0.32, Math.min(0.32, -localSide * 1.4))
          ai.headReactPitch = Math.max(-0.28, Math.min(0.28, -pdy * 1.2))
          const dxA = ai.pos[0] - hRes.posArr[0]
          const dzA = ai.pos[2] - hRes.posArr[2]
          const dXZ = Math.hypot(dxA, dzA)
          if (dXZ > 0.22) {
            ai.followPullTargetXZ = [
              hRes.posArr[0] + (dxA / dXZ) * 0.16,
              hRes.posArr[2] + (dzA / dXZ) * 0.16,
            ]
          }
        }
      }

      const prevPalm = prevPalmPosRef.current[hRes.side]
      const palmVelX = (hRes.posArr[0] - prevPalm[0]) / Math.max(0.008, cDt)
      const palmVelZ = (hRes.posArr[2] - prevPalm[2]) / Math.max(0.008, cDt)
      prevPalmPosRef.current[hRes.side] = [...hRes.posArr]

      // Distance "Pull To Me" gesture:
      // 1) Companion pull if opponent went >1.25m away
      // 2) Telekinetic / Distant Object Pull if hand aims at an unheld Wood/Metal/Clay/Paper piece >0.38m away and pulls toward chest!
      if (heldByHandRef.current[hRes.side] === null && !companionHoldRef.current[hRes.side] && hRes.isGrabbing) {
        const toUserX = lp.headPos[0] - hRes.posArr[0]
        const toUserZ = lp.headPos[2] - hRes.posArr[2]
        const uLen = Math.hypot(toUserX, toUserZ) || 1
        const pullingTowardMe = (palmVelX * toUserX + palmVelZ * toUserZ) / uLen
        const palmFromHeadX = hRes.posArr[0] - lp.headPos[0]
        const palmFromHeadZ = hRes.posArr[2] - lp.headPos[2]
        const pLen = Math.hypot(palmFromHeadX, palmFromHeadZ) || 1

        if (pullingTowardMe > 0.34) {
          // Check distant craft objects along aim vector first so building Wood/Metal structures is effortless!
          const nowMs = performance.now()
          if (nowMs - lastObjPullMsRef.current > 420) {
            let bestPullObj: RuntimeCraftObject | null = null
            let bestPullScore = -1
            myRoomRuntime.objects.forEach((cand) => {
              if (cand.isHeldByLocal || cand.ownerId !== null) return
              const ox = cand.pos[0] - hRes.posArr[0]
              const oy = cand.pos[1] - hRes.posArr[1]
              const oz = cand.pos[2] - hRes.posArr[2]
              const oDist = Math.hypot(ox, oy, oz)
              if (oDist < 0.36 || oDist > 4.2) return
              const aimCos =
                ((cand.pos[0] - lp.headPos[0]) * palmFromHeadX +
                  (cand.pos[2] - lp.headPos[2]) * palmFromHeadZ) /
                (Math.hypot(cand.pos[0] - lp.headPos[0], cand.pos[2] - lp.headPos[2]) * pLen || 1)
              if (aimCos > 0.58 && aimCos > bestPullScore) {
                bestPullScore = aimCos
                bestPullObj = cand
              }
            })

            if (bestPullObj) {
              const pulled: RuntimeCraftObject = bestPullObj
              const dx = hRes.posArr[0] - pulled.pos[0]
              const dy = hRes.posArr[1] - pulled.pos[1]
              const dz = hRes.posArr[2] - pulled.pos[2]
              const dist = Math.hypot(dx, dy, dz) || 1
              const pullSpeed = Math.min(4.2, 1.9 + dist * 0.95)
              pulled.vel = [(dx / dist) * pullSpeed, (dy / dist) * pullSpeed + 1.15, (dz / dist) * pullSpeed]
              lastObjPullMsRef.current = nowMs
              pulseXRControllerHaptics(hRes.activeInput, 0.42, 35)
              useMyRoomStore
                .getState()
                .setStatusHint(`Pulling ${MATERIAL_PHYSICS[pulled.kind].label} toward you!`)
            }
          }

          const aiXZDist = Math.hypot(ai.pos[0] - lp.headPos[0], ai.pos[2] - lp.headPos[2])
          if (myRoomSt.showAiOpponent && aiXZDist > 1.25) {
            const toAiX = ai.pos[0] - lp.headPos[0]
            const toAiZ = ai.pos[2] - lp.headPos[2]
            const handAimAtAi = (toAiX * palmFromHeadX + toAiZ * palmFromHeadZ) / (aiXZDist * pLen)
            if (handAimAtAi > 0.55 && !ai.pullToUserActive) {
              ai.pullToUserActive = true
              pulseXRControllerHaptics(hRes.activeInput, 0.55, 50)
              useMyRoomStore.getState().setStatusHint('Pulling companion back nearest to you!')
            }
          }
        }
      }

      if (
        myRoomSt.showAiOpponent &&
        heldByHandRef.current[hRes.side] === null &&
        !companionHoldRef.current[hRes.side]
      ) {
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

    // 2. Bimanual Two-Hand Manipulation: Tear Down OR Fold (Paper/Cloth) OR Palm Squeeze!
    if (leftId !== null && leftId === rightId) {
      const obj = myRoomRuntime.objects.get(leftId)
      if (obj) {
        const spec = MATERIAL_PHYSICS[obj.kind]
        const span = Math.hypot(
          rightRes.posArr[0] - leftRes.posArr[0],
          rightRes.posArr[1] - leftRes.posArr[1],
          rightRes.posArr[2] - leftRes.posArr[2]
        )
        if (dualRestSpanRef.current === null) {
          dualRestSpanRef.current = Math.max(0.08, span)
        }

        // Tear Check: pulling both palms strongly apart rips Paper, Cloth or splits Clay (rejected for Wood/Metal!)
        const tearThreshold = Math.max(obj.meshData.approxRadius * 1.55, dualRestSpanRef.current * 1.45) + 0.11
        if (span > tearThreshold) {
          if (!spec.canTear) {
            playMaterialActionSfx(obj.kind, 'reject')
            pulseXRControllerHaptics(rightRes.activeInput, 0.45, 35)
            useMyRoomStore.getState().setStatusHint(`Solid ${spec.label} cannot be torn or squeezed!`)
          } else {
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
              playMaterialActionSfx(baseKind, 'tear')
              useMyRoomStore.getState().setStatusHint(`Tore ${spec.label} into two pieces!`)
              pulseXRControllerHaptics(leftRes.activeInput, 0.9, 85)
              pulseXRControllerHaptics(rightRes.activeInput, 0.9, 85)
              return
            }
          }
        }

        // Keep object centered smoothly between both palms
        obj.pos = [
          (leftRes.posArr[0] + rightRes.posArr[0]) * 0.5,
          (leftRes.posArr[1] + rightRes.posArr[1]) * 0.5,
          (leftRes.posArr[2] + rightRes.posArr[2]) * 0.5,
        ]
        obj.quat = [...rightRes.quatArr]

        const compress = Math.max(0, (dualRestSpanRef.current - span) / 0.11)
        const squeezeIntensity = Math.min(
          1,
          Math.max(
            compress,
            (leftRes.palmSqueezeStrength + rightRes.palmSqueezeStrength) * 0.5
          )
        )

        if (compress > 0.08 || squeezeIntensity > 0.28) {
          if (spec.canFold && (!spec.canSqueeze || (compress > 0.1 && squeezeIntensity < 0.72))) {
            // Folding Paper (fold-only!) or gently folding Cloth cleanly along the center hinge axis!
            const fRes = foldCraftWithHands(
              obj.meshData,
              obj.kind,
              obj.quat,
              leftRes.posArr,
              rightRes.posArr,
              obj.foldFactor,
              cDt * (1.05 + compress * 1.45)
            )
            if (fRes.dirty) {
              obj.foldFactor = fRes.nextFold
              obj.deformQ = encodeDeformOffsets(
                obj.meshData.restPositions,
                obj.meshData.currPositions
              )
              obj.dirtyNetwork = true
              syncDirtyObject(obj, false)
              playMaterialActionSfx(obj.kind, 'fold')
              useMyRoomStore.getState().setStatusHint(`Folded ${spec.label}!`)
            }
          } else if (!spec.canSqueeze) {
            playMaterialActionSfx(obj.kind, 'reject')
            useMyRoomStore.getState().setStatusHint(`Solid ${spec.label} cannot be squeezed!`)
          } else {
            // Two-palm axis compression: volume-preserving Clay reshape or soft Cloth crumpling
            const squeezeDirX = rightRes.posArr[0] - leftRes.posArr[0]
            const squeezeDirY = rightRes.posArr[1] - leftRes.posArr[1]
            const squeezeDirZ = rightRes.posArr[2] - leftRes.posArr[2]
            const sdLen = Math.hypot(squeezeDirX, squeezeDirY, squeezeDirZ) || 1
            const nLeft: [number, number, number] = [squeezeDirX / sdLen, squeezeDirY / sdLen, squeezeDirZ / sdLen]
            const nRight: [number, number, number] = [-nLeft[0], -nLeft[1], -nLeft[2]]

            const rA = squeezeCraftWithPalm(
              obj.meshData,
              obj.kind,
              obj.pos,
              obj.quat,
              leftRes.posArr,
              nLeft,
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
              nRight,
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
              playMaterialActionSfx(obj.kind, 'squeeze')
              pulseXRControllerHaptics(leftRes.activeInput, 0.28, 20)
              pulseXRControllerHaptics(rightRes.activeInput, 0.28, 20)
            }
          }
        }
      }
    } else {
      dualRestSpanRef.current = null

      // Single-hand carry + responsive squeeze when closing fist or pressing Grip
      const processSingleHeld = (handRes: ReturnType<typeof readHand>, objId: string | null) => {
        if (!objId) return
        const obj = myRoomRuntime.objects.get(objId)
        if (!obj) return
        obj.pos = [...handRes.posArr]
        obj.quat = [...handRes.quatArr]

        const spec = MATERIAL_PHYSICS[obj.kind]
        if (handRes.palmSqueezeStrength > 0.48) {
          if (!spec.canSqueeze) {
            if (!spec.canFold) {
              playMaterialActionSfx(obj.kind, 'reject')
              useMyRoomStore.getState().setStatusHint(`Solid ${spec.label} cannot be squeezed!`)
            }
            return
          }
          const squeezeAmt = Math.min(1, Math.max(0.28, (handRes.palmSqueezeStrength - 0.36) * 1.9))
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
            playMaterialActionSfx(obj.kind, 'squeeze')
            pulseXRControllerHaptics(handRes.activeInput, 0.22, 16)
          }
        }
      }

      processSingleHeld(leftRes, leftId)
      processSingleHeld(rightRes, rightId)
    }

    // 3. Direct Open-Palm / Free-Hand Press Deformation (Clay & Cloth only — Paper folds with 2 hands, Wood/Metal rigid!)
    const applyFreePalmSculpt = (handRes: ReturnType<typeof readHand>, heldId: string | null) => {
      if (heldId !== null) return
      if (handRes.side === 'right' && equippedRightTool !== 'none') return
      myRoomRuntime.objects.forEach((obj) => {
        if (obj.isHeldByLocal) return
        const d = Math.hypot(
          obj.pos[0] - handRes.posArr[0],
          obj.pos[1] - handRes.posArr[1],
          obj.pos[2] - handRes.posArr[2]
        )
        if (d <= obj.meshData.approxRadius + PALM_SQUEEZE_RADIUS && handRes.palmSqueezeStrength > 0.18) {
          const spec = MATERIAL_PHYSICS[obj.kind]
          if (!spec.canSqueeze) {
            if (!spec.canFold) playMaterialActionSfx(obj.kind, 'reject')
            return
          }
          const res = squeezeCraftWithPalm(
            obj.meshData,
            obj.kind,
            obj.pos,
            obj.quat,
            handRes.posArr,
            handRes.palmNormal,
            Math.max(0.45, handRes.palmSqueezeStrength),
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
            playMaterialActionSfx(obj.kind, 'squeeze')
          }
        }
      })
    }

    applyFreePalmSculpt(leftRes, leftId)
    applyFreePalmSculpt(rightRes, rightId)

    // 4. Active Left-Watch Machinery Tool Interactions (Pen on Paper, Knife/Axe on Wood, Electric Tester)
    if (equippedRightTool !== 'none') {
      const { tipPos, cutNormal } = computeRightToolWorldTransform(
        equippedRightTool,
        rightRes.posArr,
        rightRes.quatArr,
        rightRes.hasController
      )
      const prevTip = prevToolTipRef.current
      const tipSpeed =
        Math.hypot(tipPos[0] - prevTip[0], tipPos[1] - prevTip[1], tipPos[2] - prevTip[2]) /
        Math.max(0.008, cDt)
      prevToolTipRef.current = [...tipPos]

      const nowMs = performance.now()
      const inkColor = useMyRoomStore.getState().activeInkColor
      const distPointToObjectSurface = (obj: RuntimeCraftObject, pt: [number, number, number]) => {
        const b = computeWorldObjectBox({
          pos: obj.pos,
          quat: obj.quat,
          approxRadius: obj.meshData.approxRadius,
          halfExtents: obj.meshData.halfExtents,
          localCenter: obj.meshData.localCenter,
        })
        const dx = Math.max(0, Math.abs(pt[0] - b.cx) - b.hx)
        const dy = Math.max(0, Math.abs(pt[1] - b.cy) - b.hy)
        const dz = Math.max(0, Math.abs(pt[2] - b.cz) - b.hz)
        return Math.hypot(dx, dy, dz)
      }

      if (equippedRightTool === 'pen') {
        let wrotePaperId: string | null = null
        myRoomRuntime.objects.forEach((obj) => {
          if (obj.kind !== 'paper' || wrotePaperId) return
          const approx = obj.meshData.approxRadius + 0.08
          if (
            Math.hypot(obj.pos[0] - tipPos[0], obj.pos[1] - tipPos[1], obj.pos[2] - tipPos[2]) > approx
          ) {
            return
          }
          const hit = projectWorldTipOntoPaperUV(obj.meshData, obj.pos, obj.quat, tipPos, 0.038)
          if (hit.hit) {
            wrotePaperId = obj.id
            const continuingSame =
              activeStrokePaperIdRef.current === obj.id && obj.strokes.length > 0
            if (continuingSame) {
              const curStroke = obj.strokes[obj.strokes.length - 1]
              const lastPt = curStroke.points[curStroke.points.length - 1]
              if (
                !lastPt ||
                Math.hypot(hit.uv[0] - lastPt[0], hit.uv[1] - lastPt[1]) > 0.009
              ) {
                curStroke.points.push(hit.uv)
                obj.strokeVersion += 1
                obj.dirtyNetwork = true
                syncDirtyObject(obj, false)
                playMaterialActionSfx('paper', 'pen_write')
              }
            } else {
              obj.strokes.push({ color: inkColor, points: [hit.uv] })
              obj.strokeVersion += 1
              obj.dirtyNetwork = true
              syncDirtyObject(obj, false)
              playMaterialActionSfx('paper', 'pen_write')
              pulseXRControllerHaptics(rightRes.activeInput, 0.16, 12)
            }
          }
        })
        activeStrokePaperIdRef.current = wrotePaperId
      } else if (equippedRightTool === 'knife' || equippedRightTool === 'axe') {
        const minSpeed = equippedRightTool === 'axe' ? 0.2 : 0.12
        const cutCooldownMs = equippedRightTool === 'axe' ? 720 : 620
        if ((tipSpeed > minSpeed || rightRes.isGrabbing) && nowMs - lastToolCutMsRef.current > cutCooldownMs) {
          let hitCutObj: RuntimeCraftObject | null = null
          let hitDist = Infinity
          myRoomRuntime.objects.forEach((obj) => {
            const d = distPointToObjectSurface(obj, tipPos)
            if (d <= 0.042 && d < hitDist) {
              hitDist = d
              hitCutObj = obj
            }
          })

          if (hitCutObj) {
            const target: RuntimeCraftObject = hitCutObj
            lastToolCutMsRef.current = nowMs
            if (target.kind === 'metal') {
              playMaterialActionSfx('metal', 'reject')
              pulseXRControllerHaptics(rightRes.activeInput, 0.45, 35)
              useMyRoomStore
                .getState()
                .setStatusHint('Metal is too hard for Knife/Axe — check with Electric Tester!')
            } else {
              const split = computeBladeCutDeforms(
                target.meshData,
                target.kind,
                target.pos,
                target.quat,
                tipPos,
                cutNormal,
                target.tearGeneration
              )
              if (split.canCut) {
                const basePos: [number, number, number] = [...target.pos]
                const baseQuat: [number, number, number, number] = [...target.quat]
                const baseKind = target.kind
                const basePreset = target.preset
                const baseColor = target.color
                const baseStrokes = target.strokes.map((s) => ({
                  color: s.color,
                  points: s.points.map((p) => [p[0], p[1]] as [number, number]),
                }))
                const nextScale = target.scale * split.childScale
                const nextGen = target.tearGeneration + 1
                const chopPop = equippedRightTool === 'axe' ? 0.45 : 0.18

                if (heldByHandRef.current.left === target.id) heldByHandRef.current.left = null
                deleteRuntimeCraftObject(target.id, true)

                spawnRuntimeCraftObject({
                  ownerId: null,
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
                  vel: [-cutNormal[0] * chopPop, 0.25, -cutNormal[2] * chopPop],
                  scale: nextScale,
                  tearGeneration: nextGen,
                  deformQ: split.leftDeformQ,
                  strokes: baseStrokes,
                  broadcast: true,
                })
                spawnRuntimeCraftObject({
                  ownerId: null,
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
                  vel: [cutNormal[0] * chopPop, 0.25, cutNormal[2] * chopPop],
                  scale: nextScale,
                  tearGeneration: nextGen,
                  deformQ: split.rightDeformQ,
                  strokes: baseStrokes,
                  broadcast: true,
                })

                playMaterialActionSfx(
                  baseKind,
                  equippedRightTool === 'axe' ? 'chop' : 'cut'
                )
                pulseXRControllerHaptics(
                  rightRes.activeInput,
                  equippedRightTool === 'axe' ? 0.92 : 0.72,
                  equippedRightTool === 'axe' ? 85 : 55
                )
                useMyRoomStore
                  .getState()
                  .setStatusHint(
                    `${equippedRightTool === 'axe' ? 'Chopped' : 'Cut'} ${MATERIAL_PHYSICS[baseKind].label} cleanly into 2 pieces!`
                  )
              }
            }
          }
        }
      } else if (equippedRightTool === 'tester') {
        let probedObj: RuntimeCraftObject | null = null
        let bestDist = Infinity
        myRoomRuntime.objects.forEach((obj) => {
          const d = distPointToObjectSurface(obj, tipPos)
          if (d <= 0.042 && d < bestDist) {
            bestDist = d
            probedObj = obj
          }
        })

        if (probedObj) {
          const hitObj: RuntimeCraftObject = probedObj
          lastTesterContactMsRef.current = nowMs
          const isConductive = hitObj.kind === 'metal'
          const readout = isConductive
            ? `METAL LIVE 230V`
            : `${MATERIAL_PHYSICS[hitObj.kind].label.toUpperCase()} 0V`
          const st = useMyRoomStore.getState()
          if (st.testerReadout !== readout || st.testerIsLive !== isConductive) {
            st.setTesterState(readout, isConductive)
            st.setStatusHint(
              isConductive
                ? `Electric Tester: METAL CONDUCTIVE (${MATERIAL_PHYSICS[hitObj.kind].massKg}kg) ⚡`
                : `Electric Tester: ${MATERIAL_PHYSICS[hitObj.kind].label} INSULATOR (${MATERIAL_PHYSICS[hitObj.kind].massKg}kg) — 0V`
            )
          }
          playMaterialActionSfx(
            hitObj.kind,
            isConductive ? 'tester_live' : 'tester_insulator'
          )
          if (isConductive) {
            pulseXRControllerHaptics(rightRes.activeInput, 0.32, 22)
          }
        } else if (nowMs - lastTesterContactMsRef.current > 450) {
          const st = useMyRoomStore.getState()
          if (st.testerIsLive || st.testerReadout !== 'TOUCH METAL/OBJECT') {
            st.setTesterState('TOUCH METAL/OBJECT', false)
          }
        }
      }
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

      {/* Unity 3D First-Person VR Character Body + IK Arms (toggleable in AR studio menu) */}
      {showSelfBody && (
        <UnityLocalVRCharacter
          uniformStyle="casual"
          floorY={myRoomRuntime.floorY}
          hideLeftHand={Boolean(!leftController?.object && leftHand)}
          hideRightHand={Boolean(!rightController?.object && rightHand)}
        />
      )}
    </>
  )
}
