import { useFrame } from '@react-three/fiber'
import { useXR, useXRInputSourceState } from '@react-three/xr'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  HAND_BONE_SEGMENTS,
  HAND_JOINT_INDEX,
  XR_HAND_JOINTS,
} from '../physics/handGesture'
import { HandSide } from '../types/game'

const JOINT_COUNT = XR_HAND_JOINTS.length
const SEGMENT_COUNT = HAND_BONE_SEGMENTS.length

const _mat = new THREE.Matrix4()
const _posA = new THREE.Vector3()
const _posB = new THREE.Vector3()
const _mid = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _palmPos = new THREE.Vector3()
const _palmQuat = new THREE.Quaternion()

function getJointRadius(joint: XRHandJoint): number {
  if (joint === 'wrist') return 0.022
  if (joint.endsWith('metacarpal')) return 0.015
  if (joint.endsWith('proximal')) return 0.0125
  if (joint.endsWith('intermediate') || joint.endsWith('distal')) return 0.0105
  return 0.009
}

export interface ArticulatedHandProps {
  side: HandSide
  isGrabbingRef: React.MutableRefObject<{ left: boolean; right: boolean }>
}

/**
 * Renders an articulated full 25-joint, 28-segment WebXR hand directly in XROrigin space
 * using frame.fillPoses — capturing every finger joint movement with zero external GLB dependency.
 */
export function ArticulatedHand({ side, isGrabbingRef }: ArticulatedHandProps) {
  const handState = useXRInputSourceState('hand', side)
  const referenceSpace = useXR((s) => s.originReferenceSpace)

  const rootRef = useRef<THREE.Group>(null)
  const jointsMeshRef = useRef<THREE.InstancedMesh>(null)
  const bonesMeshRef = useRef<THREE.InstancedMesh>(null)
  const palmPadRef = useRef<THREE.Mesh>(null)

  const poseBuffer = useMemo(() => new Float32Array(JOINT_COUNT * 16), [])
  const orderedSpaces = useMemo<XRJointSpace[]>(() => new Array(JOINT_COUNT), [])
  const jointPositions = useMemo(
    () => Array.from({ length: JOINT_COUNT }, () => new THREE.Vector3()),
    []
  )

  const baseColor = side === 'left' ? '#38bdf8' : '#fb923c'

  useFrame((state, _delta, frame) => {
    const group = rootRef.current
    if (!group) return

    const xrHand = handState?.inputSource.hand
    const refSpace = referenceSpace ?? state.gl.xr.getReferenceSpace()
    if (!xrHand || !frame || !refSpace) {
      group.visible = false
      return
    }

    for (let i = 0; i < JOINT_COUNT; i++) {
      const js = xrHand.get(XR_HAND_JOINTS[i])
      if (!js) {
        group.visible = false
        return
      }
      orderedSpaces[i] = js
    }

    const valid = frame.fillPoses(orderedSpaces, refSpace, poseBuffer)
    if (!valid) {
      group.visible = false
      return
    }
    group.visible = true

    const grabbing = isGrabbingRef.current[side]
    const activeColor = grabbing ? '#34d399' : baseColor

    // 1. Update all 25 finger/wrist joint spheres
    const jointsMesh = jointsMeshRef.current
    if (jointsMesh) {
      const jMat = jointsMesh.material as THREE.MeshStandardMaterial
      jMat.color.set(grabbing ? '#a7f3d0' : '#e0f2fe')
      jMat.emissive.set(activeColor)
      jMat.emissiveIntensity = grabbing ? 0.55 : 0.25

      for (let i = 0; i < JOINT_COUNT; i++) {
        const offset = i * 16
        const p = jointPositions[i]
        p.set(poseBuffer[offset + 12], poseBuffer[offset + 13], poseBuffer[offset + 14])
        const r = getJointRadius(XR_HAND_JOINTS[i])
        _scale.set(r, r, r)
        _quat.identity()
        _mat.compose(p, _quat, _scale)
        jointsMesh.setMatrixAt(i, _mat)
      }
      jointsMesh.instanceMatrix.needsUpdate = true
    }

    // 2. Update all 28 finger phalanx / palm bone segments
    const bonesMesh = bonesMeshRef.current
    if (bonesMesh) {
      const bMat = bonesMesh.material as THREE.MeshStandardMaterial
      bMat.color.set(activeColor)
      bMat.emissive.set(activeColor)
      bMat.emissiveIntensity = grabbing ? 0.45 : 0.16

      for (let i = 0; i < SEGMENT_COUNT; i++) {
        const [aName, bName, radius] = HAND_BONE_SEGMENTS[i]
        _posA.copy(jointPositions[HAND_JOINT_INDEX[aName]])
        _posB.copy(jointPositions[HAND_JOINT_INDEX[bName]])

        _dir.subVectors(_posB, _posA)
        const length = _dir.length()
        if (length < 1e-5) {
          _scale.set(0, 0, 0)
          _mat.compose(_posA, _quat.identity(), _scale)
        } else {
          _mid.addVectors(_posA, _posB).multiplyScalar(0.5)
          _dir.divideScalar(length)
          _quat.setFromUnitVectors(_up, _dir)
          _scale.set(radius, length, radius)
          _mat.compose(_mid, _quat, _scale)
        }
        bonesMesh.setMatrixAt(i, _mat)
      }
      bonesMesh.instanceMatrix.needsUpdate = true
    }

    // 3. Sculpted palm silhouette plate anchored to middle-finger-metacarpal
    const palmPad = palmPadRef.current
    if (palmPad) {
      const palmOffset = HAND_JOINT_INDEX['middle-finger-metacarpal'] * 16
      _mat.fromArray(poseBuffer, palmOffset)
      _palmPos.setFromMatrixPosition(_mat)
      _palmQuat.setFromRotationMatrix(_mat)
      palmPad.position.copy(_palmPos)
      palmPad.quaternion.copy(_palmQuat)
      const pMat = palmPad.material as THREE.MeshStandardMaterial
      pMat.color.set(activeColor)
      pMat.emissive.set(activeColor)
      pMat.emissiveIntensity = grabbing ? 0.42 : 0.14
    }
  })

  return (
    <group ref={rootRef} visible={false}>
      <instancedMesh ref={jointsMeshRef} args={[undefined, undefined, JOINT_COUNT]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#e0f2fe" roughness={0.3} metalness={0.1} />
      </instancedMesh>

      <instancedMesh ref={bonesMeshRef} args={[undefined, undefined, SEGMENT_COUNT]}>
        <cylinderGeometry args={[1, 1, 1, 10]} />
        <meshStandardMaterial
          color={baseColor}
          roughness={0.35}
          metalness={0.12}
          transparent
          opacity={0.92}
        />
      </instancedMesh>

      <mesh ref={palmPadRef}>
        <boxGeometry args={[0.074, 0.022, 0.078]} />
        <meshStandardMaterial
          color={baseColor}
          roughness={0.4}
          metalness={0.1}
          transparent
          opacity={0.78}
        />
      </mesh>
    </group>
  )
}
