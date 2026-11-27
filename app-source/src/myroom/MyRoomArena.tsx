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
import { DartArenaLayer } from './DartArenaLayer'
import { computeAIDartThrowVelocity, findDartboardPlacement } from './dartEngine'
import { LeftWristSmartWatch, RightHandActiveToolView } from './LeftWristSmartWatch'
import { MyRoomARRig } from './MyRoomARRig'
import { stepMyRoomAI } from './myroomAI'
import { raycastRoomPlacementPoint } from './roomPhysics'
import { RealisticHumanAvatar } from './RealisticHumanAvatar'
import { RoomScanner } from './RoomScanner'
import {
  CraftMaterialKind,
  CraftShapePreset,
  getAllPaletteColors,
  getDefaultColorForKind,
  MATERIAL_PHYSICS,
} from './types'
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
  const showSelfBody = useMyRoomStore((s) => s.showSelfBody)
  const showAiOpponent = useMyRoomStore((s) => s.showAiOpponent)
  const dartGame = useMyRoomStore((s) => s.dartGame)
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

  const spawnInRoom = (kind: CraftMaterialKind, preset: CraftShapePreset) => {
    camera.getWorldPosition(_rayOrigin)
    camera.getWorldDirection(_rayDir)
    const placePos = raycastRoomPlacementPoint(
      [_rayOrigin.x, _rayOrigin.y, _rayOrigin.z],
      [_rayDir.x, _rayDir.y, _rayDir.z],
      myRoomRuntime.surfaces,
      myRoomRuntime.floorY,
      1.15
    )
    const color = getDefaultColorForKind(kind)
    const spec = MATERIAL_PHYSICS[kind]

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
      .setStatusHint(
        `${spec.label} (${spec.massKg}kg): ${
          spec.canFold
            ? spec.canSqueeze
              ? 'Fold, Squeeze, or Tear with hands!'
              : 'Fold with 2 palms, Tear, or Write with Watch Pen!'
            : spec.canSqueeze
              ? 'Squeeze (same volume!), Tear, or Cut with Knife!'
              : kind === 'wood'
                ? 'Stack solidly, or Cut/Chop with Watch Knife/Axe!'
                : 'Heavy solid — Stack structures & Probe with Watch Tester!'
        }`
      )
  }

  const getForwardBoardPose = () => {
    camera.getWorldPosition(_rayOrigin)
    camera.getWorldDirection(_rayDir)
    return findDartboardPlacement(
      [_rayOrigin.x, _rayOrigin.y, _rayOrigin.z],
      [_rayDir.x, _rayDir.z],
      myRoomRuntime.surfaces,
      myRoomRuntime.floorY,
      myRoomRuntime.roomBoundsXZ
    )
  }

  return (
    <group position={panelPoseRef.current.pos} rotation={[0, panelPoseRef.current.yaw, 0]}>
      <mesh>
        <boxGeometry args={[1.06, 1.02, 0.025]} />
        <meshStandardMaterial color="#0b1220" transparent opacity={0.92} roughness={0.5} />
      </mesh>
      <TextLabel position={[0, 0.44, 0.018]} fontSize={0.032} color="#38bdf8">
        {`MYROOM MR STUDIO  •  SURFACES: ${scannedCount}  •  OBJECTS: ${objectCount}  •  [B] HIDE`}
      </TextLabel>
      <TextLabel position={[0, 0.38, 0.018]} fontSize={0.021} color="#fde047">
        {statusHint || 'Pinch to Carry • Fold Paper • Tap Watch Tools • Play 6 Darts!'}
      </TextLabel>

      {/* Row 1: Squeezeable / Foldable Craft Materials */}
      <ARStudioButton
        position={[-0.31, 0.27, 0.016]}
        label="+ CLAY (0.7kg)"
        color="#c2410c"
        onClick={() => spawnInRoom('clay', 'sphere')}
      />
      <ARStudioButton
        position={[0, 0.27, 0.016]}
        label="+ PAPER (15g)"
        color="#0284c7"
        onClick={() => spawnInRoom('paper', 'sheet')}
      />
      <ARStudioButton
        position={[0.31, 0.27, 0.016]}
        label="+ CLOTH (0.2kg)"
        color="#dc2626"
        onClick={() => spawnInRoom('cloth', 'towel')}
      />

      {/* Row 2: Heavy Rigid Building Materials (+ Thin Wide Wood Plate) & Companion Pull */}
      <ARStudioButton
        position={[-0.36, 0.16, 0.016]}
        width={0.22}
        label="+ WOOD BLK"
        color="#92400e"
        onClick={() => spawnInRoom('wood', 'block')}
      />
      <ARStudioButton
        position={[-0.12, 0.16, 0.016]}
        width={0.22}
        label="+ WOOD PLATE"
        color="#b45309"
        onClick={() => spawnInRoom('wood', 'plate')}
      />
      <ARStudioButton
        position={[0.12, 0.16, 0.016]}
        width={0.22}
        label="+ METAL BLK"
        color="#475569"
        onClick={() => spawnInRoom('metal', 'block')}
      />
      <ARStudioButton
        position={[0.36, 0.16, 0.016]}
        width={0.22}
        label="PULL NEAR ME"
        color="#0d9488"
        onClick={() => {
          myRoomRuntime.ai.pullToUserActive = true
          useMyRoomStore.getState().setStatusHint('Pulling companion back nearest to you!')
        }}
      />

      {/* Row 3: Color, Room Scan, Hide/Show AI, AI Gender */}
      <ARStudioButton
        position={[-0.36, 0.05, 0.016]}
        width={0.22}
        label="NEXT COLOR"
        color={selectedColor}
        onClick={() => {
          const all = getAllPaletteColors()
          const next = all[(all.indexOf(selectedColor) + 1) % all.length]
          useMyRoomStore.getState().setSelectedColor(next)
        }}
      />
      <ARStudioButton
        position={[-0.12, 0.05, 0.016]}
        width={0.22}
        label={showRoomMesh ? 'SCAN: ON' : 'SCAN: OFF'}
        color={showRoomMesh ? '#059669' : '#475569'}
        onClick={() => useMyRoomStore.getState().setShowRoomMesh(!showRoomMesh)}
      />
      <ARStudioButton
        position={[0.12, 0.05, 0.016]}
        width={0.22}
        label={showAiOpponent ? 'AI: VISIBLE' : 'AI: HIDDEN'}
        color={showAiOpponent ? '#0284c7' : '#64748b'}
        onClick={() => useMyRoomStore.getState().setShowAiOpponent(!showAiOpponent)}
      />
      <ARStudioButton
        position={[0.36, 0.05, 0.016]}
        width={0.22}
        label={`AI: ${aiGender.toUpperCase()}`}
        color="#db2777"
        onClick={() => useGameStore.getState().setAiAvatarGender(aiGender === 'male' ? 'female' : 'male')}
      />

      {/* Row 4: Opponent Mode, Clear Mine, Mic */}
      <ARStudioButton
        position={[-0.31, -0.06, 0.016]}
        label={`MODE: ${opponentMode.toUpperCase()}`}
        color="#6366f1"
        onClick={() => {
          const next = opponentMode === 'auto' ? 'computer' : opponentMode === 'computer' ? 'peer' : 'auto'
          useMyRoomStore.getState().setOpponentMode(next)
        }}
      />
      <ARStudioButton
        position={[0, -0.06, 0.016]}
        label="CLEAR MINE"
        color="#d97706"
        onClick={() => clearAllMyRoomObjects(localPeerId || 'local')}
      />
      <ARStudioButton
        position={[0.31, -0.06, 0.016]}
        label={micEnabled ? 'MIC: ON' : 'MIC: MUTED'}
        color={micEnabled ? '#059669' : '#dc2626'}
        onClick={() => {
          voiceAudio.setMicEnabled(!micEnabled)
          p2pClient.broadcastProfile()
        }}
      />

      {/* Row 5: 6-Dart AR Mini-Game (Play vs AI or Peer, Relocate Board, Quick Throw) */}
      <ARStudioButton
        position={[-0.31, -0.18, 0.016]}
        label={
          dartGame.active
            ? dartGame.finished
              ? 'REMATCH DARTS'
              : 'END 6 DARTS'
            : 'PLAY 6 DARTS'
        }
        color={dartGame.active && !dartGame.finished ? '#e11d48' : '#16a34a'}
        onClick={() => {
          const st = useMyRoomStore.getState()
          if (!st.dartGame.active || st.dartGame.finished) {
            st.startDartMatch(getForwardBoardPose(), localPeerId || 'local', true)
          } else {
            st.stopDartMatch(true)
          }
        }}
      />
      <ARStudioButton
        position={[0, -0.18, 0.016]}
        label={dartGame.active ? 'MOVE BOARD' : '6 DARTS READY'}
        color={dartGame.active ? '#0891b2' : '#334155'}
        onClick={() => {
          if (useMyRoomStore.getState().dartGame.active) {
            useMyRoomStore.getState().relocateDartboard(getForwardBoardPose(), true)
          }
        }}
      />
      <ARStudioButton
        position={[0.31, -0.18, 0.016]}
        label={dartGame.active ? 'THROW DART' : '6 DARTS VS AI/PEER'}
        color={dartGame.active ? '#ca8a04' : '#334155'}
        onClick={() => {
          const st = useMyRoomStore.getState()
          const dg = st.dartGame
          const myId = localPeerId || 'local'
          if (!dg.active || dg.finished) return
          if (dg.turnOwnerId !== myId && dg.turnOwnerId !== 'local') return
          const myCount = dg.throws.filter((t) => t.thrower === 'local').length
          if (myCount >= 6) return
          if (myRoomRuntime.darts.flyingDarts.some((d) => d.thrower === 'local' && !d.settled)) return

          camera.getWorldPosition(_rayOrigin)
          const launchPos: [number, number, number] = [
            _rayOrigin.x + 0.14,
            _rayOrigin.y - 0.12,
            _rayOrigin.z,
          ]
          const vel = computeAIDartThrowVelocity(launchPos, dg.boardPose)
          myRoomRuntime.darts.flyingDarts.push({
            id: `tap_dart_${dg.matchId}_${myCount}_${Date.now()}`,
            thrower: 'local',
            throwerId: myId,
            throwIndex: myCount,
            inFlight: true,
            settled: false,
            flightTimeSec: 0,
            pos: launchPos,
            prevPos: [...launchPos],
            vel,
            quat: [0, 0, 0, 1],
          })
          myRoomRuntime.darts.readyDart = null
          myRoomRuntime.darts.lastThrowAtSec = performance.now() / 1000
        }}
      />

      {/* Row 6: Self Body, Main Lobby & Exit AR */}
      <ARStudioButton
        position={[-0.31, -0.31, 0.016]}
        label={showSelfBody ? 'MY BODY: ON' : 'MY BODY: OFF'}
        color={showSelfBody ? '#0ea5e9' : '#475569'}
        onClick={() => useMyRoomStore.getState().setShowSelfBody(!showSelfBody)}
      />
      <ARStudioButton
        position={[0, -0.31, 0.016]}
        label="MAIN LOBBY"
        color="#7c3aed"
        onClick={() => {
          void xrStore.getState().session?.end()
          void p2pClient.disconnect()
          useGameStore.getState().leaveRoomReset()
        }}
      />
      <ARStudioButton
        position={[0.31, -0.31, 0.016]}
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
  const showAiOpponent = useMyRoomStore((s) => s.showAiOpponent)
  const peerList = Object.values(peers)
  const showComputerAI =
    showAiOpponent && (opponentMode === 'computer' || (opponentMode === 'auto' && peerList.length === 0))

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
      <DartArenaLayer />
      <MyRoomARRig />
      <LeftWristSmartWatch />
      <RightHandActiveToolView />
      <InARCraftStudioPanel />

      {peerList.map((peer) => (
        <RemoteARPeerAvatar key={peer.id} peer={peer} />
      ))}

      {showComputerAI && <ComputerAROpponentAvatar />}
    </group>
  )
}
