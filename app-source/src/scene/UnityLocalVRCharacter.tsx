import { useRef } from 'react'
import * as THREE from 'three'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { UnityHumanoidCharacter } from './UnityHumanoidCharacter'

const _euler = new THREE.Euler(0, 0, 0, 'YXZ')
const _quat = new THREE.Quaternion()
const _fwd = new THREE.Vector3()
const _prevXZ = { x: 0, z: 0 }

/**
 * First-person Unity 3D VR Character body worn by the local player in VR / MR:
 * tracks live XR headset height/orientation for spine, neck, squat & foot stepping,
 * and drives SkinnedMesh VRIK arms & articulated 5-finger hands to real controllers/wrists.
 */
export function UnityLocalVRCharacter({
  uniformStyle = 'sport',
  outfitColor,
  pantsColor,
  shoeColor,
  floorY = 0,
  hideHands = false,
  hideLeftHand = false,
  hideRightHand = false,
}: {
  uniformStyle?: 'casual' | 'sport' | 'cricket'
  outfitColor?: string
  pantsColor?: string
  shoeColor?: string
  floorY?: number
  hideHands?: boolean
  hideLeftHand?: boolean
  hideRightHand?: boolean
}) {
  const localPeerId = useGameStore((s) => s.localPeerId)
  const playerName = useGameStore((s) => s.playerName)
  const localColor = useGameStore((s) => s.localColor)
  const avatarGender = useGameStore((s) => s.avatarGender)

  const bodyPosRef = useRef<[number, number, number]>([0, floorY, 0])
  const yawRef = useRef(0)
  const walkPhaseRef = useRef(0)
  const walkSpeedRef = useRef(0)
  const squatRef = useRef(0)
  const torsoPitchRef = useRef(0)

  const leftEmpty = hideHands || hideLeftHand ? <group visible={false} /> : undefined
  const rightEmpty = hideHands || hideRightHand ? <group visible={false} /> : undefined

  return (
    <UnityHumanoidCharacter
      seedKey={localPeerId || playerName || 'local-vr'}
      gender={avatarGender}
      outfitColor={outfitColor ?? localColor}
      accentColor="#f8fafc"
      pantsColor={pantsColor}
      shoeColor={shoeColor}
      uniformStyle={uniformStyle}
      hideHead
      firstPersonMode
      leftHandAttachment={leftEmpty}
      rightHandAttachment={rightEmpty}
      getBodyAnchor={() => {
        const lp = runtimeState.localPose
        _quat.set(lp.headQuat[0], lp.headQuat[1], lp.headQuat[2], lp.headQuat[3])
        _euler.setFromQuaternion(_quat, 'YXZ')
        _fwd.set(0, 0, -1).applyQuaternion(_quat)
        _fwd.y = 0
        if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1)
        _fwd.normalize()

        const eyeH = lp.headPos[1] - floorY
        const squat = Math.max(0, Math.min(1, (1.58 - eyeH) / 0.56))
        squatRef.current = squat

        // Offset hips slightly behind camera eyes so looking straight down displays chest, arms & knees cleanly
        const bx = lp.headPos[0] - _fwd.x * 0.065
        const bz = lp.headPos[2] - _fwd.z * 0.065
        const stepDist = Math.hypot(bx - _prevXZ.x, bz - _prevXZ.z)
        _prevXZ.x = bx
        _prevXZ.z = bz

        walkSpeedRef.current = Math.min(1, stepDist * 18)
        if (walkSpeedRef.current > 0.06) {
          walkPhaseRef.current += stepDist * 14
        }

        bodyPosRef.current = [bx, floorY, bz]
        yawRef.current = _euler.y
        torsoPitchRef.current = Math.max(-0.22, Math.min(0.28, -_euler.x * 0.25))

        return {
          pos: bodyPosRef.current,
          yaw: yawRef.current,
          walkSpeed: walkSpeedRef.current,
          walkPhase: walkPhaseRef.current,
          squat: squatRef.current,
          torsoPitch: torsoPitchRef.current,
        }
      }}
      getLeftWrist={() => runtimeState.localPose.leftPos}
      getRightWrist={() => runtimeState.localPose.rightPos}
      getLeftHandQuat={() => runtimeState.localPose.leftQuat}
      getRightHandQuat={() => runtimeState.localPose.rightQuat}
      getLeftCurls={() => runtimeState.localPose.leftCurls}
      getRightCurls={() => runtimeState.localPose.rightCurls}
    />
  )
}
