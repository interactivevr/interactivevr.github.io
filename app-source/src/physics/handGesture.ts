import * as THREE from 'three'

/**
 * Standard WebXR XRHand joint order (25 joints).
 */
export const XR_HAND_JOINTS: readonly XRHandJoint[] = [
  'wrist',
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  'index-finger-metacarpal',
  'index-finger-phalanx-proximal',
  'index-finger-phalanx-intermediate',
  'index-finger-phalanx-distal',
  'index-finger-tip',
  'middle-finger-metacarpal',
  'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal',
  'middle-finger-tip',
  'ring-finger-metacarpal',
  'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-distal',
  'ring-finger-tip',
  'pinky-finger-metacarpal',
  'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-distal',
  'pinky-finger-tip',
] as const

export const HAND_JOINT_INDEX: Record<XRHandJoint, number> = Object.fromEntries(
  XR_HAND_JOINTS.map((name, idx) => [name, idx])
) as Record<XRHandJoint, number>

/**
 * Bone segment pairs connecting joints to render the full articulated hand skeleton.
 */
export const HAND_BONE_SEGMENTS: ReadonlyArray<readonly [XRHandJoint, XRHandJoint, number]> = [
  // Palm fan from wrist to metacarpals + knuckle bridge
  ['wrist', 'thumb-metacarpal', 0.011],
  ['wrist', 'index-finger-metacarpal', 0.011],
  ['wrist', 'middle-finger-metacarpal', 0.012],
  ['wrist', 'ring-finger-metacarpal', 0.011],
  ['wrist', 'pinky-finger-metacarpal', 0.01],
  ['index-finger-metacarpal', 'middle-finger-metacarpal', 0.01],
  ['middle-finger-metacarpal', 'ring-finger-metacarpal', 0.01],
  ['ring-finger-metacarpal', 'pinky-finger-metacarpal', 0.009],
  ['index-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal', 0.008],
  // Thumb
  ['thumb-metacarpal', 'thumb-phalanx-proximal', 0.01],
  ['thumb-phalanx-proximal', 'thumb-phalanx-distal', 0.009],
  ['thumb-phalanx-distal', 'thumb-tip', 0.008],
  // Index
  ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 0.0095],
  ['index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 0.0085],
  ['index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 0.0075],
  ['index-finger-phalanx-distal', 'index-finger-tip', 0.0068],
  // Middle
  ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 0.0098],
  ['middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 0.0088],
  ['middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 0.0078],
  ['middle-finger-phalanx-distal', 'middle-finger-tip', 0.007],
  // Ring
  ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 0.0092],
  ['ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 0.0082],
  ['ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 0.0072],
  ['ring-finger-phalanx-distal', 'ring-finger-tip', 0.0065],
  // Pinky
  ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 0.0082],
  ['pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 0.0074],
  ['pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 0.0065],
  ['pinky-finger-phalanx-distal', 'pinky-finger-tip', 0.006],
] as const

export interface HandFrameAnalysis {
  valid: boolean
  palmWorldPos: [number, number, number]
  palmWorldQuat: [number, number, number, number]
  wristWorldPos?: [number, number, number]
  wristWorldQuat?: [number, number, number, number]
  indexTipWorldPos?: [number, number, number]
  curls: [number, number, number, number, number] // thumb, index, middle, ring, pinky (0..1)
  pinchDist: number
  isGrabbing: boolean
}

const _mat = new THREE.Matrix4()
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _originQuat = new THREE.Quaternion()
const _palmOffsetVec = new THREE.Vector3()
const _orderedSpaces: XRJointSpace[] = new Array(XR_HAND_JOINTS.length)

function getJointPosFromBuffer(buf: Float32Array, joint: XRHandJoint, out: THREE.Vector3): THREE.Vector3 {
  const idx = HAND_JOINT_INDEX[joint] * 16
  return out.set(buf[idx + 12], buf[idx + 13], buf[idx + 14])
}

const _wristPos = new THREE.Vector3()
const _palmPos = new THREE.Vector3()
const _thumbTip = new THREE.Vector3()
const _indexTip = new THREE.Vector3()
const _middleTip = new THREE.Vector3()
const _ringTip = new THREE.Vector3()
const _pinkyTip = new THREE.Vector3()
const _indexBase = new THREE.Vector3()
const _middleBase = new THREE.Vector3()
const _ringBase = new THREE.Vector3()
const _pinkyBase = new THREE.Vector3()

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * Samples all 25 WebXR hand joints using frame.fillPoses, transforms palm into world space,
 * computes 5-finger curl values [0..1], and applies hysteresis for natural fist/pinch grabbing.
 */
export function analyzeXRHandFrame(
  hand: XRHand,
  frame: XRFrame,
  referenceSpace: XRReferenceSpace,
  poseBuffer: Float32Array,
  originObject: THREE.Object3D | null,
  wasGrabbing: boolean,
  webxrSelectActive: boolean
): HandFrameAnalysis {
  for (let i = 0; i < XR_HAND_JOINTS.length; i++) {
    const js = hand.get(XR_HAND_JOINTS[i])
    if (!js) {
      return {
        valid: false,
        palmWorldPos: [0, 0, 0],
        palmWorldQuat: [0, 0, 0, 1],
        curls: [0, 0, 0, 0, 0],
        pinchDist: 1,
        isGrabbing: false,
      }
    }
    _orderedSpaces[i] = js
  }

  const ok = frame.fillPoses(_orderedSpaces, referenceSpace, poseBuffer)
  if (!ok) {
    return {
      valid: false,
      palmWorldPos: [0, 0, 0],
      palmWorldQuat: [0, 0, 0, 1],
      curls: [0, 0, 0, 0, 0],
      pinchDist: 1,
      isGrabbing: wasGrabbing && webxrSelectActive,
    }
  }

  getJointPosFromBuffer(poseBuffer, 'wrist', _wristPos)
  getJointPosFromBuffer(poseBuffer, 'middle-finger-metacarpal', _palmPos)
  getJointPosFromBuffer(poseBuffer, 'thumb-tip', _thumbTip)
  getJointPosFromBuffer(poseBuffer, 'index-finger-tip', _indexTip)
  getJointPosFromBuffer(poseBuffer, 'middle-finger-tip', _middleTip)
  getJointPosFromBuffer(poseBuffer, 'ring-finger-tip', _ringTip)
  getJointPosFromBuffer(poseBuffer, 'pinky-finger-tip', _pinkyTip)

  getJointPosFromBuffer(poseBuffer, 'index-finger-phalanx-proximal', _indexBase)
  getJointPosFromBuffer(poseBuffer, 'middle-finger-phalanx-proximal', _middleBase)
  getJointPosFromBuffer(poseBuffer, 'ring-finger-phalanx-proximal', _ringBase)
  getJointPosFromBuffer(poseBuffer, 'pinky-finger-phalanx-proximal', _pinkyBase)

  // Scale-normalized curl metric using wrist->middle-proximal as anatomical hand scale
  const handScale = Math.max(0.06, _wristPos.distanceTo(_middleBase))

  // Finger tip distance to palm center (when open ~ 1.05 * handScale, when closed fist ~ 0.42 * handScale)
  const fingerCurl = (tip: THREE.Vector3) => {
    const ratio = tip.distanceTo(_palmPos) / handScale
    return clamp01((1.05 - ratio) / 0.58)
  }

  const indexCurl = fingerCurl(_indexTip)
  const middleCurl = fingerCurl(_middleTip)
  const ringCurl = fingerCurl(_ringTip)
  const pinkyCurl = fingerCurl(_pinkyTip)

  const pinchDist = _thumbTip.distanceTo(_indexTip)
  const thumbToPinkyBase = _thumbTip.distanceTo(_pinkyBase) / handScale
  const thumbCurl = clamp01(Math.max((0.08 - pinchDist) / 0.055, (1.1 - thumbToPinkyBase) / 0.6))

  const fistCurlAvg = (indexCurl + middleCurl + ringCurl) / 3
  const pinchGrab = pinchDist < (wasGrabbing ? 0.054 : 0.038)
  const fistGrab = fistCurlAvg >= (wasGrabbing ? 0.36 : 0.56)
  const isGrabbing = Boolean(webxrSelectActive || pinchGrab || fistGrab)

  // Extract palm center pose (offset slightly along local -Y toward interior of palm for ball seat)
  const palmOffset = HAND_JOINT_INDEX['middle-finger-metacarpal'] * 16
  _mat.fromArray(poseBuffer, palmOffset)
  _pos.setFromMatrixPosition(_mat)
  _quat.setFromRotationMatrix(_mat)

  // Shift 1.5cm forward from knuckles/palm center toward grasping fingers
  _palmOffsetVec.set(0, -0.015, -0.015).applyQuaternion(_quat)
  _pos.add(_palmOffsetVec)

  if (originObject) {
    originObject.updateMatrixWorld()
    _pos.applyMatrix4(originObject.matrixWorld)
    originObject.getWorldQuaternion(_originQuat)
    _quat.premultiply(_originQuat)
    _indexTip.applyMatrix4(originObject.matrixWorld)
  }

  // Extract anatomical wrist pose for smartwatch mounting
  const wristOffset = HAND_JOINT_INDEX['wrist'] * 16
  _mat.fromArray(poseBuffer, wristOffset)
  const wPos = new THREE.Vector3().setFromMatrixPosition(_mat)
  const wQuat = new THREE.Quaternion().setFromRotationMatrix(_mat)
  if (originObject) {
    wPos.applyMatrix4(originObject.matrixWorld)
    wQuat.premultiply(_originQuat)
  }

  return {
    valid: true,
    palmWorldPos: [_pos.x, _pos.y, _pos.z],
    palmWorldQuat: [_quat.x, _quat.y, _quat.z, _quat.w],
    wristWorldPos: [wPos.x, wPos.y, wPos.z],
    wristWorldQuat: [wQuat.x, wQuat.y, wQuat.z, wQuat.w],
    indexTipWorldPos: [_indexTip.x, _indexTip.y, _indexTip.z],
    curls: [thumbCurl, indexCurl, middleCurl, ringCurl, pinkyCurl],
    pinchDist,
    isGrabbing,
  }
}
