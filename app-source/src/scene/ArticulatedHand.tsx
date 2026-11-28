import { useFrame } from '@react-three/fiber'
import { useXR, useXRInputSourceState } from '@react-three/xr'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  HAND_BONE_SEGMENTS,
  HAND_JOINT_INDEX,
  XR_HAND_JOINTS,
} from '../physics/handGesture'
import { HandSide } from '../types/game'

const JOINT_COUNT = XR_HAND_JOINTS.length
const SEGMENT_COUNT = HAND_BONE_SEGMENTS.length

export interface ArticulatedHandProps {
  side: HandSide
  isGrabbingRef: React.MutableRefObject<{ left: boolean; right: boolean }>
}

/**
 * Renders a crisp wireframe line-only 25-joint WebXR hand tracking skeleton directly
 * in XROrigin space using `THREE.LineSegments` (zero bulky joint balls or solid palm blocks).
 */
export function ArticulatedHand({ side, isGrabbingRef }: ArticulatedHandProps) {
  const handState = useXRInputSourceState('hand', side)
  const referenceSpace = useXR((s) => s.originReferenceSpace)

  const lineRef = useRef<THREE.LineSegments>(null)
  const matRef = useRef<THREE.LineBasicMaterial>(null)

  const poseBuffer = useMemo(() => new Float32Array(JOINT_COUNT * 16), [])
  const orderedSpaces = useMemo<XRJointSpace[]>(() => new Array(JOINT_COUNT), [])
  const linePositions = useMemo(() => new Float32Array(SEGMENT_COUNT * 6), [])

  const lineGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
    return geo
  }, [linePositions])

  useEffect(() => {
    return () => {
      lineGeo.dispose()
    }
  }, [lineGeo])

  const baseColor = side === 'left' ? '#38bdf8' : '#fb923c'

  useFrame((state, _delta, frame) => {
    const lineObj = lineRef.current
    if (!lineObj) return

    const xrHand = handState?.inputSource.hand
    const refSpace = referenceSpace ?? state.gl.xr.getReferenceSpace()
    if (!xrHand || !frame || !refSpace) {
      lineObj.visible = false
      return
    }

    for (let i = 0; i < JOINT_COUNT; i++) {
      const js = xrHand.get(XR_HAND_JOINTS[i])
      if (!js) {
        lineObj.visible = false
        return
      }
      orderedSpaces[i] = js
    }

    const valid = frame.fillPoses(orderedSpaces, refSpace, poseBuffer)
    if (!valid) {
      lineObj.visible = false
      return
    }
    lineObj.visible = true

    const grabbing = isGrabbingRef.current[side]
    if (matRef.current) {
      matRef.current.color.set(grabbing ? '#34d399' : baseColor)
      matRef.current.opacity = grabbing ? 0.98 : 0.88
    }

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const [aName, bName] = HAND_BONE_SEGMENTS[i]
      const aOff = HAND_JOINT_INDEX[aName] * 16
      const bOff = HAND_JOINT_INDEX[bName] * 16
      const dst = i * 6
      linePositions[dst] = poseBuffer[aOff + 12]
      linePositions[dst + 1] = poseBuffer[aOff + 13]
      linePositions[dst + 2] = poseBuffer[aOff + 14]
      linePositions[dst + 3] = poseBuffer[bOff + 12]
      linePositions[dst + 4] = poseBuffer[bOff + 13]
      linePositions[dst + 5] = poseBuffer[bOff + 14]
    }
    const attr = lineGeo.getAttribute('position') as THREE.BufferAttribute
    attr.needsUpdate = true
    lineGeo.computeBoundingSphere()
  })

  return (
    <lineSegments ref={lineRef} geometry={lineGeo} visible={false} frustumCulled={false}>
      <lineBasicMaterial ref={matRef} color={baseColor} transparent opacity={0.88} />
    </lineSegments>
  )
}
