import * as THREE from 'three'
import { CraftMaterialKind, CraftShapePreset, MATERIAL_PHYSICS, MAX_TEAR_GENERATION } from './types'

export const DEFORM_QUANT_RANGE = 0.26

export interface RuntimeCraftMeshData {
  geometry: THREE.BufferGeometry
  restPositions: Float32Array
  currPositions: Float32Array
  vertexCount: number
  approxRadius: number
  halfExtents: [number, number, number]
  localCenter: [number, number, number]
  restVolume: number
}

function createSeededNoise(seed: number, idx: number): number {
  const x = Math.sin(seed * 12.9898 + idx * 78.233) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/**
 * Computes tight local bounding half-extents & centroid offset directly from current vertex positions
 * so stacked/cut/folded objects rest flush against each other without passing through.
 */
export function computeLocalMeshBounds(positions: Float32Array): {
  halfExtents: [number, number, number]
  localCenter: [number, number, number]
  approxRadius: number
} {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]
    const y = positions[i + 1]
    const z = positions[i + 2]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }

  if (!Number.isFinite(minX)) {
    return {
      halfExtents: [0.05, 0.05, 0.05],
      localCenter: [0, 0, 0],
      approxRadius: 0.08,
    }
  }

  const hx = Math.max(0.012, (maxX - minX) * 0.5)
  const hy = Math.max(0.01, (maxY - minY) * 0.5)
  const hz = Math.max(0.012, (maxZ - minZ) * 0.5)
  const cx = (minX + maxX) * 0.5
  const cy = (minY + maxY) * 0.5
  const cz = (minZ + maxZ) * 0.5

  return {
    halfExtents: [hx, hy, hz],
    localCenter: [cx, cy, cz],
    approxRadius: Math.hypot(hx, hy, hz) * 0.72,
  }
}

/**
 * Exact signed tetrahedral mesh volume relative to vertex centroid for watertight closed meshes (Clay solids).
 */
export function computeSignedMeshVolume(geometry: THREE.BufferGeometry, positions: Float32Array): number {
  const index = geometry.getIndex()
  const vertCount = Math.floor(positions.length / 3)
  if (!index || vertCount < 4) return 0

  let cx = 0
  let cy = 0
  let cz = 0
  for (let i = 0; i < positions.length; i += 3) {
    cx += positions[i]
    cy += positions[i + 1]
    cz += positions[i + 2]
  }
  cx /= vertCount
  cy /= vertCount
  cz /= vertCount

  const idxArr = index.array
  let vol6 = 0
  for (let t = 0; t < idxArr.length; t += 3) {
    const a = idxArr[t] * 3
    const b = idxArr[t + 1] * 3
    const c = idxArr[t + 2] * 3

    const ax = positions[a] - cx
    const ay = positions[a + 1] - cy
    const az = positions[a + 2] - cz
    const bx = positions[b] - cx
    const by = positions[b + 1] - cy
    const bz = positions[b + 2] - cz
    const dx = positions[c] - cx
    const dy = positions[c + 1] - cy
    const dz = positions[c + 2] - cz

    const crossX = by * dz - bz * dy
    const crossY = bz * dx - bx * dz
    const crossZ = bx * dy - by * dx
    vol6 += ax * crossX + ay * crossY + az * crossZ
  }

  return Math.abs(vol6) / 6
}

/**
 * Builds subdivided 3D geometry tailored to Paper, Cloth, Artificial Clay, Wood (including thin wide Plates), or Metal.
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
    baseGeo.rotateX(-Math.PI * 0.44)
    const pAttr = baseGeo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pAttr.count; i++) {
      const px = pAttr.getX(i)
      pAttr.setY(i, pAttr.getY(i) + Math.cos((px / w) * Math.PI) * 0.008 * scale)
    }
    approxRadius = Math.max(w, h) * 0.54
  } else if (kind === 'cloth') {
    const w = (preset === 'towel' ? 0.28 : 0.34) * scale
    const h = (preset === 'towel' ? 0.44 : 0.34) * scale
    baseGeo = new THREE.PlaneGeometry(w, h, 14, 14)
    baseGeo.rotateX(-Math.PI * 0.42)
    const pAttr = baseGeo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pAttr.count; i++) {
      const px = pAttr.getX(i)
      const pz = pAttr.getZ(i)
      pAttr.setY(i, pAttr.getY(i) + Math.sin(px * 18 + pz * 10) * 0.012 * scale)
    }
    approxRadius = Math.max(w, h) * 0.52
  } else if (kind === 'wood') {
    if (preset === 'plate') {
      // Thin, wide structural wood plate / board for decks, bridges, roofs, & multi-layer builds
      baseGeo = new THREE.BoxGeometry(0.46 * scale, 0.024 * scale, 0.32 * scale, 3, 1, 3)
      approxRadius = 0.24 * scale
    } else if (preset === 'plank') {
      baseGeo = new THREE.BoxGeometry(0.3 * scale, 0.045 * scale, 0.12 * scale, 2, 1, 2)
      approxRadius = 0.16 * scale
    } else if (preset === 'cylinder') {
      baseGeo = new THREE.CylinderGeometry(0.058 * scale, 0.058 * scale, 0.24 * scale, 18, 2)
      approxRadius = 0.125 * scale
    } else {
      baseGeo = new THREE.BoxGeometry(0.14 * scale, 0.14 * scale, 0.14 * scale, 2, 2, 2)
      approxRadius = 0.105 * scale
    }
  } else if (kind === 'metal') {
    if (preset === 'plate' || preset === 'plank') {
      baseGeo = new THREE.BoxGeometry(0.36 * scale, 0.024 * scale, 0.16 * scale, 2, 1, 2)
      approxRadius = 0.19 * scale
    } else if (preset === 'cylinder') {
      baseGeo = new THREE.CylinderGeometry(0.054 * scale, 0.054 * scale, 0.22 * scale, 20, 2)
      approxRadius = 0.115 * scale
    } else if (preset === 'sphere') {
      baseGeo = new THREE.SphereGeometry(0.088 * scale, 20, 16)
      approxRadius = 0.092 * scale
    } else {
      baseGeo = new THREE.BoxGeometry(0.16 * scale, 0.09 * scale, 0.11 * scale, 2, 2, 2)
      approxRadius = 0.105 * scale
    }
  } else if (preset === 'cylinder') {
    baseGeo = new THREE.CylinderGeometry(0.068 * scale, 0.068 * scale, 0.22 * scale, 18, 10)
    approxRadius = 0.12 * scale
  } else if (preset === 'box') {
    baseGeo = new THREE.BoxGeometry(0.155 * scale, 0.155 * scale, 0.155 * scale, 7, 7, 7)
    approxRadius = 0.115 * scale
  } else {
    baseGeo = new THREE.SphereGeometry(0.108 * scale, 18, 14)
    approxRadius = 0.11 * scale
  }

  const posAttr = baseGeo.getAttribute('position') as THREE.BufferAttribute
  const restPositions = new Float32Array(posAttr.array.length)
  if (kind === 'clay') {
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i)
      const y = posAttr.getY(i)
      const z = posAttr.getZ(i)
      const wobble = 1 + createSeededNoise(seed, i) * 0.035
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
  const bounds = computeLocalMeshBounds(currPositions)
  const restVolume = kind === 'clay' ? computeSignedMeshVolume(baseGeo, restPositions) : 0

  return {
    geometry: baseGeo,
    restPositions,
    currPositions,
    vertexCount: posAttr.count,
    approxRadius: Math.max(approxRadius, bounds.approxRadius),
    halfExtents: bounds.halfExtents,
    localCenter: bounds.localCenter,
    restVolume,
  }
}

export function refreshMeshDerivedData(meshData: RuntimeCraftMeshData): void {
  const bounds = computeLocalMeshBounds(meshData.currPositions)
  meshData.halfExtents = bounds.halfExtents
  meshData.localCenter = bounds.localCenter
  meshData.approxRadius = Math.max(0.04, bounds.approxRadius)
}

const _invQuat = new THREE.Quaternion()
const _localPalm = new THREE.Vector3()
const _localNorm = new THREE.Vector3()
const _delta = new THREE.Vector3()

/**
 * Enforces volume conservation on Clay by expanding orthogonal axes around centroid
 * whenever local palm pressure compresses along one axis, followed by exact tetrahedral volume lock.
 */
function enforceClayVolumePreservation(
  meshData: RuntimeCraftMeshData,
  pressAxisLocal: THREE.Vector3
): void {
  const { restPositions, currPositions, vertexCount, geometry, restVolume } = meshData
  if (restVolume <= 1e-8 || vertexCount < 4) return

  const curVol = computeSignedMeshVolume(geometry, currPositions)
  if (curVol <= 1e-8) return

  let cx = 0
  let cy = 0
  let cz = 0
  for (let i = 0; i < vertexCount; i++) {
    const i3 = i * 3
    cx += currPositions[i3]
    cy += currPositions[i3 + 1]
    cz += currPositions[i3 + 2]
  }
  cx /= vertexCount
  cy /= vertexCount
  cz /= vertexCount

  // First pass: compensate lost thickness purely by flaring orthogonal (pancake) axes so pressed face stays indented!
  const ratio = restVolume / curVol
  const perpScale = Math.max(0.92, Math.min(1.24, Math.sqrt(ratio)))
  for (let i = 0; i < vertexCount; i++) {
    const i3 = i * 3
    const dx = currPositions[i3] - cx
    const dy = currPositions[i3 + 1] - cy
    const dz = currPositions[i3 + 2] - cz
    const proj = dx * pressAxisLocal.x + dy * pressAxisLocal.y + dz * pressAxisLocal.z
    const ax = pressAxisLocal.x * proj
    const ay = pressAxisLocal.y * proj
    const az = pressAxisLocal.z * proj
    const px = dx - ax
    const py = dy - ay
    const pz = dz - az

    const nx = cx + ax + px * perpScale
    const ny = cy + ay + py * perpScale
    const nz = cz + az + pz * perpScale

    currPositions[i3] =
      restPositions[i3] + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, nx - restPositions[i3]))
    currPositions[i3 + 1] =
      restPositions[i3 + 1] +
      Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, ny - restPositions[i3 + 1]))
    currPositions[i3 + 2] =
      restPositions[i3 + 2] +
      Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, nz - restPositions[i3 + 2]))
  }

  // Second pass: uniform isotropic trim so exact final volume equals restVolume even under repeated squashes
  const volAfterPerp = computeSignedMeshVolume(geometry, currPositions)
  if (volAfterPerp > 1e-8) {
    const uniScale = Math.max(0.9, Math.min(1.18, Math.cbrt(restVolume / volAfterPerp)))
    if (Math.abs(uniScale - 1) > 0.002) {
      for (let i = 0; i < vertexCount; i++) {
        const i3 = i * 3
        const nx = cx + (currPositions[i3] - cx) * uniScale
        const ny = cy + (currPositions[i3 + 1] - cy) * uniScale
        const nz = cz + (currPositions[i3 + 2] - cz) * uniScale
        currPositions[i3] =
          restPositions[i3] + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, nx - restPositions[i3]))
        currPositions[i3 + 1] =
          restPositions[i3 + 1] +
          Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, ny - restPositions[i3 + 1]))
        currPositions[i3 + 2] =
          restPositions[i3 + 2] +
          Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, nz - restPositions[i3 + 2]))
      }
    }
  }
}

/**
 * Squeezes / reshapes Clay (volume-preserving) or soft Cloth.
 * Paper (only fold enabled), Wood, and Metal explicitly do NOT squeeze.
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
    return {
      dirty: false,
      nextCrumple: currentCrumple,
      rejectedRigid: kind === 'wood' || kind === 'metal',
    }
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
    const squashRate = Math.min(0.36, clampDt * (1.1 + strength * 1.9))
    const localBrushR = Math.max(0.11, approxRadius * 1.55)

    let cx = 0
    let cy = 0
    let cz = 0
    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3
      cx += currPositions[i3]
      cy += currPositions[i3 + 1]
      cz += currPositions[i3 + 2]
    }
    cx /= vertexCount
    cy /= vertexCount
    cz /= vertexCount

    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3
      const rx = restPositions[i3]
      const ry = restPositions[i3 + 1]
      const rz = restPositions[i3 + 2]
      const vx = currPositions[i3] - cx
      const vy = currPositions[i3 + 1] - cy
      const vz = currPositions[i3 + 2] - cz

      const dToPalm = Math.hypot(currPositions[i3] - _localPalm.x, currPositions[i3 + 1] - _localPalm.y, currPositions[i3 + 2] - _localPalm.z)
      if (dToPalm >= localBrushR) continue

      const weight = 0.38 + 0.62 * Math.cos((dToPalm / localBrushR) * Math.PI * 0.5)
      const proj = vx * _localNorm.x + vy * _localNorm.y + vz * _localNorm.z
      const pxComp = _localNorm.x * proj
      const pyComp = _localNorm.y * proj
      const pzComp = _localNorm.z * proj
      const perpX = vx - pxComp
      const perpY = vy - pyComp
      const perpZ = vz - pzComp

      // Compress along press axis while pre-flaring orthogonal axes inversely
      const compFactor = Math.max(0.55, 1 - squashRate * weight)
      const preFlare = 1 / Math.sqrt(compFactor)

      const nextX = cx + pxComp * compFactor + perpX * preFlare
      const nextY = cy + pyComp * compFactor + perpY * preFlare
      const nextZ = cz + pzComp * compFactor + perpZ * preFlare

      currPositions[i3] = rx + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, nextX - rx))
      currPositions[i3 + 1] = ry + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, nextY - ry))
      currPositions[i3 + 2] = rz + Math.max(-DEFORM_QUANT_RANGE, Math.min(DEFORM_QUANT_RANGE, nextZ - rz))
      dirty = true
    }

    if (dirty) {
      enforceClayVolumePreservation(meshData, _localNorm)
    }
  } else if (kind === 'cloth') {
    // Soft fabric bunching / squeezing
    nextCrumple = Math.min(1, currentCrumple + clampDt * 1.45 * (0.4 + strength * 0.8))
    if (Math.abs(nextCrumple - currentCrumple) > 0.002) {
      for (let i = 0; i < vertexCount; i++) {
        const i3 = i * 3
        const rx = restPositions[i3]
        const ry = restPositions[i3 + 1]
        const rz = restPositions[i3 + 2]

        const shrink = 1 - nextCrumple * 0.58
        const amp = 0.036 * nextCrumple
        const ridgeA = Math.sin(rx * 16 + seed * 3.1 + rz * 14) * amp
        const ridgeB = Math.cos(rz * 20 - rx * 18 + seed * 5.7) * amp
        const creaseY = Math.sin(rx * 22 + rz * 20 + seed) * amp

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
    refreshMeshDerivedData(meshData)
  }
  return { dirty, nextCrumple }
}

/**
 * Folds Paper or Cloth neatly along the central hinge axis (foldFactor 0..1 -> up to 172deg).
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
  const hingeAxis = new THREE.Vector3(0, 1, 0).cross(foldAcross)
  if (hingeAxis.lengthSq() < 1e-4) hingeAxis.set(0, 0, 1)
  hingeAxis.normalize()

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
  refreshMeshDerivedData(meshData)
  return { dirty: true, nextFold }
}

/**
 * Splits deformed vertex offsets along a tear plane between left and right hands
 * for tearable materials (Clay, Paper, Cloth). Wood & Metal reject hand tearing.
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
    childScale: kind === 'paper' || kind === 'cloth' ? 0.88 : 0.85,
  }
}

/**
 * Clean planar tool cut (Knife / Axe) that splits Wood, Clay, Paper, or Cloth cleanly along the blade plane
 * without jagged tearing. Metal resists knife/axe cutting.
 */
export function computeBladeCutDeforms(
  meshData: RuntimeCraftMeshData,
  kind: CraftMaterialKind,
  objPos: [number, number, number],
  objQuat: [number, number, number, number],
  cutPointWorld: [number, number, number],
  bladeNormalWorld: [number, number, number],
  tearGeneration: number
): {
  canCut: boolean
  leftDeformQ: number[]
  rightDeformQ: number[]
  leftOffsetWorld: [number, number, number]
  rightOffsetWorld: [number, number, number]
  childScale: number
} {
  if (kind === 'metal' || tearGeneration >= MAX_TEAR_GENERATION) {
    return {
      canCut: false,
      leftDeformQ: [],
      rightDeformQ: [],
      leftOffsetWorld: [0, 0, 0],
      rightOffsetWorld: [0, 0, 0],
      childScale: 1,
    }
  }

  _invQuat.set(objQuat[0], objQuat[1], objQuat[2], objQuat[3]).invert()
  const normW = new THREE.Vector3(bladeNormalWorld[0], bladeNormalWorld[1], bladeNormalWorld[2])
  if (normW.lengthSq() < 1e-4) normW.set(1, 0, 0)
  normW.normalize()

  const localCutPt = _localPalm
    .set(cutPointWorld[0] - objPos[0], cutPointWorld[1] - objPos[1], cutPointWorld[2] - objPos[2])
    .applyQuaternion(_invQuat)
  const localNorm = _localNorm.copy(normW).applyQuaternion(_invQuat).normalize()

  const { restPositions, currPositions, vertexCount } = meshData

  let minP = Infinity
  let maxP = -Infinity
  let sumP = 0
  for (let i = 0; i < vertexCount; i++) {
    const i3 = i * 3
    const p =
      currPositions[i3] * localNorm.x +
      currPositions[i3 + 1] * localNorm.y +
      currPositions[i3 + 2] * localNorm.z
    if (p < minP) minP = p
    if (p > maxP) maxP = p
    sumP += p
  }
  const midP = sumP / Math.max(1, vertexCount)
  const rawCutOffset =
    localCutPt.x * localNorm.x + localCutPt.y * localNorm.y + localCutPt.z * localNorm.z
  // Keep cut within middle 60% of piece span so neither cut piece is a sliver
  const span = Math.max(0.02, maxP - minP)
  const cutOffset = Math.max(minP + span * 0.25, Math.min(maxP - span * 0.25, Number.isFinite(rawCutOffset) ? rawCutOffset : midP))

  const leftVerts = new Float32Array(currPositions)
  const rightVerts = new Float32Array(currPositions)

  for (let i = 0; i < vertexCount; i++) {
    const i3 = i * 3
    const vx = currPositions[i3]
    const vy = currPositions[i3 + 1]
    const vz = currPositions[i3 + 2]
    const proj = vx * localNorm.x + vy * localNorm.y + vz * localNorm.z

    if (proj > cutOffset) {
      const pull = proj - cutOffset
      leftVerts[i3] = vx - localNorm.x * pull
      leftVerts[i3 + 1] = vy - localNorm.y * pull
      leftVerts[i3 + 2] = vz - localNorm.z * pull
    }
    if (proj < cutOffset) {
      const pull = cutOffset - proj
      rightVerts[i3] = vx + localNorm.x * pull
      rightVerts[i3 + 1] = vy + localNorm.y * pull
      rightVerts[i3 + 2] = vz + localNorm.z * pull
    }
  }

  const shiftDist = Math.max(0.055, meshData.approxRadius * 0.42)
  return {
    canCut: true,
    leftDeformQ: encodeDeformOffsets(restPositions, leftVerts),
    rightDeformQ: encodeDeformOffsets(restPositions, rightVerts),
    leftOffsetWorld: [-normW.x * shiftDist, -normW.y * shiftDist, -normW.z * shiftDist],
    rightOffsetWorld: [normW.x * shiftDist, normW.y * shiftDist, normW.z * shiftDist],
    childScale: kind === 'wood' ? 0.94 : 0.9,
  }
}

const _tipLocal = new THREE.Vector3()
const _triA = new THREE.Vector3()
const _triB = new THREE.Vector3()
const _triC = new THREE.Vector3()
const _closestPt = new THREE.Vector3()
const _tri = new THREE.Triangle()
const _bary = new THREE.Vector3()

/**
 * Projects a world-space Pen nib point onto a Paper object's nearest UV surface coordinates [0..1].
 */
export function projectWorldTipOntoPaperUV(
  meshData: RuntimeCraftMeshData,
  objPos: [number, number, number],
  objQuat: [number, number, number, number],
  tipWorldPos: [number, number, number],
  maxDist = 0.036
): { hit: boolean; uv: [number, number]; dist: number } {
  const index = meshData.geometry.getIndex()
  const uvAttr = meshData.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined
  if (!index || !uvAttr) {
    return { hit: false, uv: [0.5, 0.5], dist: Infinity }
  }

  _invQuat.set(objQuat[0], objQuat[1], objQuat[2], objQuat[3]).invert()
  _tipLocal
    .set(tipWorldPos[0] - objPos[0], tipWorldPos[1] - objPos[1], tipWorldPos[2] - objPos[2])
    .applyQuaternion(_invQuat)

  const pos = meshData.currPositions
  const idxArr = index.array
  let bestDistSq = maxDist * maxDist
  let bestU = 0.5
  let bestV = 0.5
  let hit = false

  for (let t = 0; t < idxArr.length; t += 3) {
    const ia = idxArr[t]
    const ib = idxArr[t + 1]
    const ic = idxArr[t + 2]
    _triA.set(pos[ia * 3], pos[ia * 3 + 1], pos[ia * 3 + 2])
    _triB.set(pos[ib * 3], pos[ib * 3 + 1], pos[ib * 3 + 2])
    _triC.set(pos[ic * 3], pos[ic * 3 + 1], pos[ic * 3 + 2])

    _tri.set(_triA, _triB, _triC)
    _tri.closestPointToPoint(_tipLocal, _closestPt)
    const dSq = _closestPt.distanceToSquared(_tipLocal)
    if (dSq < bestDistSq) {
      bestDistSq = dSq
      _tri.getBarycoord(_closestPt, _bary)
      const u =
        uvAttr.getX(ia) * _bary.x + uvAttr.getX(ib) * _bary.y + uvAttr.getX(ic) * _bary.z
      const v =
        uvAttr.getY(ia) * _bary.x + uvAttr.getY(ib) * _bary.y + uvAttr.getY(ic) * _bary.z
      bestU = Math.max(0.01, Math.min(0.99, u))
      bestV = Math.max(0.01, Math.min(0.99, v))
      hit = true
    }
  }

  return { hit, uv: [bestU, bestV], dist: Math.sqrt(bestDistSq) }
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
  refreshMeshDerivedData(meshData)
}

export function syncGeometryPositions(geometry: THREE.BufferGeometry, currPositions: Float32Array): void {
  const attr = geometry.getAttribute('position') as THREE.BufferAttribute
  ;(attr.array as Float32Array).set(currPositions)
  attr.needsUpdate = true
  geometry.computeVertexNormals()
}
