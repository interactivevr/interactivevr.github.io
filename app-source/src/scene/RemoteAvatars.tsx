import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CricketKitBody, KitAnimState } from '../cricket/PlayerGear'
import { voiceAudio } from '../net/voiceAudio'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { HandSide, PeerInfo } from '../types/game'
import { getAthleteProfile, HumanFaceHead } from './HumanFace'
import { TextLabel as Text } from './TextLabel'

const _targetVec = new THREE.Vector3()
const _targetQuat = new THREE.Quaternion()
const _headEuler = new THREE.Euler()

interface FingerLayout {
  basePos: [number, number, number]
  proxLen: number
  distLen: number
  radius: number
  isThumb?: boolean
}

const FINGER_LAYOUTS: FingerLayout[] = [
  { basePos: [0.036, -0.005, -0.01], proxLen: 0.028, distLen: 0.022, radius: 0.008, isThumb: true },
  { basePos: [0.024, 0, -0.042], proxLen: 0.036, distLen: 0.028, radius: 0.0072 },
  { basePos: [0.008, 0, -0.045], proxLen: 0.04, distLen: 0.032, radius: 0.0075 },
  { basePos: [-0.008, 0, -0.042], proxLen: 0.037, distLen: 0.029, radius: 0.007 },
  { basePos: [-0.024, 0, -0.036], proxLen: 0.029, distLen: 0.023, radius: 0.0062 },
]

function ArticulatedAvatarHand({
  side,
  skinColor,
  accentColor,
  curlsRef,
  grabbingRef,
}: {
  side: HandSide
  skinColor: string
  accentColor: string
  curlsRef: React.MutableRefObject<[number, number, number, number, number]>
  grabbingRef: React.MutableRefObject<boolean>
}) {
  const proxRefs = useRef<Array<THREE.Group | null>>([])
  const distRefs = useRef<Array<THREE.Group | null>>([])
  const palmMatRef = useRef<THREE.MeshStandardMaterial>(null)

  const mirrorSign = side === 'left' ? 1 : -1

  useFrame(() => {
    const curls = curlsRef.current
    const grabbing = grabbingRef.current
    if (palmMatRef.current) {
      palmMatRef.current.emissive.set(grabbing ? '#34d399' : '#000000')
      palmMatRef.current.emissiveIntensity = grabbing ? 0.35 : 0
    }

    for (let i = 0; i < 5; i++) {
      const curl = curls[i] ?? 0
      const prox = proxRefs.current[i]
      const dist = distRefs.current[i]
      if (i === 0) {
        if (prox) {
          prox.rotation.z = mirrorSign * (0.45 + curl * 0.55)
          prox.rotation.x = -0.35 - curl * 0.65
        }
        if (dist) dist.rotation.x = -curl * 0.9
      } else {
        if (prox) prox.rotation.x = -curl * 1.35
        if (dist) dist.rotation.x = -curl * 1.4
      }
    }
  })

  return (
    <group>
      {/* Sport Sweatband */}
      <mesh position={[0, 0, 0.056]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.032, 0.034, 0.044, 10]} />
        <meshStandardMaterial color={accentColor} roughness={0.6} />
      </mesh>
      {/* Realistic Palm */}
      <mesh>
        <boxGeometry args={[0.068, 0.022, 0.076]} />
        <meshStandardMaterial ref={palmMatRef} color={skinColor} roughness={0.58} />
      </mesh>
      {/* 5 Articulated Fingers */}
      {FINGER_LAYOUTS.map((f, idx) => {
        const bx = f.basePos[0] * mirrorSign
        return (
          <group
            key={idx}
            ref={(el) => {
              proxRefs.current[idx] = el
            }}
            position={[bx, f.basePos[1], f.basePos[2]]}
          >
            <mesh position={[0, 0, -f.proxLen / 2]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[f.radius * 0.9, f.radius, f.proxLen, 8]} />
              <meshStandardMaterial color={skinColor} roughness={0.58} />
            </mesh>
            <group
              ref={(el) => {
                distRefs.current[idx] = el
              }}
              position={[0, 0, -f.proxLen]}
            >
              <mesh position={[0, 0, -f.distLen / 2]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[f.radius * 0.72, f.radius * 0.88, f.distLen, 8]} />
                <meshStandardMaterial color={skinColor} roughness={0.55} />
              </mesh>
            </group>
          </group>
        )
      })}
    </group>
  )
}

function RemoteAvatar({ peer }: { peer: PeerInfo }) {
  const headRef = useRef<THREE.Group>(null)
  const labelRef = useRef<THREE.Group>(null)
  const leftHandRef = useRef<THREE.Group>(null)
  const rightHandRef = useRef<THREE.Group>(null)
  const voiceRingRef = useRef<THREE.Mesh>(null)
  const mittAuraRef = useRef<THREE.Mesh>(null)

  const bodyPosRef = useRef<[number, number, number]>([0, 0, 0])
  const prevBodyPosRef = useRef<[number, number, number]>([0, 0, 0])
  const bodyYawRef = useRef(0)
  const leftWristRef = useRef<[number, number, number]>([-0.25, 1.25, -0.3])
  const rightWristRef = useRef<[number, number, number]>([0.25, 1.25, -0.3])
  const animRef = useRef<KitAnimState>({
    runPhase: 0,
    runSpeed: 0,
    squat: 0.08,
    torsoLean: 0.04,
    diveTilt: 0,
  })

  const leftCurlsRef = useRef<[number, number, number, number, number]>([0, 0, 0, 0, 0])
  const rightCurlsRef = useRef<[number, number, number, number, number]>([0, 0, 0, 0, 0])
  const leftGrabbingRef = useRef(false)
  const rightGrabbingRef = useRef(false)

  const profile = useMemo(() => getAthleteProfile(peer.id), [peer.id])

  useEffect(() => {
    if (headRef.current) {
      voiceAudio.attachRigToAvatarHead(peer.id, headRef.current)
    }
  }, [peer.id])

  useFrame((state, delta) => {
    const poseEntry = runtimeState.remotePoses[peer.id]
    if (!poseEntry) return

    if (headRef.current && runtimeState.remoteStreams[peer.id]) {
      voiceAudio.attachRigToAvatarHead(peer.id, headRef.current)
    }

    const cDt = Math.min(delta, 0.05)
    const alpha = 1 - Math.exp(-18 * cDt)
    const { current, target } = poseEntry

    if (headRef.current) {
      _targetVec.set(target.headPos[0], target.headPos[1], target.headPos[2])
      headRef.current.position.lerp(_targetVec, alpha)
      _targetQuat.set(target.headQuat[0], target.headQuat[1], target.headQuat[2], target.headQuat[3])
      headRef.current.quaternion.slerp(_targetQuat, alpha)

      current.headPos = [headRef.current.position.x, headRef.current.position.y, headRef.current.position.z]

      prevBodyPosRef.current = [...bodyPosRef.current]
      bodyPosRef.current = [
        headRef.current.position.x,
        Math.max(0, headRef.current.position.y - 1.58),
        headRef.current.position.z,
      ]
      _headEuler.setFromQuaternion(headRef.current.quaternion, 'YXZ')
      bodyYawRef.current = _headEuler.y

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

    if (labelRef.current) {
      labelRef.current.lookAt(state.camera.position)
    }

    if (leftHandRef.current) {
      _targetVec.set(target.leftPos[0], target.leftPos[1], target.leftPos[2])
      leftHandRef.current.position.lerp(_targetVec, alpha)
      _targetQuat.set(target.leftQuat[0], target.leftQuat[1], target.leftQuat[2], target.leftQuat[3])
      leftHandRef.current.quaternion.slerp(_targetQuat, alpha)
      current.leftPos = [
        leftHandRef.current.position.x,
        leftHandRef.current.position.y,
        leftHandRef.current.position.z,
      ]
      leftWristRef.current = [...current.leftPos]
    }

    if (rightHandRef.current) {
      _targetVec.set(target.rightPos[0], target.rightPos[1], target.rightPos[2])
      rightHandRef.current.position.lerp(_targetVec, alpha)
      _targetQuat.set(target.rightQuat[0], target.rightQuat[1], target.rightQuat[2], target.rightQuat[3])
      rightHandRef.current.quaternion.slerp(_targetQuat, alpha)
      current.rightPos = [
        rightHandRef.current.position.x,
        rightHandRef.current.position.y,
        rightHandRef.current.position.z,
      ]
      rightWristRef.current = [...current.rightPos]
    }

    for (let i = 0; i < 5; i++) {
      leftCurlsRef.current[i] += (target.leftCurls[i] - leftCurlsRef.current[i]) * alpha
      rightCurlsRef.current[i] += (target.rightCurls[i] - rightCurlsRef.current[i]) * alpha
    }
    leftGrabbingRef.current = target.leftGrabbing
    rightGrabbingRef.current = target.rightGrabbing

    if (voiceRingRef.current) {
      const lvl = peer.speakingLevel
      voiceRingRef.current.visible = lvl > 0.07
      voiceRingRef.current.scale.setScalar(1 + lvl * 0.45)
    }

    if (mittAuraRef.current) {
      mittAuraRef.current.visible = target.catchingActive
    }
  })

  return (
    <group>
      {/* Full Sculpted Athlete Outfit + Named Jersey Front & Back + Animated Legs & Sleeves */}
      <CricketKitBody
        role="bowler"
        playerName={peer.name}
        jerseyNumber={`0${(peer.slotIndex % 9) + 1}`}
        jerseyColor={peer.color}
        accentColor="#f8fafc"
        lookProfile={profile}
        hideHead
        getBodyAnchor={() => ({ pos: bodyPosRef.current, yaw: bodyYawRef.current })}
        getLeftWrist={() => leftWristRef.current}
        getRightWrist={() => rightWristRef.current}
        getAnimState={() => animRef.current}
      />

      {/* Realistic Face Head + Cap + PositionalAudio Anchor */}
      <group ref={headRef} position={[0, 1.58, 0]}>
        <HumanFaceHead profile={profile} showHair allowSunglasses />
        {/* Sport Headband / Cap */}
        <mesh position={[0, 0.056, 0]} rotation={[0.1, 0, 0]}>
          <torusGeometry args={[0.128, 0.014, 8, 22]} />
          <meshStandardMaterial color={peer.color} roughness={0.6} />
        </mesh>

        {/* Voice speaking indicator halo */}
        <mesh ref={voiceRingRef} position={[0, 0.21, 0]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
          <torusGeometry args={[0.16, 0.015, 8, 24]} />
          <meshBasicMaterial color="#34d399" />
        </mesh>

        {/* Floating Nametag */}
        <group ref={labelRef} position={[0, 0.34, 0]}>
          <Text
            position={[0, 0, 0]}
            fontSize={0.11}
            color="#f8fafc"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#020617"
          >
            {`${peer.name} [${peer.platform.toUpperCase()} • ${peer.role.toUpperCase()}]`}
          </Text>
        </group>
      </group>

      {/* Left Articulated Hand */}
      <group ref={leftHandRef} position={[-0.25, 1.25, -0.3]}>
        <ArticulatedAvatarHand
          side="left"
          skinColor={profile.skinColor}
          accentColor={peer.color}
          curlsRef={leftCurlsRef}
          grabbingRef={leftGrabbingRef}
        />
      </group>

      {/* Right Articulated Hand / Catching Mitt */}
      <group ref={rightHandRef} position={[0.25, 1.25, -0.3]}>
        <ArticulatedAvatarHand
          side="right"
          skinColor={profile.skinColor}
          accentColor={peer.color}
          curlsRef={rightCurlsRef}
          grabbingRef={rightGrabbingRef}
        />
        <mesh ref={mittAuraRef} visible={false}>
          <sphereGeometry args={[0.17, 14, 10]} />
          <meshBasicMaterial color="#34d399" transparent opacity={0.28} wireframe />
        </mesh>
      </group>
    </group>
  )
}

export function RemoteAvatars() {
  const peers = useGameStore((s) => s.peers)
  const peerList = Object.values(peers)

  return (
    <>
      {peerList.map((peer) => (
        <RemoteAvatar key={peer.id} peer={peer} />
      ))}
    </>
  )
}
