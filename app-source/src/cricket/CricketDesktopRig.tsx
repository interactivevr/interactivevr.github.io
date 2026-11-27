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
import {
  CricketBatMesh,
  CricketGloveMesh,
  CricketHelmetMesh,
  CricketKitBody,
  KitAnimState,
} from './PlayerGear'
import {
  BATTING_STUMPS_Z,
  BOWLING_STUMPS_Z,
  CRICKET_BALL_RADIUS,
  getCricketSpawn,
  WIDE_HALF_W,
} from './types'
import { cricketRuntime, useCricketStore } from './useCricketStore'

const EYE_HEIGHT = 1.62
const MOVE_SPEED = 4.0

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
  const helmetGroupRef = useRef<THREE.Group>(null)
  const pitchMarkerRef = useRef<THREE.Mesh>(null)
  const catchMittRef = useRef<THREE.Mesh>(null)

  const leftWristRef = useRef<[number, number, number]>([0, 1.0, 0])
  const rightWristRef = useRef<[number, number, number]>([0, 1.0, 0])
  const animRef = useRef<KitAnimState>({
    runPhase: 0,
    runSpeed: 0,
    squat: 0.14,
    torsoLean: 0.05,
    diveTilt: 0,
  })
  const localProfile = useMemo(() => getAthleteProfile(localPeerId || playerName || 'local'), [localPeerId, playerName])

  useEffect(() => {
    voiceAudio.ensureListener(camera)
  }, [camera])

  useEffect(() => {
    const spawn = getCricketSpawn(localRole, batterStance)
    posRef.current.set(spawn.position[0], 0, spawn.position[2])
    yawRef.current = spawn.yaw
    pitchRef.current = localRole === 'bowler' ? -0.14 : -0.05
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
          st.setBowlerCharge(0.08)
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
          const power = Math.min(1, Math.max(0.25, elapsed / 0.85))
          st.setBowlerCharge(0)

          const ball = cricketRuntime.ball
          if (ball.phase === 'ready' && !st.inningsOver) {
            const releasePos: [number, number, number] = [
              posRef.current.x + 0.25,
              1.92,
              Math.max(BOWLING_STUMPS_Z - 0.5, posRef.current.z + 0.5),
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
        animRef.current.runSpeed = 1
        animRef.current.runPhase += dt * 10
        // Constrain to sensible crease/play zone per role
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
      } else {
        animRef.current.runSpeed = 0
      }
      animRef.current.squat = localRole === 'wicketkeeper' ? 0.52 : localRole === 'batter' ? 0.24 : 0
      animRef.current.stanceSpread = localRole === 'batter' ? 0.2 : localRole === 'wicketkeeper' ? 0.14 : 0
      animRef.current.torsoLean = localRole === 'batter' ? 0.22 : localRole === 'wicketkeeper' ? 0.26 : 0.05
    }

    camera.position.set(posRef.current.x, EYE_HEIGHT, posRef.current.z)
    _euler.set(pitchRef.current, yawRef.current, 0, 'YXZ')
    camera.quaternion.setFromEuler(_euler)

    if (helmetGroupRef.current) {
      helmetGroupRef.current.position.copy(camera.position)
      helmetGroupRef.current.quaternion.copy(camera.quaternion)
    }

    _lookDir.set(0, 0, -1).applyEuler(_euler).normalize()
    _right.set(1, 0, 0).applyEuler(_euler).normalize()

    // Update Pitch Target Reticle from camera ray onto ground y=0 for PC Bowler
    if (localRole === 'bowler' && _lookDir.y < -0.02) {
      const tHit = -camera.position.y / _lookDir.y
      const hitX = camera.position.x + _lookDir.x * tHit
      const hitZ = camera.position.z + _lookDir.z * tHit
      crState.setPitchTarget(hitX, hitZ)
    }

    if (pitchMarkerRef.current) {
      pitchMarkerRef.current.visible = localRole === 'bowler' && cricketRuntime.ball.phase === 'ready'
      pitchMarkerRef.current.position.set(pitchTarget[0], 0.025, pitchTarget[1])
    }

    // Update Bowler Charge bar
    if (chargingBowlRef.current) {
      const elapsed = (performance.now() - chargeStartRef.current) / 1000
      crState.setBowlerCharge(Math.min(1, Math.max(0.15, elapsed / 0.85)))
    }

    // Update Desktop Hands + Authentic Two-Handed Cricket Batting Stance & Swing
    const stanceSign = batterStance === 'right' ? 1 : -1
    let swingPhase = 0
    if (batSwingTimerRef.current > 0) {
      batSwingTimerRef.current = Math.max(0, batSwingTimerRef.current - dt)
      swingPhase = Math.sin((1 - batSwingTimerRef.current / 0.28) * Math.PI)
    }

    if (localRole === 'batter') {
      animRef.current.torsoTwist = swingPhase * 0.45 * stanceSign
      animRef.current.frontStride = swingPhase * 0.22 * -stanceSign
    } else {
      animRef.current.torsoTwist = 0
      animRef.current.frontStride = 0
    }

    const tap =
      localRole === 'batter' && cricketRuntime.ball.phase === 'ready' && swingPhase <= 0
        ? Math.max(0, Math.sin(performance.now() * 0.005)) * 0.04
        : 0
    const backlift =
      localRole === 'batter' && cricketRuntime.ball.phase === 'bowled' && swingPhase <= 0 ? 0.14 : 0

    const rHandX =
      localRole === 'batter'
        ? posRef.current.x + _lookDir.x * (0.44 + swingPhase * 0.42) + _right.x * (0.16 * stanceSign - swingPhase * 0.22 * stanceSign)
        : posRef.current.x + _lookDir.x * (0.48 + swingPhase * 0.34) + _right.x * (0.24 * stanceSign - swingPhase * 0.32 * stanceSign)
    const rHandY =
      localRole === 'batter'
        ? 0.9 + tap + backlift + swingPhase * (batLoftRef.current ? 0.34 : 0.18)
        : EYE_HEIGHT - 0.52 + swingPhase * (batLoftRef.current ? 0.26 : 0.1)
    const rHandZ =
      localRole === 'batter'
        ? posRef.current.z + _lookDir.z * (0.44 + swingPhase * 0.42) + _right.z * (0.16 * stanceSign - swingPhase * 0.22 * stanceSign)
        : posRef.current.z + _lookDir.z * (0.48 + swingPhase * 0.34) + _right.z * (0.24 * stanceSign - swingPhase * 0.32 * stanceSign)

    // Top hand stacks directly on bat grip above bottom hand in batting stance
    const lHandX =
      localRole === 'batter'
        ? rHandX - _right.x * (0.02 * stanceSign)
        : posRef.current.x + _lookDir.x * 0.44 - _right.x * (0.22 * stanceSign)
    const lHandY = localRole === 'batter' ? rHandY + 0.07 : EYE_HEIGHT - 0.48 + swingPhase * 0.08
    const lHandZ =
      localRole === 'batter'
        ? rHandZ - _right.z * (0.02 * stanceSign)
        : posRef.current.z + _lookDir.z * 0.44 - _right.z * (0.22 * stanceSign)

    leftWristRef.current = [lHandX, lHandY, lHandZ]
    rightWristRef.current = [rHandX, rHandY, rHandZ]

    if (leftHandGroupRef.current) {
      leftHandGroupRef.current.position.set(lHandX, lHandY, lHandZ)
      leftHandGroupRef.current.quaternion.copy(camera.quaternion)
    }
    if (rightHandGroupRef.current) {
      rightHandGroupRef.current.position.set(rHandX, rHandY, rHandZ)
      // Angle cricket bat cleanly across strike zone: ready/backlift -> drive -> follow-through
      const batPitch =
        localRole === 'batter'
          ? -0.28 - backlift * 1.3 + swingPhase * (batLoftRef.current ? 1.55 : 1.2)
          : 0.25 + swingPhase * (batLoftRef.current ? 0.95 : 0.65)
      const batRoll = -0.18 * stanceSign + swingPhase * 0.45 * stanceSign
      _swingEuler.set(batPitch, 0, batRoll)
      _swingQuat.setFromEuler(_swingEuler)
      _quat.copy(camera.quaternion).multiply(_swingQuat)
      rightHandGroupRef.current.quaternion.copy(_quat)
    }

    // Sync localPose for WebRTC broadcast
    const lp = runtimeState.localPose
    lp.headPos = [camera.position.x, camera.position.y, camera.position.z]
    lp.headQuat = [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w]
    lp.leftPos = leftWristRef.current
    lp.rightPos = rightWristRef.current
    lp.leftQuat = [...lp.headQuat]
    lp.rightQuat = [...lp.headQuat]
    lp.catchingActive = catchActiveRef.current

    // Bat swept segment for PC Batter
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
        const speed = batLoftRef.current ? 19.5 : 15.5
        bat.vel = [
          _batNormVec.x * speed,
          batLoftRef.current ? 7.5 : 2.2,
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

    // PC Bowler Caught & Bowled OR PC Keeper Catch Mitt
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
        CRICKET_BALL_RADIUS + 0.48
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
        CRICKET_BALL_RADIUS + 0.55
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
    void BATTING_STUMPS_Z
  })

  const gloveVariant =
    localRole === 'batter' ? 'batting' : localRole === 'wicketkeeper' ? 'keeper' : 'bowler'
  const jerseyColor = localRole === 'batter' ? '#1d4ed8' : '#047857'

  return (
    <group>
      <CricketKitBody
        role={localRole}
        playerName={playerName}
        jerseyNumber="01"
        jerseyColor={jerseyColor}
        lookProfile={localProfile}
        hideHead
        getBodyAnchor={() => ({
          pos: [posRef.current.x, 0, posRef.current.z],
          yaw:
            localRole === 'batter'
              ? yawRef.current - (batterStance === 'right' ? 1 : -1) * Math.PI * 0.42
              : yawRef.current,
        })}
        getLeftWrist={() => leftWristRef.current}
        getRightWrist={() => rightWristRef.current}
        getAnimState={() => animRef.current}
      />

      {(localRole === 'batter' || localRole === 'wicketkeeper') && (
        <group ref={helmetGroupRef}>
          <CricketHelmetMesh jerseyColor={jerseyColor} firstPersonFraming />
        </group>
      )}

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

      {/* Bowler Pitch Landing Target Ring */}
      <mesh ref={pitchMarkerRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.18, 0.28, 24]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.9} />
      </mesh>

      {/* Catch Mitt Sphere for Bowler / Wicketkeeper */}
      <mesh ref={catchMittRef} visible={false}>
        <sphereGeometry args={[0.24, 16, 12]} />
        <meshBasicMaterial color="#34d399" transparent opacity={0.3} wireframe />
      </mesh>
    </group>
  )
}
