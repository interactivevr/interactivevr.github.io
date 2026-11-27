import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getAthleteProfile, HumanFaceHead } from '../scene/HumanFace'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { PeerInfo } from '../types/game'
import {
  CricketBatMesh,
  CricketGloveMesh,
  CricketHelmetMesh,
  CricketKitBody,
  KitAnimState,
} from './PlayerGear'
import { AI_FIELD_POSITIONS, CricketRole } from './types'
import { cricketRuntime, useCricketStore } from './useCricketStore'

const _targetVec = new THREE.Vector3()
const _targetQuat = new THREE.Quaternion()
const _avatarEuler = new THREE.Euler()

const AI_PLAYER_NAMES = [
  'SHARMA',
  'KOHLI',
  'STOKES',
  'STARC',
  'RASHID',
  'BABAR',
  'WARNER',
  'BUMRAH',
  'ROOT',
] as const

function RemoteCricketPlayer({
  peer,
  role,
  squadNum,
}: {
  peer: PeerInfo
  role: CricketRole
  squadNum: string
}) {
  const headRef = useRef<THREE.Group>(null)
  const leftHandRef = useRef<THREE.Group>(null)
  const rightHandRef = useRef<THREE.Group>(null)
  const bodyPosRef = useRef<[number, number, number]>([0, 0, 0])
  const prevBodyPosRef = useRef<[number, number, number]>([0, 0, 0])
  const bodyYawRef = useRef(0)
  const leftWristRef = useRef<[number, number, number]>([-0.2, 1.1, 0])
  const rightWristRef = useRef<[number, number, number]>([0.2, 1.1, 0])
  const animRef = useRef<KitAnimState>({
    runPhase: 0,
    runSpeed: 0,
    squat: role === 'wicketkeeper' ? 0.6 : role === 'batter' ? 0.15 : 0,
    torsoLean: role === 'wicketkeeper' ? 0.25 : 0.06,
    diveTilt: 0,
  })

  const profile = useMemo(() => getAthleteProfile(peer.id), [peer.id])
  const batterStance = useCricketStore((s) => s.batterStance)

  useFrame((_, delta) => {
    const poseEntry = runtimeState.remotePoses[peer.id]
    if (!poseEntry) return

    const cDt = Math.min(delta, 0.05)
    const alpha = 1 - Math.exp(-18 * cDt)
    const { target } = poseEntry

    if (headRef.current) {
      _targetVec.set(target.headPos[0], target.headPos[1], target.headPos[2])
      headRef.current.position.lerp(_targetVec, alpha)
      _targetQuat.set(target.headQuat[0], target.headQuat[1], target.headQuat[2], target.headQuat[3])
      headRef.current.quaternion.slerp(_targetQuat, alpha)

      prevBodyPosRef.current = [...bodyPosRef.current]
      bodyPosRef.current = [
        headRef.current.position.x,
        Math.max(0, headRef.current.position.y - 1.58),
        headRef.current.position.z,
      ]
      _avatarEuler.setFromQuaternion(headRef.current.quaternion, 'YXZ')
      const stanceSign = batterStance === 'right' ? 1 : -1
      bodyYawRef.current =
        role === 'batter' ? _avatarEuler.y - stanceSign * Math.PI * 0.42 : _avatarEuler.y
      animRef.current.stanceSpread = role === 'batter' ? 0.19 : 0
      animRef.current.squat = role === 'wicketkeeper' ? 0.65 : role === 'batter' ? 0.24 : 0
      animRef.current.torsoLean = role === 'wicketkeeper' ? 0.28 : role === 'batter' ? 0.22 : 0.06

      const moveSpeed =
        Math.hypot(
          bodyPosRef.current[0] - prevBodyPosRef.current[0],
          bodyPosRef.current[2] - prevBodyPosRef.current[2]
        ) / Math.max(0.005, cDt)

      animRef.current.runSpeed = Math.min(1, moveSpeed / 3.8)
      if (animRef.current.runSpeed > 0.08) {
        animRef.current.runPhase += cDt * 9.5 * animRef.current.runSpeed
      }
    }

    if (leftHandRef.current) {
      _targetVec.set(target.leftPos[0], target.leftPos[1], target.leftPos[2])
      leftHandRef.current.position.lerp(_targetVec, alpha)
      _targetQuat.set(target.leftQuat[0], target.leftQuat[1], target.leftQuat[2], target.leftQuat[3])
      leftHandRef.current.quaternion.slerp(_targetQuat, alpha)
      leftWristRef.current = [
        leftHandRef.current.position.x,
        leftHandRef.current.position.y,
        leftHandRef.current.position.z,
      ]
    }

    if (rightHandRef.current) {
      _targetVec.set(target.rightPos[0], target.rightPos[1], target.rightPos[2])
      rightHandRef.current.position.lerp(_targetVec, alpha)
      _targetQuat.set(target.rightQuat[0], target.rightQuat[1], target.rightQuat[2], target.rightQuat[3])
      rightHandRef.current.quaternion.slerp(_targetQuat, alpha)
      rightWristRef.current = [
        rightHandRef.current.position.x,
        rightHandRef.current.position.y,
        rightHandRef.current.position.z,
      ]
    }
  })

  const jerseyColor = role === 'batter' ? '#1d4ed8' : '#047857'
  const gloveVariant = role === 'batter' ? 'batting' : role === 'wicketkeeper' ? 'keeper' : 'bowler'

  return (
    <group>
      <CricketKitBody
        role={role}
        playerName={peer.name}
        jerseyNumber={squadNum}
        jerseyColor={jerseyColor}
        lookProfile={profile}
        hideHead
        getBodyAnchor={() => ({ pos: bodyPosRef.current, yaw: bodyYawRef.current })}
        getLeftWrist={() => leftWristRef.current}
        getRightWrist={() => rightWristRef.current}
        getAnimState={() => animRef.current}
      />

      {/* Realistic Face Head + Helmet or Cap */}
      <group ref={headRef} position={[0, 1.58, 0]}>
        <HumanFaceHead
          profile={profile}
          showHair={role === 'bowler'}
          allowSunglasses={role === 'bowler'}
        />
        {role === 'bowler' ? (
          <group position={[0, 0.058, 0]}>
            <mesh scale={[1.01, 0.9, 1.04]}>
              <sphereGeometry args={[0.132, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
              <meshStandardMaterial color={jerseyColor} roughness={0.5} />
            </mesh>
            <mesh position={[0, -0.005, -0.138]} rotation={[0.15, 0, 0]}>
              <boxGeometry args={[0.17, 0.014, 0.09]} />
              <meshStandardMaterial color={jerseyColor} roughness={0.5} />
            </mesh>
          </group>
        ) : (
          <CricketHelmetMesh jerseyColor={jerseyColor} />
        )}
      </group>

      <group ref={leftHandRef}>
        <CricketGloveMesh variant={gloveVariant} accent={jerseyColor} skinColor={profile.skinColor} />
      </group>
      <group ref={rightHandRef}>
        <CricketGloveMesh variant={gloveVariant} accent={jerseyColor} skinColor={profile.skinColor} />
        {role === 'batter' && (
          <group rotation={[Math.PI * 0.35, 0, 0]}>
            <CricketBatMesh />
          </group>
        )}
      </group>
    </group>
  )
}

function ComputerCricketPlayer({
  role,
  name,
  jerseyNumber,
  jerseyColor,
  fielderIdx,
  seedIdx,
}: {
  role: CricketRole | 'outfielder' | 'nonstriker'
  name: string
  jerseyNumber: string
  jerseyColor: string
  fielderIdx?: number
  seedIdx: number
}) {
  const posRef = useRef<[number, number, number]>([0, 0, 0])
  const yawRef = useRef(0)
  const leftWristRef = useRef<[number, number, number]>([-0.25, 1.05, 0])
  const rightWristRef = useRef<[number, number, number]>([0.25, 1.05, 0])
  const batGroupRef = useRef<THREE.Group>(null)
  const animRef = useRef<KitAnimState>({
    runPhase: seedIdx * 1.1,
    runSpeed: 0,
    squat: 0,
    torsoLean: 0.05,
    diveTilt: 0,
  })
  const bowlArmAngleRef = useRef(0)

  const profile = useMemo(() => getAthleteProfile(seedIdx), [seedIdx])
  const batterStance = useCricketStore((s) => s.batterStance)

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const cDt = Math.min(delta, 0.05)
    let px = 0
    let pz = 0
    let yaw = 0
    const stanceSign = batterStance === 'right' ? 1 : -1

    if (role === 'outfielder' && fielderIdx !== undefined) {
      const f = cricketRuntime.fielders[fielderIdx]
      px = f.pos[0]
      pz = f.pos[2]
      yaw = f.yaw
      animRef.current.runSpeed = f.isRunning ? 1.0 : 0
      if (f.isRunning) animRef.current.runPhase += cDt * 12.5
      animRef.current.squat = f.isRunning ? 0.1 : 0.12 + Math.sin(t * 2 + seedIdx) * 0.03
      animRef.current.torsoLean = f.isRunning ? 0.24 : 0.08
      animRef.current.diveTilt = f.diving ? 0.65 : 0
      animRef.current.stanceSpread = 0
      animRef.current.headYawOffset = 0
      animRef.current.torsoTwist = 0
      animRef.current.frontStride = 0
    } else if (role === 'nonstriker') {
      px = -0.95
      pz = -9.1
      yaw = -Math.PI * 0.42
      animRef.current.runSpeed = 0
      animRef.current.squat = 0.14
      animRef.current.torsoLean = 0.1
      animRef.current.stanceSpread = 0.16
      animRef.current.headYawOffset = Math.PI * 0.42
    } else if (role === 'bowler') {
      px = cricketRuntime.aiBowlerPos[0]
      pz = cricketRuntime.aiBowlerPos[2]
      yaw = Math.PI
      const isRunup = cricketRuntime.ball.phase === 'ready'
      animRef.current.runSpeed = isRunup ? 0.92 : 0
      if (isRunup) {
        animRef.current.runPhase += cDt * 11
        bowlArmAngleRef.current += cDt * 8.5
      } else {
        bowlArmAngleRef.current = 0.4
      }
      animRef.current.torsoLean = isRunup ? 0.22 : 0.06
      animRef.current.stanceSpread = 0
      animRef.current.headYawOffset = 0
    } else if (role === 'wicketkeeper') {
      px = cricketRuntime.aiKeeperPos[0]
      pz = cricketRuntime.aiKeeperPos[2]
      yaw = 0
      animRef.current.runSpeed = 0
      animRef.current.squat = 0.72
      animRef.current.torsoLean = 0.32
      animRef.current.stanceSpread = 0.16
      animRef.current.headYawOffset = 0
    } else if (role === 'batter') {
      px = cricketRuntime.aiBatterPos[0]
      pz = cricketRuntime.aiBatterPos[2]
      // Authentic sideways stance: lead shoulder points down the pitch (-Z), head turns toward bowler
      yaw = -stanceSign * Math.PI * 0.44
      const swing = cricketRuntime.aiBatSwingPhase
      const swingArc = Math.sin(swing * Math.PI)
      const isBowled = cricketRuntime.ball.phase === 'bowled'

      animRef.current.runSpeed = 0
      animRef.current.squat = 0.25 + swingArc * 0.18
      animRef.current.torsoLean = 0.22 + swingArc * 0.08
      animRef.current.stanceSpread = 0.21
      animRef.current.frontStride = swingArc * 0.24 * -stanceSign
      animRef.current.headYawOffset = stanceSign * Math.PI * 0.42
      animRef.current.torsoTwist = isBowled && swing <= 0
        ? -0.18 * stanceSign // subtle shoulder coil in backlift
        : swingArc * 0.48 * stanceSign
    }

    posRef.current = [px, 0, pz]
    yawRef.current = yaw

    const cosY = Math.cos(yaw)
    const sinY = Math.sin(yaw)

    if (role === 'batter') {
      const swing = cricketRuntime.aiBatSwingPhase
      const swingArc = Math.sin(swing * Math.PI)
      const isBowled = cricketRuntime.ball.phase === 'bowled'
      const tap = cricketRuntime.ball.phase === 'ready' ? Math.max(0, Math.sin(t * 5.2)) * 0.06 : 0
      const backlift = isBowled && swing <= 0 ? 0.18 : 0

      // Two-handed stacked grip just outside front pad, tapping at crease then lifting & driving through
      const handX = px + stanceSign * (0.14 - swingArc * 0.12)
      const handY = 0.86 + tap + backlift + swingArc * 0.3
      const handZ = pz - 0.15 - swingArc * 0.48

      leftWristRef.current = [handX, handY + (stanceSign > 0 ? 0.065 : 0), handZ]
      rightWristRef.current = [handX, handY + (stanceSign < 0 ? 0.065 : 0), handZ]

      if (batGroupRef.current) {
        batGroupRef.current.position.set(handX, handY + 0.03, handZ)
        const pitchAngle = -0.35 - backlift * 1.4 + swingArc * 1.55
        const rollAngle = stanceSign * (0.18 - swingArc * 0.35)
        batGroupRef.current.rotation.set(pitchAngle, 0, rollAngle)
      }
    } else if (role === 'bowler') {
      // Authentic overarm bowling arm windup & pumping non-bowling arm
      const swingOff = Math.sin(animRef.current.runPhase) * 0.22 * animRef.current.runSpeed
      const bowlY = 1.38 + Math.sin(bowlArmAngleRef.current) * 0.46
      const bowlZ = pz - Math.cos(bowlArmAngleRef.current) * 0.34
      leftWristRef.current = [px - 0.26 * cosY, 1.15 + swingOff, pz + 0.26 * sinY + swingOff]
      rightWristRef.current = [px + 0.26 * cosY, bowlY, bowlZ]
    } else if (role === 'wicketkeeper') {
      // Keeper gloves poised together ready behind stumps
      leftWristRef.current = [px - 0.11, 0.78, pz - 0.34]
      rightWristRef.current = [px + 0.11, 0.78, pz - 0.34]
    } else {
      // Outfielder sprint arm pumping vs athletic ready stance
      const pump = Math.sin(animRef.current.runPhase) * 0.28 * animRef.current.runSpeed
      leftWristRef.current = [
        px - 0.22 * cosY - sinY * (0.24 - pump),
        0.96 + Math.abs(pump) * 0.18,
        pz + 0.22 * sinY - cosY * (0.24 - pump),
      ]
      rightWristRef.current = [
        px + 0.22 * cosY - sinY * (0.24 + pump),
        0.96 + Math.abs(pump) * 0.18,
        pz - 0.22 * sinY - cosY * (0.24 + pump),
      ]
    }
  })

  const kitRole: CricketRole =
    role === 'batter' || role === 'nonstriker'
      ? 'batter'
      : role === 'wicketkeeper'
        ? 'wicketkeeper'
        : 'bowler'

  return (
    <group>
      <CricketKitBody
        role={kitRole}
        playerName={name}
        jerseyNumber={jerseyNumber}
        jerseyColor={jerseyColor}
        lookProfile={profile}
        getBodyAnchor={() => ({ pos: posRef.current, yaw: yawRef.current })}
        getLeftWrist={() => leftWristRef.current}
        getRightWrist={() => rightWristRef.current}
        getAnimState={() => animRef.current}
      />
      {role === 'batter' && (
        <group ref={batGroupRef}>
          <CricketBatMesh />
        </group>
      )}
    </group>
  )
}

export function CricketAvatars() {
  const peers = useGameStore((s) => s.peers)
  const localPeerId = useGameStore((s) => s.localPeerId)
  const assignments = useCricketStore((s) => s.assignments)

  const roles: CricketRole[] = ['batter', 'bowler', 'wicketkeeper']

  return (
    <group>
      {roles.map((r, idx) => {
        const assignee = assignments[r]
        if (assignee === (localPeerId || 'local') || assignee === 'local') {
          return null
        }
        if (assignee !== 'ai' && peers[assignee]) {
          return (
            <RemoteCricketPlayer
              key={assignee}
              peer={peers[assignee]}
              role={r}
              squadNum={`0${idx + 1}`}
            />
          )
        }
        const aiColor = r === 'batter' ? '#1d4ed8' : '#047857'
        const aiLabel = r === 'batter' ? 'AI BATTER' : r === 'bowler' ? 'AI BOWLER' : 'AI KEEPER'
        return (
          <ComputerCricketPlayer
            key={`ai-${r}`}
            role={r}
            name={aiLabel}
            jerseyNumber={`1${idx}`}
            jerseyColor={aiColor}
            seedIdx={idx + 1}
          />
        )
      })}

      {/* Non-Striker Batter */}
      <ComputerCricketPlayer
        role="nonstriker"
        name="PARTNER"
        jerseyNumber="18"
        jerseyColor="#1d4ed8"
        seedIdx={4}
      />

      {/* 9 Distinct Computer AI Outfielders */}
      {AI_FIELD_POSITIONS.map((f, idx) => (
        <ComputerCricketPlayer
          key={f.id}
          role="outfielder"
          fielderIdx={idx}
          name={AI_PLAYER_NAMES[idx % AI_PLAYER_NAMES.length]}
          jerseyNumber={`${20 + idx}`}
          jerseyColor="#047857"
          seedIdx={idx + 5}
        />
      ))}
    </group>
  )
}
