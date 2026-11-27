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
import { InARShowcasePanel, RoomDecorLayer } from './RoomShowcaseLayer'
import {
  CraftMaterialKind,
  CraftShapePreset,
  getAllPaletteColors,
  getDefaultColorForKind,
  MATERIAL_PHYSICS,
} from './types'
import {
  clearAllCreatedRoomContent,
  clearAllMyRoomObjects,
  deleteRuntimeCraftObject,
  getCombinedRoomSurfaces,
  myRoomRuntime,
  spawnRuntimeCraftObject,
  useMyRoomStore,
} from './useMyRoomStore'

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
  const aiDressupStyle = useMyRoomStore((s) => s.aiDressupStyle)
  return (
    <group
      onPointerDown={(e) => {
        if (!useGameStore.getState().inXR && e.button === 0) {
          e.stopPropagation()
          myRoomRuntime.ai.desktopRotateDrag = true
        }
      }}
    >
      <RealisticHumanAvatar
        seedKey={`computer-roommate-${aiGender}`}
        displayName={aiGender === 'female' ? 'AI COMPANION (F)' : 'AI COMPANION (M)'}
        gender={aiGender}
        uniformStyle={
          aiDressupStyle === 'sport' ? 'sport' : aiDressupStyle === 'nerdy' ? 'nerdy' : 'casual'
        }
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
    </group>
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
  const aiDressupStyle = useMyRoomStore((s) => s.aiDressupStyle)
  const aiCanProduceObjects = useMyRoomStore((s) => s.aiCanProduceObjects)
  const selectedCraftId = useMyRoomStore((s) => s.selectedCraftId)
  const showcaseOpen = useMyRoomStore((s) => s.showcaseOpen)
  const decorCount = useMyRoomStore((s) => s.decorCount)
  const dartGame = useMyRoomStore((s) => s.dartGame)
  const opponentMode = useMyRoomStore((s) => s.opponentMode)
  const scannedCount = useMyRoomStore((s) => s.scannedSurfaceCount)
  const objectCount = useMyRoomStore((s) => s.objectCount)
  const statusHint = useMyRoomStore((s) => s.statusHint)

  const camera = useThree((s) => s.camera)
  const panelPoseRef = useRef<{ pos: [number, number, number]; yaw: number }>({
    pos: [-0.72, 1.32, -0.25],
    yaw: 0.48,
  })
  const prevVisibleRef = useRef(false)
  const inXR = useGameStore((s) => s.inXR)

  // Dynamically anchor menu comfortably ahead-left of user whenever opened (skipping pre-snap z=5.4 default)
  useEffect(() => {
    if (vrMenuVisible && !prevVisibleRef.current) {
      camera.getWorldPosition(_rayOrigin)
      camera.getWorldDirection(_rayDir)
      _rayDir.y = 0
      if (_rayDir.lengthSq() < 1e-4) _rayDir.set(0, 0, -1)
      _rayDir.normalize()
      const rightX = -_rayDir.z
      const rightZ = _rayDir.x
      if (!inXR && Math.abs(_rayOrigin.z - 5.4) < 0.05) {
        panelPoseRef.current = { pos: [-0.72, 1.32, -0.25], yaw: 0.48 }
      } else {
        panelPoseRef.current = {
          pos: [
            _rayOrigin.x + _rayDir.x * 1.05 - rightX * 0.46,
            Math.max(myRoomRuntime.floorY + 0.85, _rayOrigin.y - 0.14),
            _rayOrigin.z + _rayDir.z * 1.05 - rightZ * 0.46,
          ],
          yaw: Math.atan2(-_rayDir.x, -_rayDir.z) + 0.42,
        }
      }
    }
    prevVisibleRef.current = vrMenuVisible
  }, [vrMenuVisible, camera, inXR])

  if (!vrMenuVisible) return null

  const spawnInRoom = (kind: CraftMaterialKind, preset: CraftShapePreset) => {
    camera.getWorldPosition(_rayOrigin)
    camera.getWorldDirection(_rayDir)
    const placePos = raycastRoomPlacementPoint(
      [_rayOrigin.x, _rayOrigin.y, _rayOrigin.z],
      [_rayDir.x, _rayDir.y, _rayDir.z],
      getCombinedRoomSurfaces(),
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
        <boxGeometry args={[1.06, 1.12, 0.025]} />
        <meshStandardMaterial color="#0b1220" transparent opacity={0.92} roughness={0.5} />
      </mesh>
      <TextLabel position={[0, 0.48, 0.018]} fontSize={0.032} color="#38bdf8">
        {`MYROOM MR STUDIO  •  SURFACES: ${scannedCount}  •  OBJECTS: ${objectCount}  •  [B] HIDE`}
      </TextLabel>
      <TextLabel position={[0, 0.42, 0.018]} fontSize={0.021} color="#fde047">
        {statusHint || 'Pinch to Carry • Fold Paper • Tap Watch Tools • Play 6 Darts!'}
      </TextLabel>

      {/* Row 1: Squeezeable / Foldable Craft Materials */}
      <ARStudioButton
        position={[-0.31, 0.31, 0.016]}
        label="+ CLAY (0.7kg)"
        color="#c2410c"
        onClick={() => spawnInRoom('clay', 'sphere')}
      />
      <ARStudioButton
        position={[0, 0.31, 0.016]}
        label="+ PAPER (15g)"
        color="#0284c7"
        onClick={() => spawnInRoom('paper', 'sheet')}
      />
      <ARStudioButton
        position={[0.31, 0.31, 0.016]}
        label="+ CLOTH (0.2kg)"
        color="#dc2626"
        onClick={() => spawnInRoom('cloth', 'towel')}
      />

      {/* Row 2: Heavy Rigid Building Materials (+ Thin Wide Wood Plate) & Companion Pull */}
      <ARStudioButton
        position={[-0.36, 0.2, 0.016]}
        width={0.22}
        label="+ WOOD BLK"
        color="#92400e"
        onClick={() => spawnInRoom('wood', 'block')}
      />
      <ARStudioButton
        position={[-0.12, 0.2, 0.016]}
        width={0.22}
        label="+ WOOD PLATE"
        color="#b45309"
        onClick={() => spawnInRoom('wood', 'plate')}
      />
      <ARStudioButton
        position={[0.12, 0.2, 0.016]}
        width={0.22}
        label="+ METAL BLK"
        color="#475569"
        onClick={() => spawnInRoom('metal', 'block')}
      />
      <ARStudioButton
        position={[0.36, 0.2, 0.016]}
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
        position={[-0.36, 0.09, 0.016]}
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
        position={[-0.12, 0.09, 0.016]}
        width={0.22}
        label={showRoomMesh ? 'SCAN: ON' : 'SCAN: OFF'}
        color={showRoomMesh ? '#059669' : '#475569'}
        onClick={() => useMyRoomStore.getState().setShowRoomMesh(!showRoomMesh)}
      />
      <ARStudioButton
        position={[0.12, 0.09, 0.016]}
        width={0.22}
        label={showAiOpponent ? 'AI: VISIBLE' : 'AI: HIDDEN'}
        color={showAiOpponent ? '#0284c7' : '#64748b'}
        onClick={() => useMyRoomStore.getState().setShowAiOpponent(!showAiOpponent)}
      />
      <ARStudioButton
        position={[0.36, 0.09, 0.016]}
        width={0.22}
        label={`AI: ${aiGender.toUpperCase()}`}
        color="#db2777"
        onClick={() => useGameStore.getState().setAiAvatarGender(aiGender === 'male' ? 'female' : 'male')}
      />

      {/* Row 4: Opponent Mode, AI Object Production Toggle, Remove Selected/Last, Clear All Created */}
      <ARStudioButton
        position={[-0.36, -0.02, 0.016]}
        width={0.22}
        label={`MODE: ${opponentMode.toUpperCase()}`}
        color="#6366f1"
        onClick={() => {
          const next = opponentMode === 'auto' ? 'computer' : opponentMode === 'computer' ? 'peer' : 'auto'
          useMyRoomStore.getState().setOpponentMode(next)
        }}
      />
      <ARStudioButton
        position={[-0.12, -0.02, 0.016]}
        width={0.22}
        label={aiCanProduceObjects ? 'AI PROD: ON' : 'AI PROD: OFF'}
        color={aiCanProduceObjects ? '#059669' : '#475569'}
        onClick={() => useMyRoomStore.getState().setAiCanProduceObjects(!aiCanProduceObjects)}
      />
      <ARStudioButton
        position={[0.12, -0.02, 0.016]}
        width={0.22}
        label={selectedCraftId ? 'DEL SEL OBJ' : 'DEL LAST OBJ'}
        color="#ea580c"
        onClick={() => {
          const keys = Array.from(myRoomRuntime.objects.keys())
          const targetId =
            selectedCraftId && myRoomRuntime.objects.has(selectedCraftId)
              ? selectedCraftId
              : keys[keys.length - 1]
          if (targetId) {
            deleteRuntimeCraftObject(targetId, true)
            useMyRoomStore.getState().setStatusHint('Removed created object!')
          }
        }}
      />
      <ARStudioButton
        position={[0.36, -0.02, 0.016]}
        width={0.22}
        label="CLEAR ALL OBJS"
        color="#d97706"
        onClick={() => {
          clearAllMyRoomObjects()
          useMyRoomStore.getState().setStatusHint('Removed all created craft objects!')
        }}
      />

      {/* Row 5: 6-Dart AR Mini-Game (Play vs AI or Peer, Relocate Board, Quick Throw) */}
      <ARStudioButton
        position={[-0.31, -0.13, 0.016]}
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
        position={[0, -0.13, 0.016]}
        label={dartGame.active ? 'MOVE BOARD' : '6 DARTS READY'}
        color={dartGame.active ? '#0891b2' : '#334155'}
        onClick={() => {
          if (useMyRoomStore.getState().dartGame.active) {
            useMyRoomStore.getState().relocateDartboard(getForwardBoardPose(), true)
          }
        }}
      />
      <ARStudioButton
        position={[0.31, -0.13, 0.016]}
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

      {/* Row 6: Showcase Panel, Self Body, Mic & Wipe All Room Content */}
      <ARStudioButton
        position={[-0.36, -0.25, 0.016]}
        width={0.22}
        label={showcaseOpen ? 'SHOWCASE: ON' : `SHOWCASE (${decorCount})`}
        color={showcaseOpen ? '#eab308' : '#b45309'}
        onClick={() => useMyRoomStore.getState().setShowcaseOpen(!showcaseOpen)}
      />
      <ARStudioButton
        position={[-0.12, -0.25, 0.016]}
        width={0.22}
        label={showSelfBody ? 'MY BODY: ON' : 'MY BODY: OFF'}
        color={showSelfBody ? '#0ea5e9' : '#475569'}
        onClick={() => useMyRoomStore.getState().setShowSelfBody(!showSelfBody)}
      />
      <ARStudioButton
        position={[0.12, -0.25, 0.016]}
        width={0.22}
        label={micEnabled ? 'MIC: ON' : 'MIC: MUTED'}
        color={micEnabled ? '#059669' : '#dc2626'}
        onClick={() => {
          voiceAudio.setMicEnabled(!micEnabled)
          p2pClient.broadcastProfile()
        }}
      />
      <ARStudioButton
        position={[0.36, -0.25, 0.016]}
        width={0.22}
        label="WIPE EVERYTHING"
        color="#9f1239"
        onClick={() => {
          clearAllCreatedRoomContent()
          useMyRoomStore.getState().setStatusHint('Removed all created craft objects and room decor!')
        }}
      />

      {/* Row 7: AI Dressup Style (Chic / Nerdy / Sporty), Main Lobby & Exit AR */}
      <ARStudioButton
        position={[-0.31, -0.37, 0.016]}
        width={0.28}
        label={
          aiDressupStyle === 'sport'
            ? 'DRESS: SPORTY'
            : aiDressupStyle === 'nerdy'
              ? 'DRESS: NERDY'
              : 'DRESS: CHIC'
        }
        color={
          aiDressupStyle === 'sport'
            ? '#0284c7'
            : aiDressupStyle === 'nerdy'
              ? '#4338ca'
              : '#7d293b'
        }
        onClick={() => {
          const next =
            aiDressupStyle === 'chic' ? 'nerdy' : aiDressupStyle === 'nerdy' ? 'sport' : 'chic'
          useMyRoomStore.getState().setAiDressupStyle(next)
        }}
      />
      <ARStudioButton
        position={[0, -0.37, 0.016]}
        width={0.28}
        label="MAIN LOBBY"
        color="#7c3aed"
        onClick={() => {
          void xrStore.getState().session?.end()
          void p2pClient.disconnect()
          useGameStore.getState().leaveRoomReset()
        }}
      />
      <ARStudioButton
        position={[0.31, -0.37, 0.016]}
        width={0.28}
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
  const xrMode = useGameStore((s) => s.xrMode)
  const opponentMode = useMyRoomStore((s) => s.opponentMode)
  const showAiOpponent = useMyRoomStore((s) => s.showAiOpponent)
  const peerList = Object.values(peers)
  const showComputerAI =
    showAiOpponent && (opponentMode === 'computer' || (opponentMode === 'auto' && peerList.length === 0))
  const isPassThroughAR = xrMode === 'immersive-ar'

  useFrame((_, delta) => {
    stepMyRoomAI(delta, localPeerId, peerList.length > 0)
  })

  return (
    <group>
      {/* Balanced Warm Beauty Studio / AR lighting so true skin tones glow naturally without gray cast */}
      <hemisphereLight args={['#fffdf9', '#9f8276', 1.55]} />
      <directionalLight position={[2.8, 4.5, 3.2]} intensity={1.4} color="#fff9f2" />
      <directionalLight position={[-2.8, 3.8, -2.5]} intensity={0.75} color="#fff5eb" />
      <directionalLight position={[0, 1.8, 2.8]} intensity={0.75} color="#fff4ea" />

      {/* Grounded virtual studio backdrop when previewing or running MyRoom in pure VR (non-passthrough) */}
      {!isPassThroughAR && (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} receiveShadow>
            <circleGeometry args={[6.5, 48]} />
            <meshStandardMaterial color="#131c2e" roughness={0.85} metalness={0.05} />
          </mesh>
          <gridHelper args={[10, 20, '#334155', '#1e293b']} position={[0, -0.002, 0]} />
        </group>
      )}

      <RoomScanner />
      <RoomDecorLayer />
      <CraftObjectsLayer />
      <DartArenaLayer />
      <MyRoomARRig />
      <LeftWristSmartWatch />
      <RightHandActiveToolView />
      <InARCraftStudioPanel />
      <InARShowcasePanel />

      {peerList.map((peer) => (
        <RemoteARPeerAvatar key={peer.id} peer={peer} />
      ))}

      {showComputerAI && <ComputerAROpponentAvatar />}
    </group>
  )
}
