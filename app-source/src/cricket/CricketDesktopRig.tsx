import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { playBoundaryCrowdSfx, playCricketCatchSfx } from '../audio/cricketSfx'
import { playThrowSfx } from '../audio/sfx'
import { voiceAudio } from '../net/voiceAudio'
import { segmentSphereIntersects } from '../physics/ballPhysics'
import { getAthleteProfile } from '../scene/HumanFace'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { computeDeliveryVelocity } from './cricketPhysics'
import { CricketBatMesh, CricketGloveMesh } from './PlayerGear'
import {
  BOWLING_STUMPS_Z,
  CRICKET_BALL_RADIUS,
  getCricketSpawn,
  WIDE_HALF_W,
} from './types'
import { cricketRuntime, useCricketStore } from './useCricketStore'

const EYE_HEIGHT = 1.62
const MOVE_SPEED = 4.0
const PREVIEW_DOTS = 18

const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _lookDir = new THREE.Vector3()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')
const _quat = new THREE.Quaternion()
const _batTipVec = new THREE.Vector3()
const _batBaseVec = new THREE.Vector3()
const _batNormVec = new THREE.Vector3()
const _batDownVec = new THREE.Vector3()
const _swingEuler = new THREE.Euler()
const _swingQuat = new THREE.Quaternion()

export function CricketDesktopRig() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const localPeerId = useGameStore((s) => s.localPeerId)
  const playerName = useGameStore((s) => s.playerName)
  const joined = useGameStore((s) => s.joined)

  const localRole = useCricketStore((s) => s.localCricketRole)
  const batterStance = useCricketStore((s) => s.batterStance)
  const pitchTarget = useCricketStore((s) => s.pitchTarget)
  const bowlingStyle = useCricketStore((s) => s.bowlingStyle)
  const spinDir = useCricketStore((s) => s.spinDir)

  const keysRef = useRef<Set<string>>(new Set())
  const posRef = useRef(new THREE.Vector3(-0.48, 0, 9.04))
  const yawRef = useRef(0)
  const pitchRef = useRef(-0.04)
  const draggingLookRef = useRef(false)
  const chargingBowlRef = useRef(false)
  const chargeStartRef = useRef(0)
  const catchActiveRef = useRef(false)
  const batSwingTimerRef = useRef(0)
  const batLoftRef = useRef(false)

  const leftHandGroupRef = useRef<THREE.Group>(null)
  const rightHandGroupRef = useRef<THREE.Group>(null)
  const pitchMarkerRef = useRef<THREE.Mesh>(null)
  const catchMittRef = useRef<THREE.Mesh>(null)
  const previewDotsRef = useRef<THREE.InstancedMesh>(null)
  const previewDummy = useMemo(() => new THREE.Object3D(), [])

  const localProfile = useMemo(
    () => getAthleteProfile(localPeerId || playerName || 'local'),
    [localPeerId, playerName]
  )

  useEffect(() => {
    voiceAudio.ensureListener(camera)
  }, [camera])

  useEffect(() => {
    const spawn = getCricketSpawn(localRole, batterStance)
    posRef.current.set(spawn.position[0], 0, spawn.position[2])
    yawRef.current = spawn.yaw
    pitchRef.current = localRole === 'bowler' ? -0.11 : -0.05
  }, [localRole, batterStance, joined])

  useEffect(() => {
    const canvas = gl.domElement

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      keysRef.current.add(e.code)
      if (e.code === 'Space' || e.code === 'KeyE') {
        catchActiveRef.current = true
        const role = useCricketStore.getState().localCricketRole
        if (role === 'bowler') useCricketStore.getState().setBowlerCatchActive(true)
        if (role === 'wicketkeeper') useCricketStore.getState().setKeeperCatchActive(true)
        if (role === 'batter' && batSwingTimerRef.current <= 0) {
          batSwingTimerRef.current = 0.28
          batLoftRef.current = e.shiftKey
        }
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code)
      if (e.code === 'Space' || e.code === 'KeyE') {
        catchActiveRef.current = false
        useCricketStore.getState().setBowlerCatchActive(false)
        useCricketStore.getState().setKeeperCatchActive(false)
      }
    }

    const onMouseDown = (e: MouseEvent) => {
      if (!useGameStore.getState().joined) return
      voiceAudio.resumeContext()

      if (e.button === 2) {
        catchActiveRef.current = true
        draggingLookRef.current = true
        const role = useCricketStore.getState().localCricketRole
        if (role === 'bowler') useCricketStore.getState().setBowlerCatchActive(true)
        if (role === 'wicketkeeper') useCricketStore.getState().setKeeperCatchActive(true)
        return
      }

      if (e.button === 0) {
        if (document.pointerLockElement !== canvas) {
          void canvas.requestPointerLock?.()
        }
        const st = useCricketStore.getState()
        if (st.localCricketRole === 'batter') {
          if (batSwingTimerRef.current <= 0) {
            batSwingTimerRef.current = 0.28
            batLoftRef.current = e.shiftKey
          }
        } else if (st.localCricketRole === 'bowler' && cricketRuntime.ball.phase === 'ready' && !st.inningsOver) {
          chargingBowlRef.current = true
          chargeStartRef.current = performance.now()
          st.setBowlerCharge(0.15)
        } else if (st.localCricketRole === 'wicketkeeper') {
          catchActiveRef.current = true
          st.setKeeperCatchActive(true)
        }
      }
    }

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        catchActiveRef.current = false
        draggingLookRef.current = false
        useCricketStore.getState().setBowlerCatchActive(false)
        useCricketStore.getState().setKeeperCatchActive(false)
        return
      }

      if (e.button === 0) {
        const st = useCricketStore.getState()
        if (st.localCricketRole === 'wicketkeeper') {
          catchActiveRef.current = false
          st.setKeeperCatchActive(false)
        }
        if (chargingBowlRef.current) {
          chargingBowlRef.current = false
          const elapsed = (performance.now() - chargeStartRef.current) / 1000
          const power = Math.min(1, Math.max(0.35, elapsed / 0.85))
          st.setBowlerCharge(0)

          const ball = cricketRuntime.ball
          if (ball.phase === 'ready' && !st.inningsOver) {
            const releasePos: [number, number, number] = [
              posRef.current.x + 0.26,
              1.98,
              Math.max(BOWLING_STUMPS_Z - 0.35, posRef.current.z + 0.45),
            ]
            const { vel, spin } = computeDeliveryVelocity(
              releasePos,
              st.pitchTarget[0],
              st.pitchTarget[1],
              st.bowlingStyle,
              st.spinDir,
              power
            )
            ball.phase = 'bowled'
            ball.ownerId = useGameStore.getState().localPeerId || 'local'
            ball.pos = [...releasePos]
            ball.prevPos = [...releasePos]
            ball.vel = vel
            ball.spin = spin
            ball.bowlingStyle = st.bowlingStyle
            ball.spinDir = st.spinDir
            ball.bouncedOnPitch = false
            ball.bouncedAfterHit = false
            ball.hitByBat = false
            ball.edgeContact = false
            ball.epoch += 1
            ball.timestamp = Date.now()
            playThrowSfx(Math.hypot(vel[0], vel[1], vel[2]))
            cricketRuntime.onCricketBallSend?.(ball)
          }
        }
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      const locked = document.pointerLockElement === canvas
      if (!locked && !draggingLookRef.current) return
      const sensitivity = 0.0021
      yawRef.current -= e.movementX * sensitivity
      pitchRef.current = Math.max(-1.1, Math.min(1.15, pitchRef.current - e.movementY * sensitivity))
    }

    const onContextMenu = (e: MouseEvent) => e.preventDefault()
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
  }, [gl])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const crState = useCricketStore.getState()
    const gState = useGameStore.getState()

    if (gState.joined) {
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
        if (localRole === 'batter') {
          posRef.current.x = Math.max(-1.6, Math.min(1.6, posRef.current.x))
          posRef.current.z = Math.max(7.6, Math.min(9.9, posRef.current.z))
        } else if (localRole === 'bowler') {
          posRef.current.x = Math.max(-2.2, Math.min(2.2, posRef.current.x))
          posRef.current.z = Math.max(-14.0, Math.min(-8.5, posRef.current.z))
        } else {
          posRef.current.x = Math.max(-3.0, Math.min(3.0, posRef.current.x))
          posRef.current.z = Math.max(10.8, Math.min(14.5, posRef.current.z))
        }
      }
    }

    camera.position.set(posRef.current.x, EYE_HEIGHT, posRef.current.z)
    _euler.set(pitchRef.current, yawRef.current, 0, 'YXZ')
    camera.quaternion.setFromEuler(_euler)

    _lookDir.set(0, 0, -1).applyEuler(_euler).normalize()
    _right.set(1, 0, 0).applyEuler(_euler).normalize()

    // Always-responsive Bowler pitch target raycast onto 22-yard strip
    if (localRole === 'bowler') {
      const rayY = Math.min(-0.085, _lookDir.y)
      const tHit = -camera.position.y / rayY
      const hitX = camera.position.x + _lookDir.x * tHit
      const hitZ = camera.position.z + _lookDir.z * tHit
      crState.setPitchTarget(hitX, hitZ)
    }

    if (pitchMarkerRef.current) {
      pitchMarkerRef.current.visible = localRole === 'bowler' && cricketRuntime.ball.phase === 'ready'
      pitchMarkerRef.current.position.set(pitchTarget[0], 0.025, pitchTarget[1])
    }

    // Update Bowler Charge bar & Dotted Flight Preview Arc
    let previewPower = 0.68
    if (chargingBowlRef.current) {
      const elapsed = (performance.now() - chargeStartRef.current) / 1000
      previewPower = Math.min(1, Math.max(0.25, elapsed / 0.85))
      crState.setBowlerCharge(previewPower)
    }

    if (previewDotsRef.current) {
      const showPreview = localRole === 'bowler' && cricketRuntime.ball.phase === 'ready'
      previewDotsRef.current.visible = showPreview
      if (showPreview) {
        const rel: [number, number, number] = [
          posRef.current.x + 0.26,
          1.98,
          Math.max(BOWLING_STUMPS_Z - 0.35, posRef.current.z + 0.45),
        ]
        const { vel, spin } = computeDeliveryVelocity(
          rel,
          pitchTarget[0],
          pitchTarget[1],
          bowlingStyle,
          spinDir,
          previewPower
        )
        let px = rel[0]
        let py = rel[1]
        let pz = rel[2]
        let vx = vel[0]
        let vy = vel[1]
        const vz = vel[2]
        const stepDt = 0.045
        for (let i = 0; i < PREVIEW_DOTS; i++) {
          previewDummy.position.set(px, Math.max(0.04, py), pz)
          previewDummy.scale.setScalar(1 - i * 0.03)
          previewDummy.updateMatrix()
          previewDotsRef.current.setMatrixAt(i, previewDummy.matrix)
          vx += spin[0] * (bowlingStyle === 'fast' ? 0.55 : 0.28) * stepDt
          vy += -9.81 * stepDt
          px += vx * stepDt
          py += vy * stepDt
          pz += vz * stepDt
          if (py <= CRICKET_BALL_RADIUS) break
        }
        previewDotsRef.current.instanceMatrix.needsUpdate = true
      }
    }

    // First-person Unobstructed Gloves & MRF Bat positioning
    const stanceSign = batterStance === 'right' ? 1 : -1
    let swingPhase = 0
    if (batSwingTimerRef.current > 0) {
      batSwingTimerRef.current = Math.max(0, batSwingTimerRef.current - dt)
      swingPhase = Math.sin((1 - batSwingTimerRef.current / 0.28) * Math.PI)
    }

    const rHandX =
      localRole === 'batter'
        ? posRef.current.x + _lookDir.x * (0.48 + swingPhase * 0.4) + _right.x * (0.2 * stanceSign - swingPhase * 0.25 * stanceSign)
        : posRef.current.x + _lookDir.x * 0.52 + _right.x * 0.24
    const rHandY =
      localRole === 'batter'
        ? 1.02 + swingPhase * (batLoftRef.current ? 0.32 : 0.16)
        : EYE_HEIGHT - 0.35
    const rHandZ =
      localRole === 'batter'
        ? posRef.current.z + _lookDir.z * (0.48 + swingPhase * 0.4) + _right.z * (0.2 * stanceSign - swingPhase * 0.25 * stanceSign)
        : posRef.current.z + _lookDir.z * 0.52 + _right.z * 0.24

    const lHandX =
      localRole === 'batter'
        ? rHandX - _right.x * (0.02 * stanceSign)
        : posRef.current.x + _lookDir.x * 0.52 - _right.x * 0.24
    const lHandY = localRole === 'batter' ? rHandY + 0.065 : EYE_HEIGHT - 0.35
    const lHandZ =
      localRole === 'batter'
        ? rHandZ - _right.z * (0.02 * stanceSign)
        : posRef.current.z + _lookDir.z * 0.52 - _right.z * 0.24

    if (leftHandGroupRef.current) {
      leftHandGroupRef.current.position.set(lHandX, lHandY, lHandZ)
      leftHandGroupRef.current.quaternion.copy(camera.quaternion)
    }
    if (rightHandGroupRef.current) {
      rightHandGroupRef.current.position.set(rHandX, rHandY, rHandZ)
      const batPitch =
        localRole === 'batter'
          ? -0.2 + swingPhase * (batLoftRef.current ? 1.5 : 1.18)
          : 0.2
      const batRoll = -0.18 * stanceSign + swingPhase * 0.42 * stanceSign
      _swingEuler.set(batPitch, 0, batRoll)
      _swingQuat.setFromEuler(_swingEuler)
      _quat.copy(camera.quaternion).multiply(_swingQuat)
      rightHandGroupRef.current.quaternion.copy(_quat)
    }

    // Sync localPose for WebRTC peers
    const lp = runtimeState.localPose
    lp.headPos = [camera.position.x, camera.position.y, camera.position.z]
    lp.headQuat = [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w]
    lp.leftPos = [lHandX, lHandY, lHandZ]
    lp.rightPos = [rHandX, rHandY, rHandZ]
    lp.leftQuat = [...lp.headQuat]
    lp.rightQuat = [...lp.headQuat]
    lp.catchingActive = catchActiveRef.current

    // Bat swept collision for PC Batter
    if (localRole === 'batter') {
      const bat = cricketRuntime.bat
      bat.prevBase = [...bat.currBase]
      bat.prevTip = [...bat.currTip]
      const q = rightHandGroupRef.current?.quaternion ?? camera.quaternion
      _batDownVec.set(0, -1, 0).applyQuaternion(q).normalize()
      _batBaseVec.set(rHandX, rHandY, rHandZ).addScaledVector(_batDownVec, 0.2)
      _batTipVec.set(rHandX, rHandY, rHandZ).addScaledVector(_batDownVec, 0.86)
      bat.currBase = [_batBaseVec.x, _batBaseVec.y, _batBaseVec.z]
      bat.currTip = [_batTipVec.x, _batTipVec.y, _batTipVec.z]

      _batNormVec.copy(_lookDir).normalize()
      if (swingPhase > 0.05) {
        const speed = batLoftRef.current ? 20.5 : 16.0
        bat.vel = [
          _batNormVec.x * speed,
          batLoftRef.current ? 7.8 : 2.3,
          _batNormVec.z * speed,
        ]
      } else {
        bat.vel = [0, 0, 0]
      }
      bat.faceNormal = [_batNormVec.x, _batNormVec.y, _batNormVec.z]
      bat.active = true
    } else {
      cricketRuntime.bat.active = false
    }

    // Catch Mitt for Bowler / Keeper
    const mittPosX = posRef.current.x + _lookDir.x * 0.72
    const mittPosY = EYE_HEIGHT - 0.14 + _lookDir.y * 0.72
    const mittPosZ = posRef.current.z + _lookDir.z * 0.72

    if (catchMittRef.current) {
      catchMittRef.current.visible =
        (localRole === 'bowler' || localRole === 'wicketkeeper') && catchActiveRef.current
      catchMittRef.current.position.set(mittPosX, mittPosY, mittPosZ)
    }

    const ball = cricketRuntime.ball
    if (localRole === 'bowler' && catchActiveRef.current && ball.phase === 'hit' && !ball.bouncedAfterHit) {
      const hit = segmentSphereIntersects(
        ball.prevPos[0],
        ball.prevPos[1],
        ball.prevPos[2],
        ball.pos[0],
        ball.pos[1],
        ball.pos[2],
        mittPosX,
        mittPosY,
        mittPosZ,
        CRICKET_BALL_RADIUS + 0.52
      )
      if (hit) {
        ball.phase = 'dead'
        ball.vel = [0, 0, 0]
        ball.epoch += 1
        playCricketCatchSfx()
        playBoundaryCrowdSfx(true)
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
    } else if (
      localRole === 'wicketkeeper' &&
      catchActiveRef.current &&
      (ball.phase === 'bowled' || (ball.phase === 'hit' && !ball.bouncedAfterHit))
    ) {
      const hit = segmentSphereIntersects(
        ball.prevPos[0],
        ball.prevPos[1],
        ball.prevPos[2],
        ball.pos[0],
        ball.pos[1],
        ball.pos[2],
        mittPosX,
        mittPosY,
        mittPosZ,
        CRICKET_BALL_RADIUS + 0.58
      )
      if (hit) {
        const isCaughtBehind = ball.phase === 'hit' && !ball.bouncedAfterHit
        const isWide =
          ball.phase === 'bowled' && !ball.hitByBat && Math.abs(ball.pos[0]) > WIDE_HALF_W
        ball.phase = 'dead'
        ball.vel = [0, 0, 0]
        ball.epoch += 1
        playCricketCatchSfx()

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
    }
    void localPeerId
  })

  const gloveVariant =
    localRole === 'batter' ? 'batting' : localRole === 'wicketkeeper' ? 'keeper' : 'bowler'
  const jerseyColor = localRole === 'batter' ? '#1d4ed8' : '#047857'

  return (
    <group>
      {/* Unobstructed First-Person Gloves & MRF Bat */}
      <group ref={leftHandGroupRef}>
        <CricketGloveMesh
          variant={gloveVariant}
          accent={jerseyColor}
          skinColor={localProfile.skinColor}
          catching={catchActiveRef.current}
        />
      </group>
      <group ref={rightHandGroupRef}>
        <CricketGloveMesh
          variant={gloveVariant}
          accent={jerseyColor}
          skinColor={localProfile.skinColor}
          catching={catchActiveRef.current}
        />
        {localRole === 'batter' && <CricketBatMesh highlight />}
      </group>

      {/* Bowler Pitch Landing Target Ring & Flight Preview */}
      <mesh ref={pitchMarkerRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.18, 0.3, 24]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.95} />
      </mesh>
      <instancedMesh ref={previewDotsRef} args={[undefined, undefined, PREVIEW_DOTS]} visible={false}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshBasicMaterial color="#fde047" transparent opacity={0.8} />
      </instancedMesh>

      {/* Catch Mitt Sphere for Bowler / Wicketkeeper */}
      <mesh ref={catchMittRef} visible={false}>
        <sphereGeometry args={[0.25, 16, 12]} />
        <meshBasicMaterial color="#34d399" transparent opacity={0.3} wireframe />
      </mesh>
    </group>
  )
}
