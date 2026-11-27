import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { voiceAudio } from '../net/voiceAudio'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { PeerInfo } from '../types/game'
import { getAthleteProfile, HumanFaceHead } from './HumanFace'
import { TextLabel as Text } from './TextLabel'
import { UnityHumanoidCharacter } from './UnityHumanoidCharacter'

const _targetVec = new THREE.Vector3()
const _targetQuat = new THREE.Quaternion()
const _headEuler = new THREE.Euler()

function RemoteAvatar({ peer }: { peer: PeerInfo }) {
  const headRef = useRef<THREE.Group>(null)
  const labelRef = useRef<THREE.Group>(null)
  const rightAuraFollowRef = useRef<THREE.Group>(null)
  const voiceRingRef = useRef<THREE.Mesh>(null)
  const mittAuraRef = useRef<THREE.Mesh>(null)

  const bodyPosRef = useRef<[number, number, number]>([0, 0, 0])
  const prevBodyPosRef = useRef<[number, number, number]>([0, 0, 0])
  const bodyYawRef = useRef(0)
  const runSpeedRef = useRef(0)
  const runPhaseRef = useRef(0)
  const leftWristRef = useRef<[number, number, number]>([-0.25, 1.25, -0.3])
  const rightWristRef = useRef<[number, number, number]>([0.25, 1.25, -0.3])
  const leftQuatRef = useRef<[number, number, number, number]>([0, 0, 0, 1])
  const rightQuatRef = useRef<[number, number, number, number]>([0, 0, 0, 1])
  const leftCurlsRef = useRef<[number, number, number, number, number]>([0, 0, 0, 0, 0])
  const rightCurlsRef = useRef<[number, number, number, number, number]>([0, 0, 0, 0, 0])

  const gender = peer.avatarGender ?? 'male'
  const profile = useMemo(() => getAthleteProfile(peer.id, gender), [peer.id, gender])

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
        Math.max(0, headRef.current.position.y - 1.56),
        headRef.current.position.z,
      ]
      _headEuler.setFromQuaternion(headRef.current.quaternion, 'YXZ')
      bodyYawRef.current = _headEuler.y

      const moveSpeed =
        Math.hypot(
          bodyPosRef.current[0] - prevBodyPosRef.current[0],
          bodyPosRef.current[2] - prevBodyPosRef.current[2]
        ) / Math.max(0.005, cDt)

      runSpeedRef.current = Math.min(1, moveSpeed / 3.8)
      if (runSpeedRef.current > 0.08) {
        runPhaseRef.current += cDt * 9.5 * runSpeedRef.current
      }
    }

    if (labelRef.current) {
      labelRef.current.lookAt(state.camera.position)
    }

    _targetVec.set(target.leftPos[0], target.leftPos[1], target.leftPos[2])
    const lw = current.leftPos
    _targetVec.set(lw[0], lw[1], lw[2]).lerp(
      new THREE.Vector3(target.leftPos[0], target.leftPos[1], target.leftPos[2]),
      alpha
    )
    current.leftPos = [_targetVec.x, _targetVec.y, _targetVec.z]
    leftWristRef.current = [...current.leftPos]
    leftQuatRef.current = [...target.leftQuat]

    _targetVec.set(current.rightPos[0], current.rightPos[1], current.rightPos[2]).lerp(
      new THREE.Vector3(target.rightPos[0], target.rightPos[1], target.rightPos[2]),
      alpha
    )
    current.rightPos = [_targetVec.x, _targetVec.y, _targetVec.z]
    rightWristRef.current = [...current.rightPos]
    rightQuatRef.current = [...target.rightQuat]

    if (rightAuraFollowRef.current) {
      rightAuraFollowRef.current.position.set(current.rightPos[0], current.rightPos[1], current.rightPos[2])
    }

    for (let i = 0; i < 5; i++) {
      leftCurlsRef.current[i] += (target.leftCurls[i] - leftCurlsRef.current[i]) * alpha
      rightCurlsRef.current[i] += (target.rightCurls[i] - rightCurlsRef.current[i]) * alpha
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
      {/* Upgraded Unity 3D Rigged Humanoid Opponent Character */}
      <UnityHumanoidCharacter
        seedKey={peer.id}
        gender={gender}
        outfitColor={peer.color}
        accentColor="#f8fafc"
        uniformStyle="sport"
        lookProfile={profile}
        hideHead
        speakingLevel={peer.speakingLevel}
        getBodyAnchor={() => ({
          pos: bodyPosRef.current,
          yaw: bodyYawRef.current,
          walkSpeed: runSpeedRef.current,
          walkPhase: runPhaseRef.current,
        })}
        getLeftWrist={() => leftWristRef.current}
        getRightWrist={() => rightWristRef.current}
        getLeftHandQuat={() => leftQuatRef.current}
        getRightHandQuat={() => rightQuatRef.current}
        getLeftCurls={() => leftCurlsRef.current}
        getRightCurls={() => rightCurlsRef.current}
      />

      {/* Sculpted Head + PositionalAudio Anchor */}
      <group ref={headRef} position={[0, 1.56, 0]}>
        <HumanFaceHead profile={profile} gender={gender} showHair allowSunglasses hideNeck />
        <mesh position={[0, 0.056, 0]} rotation={[0.1, 0, 0]}>
          <torusGeometry args={[0.125, 0.013, 8, 22]} />
          <meshStandardMaterial color={peer.color} roughness={0.6} />
        </mesh>

        <mesh ref={voiceRingRef} position={[0, 0.21, 0]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
          <torusGeometry args={[0.16, 0.015, 8, 24]} />
          <meshBasicMaterial color="#34d399" />
        </mesh>

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

      {/* Catching aura on active right hand */}
      <group ref={rightAuraFollowRef} position={[0.25, 1.25, -0.3]}>
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
