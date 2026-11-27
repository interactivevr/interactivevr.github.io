import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { p2pClient } from '../net/p2pClient'
import { voiceAudio } from '../net/voiceAudio'
import { getAthleteProfile, HumanFaceHead } from '../scene/HumanFace'
import { TextLabel } from '../scene/TextLabel'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { PeerInfo } from '../types/game'
import { xrStore } from '../xr/xrStore'
import { CraftObjectsLayer } from './CraftObjectMesh'
import { MyRoomARRig } from './MyRoomARRig'
import { stepMyRoomAI } from './myroomAI'
import { raycastRoomPlacementPoint } from './roomPhysics'
import { RealisticHumanAvatar } from './RealisticHumanAvatar'
import { RoomScanner } from './RoomScanner'
import { CLAY_COLORS, PAPER_COLORS } from './types'
import { clearAllMyRoomObjects, myRoomRuntime, spawnRuntimeCraftObject, useMyRoomStore } from './useMyRoomStore'

const _targetVec = new THREE.Vector3()
const _targetQuat = new THREE.Quaternion()
const _euler = new THREE.Euler()
const _rayOrigin = new THREE.Vector3()
const _rayDir = new THREE.Vector3()

function RemoteARPeerAvatar({ peer }: { peer: PeerInfo }) {
  const headRef = useRef<THREE.Group>(null)
  const bodyPosRef = useRef<[number, number, number]>([0, 0, -1.6])
  const prevPosRef = useRef<[number, number, number]>([0, 0, -1.6])
  const yawRef = useRef(0)
  const walkSpeedRef = useRef(0)
  const walkPhaseRef = useRef(0)
  const leftWristRef = useRef<[number, number, number]>([-0.24, 1.15, -1.4])
  const rightWristRef = useRef<[number, number, number]>([0.24, 1.15, -1.4])

  const gender = peer.avatarGender ?? 'male'
  const profile = useMemo(() => getAthleteProfile(peer.id, gender), [peer.id, gender])

  useEffect(() => {
    if (headRef.current) {
      voiceAudio.attachRigToAvatarHead(peer.id, headRef.current)
    }
  }, [peer.id])

  useFrame((_, delta) => {
    const poseEntry = runtimeState.remotePoses[peer.id]
    if (!poseEntry) return

    if (headRef.current && runtimeState.remoteStreams[peer.id]) {
      voiceAudio.attachRigToAvatarHead(peer.id, headRef.current)
    }

    const cDt = Math.min(delta, 0.05)
    const alpha = 1 - Math.exp(-18 * cDt)
    const { target } = poseEntry

    if (headRef.current) {
      _targetVec.set(target.headPos[0], target.headPos[1], target.headPos[2])
      headRef.current.position.lerp(_targetVec, alpha)
      _targetQuat.set(target.headQuat[0], target.headQuat[1], target.headQuat[2], target.headQuat[3])
      headRef.current.quaternion.slerp(_targetQuat, alpha)

      prevPosRef.current = [...bodyPosRef.current]
      bodyPosRef.current = [
        headRef.current.position.x,
        Math.max(0, headRef.current.position.y - 1.56),
        headRef.current.position.z,
      ]
      _euler.setFromQuaternion(headRef.current.quaternion, 'YXZ')
      yawRef.current = _euler.y

      const spd =
        Math.hypot(
          bodyPosRef.current[0] - prevPosRef.current[0],
          bodyPosRef.current[2] - prevPosRef.current[2]
        ) / Math.max(0.005, cDt)
      walkSpeedRef.current = Math.min(1, spd / 2.2)
      if (walkSpeedRef.current > 0.06) {
        walkPhaseRef.current += cDt * 8.5 * walkSpeedRef.current
      }
    }

    leftWristRef.current = [...target.leftPos]
    rightWristRef.current = [...target.rightPos]
  })

  return (
    <group>
      <RealisticHumanAvatar
        seedKey={peer.id}
        displayName={peer.name}
        gender={gender}
        outfitColor={peer.color}
        hideHead
        speakingLevel={peer.speakingLevel}
        getBodyAnchor={() => ({
          pos: bodyPosRef.current,
          yaw: yawRef.current,
          walkSpeed: walkSpeedRef.current,
          walkPhase: walkPhaseRef.current,
        })}
        getLeftWrist={() => leftWristRef.current}
        getRightWrist={() => rightWristRef.current}
      />
      <group ref={headRef} position={[0, 1.56, -1.6]}>
        <HumanFaceHead profile={profile} gender={gender} showHair allowSunglasses={false} />
      </group>
    </group>
  )
}

function ComputerAROpponentAvatar() {
  const aiGender = useGameStore((s) => s.aiAvatarGender)
  return (
    <RealisticHumanAvatar
      seedKey={`computer-roommate-${aiGender}`}
      displayName={aiGender === 'female' ? 'AI COMPANION (F)' : 'AI COMPANION (M)'}
      gender={aiGender}
      outfitColor={aiGender === 'female' ? '#be185d' : '#1d4ed8'}
      accentColor={aiGender === 'female' ? '#fbcfe8' : '#38bdf8'}
      getBodyAnchor={() => ({
        pos: myRoomRuntime.ai.pos,
        yaw: myRoomRuntime.ai.yaw,
        sitBlend: myRoomRuntime.ai.sitBlend,
        walkSpeed: myRoomRuntime.ai.isWalking ? 1 : 0,
        walkPhase: myRoomRuntime.ai.walkPhase,
        headPitch: myRoomRuntime.ai.headReactPitch,
        headYaw: myRoomRuntime.ai.headReactYaw,
        headRoll: myRoomRuntime.ai.headReactRoll,
        torsoPitch: myRoomRuntime.ai.torsoReactPitch,
        torsoRoll: myRoomRuntime.ai.torsoReactRoll,
        hairPullWorld: myRoomRuntime.ai.hairPullTarget,
        onWorldTargets: (headPos, hairPos) => {
          myRoomRuntime.ai.headWorldPos = headPos
          myRoomRuntime.ai.hairWorldPos = hairPos
        },
      })}
      getLeftWrist={() => myRoomRuntime.ai.leftHand}
      getRightWrist={() => myRoomRuntime.ai.rightHand}
    />
  )
}

function ARStudioButton({
  position,
  label,
  color,
  width = 0.28,
  onClick,
}: {
  position: [number, number, number]
  label: string
  color: string
  width?: number
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <group position={position}>
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[width, 0.085, 0.022]} />
        <meshStandardMaterial
          color={hovered ? '#ffffff' : color}
          emissive={color}
          emissiveIntensity={hovered ? 0.65 : 0.28}
        />
      </mesh>
      <TextLabel position={[0, 0, 0.015]} fontSize={0.025} color={hovered ? '#0f172a' : '#f8fafc'}>
        {label}
      </TextLabel>
    </group>
  )
}

function InARCraftStudioPanel() {
  const vrMenuVisible = useGameStore((s) => s.vrMenuVisible)
  const localPeerId = useGameStore((s) => s.localPeerId)
  const aiGender = useGameStore((s) => s.aiAvatarGender)
  const micEnabled = useGameStore((s) => s.micEnabled)

  const selectedColor = useMyRoomStore((s) => s.selectedColor)
  const showRoomMesh = useMyRoomStore((s) => s.showRoomMesh)
  const opponentMode = useMyRoomStore((s) => s.opponentMode)
  const scannedCount = useMyRoomStore((s) => s.scannedSurfaceCount)
  const objectCount = useMyRoomStore((s) => s.objectCount)
  const statusHint = useMyRoomStore((s) => s.statusHint)

  const camera = useThree((s) => s.camera)
  const panelPoseRef = useRef<{ pos: [number, number, number]; yaw: number }>({
    pos: [-0.52, 1.18, -0.78],
    yaw: 0.55,
  })
  const prevVisibleRef = useRef(false)

  // Dynamically anchor menu comfortably in front-left of user whenever opened (works seated or standing anywhere in room!)
  useEffect(() => {
    if (vrMenuVisible && !prevVisibleRef.current) {
      camera.getWorldPosition(_rayOrigin)
      camera.getWorldDirection(_rayDir)
      _rayDir.y = 0
      if (_rayDir.lengthSq() < 1e-4) _rayDir.set(0, 0, -1)
      _rayDir.normalize()
      const rightX = -_rayDir.z
      const rightZ = _rayDir.x
      panelPoseRef.current = {
        pos: [
          _rayOrigin.x + _rayDir.x * 0.85 - rightX * 0.42,
          Math.max(myRoomRuntime.floorY + 0.85, _rayOrigin.y - 0.14),
          _rayOrigin.z + _rayDir.z * 0.85 - rightZ * 0.42,
        ],
        yaw: Math.atan2(-_rayDir.x, -_rayDir.z) + 0.42,
      }
    }
    prevVisibleRef.current = vrMenuVisible
  }, [vrMenuVisible, camera])

  if (!vrMenuVisible) return null

  const spawnInRoom = (kind: 'clay' | 'paper', preset: 'sphere' | 'cylinder' | 'sheet') => {
    camera.getWorldPosition(_rayOrigin)
    camera.getWorldDirection(_rayDir)
    const placePos = raycastRoomPlacementPoint(
      [_rayOrigin.x, _rayOrigin.y, _rayOrigin.z],
      [_rayDir.x, _rayDir.y, _rayDir.z],
      myRoomRuntime.surfaces,
      myRoomRuntime.floorY,
      1.15
    )
    const color =
      kind === 'clay'
        ? CLAY_COLORS.includes(selectedColor as (typeof CLAY_COLORS)[number])
          ? selectedColor
          : CLAY_COLORS[0]
        : PAPER_COLORS.includes(selectedColor as (typeof PAPER_COLORS)[number])
          ? selectedColor
          : PAPER_COLORS[0]

    spawnRuntimeCraftObject({
      ownerId: null,
      creatorId: localPeerId || 'local',
      kind,
      preset,
      color,
      pos: placePos,
      broadcast: true,
    })
    useMyRoomStore
      .getState()
      .setStatusHint(`Created ${kind.toUpperCase()} (${preset})! Squeeze palms or pull apart to tear.`)
  }

  return (
    <group position={panelPoseRef.current.pos} rotation={[0, panelPoseRef.current.yaw, 0]}>
      <mesh>
        <boxGeometry args={[0.96, 0.72, 0.025]} />
        <meshStandardMaterial color="#0b1220" transparent opacity={0.9} roughness={0.5} />
      </mesh>
      <TextLabel position={[0, 0.3, 0.018]} fontSize={0.032} color="#38bdf8">
        {`MYROOM MR STUDIO  •  SURFACES: ${scannedCount}  •  OBJECTS: ${objectCount}  •  [B] HIDE`}
      </TextLabel>
      <TextLabel position={[0, 0.24, 0.018]} fontSize={0.021} color="#fde047">
        {statusHint || 'Pinch/Grab to Place • Squeeze Palm to Shape • Pull Two Hands to Tear'}
      </TextLabel>

      {/* Row 1: Create Clay & Paper Objects */}
      <ARStudioButton
        position={[-0.3, 0.14, 0.016]}
        label="+ CLAY LUMP"
        color="#c2410c"
        onClick={() => spawnInRoom('clay', 'sphere')}
      />
      <ARStudioButton
        position={[0, 0.14, 0.016]}
        label="+ CLAY ROLL"
        color="#b45309"
        onClick={() => spawnInRoom('clay', 'cylinder')}
      />
      <ARStudioButton
        position={[0.3, 0.14, 0.016]}
        label="+ PAPER SHEET"
        color="#0284c7"
        onClick={() => spawnInRoom('paper', 'sheet')}
      />

      {/* Row 2: Color, Room Scan Wireframe, Opponent Mode */}
      <ARStudioButton
        position={[-0.3, 0.03, 0.016]}
        label="NEXT COLOR"
        color={selectedColor}
        onClick={() => {
          const all: string[] = [...CLAY_COLORS, ...PAPER_COLORS]
          const next = all[(all.indexOf(selectedColor) + 1) % all.length]
          useMyRoomStore.getState().setSelectedColor(next)
        }}
      />
      <ARStudioButton
        position={[0, 0.03, 0.016]}
        label={showRoomMesh ? 'ROOM SCAN: ON' : 'ROOM SCAN: OFF'}
        color={showRoomMesh ? '#059669' : '#475569'}
        onClick={() => useMyRoomStore.getState().setShowRoomMesh(!showRoomMesh)}
      />
      <ARStudioButton
        position={[0.3, 0.03, 0.016]}
        label={`AI: ${aiGender.toUpperCase()}`}
        color="#db2777"
        onClick={() => useGameStore.getState().setAiAvatarGender(aiGender === 'male' ? 'female' : 'male')}
      />

      {/* Row 3: Opponent Mode, Clear Mine, Mic */}
      <ARStudioButton
        position={[-0.3, -0.08, 0.016]}
        label={`MODE: ${opponentMode.toUpperCase()}`}
        color="#6366f1"
        onClick={() => {
          const next = opponentMode === 'auto' ? 'computer' : opponentMode === 'computer' ? 'peer' : 'auto'
          useMyRoomStore.getState().setOpponentMode(next)
        }}
      />
      <ARStudioButton
        position={[0, -0.08, 0.016]}
        label="CLEAR MINE"
        color="#d97706"
        onClick={() => clearAllMyRoomObjects(localPeerId || 'local')}
      />
      <ARStudioButton
        position={[0.3, -0.08, 0.016]}
        label={micEnabled ? 'MIC: ON' : 'MIC: MUTED'}
        color={micEnabled ? '#059669' : '#dc2626'}
        onClick={() => {
          voiceAudio.setMicEnabled(!micEnabled)
          p2pClient.broadcastProfile()
        }}
      />

      {/* Row 4: Main Lobby & Exit AR */}
      <ARStudioButton
        position={[-0.17, -0.22, 0.016]}
        width={0.36}
        label="MAIN LOBBY"
        color="#7c3aed"
        onClick={() => {
          void xrStore.getState().session?.end()
          void p2pClient.disconnect()
          useGameStore.getState().leaveRoomReset()
        }}
      />
      <ARStudioButton
        position={[0.17, -0.22, 0.016]}
        width={0.36}
        label="EXIT AR"
        color="#b91c1c"
        onClick={() => {
          void xrStore.getState().session?.end()
        }}
      />
    </group>
  )
}

export function MyRoomArena() {
  const peers = useGameStore((s) => s.peers)
  const localPeerId = useGameStore((s) => s.localPeerId)
  const opponentMode = useMyRoomStore((s) => s.opponentMode)
  const peerList = Object.values(peers)
  const showComputerAI =
    opponentMode === 'computer' || (opponentMode === 'auto' && peerList.length === 0)

  useFrame((_, delta) => {
    stepMyRoomAI(delta, localPeerId, peerList.length > 0)
  })

  return (
    <group>
      {/* Natural AR lighting without opaque background or fog so camera passthrough renders seamlessly */}
      <hemisphereLight args={['#ffffff', '#475569', 1.15]} />
      <directionalLight position={[3.5, 5.5, 2.5]} intensity={1.35} />
      <directionalLight position={[-3.0, 4.0, -2.5]} intensity={0.55} color="#e0f2fe" />

      <RoomScanner />
      <CraftObjectsLayer />
      <MyRoomARRig />
      <InARCraftStudioPanel />

      {peerList.map((peer) => (
        <RemoteARPeerAvatar key={peer.id} peer={peer} />
      ))}

      {showComputerAI && <ComputerAROpponentAvatar />}
    </group>
  )
}
