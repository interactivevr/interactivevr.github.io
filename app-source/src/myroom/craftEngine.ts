import * as THREE from 'three'
import { CraftMaterialKind, CraftShapePreset, MATERIAL_PHYSICS, MAX_TEAR_GENERATION } from './types'

export const DEFORM_QUANT_RANGE = 0.24

export interface RuntimeCraftMeshData {
  geometry: THREE.BufferGeometry
  restPositions: Float32Array
  currPositions: Float32Array
  vertexCount: number
  approxRadius: number
}

function createSeededNoise(seed: number, idx: number): number {
  const x = Math.sin(seed * 12.9898 + idx * 78.233) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/**
 * Builds subdivided 3D geometry tailored to Paper, Cloth, Artificial Clay, Wood, or Metal.
 */
export function createCraftMeshData(
  kind: CraftMaterialKind,
  preset: CraftShapePreset,
  scale: number,
  seed: number
): RuntimeCraftMeshData {
  let baseGeo: THREE.BufferGeometry
  let approxRadius = 0.1 * scale

  if (kind === 'paper') {
    const w = (preset === 'card' ? 0.2 : 0.28) * scale
    const h = (preset === 'card' ? 0.26 : 0.36) * scale
    baseGeo = new THREE.PlaneGeometry(w, h, 12, 16)
    baseGeo.rotateX(-Math.PI * 0.32)
    const pAttr = baseGeo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pAttr.count; i++) {
      const px = pAttr.getX(i)
      pAttr.setY(i, pAttr.getY(i) + Math.cos((px / w) * Math.PI) * 0.015 * scale)
    }
    approxRadius = Math.max(w, h) * 0.55
  } else if (kind === 'cloth') {
    const w = (preset === 'towel' ? 0.28 : 0.34) * scale
    const h = (preset === 'towel' ? 0.44 : 0.34) * scale
    baseGeo = new THREE.PlaneGeometry(w, h, 14, 14)
    baseGeo.rotateX(-Math.PI * 0.38)
    // Natural soft textile wave drape
    const pAttr = baseGeo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pAttr.count; i++) {
      const px = pAttr.getX(i)
      const pz = pAttr.getZ(i)
      pAttr.setY(i, pAttr.getY(i) + Math.sin(px * 18 + pz * 10) * 0.014 * scale)
    }
    approxRadius = Math.max(w, h) * 0.52
  } else if (kind === 'wood') {
    if (preset === 'plank') {
      baseGeo = new THREE.BoxGeometry(0.28 * scale, 0.045 * scale, 0.14 * scale, 2, 1, 2)
      approxRadius = 0.15 * scale
    } else if (preset === 'cylinder') {
      baseGeo = new THREE.CylinderGeometry(0.062 * scale, 0.062 * scale, 0.24 * scale, 18, 2)
      approxRadius = 0.125 * scale
    } else {
      baseGeo = new THREE.BoxGeometry(0.14 * scale, 0.14 * scale, 0.14 * scale, 2, 2, 2)
      approxRadius = 0.105 * scale
    }
  } else if (kind === 'metal') {
    if (preset === 'cylinder') {
      baseGeo = new THREE.CylinderGeometry(0.056 * scale, 0.056 * scale, 0.2 * scale, 20, 2)
      approxRadius = 0.11 * scale
    } else if (preset === 'sphere') {
      baseGeo = new THREE.SphereGeometry(0.088 * scale, 20, 16)
      approxRadius = 0.092 * scale
    } else {
      baseGeo = new THREE.BoxGeometry(0.16 * scale, 0.085 * scale, 0.11 * scale, 2, 2, 2)
      approxRadius = 0.105 * scale
    }
  } else if (preset === 'cylinder') {
    baseGeo = new THREE.CylinderGeometry(0.068 * scale, 0.068 * scale, 0.22 * scale, 18, 10)
    approxRadius = 0.12 * scale
  } else if (preset === 'box') {
    baseGeo = new THREE.BoxGeometry(0.155 * scale, 0.155 * scale, 0.155 * scale, 7, 7, 7)
    approxRadius = 0.115 * scale
  } else {
    baseGeo = new THREE.SphereGeometry(0.106 * scale, 18, 14)
    approxRadius = 0.11 * scale
  }

  const posAttr = baseGeo.getAttribute('position') as THREE.BufferAttribute
  const restPositions = new Float32Array(posAttr.array.length)
  if (kind === 'clay') {
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i)
      const y = posAttr.getY(i)
      const z = posAttr.getZ(i)
      const wobble = 1 + createSeededNoise(seed, i) * 0.04
      restPositions[i * 3] = x * wobble
      restPositions[i * 3 + 1] = y * wobble
      restPositions[i * 3 + 2] = z * wobble
      posAttr.setXYZ(i, restPositions[i * 3], restPositions[i * 3 + 1], restPositions[i * 3 + 2])
    }
  } else {
    restPositions.set(posAttr.array as Float32Array)
  }

  const currPositions = new Float32Array(restPositions)
  baseGeo.computeVertexNormals()

  return {
    geometry: baseGeo,
    restPositions,
    currPositions,
    vertexCount: posAttr.count,
    approxRadius,
  }
}

const _invQuat = new THREE.Quaternion()
const _localPalm = new THREE.Vector3()
const _localNorm = new THREE.Vector3()
const _delta = new THREE.Vector3()

/**
 * Squeezes / crumples / compresses malleable objects (Clay, Paper, Cloth).
 * Rigid solids (Wood, Metal) explicitly reject squeezing.
 */
export function squeezeCraftWithPalm(
  meshData: RuntimeCraftMeshData,
  kind: CraftMaterialKind,
  objPos: [number, number, number],
  objQuat: [number, number, number, number],
  palmWorldPos: [number, number, number],
  palmWorldNormal: [number, number, number],
  squeezeAmount01: number,
  seed: number,
  currentCrumple: number,
  dt: number
): { dirty: boolean; nextCrumple: number; rejectedRigid?: boolean } {
  if (!MATERIAL_PHYSICS[kind].canSqueeze) {
    return { dirty: false, nextCrumple: currentCrumple, rejectedRigid: true }
  }

  const clampDt = Math.min(dt, 0.05)
  const strength = Math.max(0, Math.min(1, squeezeAmount01))
  if (strength < 0.08) {
    return { dirty: false, nextCrumple: currentCrumple }
  }

  _invQuat.set(objQuat[0], objQuat[1], objQuat[2], objQuat[3]).invert()
  _localPalm
    .set(palmWorldPos[0] - objPos[0], palmWorldPos[1] - objPos[1], palmWorldPos[2] - objPos[2])
    .applyQuaternion(_invQuat)
  _localNorm
    .set(palmWorldNormal[0], palmWorldNormal[1], palmWorldNormal[2])
    .applyQuaternion(_invQuat)
    .normalize()

  const { restPositions, currPositions, vertexCount, geometry, approxRadius } = meshData
  let dirty = false
  let nextCrumple = currentCrumple

  if (kind === 'clay') {
    // True tactile squash: compresses whole contact face inward while flaring perpendicular dimensions smoothly!
    const squashRate = Math.min(0.45, clampDt * (1.2 + strength * 2.1))
    const bulgeGain = squashRate * 0.56
    const localBrushR = Math.max(0.11, approxRadius * 1.45)

    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3
      const rx = restPositions[i3]
      const ry = restPositions[i3 + 1]
      const rz = restPositions[i3 + 2]
      const cx = currPositions[i3]
      const cy = currPositions[i3 + 1]
      const cz = currPositions[i3 + 2]

      const dToPalm = Math.hypot(cx - _localPalm.x, cy - _localPalm.y, cz - _localPalm.z)
      if (dToPalm >= localBrushR) continue

      const weight = 0.35 + 0.65 * Math.cos((dToPalm / localBrushR) * Math.PI * 0.5)

      // Project vertex onto palm squeeze axis _localNorm (compress toward plane z=0 -> flatten!)
      const proj = cx * _localNorm.x + cy * _localNorm.y + cz * _localNorm.z
      const pxComp = _localNorm.x * proj
      const pyComp = _localNorm.y * proj
      const pzComp = _localNorm.z * proj

      // Orthogonal radial vector in the pancake plane flares outward proportionally
      const perpX = cx - pxComp
      const perpY = cy - pyComp
      const perpZ = cz - pzComp

      const compFactor = 1 - squashRate * weight
      const flareFactor = 1 + bulgeGain * weight

      const nextX = pxComp * compFactor + perpX * flareFactor
      const nextY = pyComp * compFactor + perpY * flareFactor
      const nextZ = pzComp * compFactor + perpZ * flareFactor

      currPositions[i3] = rx + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, nextX - rx))
      currPositions[i3 + 1] = ry + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, nextY - ry))
      currPositions[i3 + 2] = rz + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, nextZ - rz))
      dirty = true
    }
  } else {
    // Paper & Cloth Squeeze/Crumple: paper gets sharp angular origami ridges; cloth gets soft bunched folds!
    const isCloth = kind === 'cloth'
    nextCrumple = Math.min(1, currentCrumple + clampDt * (isCloth ? 1.45 : 1.75) * (0.4 + strength * 0.8))
    if (Math.abs(nextCrumple - currentCrumple) > 0.002) {
      for (let i = 0; i < vertexCount; i++) {
        const i3 = i * 3
        const rx = restPositions[i3]
        const ry = restPositions[i3 + 1]
        const rz = restPositions[i3 + 2]

        const shrink = 1 - nextCrumple * (isCloth ? 0.6 : 0.7)
        const waveFreq = isCloth ? 16 : 36
        const amp = (isCloth ? 0.038 : 0.032) * nextCrumple
        const ridgeA = Math.sin(rx * waveFreq + seed * 3.1 + rz * 14) * amp
        const ridgeB = Math.cos(rz * (waveFreq + 4) - rx * 18 + seed * 5.7) * amp
        const creaseY = (isCloth ? Math.sin(rx * 22 + rz * 20 + seed) : Math.sin(i * 1.9 + seed)) * amp

        const tx = rx * shrink + ridgeA
        const ty = ry * shrink + creaseY + ridgeB * 0.65
        const tz = rz * shrink + ridgeB

        currPositions[i3] = rx + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, tx - rx))
        currPositions[i3 + 1] = ry + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, ty - ry))
        currPositions[i3 + 2] = rz + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, tz - rz))
      }
      dirty = true
    }
  }

  if (dirty) {
    syncGeometryPositions(geometry, currPositions)
  }
  return { dirty, nextCrumple }
}

/**
 * Folds Paper or Cloth neatly along the central hinge axis between both hands (foldFactor 0..1 -> up to 172deg!).
 */
export function foldCraftWithHands(
  meshData: RuntimeCraftMeshData,
  kind: CraftMaterialKind,
  objQuat: [number, number, number, number],
  leftHandPos: [number, number, number],
  rightHandPos: [number, number, number],
  currentFoldFactor: number,
  deltaFold: number
): { dirty: boolean; nextFold: number } {
  if (!MATERIAL_PHYSICS[kind].canFold) {
    return { dirty: false, nextFold: currentFoldFactor }
  }

  const nextFold = Math.max(0, Math.min(1, currentFoldFactor + deltaFold))
  if (Math.abs(nextFold - currentFoldFactor) < 0.004) {
    return { dirty: false, nextFold }
  }

  _invQuat.set(objQuat[0], objQuat[1], objQuat[2], objQuat[3]).invert()
  const pullAxisWorld = _delta.set(
    rightHandPos[0] - leftHandPos[0],
    rightHandPos[1] - leftHandPos[1],
    rightHandPos[2] - leftHandPos[2]
  )
  if (pullAxisWorld.lengthSq() < 1e-5) pullAxisWorld.set(1, 0, 0)
  pullAxisWorld.normalize()

  const foldAcross = _localNorm.copy(pullAxisWorld).applyQuaternion(_invQuat).normalize()
  // Hinge axis orthogonal to foldAcross & Y in sheet plane
  const hingeAxis = new THREE.Vector3(0, 1, 0).cross(foldAcross)
  if (hingeAxis.lengthSq() < 1e-4) hingeAxis.set(0, 0, 1)
  hingeAxis.normalize()

  // Fold angle up to 170 degrees (both sides fold gently inward like closing a book / towel!)
  const halfAngle = nextFold * Math.PI * 0.47
  const qPos = new THREE.Quaternion().setFromAxisAngle(hingeAxis, halfAngle)
  const qNeg = new THREE.Quaternion().setFromAxisAngle(hingeAxis, -halfAngle)
  const _pt = new THREE.Vector3()
  const gap = kind === 'cloth' ? 0.012 : 0.006

  const { restPositions, currPositions, vertexCount, geometry } = meshData
  for (let i = 0; i < vertexCount; i++) {
    const i3 = i * 3
    const rx = restPositions[i3]
    const ry = restPositions[i3 + 1]
    const rz = restPositions[i3 + 2]
    _pt.set(rx, ry, rz)
    const side = _pt.dot(foldAcross)
    _pt.applyQuaternion(side >= 0 ? qNeg : qPos)
    if (side >= 0) _pt.y += gap * nextFold

    currPositions[i3] = rx + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, _pt.x - rx))
    currPositions[i3 + 1] = ry + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, _pt.y - ry))
    currPositions[i3 + 2] = rz + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, _pt.z - rz))
  }

  syncGeometryPositions(geometry, currPositions)
  return { dirty: true, nextFold }
}

/**
 * Splits deformed vertex offsets along a tear plane between left and right hands
 * for tearable materials (Clay, Paper, Cloth). Wood & Metal reject tearing.
 */
export function computeTearSplitDeforms(
  meshData: RuntimeCraftMeshData,
  kind: CraftMaterialKind,
  objPos: [number, number, number],
  objQuat: [number, number, number, number],
  leftHandPos: [number, number, number],
  rightHandPos: [number, number, number],
  seed: number,
  tearGeneration: number
): {
  canTear: boolean
  leftDeformQ: number[]
  rightDeformQ: number[]
  leftOffsetWorld: [number, number, number]
  rightOffsetWorld: [number, number, number]
  childScale: number
} {
  if (!MATERIAL_PHYSICS[kind].canTear || tearGeneration >= MAX_TEAR_GENERATION) {
    return {
      canTear: false,
      leftDeformQ: [],
      rightDeformQ: [],
      leftOffsetWorld: [0, 0, 0],
      rightOffsetWorld: [0, 0, 0],
      childScale: 1,
    }
  }

  _invQuat.set(objQuat[0], objQuat[1], objQuat[2], objQuat[3]).invert()
  const pullWorld = _delta.set(
    rightHandPos[0] - leftHandPos[0],
    rightHandPos[1] - leftHandPos[1],
    rightHandPos[2] - leftHandPos[2]
  )
  const pullLen = pullWorld.length() || 1
  const dirWorldX = pullWorld.x / pullLen
  const dirWorldY = pullWorld.y / pullLen
  const dirWorldZ = pullWorld.z / pullLen

  const localPull = _localNorm.set(dirWorldX, dirWorldY, dirWorldZ).applyQuaternion(_invQuat).normalize()
  const { restPositions, currPositions, vertexCount } = meshData

  const leftVerts = new Float32Array(currPositions)
  const rightVerts = new Float32Array(currPositions)

  for (let i = 0; i < vertexCount; i++) {
    const i3 = i * 3
    const vx = currPositions[i3]
    const vy = currPositions[i3 + 1]
    const vz = currPositions[i3 + 2]
    const sideProj = vx * localPull.x + vy * localPull.y + vz * localPull.z
    const seamJitter = createSeededNoise(seed + 17, i) * (kind === 'paper' || kind === 'cloth' ? 0.024 : 0.014)

    if (sideProj > seamJitter) {
      const pullBack = sideProj - seamJitter
      leftVerts[i3] = vx - localPull.x * pullBack
      leftVerts[i3 + 1] = vy - localPull.y * pullBack
      leftVerts[i3 + 2] = vz - localPull.z * pullBack
    }
    if (sideProj < seamJitter) {
      const pullForward = seamJitter - sideProj
      rightVerts[i3] = vx + localPull.x * pullForward
      rightVerts[i3 + 1] = vy + localPull.y * pullForward
      rightVerts[i3 + 2] = vz + localPull.z * pullForward
    }
  }

  const shiftDist = Math.max(0.06, meshData.approxRadius * 0.72)
  void objPos

  return {
    canTear: true,
    leftDeformQ: encodeDeformOffsets(restPositions, leftVerts),
    rightDeformQ: encodeDeformOffsets(restPositions, rightVerts),
    leftOffsetWorld: [-dirWorldX * shiftDist, -dirWorldY * shiftDist, -dirWorldZ * shiftDist],
    rightOffsetWorld: [dirWorldX * shiftDist, dirWorldY * shiftDist, dirWorldZ * shiftDist],
    childScale: kind === 'paper' || kind === 'cloth' ? 0.88 : 0.82,
  }
}

export function encodeDeformOffsets(restPositions: Float32Array, currPositions: Float32Array): number[] {
  const out = new Array<number>(currPositions.length)
  for (let i = 0; i < currPositions.length; i++) {
    const d = (currPositions[i] - restPositions[i]) / DEFORM_QUANT_RANGE
    const q = Math.round(Math.max(-1, Math.min(1, d)) * 127)
    out[i] = q
  }
  return out
}

export function applyQuantizedDeform(meshData: RuntimeCraftMeshData, deformQ: number[]): void {
  if (!deformQ || deformQ.length !== meshData.currPositions.length) return
  const { restPositions, currPositions, geometry } = meshData
  for (let i = 0; i < currPositions.length; i++) {
    currPositions[i] = restPositions[i] + (deformQ[i] / 127) * DEFORM_QUANT_RANGE
  }
  syncGeometryPositions(geometry, currPositions)
}

export function syncGeometryPositions(geometry: THREE.BufferGeometry, currPositions: Float32Array): void {
  const attr = geometry.getAttribute('position') as THREE.BufferAttribute
  ;(attr.array as Float32Array).set(currPositions)
  attr.needsUpdate = true
  geometry.computeVertexNormals()
}
