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
import { ARIconKind, getARPanelButtonTexture } from './arIconCanvas'
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
  const inXR = useGameStore((s) => s.inXR)
  const aiDressupStyle = useMyRoomStore((s) => s.aiDressupStyle)
  const aiAutoRotate = useMyRoomStore((s) => s.aiAutoRotate)
  const hitProxyRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)

  useFrame(() => {
    if (hitProxyRef.current) {
      const p = myRoomRuntime.ai.pos
      hitProxyRef.current.position.set(p[0], p[1], p[2])
    }
  })

  return (
    <group
      onPointerOver={(e) => {
        if (!inXR) {
          e.stopPropagation()
          setHovered(true)
          if (!myRoomRuntime.ai.desktopRotateDrag) {
            document.body.style.cursor = 'grab'
          }
        }
      }}
      onPointerOut={() => {
        setHovered(false)
        if (!myRoomRuntime.ai.desktopRotateDrag) {
          document.body.style.cursor = ''
        }
      }}
      onPointerDown={(e) => {
        if (!useGameStore.getState().inXR && e.button === 0) {
          e.stopPropagation()
          myRoomRuntime.ai.desktopRotateDrag = true
          document.body.style.cursor = 'grabbing'
        }
      }}
    >
      {/* Tracked wide invisible body proxy collider + turntable hover ring so drag rotation never misses */}
      <group ref={hitProxyRef}>
        {!inXR && (
          <mesh position={[0, 0.88, 0]}>
            <cylinderGeometry args={[0.32, 0.32, 1.76, 16]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
        {!inXR && (hovered || aiAutoRotate) && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
            <ringGeometry args={[0.34, 0.4, 32]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.65} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
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
  icon,
  color,
  width = 0.17,
  height = 0.06,
  onClick,
}: {
  position: [number, number, number]
  label: string
  icon: ARIconKind
  color: string
  width?: number
  height?: number
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const tex = getARPanelButtonTexture(label, icon, color, hovered, width / height)
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
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={tex} transparent />
      </mesh>
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
  const aiAutoRotate = useMyRoomStore((s) => s.aiAutoRotate)
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
      {/* Sleek compact glassmorphic AR studio frame */}
      <mesh position={[0, -0.03, 0]}>
        <boxGeometry args={[0.78, 0.78, 0.014]} />
        <meshStandardMaterial color="#090f1d" transparent opacity={0.9} roughness={0.38} metalness={0.18} />
      </mesh>
      <mesh position={[0, 0.36, 0.008]}>
        <boxGeometry args={[0.78, 0.008, 0.006]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <TextLabel position={[-0.04, 0.325, 0.012]} fontSize={0.019} color="#38bdf8">
        {`MYROOM STUDIO  •  SRF ${scannedCount}  •  OBJ ${objectCount}`}
      </TextLabel>
      <ARStudioButton
        position={[0.31, 0.325, 0.012]}
        width={0.12}
        height={0.044}
        icon="close"
        label="HIDE"
        color="#475569"
        onClick={() => useGameStore.getState().setVrMenuVisible(false)}
      />
      <TextLabel position={[0, 0.282, 0.012]} fontSize={0.0115} color="#fde047">
        {(statusHint || 'Pinch to Pull Companion • Grab Board/Darts • Wrist Dock [B]').slice(0, 66)}
      </TextLabel>

      {/* Row 1: Craft Spawners (4 compact icon buttons) */}
      <ARStudioButton position={[-0.27, 0.215, 0.012]} icon="clay" label="CLAY" color="#c2410c" onClick={() => spawnInRoom('clay', 'sphere')} />
      <ARStudioButton position={[-0.09, 0.215, 0.012]} icon="paper" label="PAPER" color="#0284c7" onClick={() => spawnInRoom('paper', 'sheet')} />
      <ARStudioButton position={[0.09, 0.215, 0.012]} icon="cloth" label="CLOTH" color="#dc2626" onClick={() => spawnInRoom('cloth', 'towel')} />
      <ARStudioButton position={[0.27, 0.215, 0.012]} icon="wood" label="WOOD" color="#92400e" onClick={() => spawnInRoom('wood', 'block')} />

      {/* Row 2: Plate, Metal, Pull AI, Next Color */}
      <ARStudioButton position={[-0.27, 0.145, 0.012]} icon="plate" label="PLATE" color="#b45309" onClick={() => spawnInRoom('wood', 'plate')} />
      <ARStudioButton position={[-0.09, 0.145, 0.012]} icon="metal" label="METAL" color="#475569" onClick={() => spawnInRoom('metal', 'block')} />
      <ARStudioButton
        position={[0.09, 0.145, 0.012]}
        icon="pull"
        label="PULL AI"
        color="#0d9488"
        onClick={() => {
          myRoomRuntime.ai.pullToUserActive = true
          useMyRoomStore.getState().setStatusHint('Pulling companion back nearest to you!')
        }}
      />
      <ARStudioButton
        position={[0.27, 0.145, 0.012]}
        icon="color"
        label="COLOR"
        color={selectedColor}
        onClick={() => {
          const all = getAllPaletteColors()
          const next = all[(all.indexOf(selectedColor) + 1) % all.length]
          useMyRoomStore.getState().setSelectedColor(next)
        }}
      />

      {/* Row 3: Room Scan, AI Visibility, AI Gender, Mode */}
      <ARStudioButton
        position={[-0.27, 0.075, 0.012]}
        icon="scan"
        label={showRoomMesh ? 'SCAN ON' : 'SCAN OFF'}
        color={showRoomMesh ? '#059669' : '#475569'}
        onClick={() => useMyRoomStore.getState().setShowRoomMesh(!showRoomMesh)}
      />
      <ARStudioButton
        position={[-0.09, 0.075, 0.012]}
        icon="ai"
        label={showAiOpponent ? 'AI ON' : 'AI OFF'}
        color={showAiOpponent ? '#0284c7' : '#64748b'}
        onClick={() => useMyRoomStore.getState().setShowAiOpponent(!showAiOpponent)}
      />
      <ARStudioButton
        position={[0.09, 0.075, 0.012]}
        icon="gender"
        label={aiGender === 'female' ? 'FEMALE' : 'MALE'}
        color="#db2777"
        onClick={() => useGameStore.getState().setAiAvatarGender(aiGender === 'male' ? 'female' : 'male')}
      />
      <ARStudioButton
        position={[0.27, 0.075, 0.012]}
        icon="mode"
        label={opponentMode.toUpperCase()}
        color="#6366f1"
        onClick={() => {
          const next = opponentMode === 'auto' ? 'computer' : opponentMode === 'computer' ? 'peer' : 'auto'
          useMyRoomStore.getState().setOpponentMode(next)
        }}
      />

      {/* Row 4: AI Produce, Delete Object, Clear All, Wipe All */}
      <ARStudioButton
        position={[-0.27, 0.005, 0.012]}
        icon="produce"
        label={aiCanProduceObjects ? 'CRAFT ON' : 'CRAFT OFF'}
        color={aiCanProduceObjects ? '#059669' : '#475569'}
        onClick={() => useMyRoomStore.getState().setAiCanProduceObjects(!aiCanProduceObjects)}
      />
      <ARStudioButton
        position={[-0.09, 0.005, 0.012]}
        icon="delete"
        label={selectedCraftId ? 'DEL SEL' : 'DEL LAST'}
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
        position={[0.09, 0.005, 0.012]}
        icon="clear"
        label="CLR OBJ"
        color="#d97706"
        onClick={() => {
          clearAllMyRoomObjects()
          useMyRoomStore.getState().setStatusHint('Removed all created craft objects!')
        }}
      />
      <ARStudioButton
        position={[0.27, 0.005, 0.012]}
        icon="wipe"
        label="WIPE ALL"
        color="#9f1239"
        onClick={() => {
          clearAllCreatedRoomContent()
          useMyRoomStore.getState().setStatusHint('Removed all created craft objects and room decor!')
        }}
      />

      {/* Row 5: 6-Dart AR Mini-Game + Dressup */}
      <ARStudioButton
        position={[-0.27, -0.065, 0.012]}
        icon="darts"
        label={dartGame.active ? (dartGame.finished ? 'REMATCH' : 'END DARTS') : '6 DARTS'}
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
        position={[-0.09, -0.065, 0.012]}
        icon="board"
        label="MV BOARD"
        color={dartGame.active ? '#0891b2' : '#334155'}
        onClick={() => {
          if (useMyRoomStore.getState().dartGame.active) {
            useMyRoomStore.getState().relocateDartboard(getForwardBoardPose(), true)
          }
        }}
      />
      <ARStudioButton
        position={[0.09, -0.065, 0.012]}
        icon="throw"
        label="THROW"
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
      <ARStudioButton
        position={[0.27, -0.065, 0.012]}
        icon="dress"
        label={aiDressupStyle.toUpperCase()}
        color={aiDressupStyle === 'sport' ? '#0284c7' : aiDressupStyle === 'nerdy' ? '#4338ca' : '#7d293b'}
        onClick={() => {
          const next =
            aiDressupStyle === 'chic' ? 'nerdy' : aiDressupStyle === 'nerdy' ? 'sport' : 'chic'
          useMyRoomStore.getState().setAiDressupStyle(next)
        }}
      />

      {/* Row 6: Showcase, My Body, Mic, Lobby/Exit */}
      <ARStudioButton
        position={[-0.27, -0.135, 0.012]}
        icon="showcase"
        label={`DECOR (${decorCount})`}
        color={showcaseOpen ? '#eab308' : '#b45309'}
        onClick={() => useMyRoomStore.getState().setShowcaseOpen(!showcaseOpen)}
      />
      <ARStudioButton
        position={[-0.09, -0.135, 0.012]}
        icon="body"
        label={showSelfBody ? 'BODY ON' : 'BODY OFF'}
        color={showSelfBody ? '#0ea5e9' : '#475569'}
        onClick={() => useMyRoomStore.getState().setShowSelfBody(!showSelfBody)}
      />
      <ARStudioButton
        position={[0.09, -0.135, 0.012]}
        icon="mic"
        label={micEnabled ? 'MIC ON' : 'MUTED'}
        color={micEnabled ? '#059669' : '#dc2626'}
        onClick={() => {
          voiceAudio.setMicEnabled(!micEnabled)
          p2pClient.broadcastProfile()
        }}
      />
      <ARStudioButton
        position={[0.27, -0.135, 0.012]}
        icon="lobby"
        label="LOBBY"
        color="#7c3aed"
        onClick={() => {
          void xrStore.getState().session?.end()
          void p2pClient.disconnect()
          useGameStore.getState().leaveRoomReset()
        }}
      />

      {/* Row 7: Opponent 360 Rotation Controls + Exit AR */}
      <ARStudioButton
        position={[-0.27, -0.205, 0.012]}
        icon="rotL"
        label="-45°"
        color="#0369a1"
        onClick={() => useMyRoomStore.getState().rotateAiModelBy(-Math.PI * 0.25)}
      />
      <ARStudioButton
        position={[-0.09, -0.205, 0.012]}
        icon="rotR"
        label="+45°"
        color="#0369a1"
        onClick={() => useMyRoomStore.getState().rotateAiModelBy(Math.PI * 0.25)}
      />
      <ARStudioButton
        position={[0.09, -0.205, 0.012]}
        icon="spin"
        label={aiAutoRotate ? 'SPIN ON' : 'SPIN OFF'}
        color={aiAutoRotate ? '#0ea5e9' : '#475569'}
        onClick={() => useMyRoomStore.getState().setAiAutoRotate(!aiAutoRotate)}
      />
      <ARStudioButton
        position={[0.27, -0.205, 0.012]}
        icon="reset"
        label="RESET 0°"
        color="#334155"
        onClick={() => useMyRoomStore.getState().resetAiModelRotation()}
      />

      {/* Bottom slim Exit AR Bar */}
      <ARStudioButton
        position={[0, -0.28, 0.012]}
        width={0.34}
        height={0.052}
        icon="exit"
        label="EXIT WEBXR AR"
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
