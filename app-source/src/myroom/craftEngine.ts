import * as THREE from 'three'
import { CraftMaterialKind, CraftShapePreset, MAX_TEAR_GENERATION } from './types'

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
 * Builds subdivided deformable Three.js geometry for Artificial Clay or Paper craft objects.
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
    baseGeo = new THREE.PlaneGeometry(w, h, 12, 15)
    baseGeo.rotateX(-Math.PI * 0.32)
    // Gentle paper bow so the sheet catches room light cleanly from eye height
    const pAttr = baseGeo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pAttr.count; i++) {
      const px = pAttr.getX(i)
      pAttr.setY(i, pAttr.getY(i) + Math.cos((px / w) * Math.PI) * 0.015 * scale)
    }
    approxRadius = Math.max(w, h) * 0.55
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

  // Slight organic surface irregularity for artificial clay at rest
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
const _v = new THREE.Vector3()
const _delta = new THREE.Vector3()

/**
 * Permanently deforms Artificial Clay or crumples/unfolds Paper using a user's bare palm/finger contact.
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
): { dirty: boolean; nextCrumple: number } {
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
    const brushRadius = Math.max(0.085, approxRadius * 1.35)
    const rate = clampDt * (0.28 + strength * 0.42)

    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3
      const rx = restPositions[i3]
      const ry = restPositions[i3 + 1]
      const rz = restPositions[i3 + 2]
      const cx = currPositions[i3]
      const cy = currPositions[i3 + 1]
      const cz = currPositions[i3 + 2]

      _v.set(cx - _localPalm.x, cy - _localPalm.y, cz - _localPalm.z)
      const dist = _v.length()
      if (dist >= brushRadius) continue

      const falloff = Math.cos((dist / brushRadius) * Math.PI * 0.5)
      const push = falloff * rate

      // Compress inward toward object core & palm normal while flaring laterally (clay volume preservation)
      const towardCenterLen = Math.hypot(cx, cy, cz)
      const invLen = towardCenterLen > 1e-4 ? 1 / towardCenterLen : 0
      const radialInX = -cx * invLen
      const radialInY = -cy * invLen
      const radialInZ = -cz * invLen

      // Blend palm push direction with radial squash
      let nx = _localNorm.x * 0.65 + radialInX * 0.35
      let ny = _localNorm.y * 0.65 + radialInY * 0.35
      let nz = _localNorm.z * 0.65 + radialInZ * 0.35
      const nLen = Math.hypot(nx, ny, nz) || 1
      nx /= nLen
      ny /= nLen
      nz /= nLen

      // Lateral flare perpendicular to squash axis
      const dotR = cx * nx + cy * ny + cz * nz
      const bulgeX = cx - nx * dotR
      const bulgeY = cy - ny * dotR
      const bulgeZ = cz - nz * dotR

      const nextX = cx + nx * push + bulgeX * push * 1.45
      const nextY = cy + ny * push + bulgeY * push * 1.45
      const nextZ = cz + nz * push + bulgeZ * push * 1.45

      // Clamp displacement from rest geometry so quantization remains lossless & manifold
      currPositions[i3] = rx + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, nextX - rx))
      currPositions[i3 + 1] = ry + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, nextY - ry))
      currPositions[i3 + 2] = rz + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, nextZ - rz))
      dirty = true
    }
  } else {
    // Paper crumple: squeezing pulls vertices toward folded ball with sharp geometric creases
    nextCrumple = Math.min(1, currentCrumple + clampDt * (0.55 + strength * 0.95))
    if (Math.abs(nextCrumple - currentCrumple) > 0.002) {
      for (let i = 0; i < vertexCount; i++) {
        const i3 = i * 3
        const rx = restPositions[i3]
        const ry = restPositions[i3 + 1]
        const rz = restPositions[i3 + 2]

        const radialTargetScale = 1 - nextCrumple * 0.66
        const ridgeA = Math.sin(rx * 38 + seed * 3.1 + rz * 19) * 0.028 * nextCrumple
        const ridgeB = Math.cos(rz * 42 - rx * 27 + seed * 5.7) * 0.026 * nextCrumple
        const creaseY = Math.sin(i * 1.9 + seed) * 0.032 * nextCrumple

        const tx = rx * radialTargetScale + ridgeA
        const ty = ry * radialTargetScale + creaseY + ridgeB * 0.7
        const tz = rz * radialTargetScale + ridgeB

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
 * Splits deformed vertex offsets along a tear plane between left and right hands, returning
 * quantized displacement arrays for the two newly created torn pieces.
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
  if (tearGeneration >= MAX_TEAR_GENERATION) {
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
    const seamJitter = createSeededNoise(seed + 17, i) * (kind === 'paper' ? 0.022 : 0.014)

    // Left piece collapses vertices on +side back onto torn mid-seam; Right piece mirrors
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
  const _ = objPos
  void _

  return {
    canTear: true,
    leftDeformQ: encodeDeformOffsets(restPositions, leftVerts),
    rightDeformQ: encodeDeformOffsets(restPositions, rightVerts),
    leftOffsetWorld: [-dirWorldX * shiftDist, -dirWorldY * shiftDist, -dirWorldZ * shiftDist],
    rightOffsetWorld: [dirWorldX * shiftDist, dirWorldY * shiftDist, dirWorldZ * shiftDist],
    childScale: kind === 'paper' ? 0.88 : 0.82,
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

export function applyQuantizedDeform(
  meshData: RuntimeCraftMeshData,
  deformQ: number[]
): void {
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
