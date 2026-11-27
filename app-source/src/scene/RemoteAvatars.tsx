import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { voiceAudio } from '../net/voiceAudio'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { HandSide, PeerInfo } from '../types/game'
import { TextLabel as Text } from './TextLabel'

const _targetVec = new THREE.Vector3()
const _targetQuat = new THREE.Quaternion()

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
  color,
  curlsRef,
  grabbingRef,
}: {
  side: HandSide
  color: string
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
      palmMatRef.current.emissive.set(grabbing ? '#34d399' : color)
      palmMatRef.current.emissiveIntensity = grabbing ? 0.55 : 0.15
    }

    for (let i = 0; i < 5; i++) {
      const curl = curls[i] ?? 0
      const prox = proxRefs.current[i]
      const dist = distRefs.current[i]
      if (i === 0) {
        // Thumb flexes inward across palm
        if (prox) {
          prox.rotation.z = mirrorSign * (0.45 + curl * 0.55)
          prox.rotation.x = -0.35 - curl * 0.65
        }
        if (dist) {
          dist.rotation.x = -curl * 0.9
        }
      } else {
        // Index, middle, ring, pinky curl downward around local X
        if (prox) prox.rotation.x = -curl * 1.35
        if (dist) dist.rotation.x = -curl * 1.4
      }
    }
  })

  return (
    <group>
      {/* Palm */}
      <mesh>
        <boxGeometry args={[0.068, 0.022, 0.076]} />
        <meshStandardMaterial ref={palmMatRef} color={color} roughness={0.38} />
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
              <meshStandardMaterial color={color} roughness={0.38} />
            </mesh>
            <group
              ref={(el) => {
                distRefs.current[idx] = el
              }}
              position={[0, 0, -f.proxLen]}
            >
              <mesh position={[0, 0, -f.distLen / 2]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[f.radius * 0.72, f.radius * 0.88, f.distLen, 8]} />
                <meshStandardMaterial color="#e0f2fe" roughness={0.35} />
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

  const leftCurlsRef = useRef<[number, number, number, number, number]>([0, 0, 0, 0, 0])
  const rightCurlsRef = useRef<[number, number, number, number, number]>([0, 0, 0, 0, 0])
  const leftGrabbingRef = useRef(false)
  const rightGrabbingRef = useRef(false)

  useEffect(() => {
    if (headRef.current) {
      voiceAudio.attachRigToAvatarHead(peer.id, headRef.current)
    }
  }, [peer.id])

  useFrame((state, delta) => {
    const poseEntry = runtimeState.remotePoses[peer.id]
    if (!poseEntry) return

    // Keep PositionalAudio attached if stream arrived after avatar mounted
    if (headRef.current && runtimeState.remoteStreams[peer.id]) {
      voiceAudio.attachRigToAvatarHead(peer.id, headRef.current)
    }

    const alpha = 1 - Math.exp(-18 * Math.min(delta, 0.05))
    const { current, target } = poseEntry

    if (headRef.current) {
      _targetVec.set(target.headPos[0], target.headPos[1], target.headPos[2])
      headRef.current.position.lerp(_targetVec, alpha)
      _targetQuat.set(target.headQuat[0], target.headQuat[1], target.headQuat[2], target.headQuat[3])
      headRef.current.quaternion.slerp(_targetQuat, alpha)

      current.headPos = [headRef.current.position.x, headRef.current.position.y, headRef.current.position.z]
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
    }

    // Smooth finger curl interpolation
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
      {/* Head + Visor + Nameplate + PositionalAudio anchor */}
      <group ref={headRef} position={[0, 1.6, 0]}>
        <mesh>
          <sphereGeometry args={[0.145, 20, 16]} />
          <meshStandardMaterial color={peer.color} roughness={0.35} />
        </mesh>
        {/* VR Visor / Face front (-Z local) */}
        <mesh position={[0, 0.02, -0.115]}>
          <boxGeometry args={[0.19, 0.08, 0.06]} />
          <meshStandardMaterial
            color="#0f172a"
            emissive={peer.platform === 'vr' ? '#38bdf8' : '#94a3b8'}
            emissiveIntensity={0.45}
            roughness={0.2}
          />
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
          color={peer.color}
          curlsRef={leftCurlsRef}
          grabbingRef={leftGrabbingRef}
        />
      </group>

      {/* Right Articulated Hand / Catching Mitt */}
      <group ref={rightHandRef} position={[0.25, 1.25, -0.3]}>
        <ArticulatedAvatarHand
          side="right"
          color={peer.color}
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
