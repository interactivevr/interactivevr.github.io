import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { voiceAudio } from '../net/voiceAudio'
import { computeTrajectoryPreview, segmentSphereIntersects } from '../physics/ballPhysics'
import { claimBallLocally, getFirstHeldBallByLocal, throwBallLocally } from '../physics/ballActions'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { BALL_RADIUS, COURT_HALF_L, COURT_HALF_W, getSpawnForSlot } from '../types/game'

const EYE_HEIGHT = 1.62
const MOVE_SPEED = 4.2
const PC_CATCH_RADIUS = 0.42
const PC_PICKUP_RADIUS = 2.6

const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _lookDir = new THREE.Vector3()
const _mittPos = new THREE.Vector3()
const _leftHandPos = new THREE.Vector3()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')
const _quat = new THREE.Quaternion()

export function DesktopPlayerRig() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const inXR = useGameStore((s) => s.inXR)
  const joined = useGameStore((s) => s.joined)
  const gameMode = useGameStore((s) => s.gameMode)
  const localSlot = useGameStore((s) => s.localSlot)

  const keysRef = useRef<Set<string>>(new Set())
  const yawRef = useRef(0)
  const pitchRef = useRef(-0.04)
  const posRef = useRef(new THREE.Vector3(0, 0, 5.4))
  const chargingRef = useRef(false)
  const chargeStartRef = useRef(0)
  const catchKeyRef = useRef(false)
  const draggingLookRef = useRef(false)

  // Ensure AudioListener is bound to the active camera
  useEffect(() => {
    voiceAudio.ensureListener(camera)
  }, [camera])

  // Move to assigned spawn pad when role/slot/mode changes on desktop
  useEffect(() => {
    if (inXR) return
    const spawn = getSpawnForSlot(gameMode, localSlot)
    posRef.current.set(spawn.position[0], 0, spawn.position[2])
    yawRef.current = spawn.yaw
    pitchRef.current = -0.04
  }, [gameMode, localSlot, inXR, joined])

  useEffect(() => {
    if (inXR) return

    const canvas = gl.domElement

    const computeThrowVelocity = (charge01: number): [number, number, number] => {
      _euler.set(pitchRef.current, yawRef.current, 0, 'YXZ')
      _lookDir.set(0, 0, -1).applyEuler(_euler).normalize()
      // Add subtle upward arc compensation so level throws travel across the court nicely
      _lookDir.y += 0.16
      _lookDir.normalize()
      const speed = 6.8 + charge01 * 10.2
      return [_lookDir.x * speed, _lookDir.y * speed, _lookDir.z * speed]
    }

    const computeMittWorldPos = (): THREE.Vector3 => {
      _euler.set(pitchRef.current, yawRef.current, 0, 'YXZ')
      _lookDir.set(0, 0, -1).applyEuler(_euler).normalize()
      _right.set(1, 0, 0).applyEuler(_euler).normalize()
      return _mittPos
        .set(posRef.current.x, EYE_HEIGHT - 0.14, posRef.current.z)
        .addScaledVector(_lookDir, 0.72)
        .addScaledVector(_right, 0.16)
    }

    const tryPickupNearbyBall = (): boolean => {
      _euler.set(pitchRef.current, yawRef.current, 0, 'YXZ')
      _lookDir.set(0, 0, -1).applyEuler(_euler).normalize()
      const eyeX = posRef.current.x
      const eyeY = EYE_HEIGHT
      const eyeZ = posRef.current.z

      let bestId: number | null = null
      let bestScore = Infinity

      for (const ball of runtimeState.balls) {
        if (ball.state === 'held') continue
        const dx = ball.pos[0] - eyeX
        const dy = ball.pos[1] - eyeY
        const dz = ball.pos[2] - eyeZ
        const dist = Math.hypot(dx, dy, dz)
        if (dist > PC_PICKUP_RADIUS) continue
        const dot = (dx * _lookDir.x + dy * _lookDir.y + dz * _lookDir.z) / Math.max(0.001, dist)
        if (dot > 0.35 || dist < 1.1) {
          const score = dist - dot
          if (score < bestScore) {
            bestScore = score
            bestId = ball.id
          }
        }
      }

      if (bestId !== null) {
        return claimBallLocally(bestId, 'right')
      }
      return false
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const code = e.code
      keysRef.current.add(code)
      if (code === 'KeyE' || code === 'Space') {
        catchKeyRef.current = true
        useGameStore.getState().setDesktopCatchActive(true)
      }
      if (code === 'KeyF') {
        if (getFirstHeldBallByLocal() === null) {
          tryPickupNearbyBall()
        }
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code)
      if (e.code === 'KeyE' || e.code === 'Space') {
        catchKeyRef.current = false
        useGameStore.getState().setDesktopCatchActive(false)
      }
    }

    const onMouseDown = (e: MouseEvent) => {
      if (!useGameStore.getState().joined) return
      voiceAudio.resumeContext()

      if (e.button === 2) {
        // Right click activates Catch Mitt (and allows drag look if pointer isn't locked)
        catchKeyRef.current = true
        draggingLookRef.current = true
        useGameStore.getState().setDesktopCatchActive(true)
        return
      }

      if (e.button === 0) {
        if (document.pointerLockElement !== canvas) {
          void canvas.requestPointerLock?.()
        }
        const heldId = getFirstHeldBallByLocal()
        if (heldId !== null) {
          chargingRef.current = true
          chargeStartRef.current = performance.now()
          useGameStore.getState().setThrowCharge(0.05)
        } else {
          tryPickupNearbyBall()
        }
      }
    }

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        catchKeyRef.current = false
        draggingLookRef.current = false
        useGameStore.getState().setDesktopCatchActive(false)
        return
      }

      if (e.button === 0 && chargingRef.current) {
        chargingRef.current = false
        const heldId = getFirstHeldBallByLocal()
        const elapsed = (performance.now() - chargeStartRef.current) / 1000
        const charge = Math.min(1, Math.max(0.12, elapsed / 0.85))
        useGameStore.getState().setThrowCharge(0)
        runtimeState.trajectoryPoints = []

        if (heldId !== null) {
          const mitt = computeMittWorldPos()
          const vel = computeThrowVelocity(charge)
          throwBallLocally(heldId, [mitt.x, mitt.y, mitt.z], vel)
        }
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      const locked = document.pointerLockElement === canvas
      if (!locked && !draggingLookRef.current) return
      const sensitivity = 0.0022
      yawRef.current -= e.movementX * sensitivity
      pitchRef.current = Math.max(
        -1.2,
        Math.min(1.25, pitchRef.current - e.movementY * sensitivity)
      )
    }

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }

    const onPointerLockChange = () => {
      useGameStore.getState().setPointerLocked(document.pointerLockElement === canvas)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('pointerlockchange', onPointerLockChange)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
    }
  }, [gl, inXR])

  useFrame((_, delta) => {
    if (inXR) return

    const dt = Math.min(delta, 0.05)
    const state = useGameStore.getState()

    if (state.joined) {
      // WASD / Arrow locomotion along camera horizontal plane
      _forward.set(-Math.sin(yawRef.current), 0, -Math.cos(yawRef.current))
      _right.set(Math.cos(yawRef.current), 0, -Math.sin(yawRef.current))

      let moveX = 0
      let moveZ = 0
      const keys = keysRef.current
      if (keys.has('KeyW') || keys.has('ArrowUp')) {
        moveX += _forward.x
        moveZ += _forward.z
      }
      if (keys.has('KeyS') || keys.has('ArrowDown')) {
        moveX -= _forward.x
        moveZ -= _forward.z
      }
      if (keys.has('KeyD') || keys.has('ArrowRight')) {
        moveX += _right.x
        moveZ += _right.z
      }
      if (keys.has('KeyA') || keys.has('ArrowLeft')) {
        moveX -= _right.x
        moveZ -= _right.z
      }

      const len = Math.hypot(moveX, moveZ)
      if (len > 0.001) {
        posRef.current.x += (moveX / len) * MOVE_SPEED * dt
        posRef.current.z += (moveZ / len) * MOVE_SPEED * dt
        posRef.current.x = Math.max(-(COURT_HALF_W - 0.55), Math.min(COURT_HALF_W - 0.55, posRef.current.x))
        posRef.current.z = Math.max(-(COURT_HALF_L - 0.65), Math.min(COURT_HALF_L - 0.65, posRef.current.z))
      }
    }

    camera.position.set(posRef.current.x, EYE_HEIGHT, posRef.current.z)
    _euler.set(pitchRef.current, yawRef.current, 0, 'YXZ')
    camera.quaternion.setFromEuler(_euler)

    // Compute hand/mitt positions in world space for avatars, catch detection, and ball holding
    _lookDir.set(0, 0, -1).applyEuler(_euler).normalize()
    _right.set(1, 0, 0).applyEuler(_euler).normalize()

    _mittPos
      .set(posRef.current.x, EYE_HEIGHT - 0.14, posRef.current.z)
      .addScaledVector(_lookDir, 0.72)
      .addScaledVector(_right, 0.16)

    _leftHandPos
      .set(posRef.current.x, EYE_HEIGHT - 0.24, posRef.current.z)
      .addScaledVector(_lookDir, 0.52)
      .addScaledVector(_right, -0.26)

    // Sync localPose for WebRTC broadcast
    const lp = runtimeState.localPose
    lp.headPos[0] = camera.position.x
    lp.headPos[1] = camera.position.y
    lp.headPos[2] = camera.position.z
    _quat.copy(camera.quaternion)
    lp.headQuat[0] = _quat.x
    lp.headQuat[1] = _quat.y
    lp.headQuat[2] = _quat.z
    lp.headQuat[3] = _quat.w

    lp.rightPos[0] = _mittPos.x
    lp.rightPos[1] = _mittPos.y
    lp.rightPos[2] = _mittPos.z
    lp.rightQuat = [...lp.headQuat]

    lp.leftPos[0] = _leftHandPos.x
    lp.leftPos[1] = _leftHandPos.y
    lp.leftPos[2] = _leftHandPos.z
    lp.leftQuat = [...lp.headQuat]

    const heldId = getFirstHeldBallByLocal()
    lp.rightGrabbing = heldId !== null || catchKeyRef.current
    lp.leftGrabbing = catchKeyRef.current
    lp.catchingActive = catchKeyRef.current
    const rCurl = heldId !== null ? 0.85 : catchKeyRef.current ? 0.35 : 0.1
    const lCurl = catchKeyRef.current ? 0.35 : 0.1
    lp.rightCurls = [rCurl * 0.8, rCurl, rCurl, rCurl, rCurl]
    lp.leftCurls = [lCurl * 0.8, lCurl, lCurl, lCurl, lCurl]

    // Keep locally held ball glued to desktop mitt
    if (heldId !== null) {
      const heldBall = runtimeState.balls[heldId]
      if (heldBall) {
        heldBall.prevPos = [...heldBall.pos]
        heldBall.pos = [_mittPos.x, _mittPos.y, _mittPos.z]
      }
    }

    // Update throw charge bar & 3D trajectory preview
    if (chargingRef.current && heldId !== null) {
      const elapsed = (performance.now() - chargeStartRef.current) / 1000
      const charge = Math.min(1, Math.max(0.12, elapsed / 0.85))
      state.setThrowCharge(charge)

      const aimDir = _lookDir.clone()
      aimDir.y += 0.16
      aimDir.normalize()
      const speed = 6.8 + charge * 10.2
      runtimeState.trajectoryPoints = computeTrajectoryPreview(
        [_mittPos.x, _mittPos.y, _mittPos.z],
        [aimDir.x * speed, aimDir.y * speed, aimDir.z * speed]
      )
    } else if (runtimeState.trajectoryPoints.length > 0) {
      runtimeState.trajectoryPoints = []
    }

    // Active desktop mitt catching check
    if (state.joined && catchKeyRef.current && heldId === null) {
      for (const ball of runtimeState.balls) {
        if (ball.state !== 'flight' && ball.state !== 'idle') continue
        const hit = segmentSphereIntersects(
          ball.prevPos[0],
          ball.prevPos[1],
          ball.prevPos[2],
          ball.pos[0],
          ball.pos[1],
          ball.pos[2],
          _mittPos.x,
          _mittPos.y,
          _mittPos.z,
          BALL_RADIUS + PC_CATCH_RADIUS
        )
        if (hit) {
          claimBallLocally(ball.id, 'right')
          break
        }
      }
    }
  })

  return null
}
