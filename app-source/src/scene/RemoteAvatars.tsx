import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { voiceAudio } from '../net/voiceAudio'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { PeerInfo } from '../types/game'
import { TextLabel as Text } from './TextLabel'

const _targetVec = new THREE.Vector3()
const _targetQuat = new THREE.Quaternion()

function RemoteAvatar({ peer }: { peer: PeerInfo }) {
  const headRef = useRef<THREE.Group>(null)
  const labelRef = useRef<THREE.Group>(null)
  const leftHandRef = useRef<THREE.Group>(null)
  const rightHandRef = useRef<THREE.Group>(null)
  const voiceRingRef = useRef<THREE.Mesh>(null)
  const mittAuraRef = useRef<THREE.Mesh>(null)

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

      {/* Left Hand */}
      <group ref={leftHandRef} position={[-0.25, 1.25, -0.3]}>
        <mesh>
          <sphereGeometry args={[0.065, 14, 12]} />
          <meshStandardMaterial color={peer.color} roughness={0.4} />
        </mesh>
      </group>

      {/* Right Hand / Catching Mitt */}
      <group ref={rightHandRef} position={[0.25, 1.25, -0.3]}>
        <mesh>
          <sphereGeometry args={[0.072, 14, 12]} />
          <meshStandardMaterial color={peer.color} roughness={0.4} />
        </mesh>
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
