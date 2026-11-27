import * as THREE from 'three'
import { CraftMaterialKind, MATERIAL_PHYSICS, RoomSurfaceCollider } from './types'

const BASE_GRAVITY = -9.81

export interface CraftPhysicsTarget {
  pos: [number, number, number]
  vel: [number, number, number]
  quat?: [number, number, number, number]
  kind: CraftMaterialKind
  crumpleFactor?: number
  foldFactor?: number
  seed?: number
  approxRadius: number
  halfExtents?: [number, number, number]
  localCenter?: [number, number, number]
  isFixed?: boolean
}

const _q = new THREE.Quaternion()
const _rotM = new THREE.Matrix4()
const _localC = new THREE.Vector3()

/**
 * Computes world-space center and axis-aligned bounding half-extents for an oriented object.
 */
export function computeWorldObjectBox(obj: {
  pos: [number, number, number]
  quat?: [number, number, number, number]
  approxRadius: number
  halfExtents?: [number, number, number]
  localCenter?: [number, number, number]
}): {
  cx: number
  cy: number
  cz: number
  hx: number
  hy: number
  hz: number
} {
  const lx = obj.halfExtents ? obj.halfExtents[0] : Math.max(0.038, obj.approxRadius * 0.72)
  const ly = obj.halfExtents ? obj.halfExtents[1] : Math.max(0.038, obj.approxRadius * 0.72)
  const lz = obj.halfExtents ? obj.halfExtents[2] : Math.max(0.038, obj.approxRadius * 0.72)

  if (!obj.quat) {
    const cx = obj.pos[0] + (obj.localCenter ? obj.localCenter[0] : 0)
    const cy = obj.pos[1] + (obj.localCenter ? obj.localCenter[1] : 0)
    const cz = obj.pos[2] + (obj.localCenter ? obj.localCenter[2] : 0)
    return { cx, cy, cz, hx: lx, hy: ly, hz: lz }
  }

  _q.set(obj.quat[0], obj.quat[1], obj.quat[2], obj.quat[3]).normalize()
  _rotM.makeRotationFromQuaternion(_q)
  const e = _rotM.elements
  const hx = Math.abs(e[0]) * lx + Math.abs(e[4]) * ly + Math.abs(e[8]) * lz
  const hy = Math.abs(e[1]) * lx + Math.abs(e[5]) * ly + Math.abs(e[9]) * lz
  const hz = Math.abs(e[2]) * lx + Math.abs(e[6]) * ly + Math.abs(e[10]) * lz

  if (obj.localCenter) {
    _localC.set(obj.localCenter[0], obj.localCenter[1], obj.localCenter[2]).applyQuaternion(_q)
  } else {
    _localC.set(0, 0, 0)
  }

  return {
    cx: obj.pos[0] + _localC.x,
    cy: obj.pos[1] + _localC.y,
    cz: obj.pos[2] + _localC.z,
    hx: Math.max(0.012, hx),
    hy: Math.max(0.01, hy),
    hz: Math.max(0.012, hz),
  }
}

/**
 * Clamps any room position (avatar or object) strictly inside scanned wall boundaries
 * and out of horizontal solid furniture blocks when walking.
 */
export function clampInsideRoomWalls(
  x: number,
  z: number,
  margin: number,
  surfaces: readonly RoomSurfaceCollider[],
  fallbackBounds: { minX: number; maxX: number; minZ: number; maxZ: number }
): [number, number] {
  let rx = Math.max(fallbackBounds.minX + margin, Math.min(fallbackBounds.maxX - margin, x))
  let rz = Math.max(fallbackBounds.minZ + margin, Math.min(fallbackBounds.maxZ - margin, z))

  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i]
    if (s.orientation !== 'vertical') continue

    const dx = rx - s.center[0]
    const dz = rz - s.center[2]
    const uProj = dx * s.uAxis[0] + dz * s.uAxis[2]
    if (Math.abs(uProj) > s.halfU + margin * 0.5) continue

    const signedDist = dx * s.normal[0] + dz * s.normal[2]
    const originSide = -s.center[0] * s.normal[0] - s.center[2] * s.normal[2]
    const inwardSign = originSide >= 0 ? 1 : -1
    const depthInward = signedDist * inwardSign
    if (depthInward < margin && depthInward > -0.65) {
      const push = margin - depthInward
      rx += s.normal[0] * inwardSign * push
      rz += s.normal[2] * inwardSign * push
    }
  }

  return [rx, rz]
}

/**
 * Finds the highest scanned horizontal supporting surface under (x, z) at or below maxSearchY.
 */
export function findSupportingSurfaceY(
  x: number,
  z: number,
  surfaces: readonly RoomSurfaceCollider[],
  floorY: number,
  maxSearchY = 2.0
): { y: number; label: string } {
  let bestY = floorY
  let bestLabel = 'floor'

  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i]
    if (s.orientation !== 'horizontal') continue
    if (s.label === 'ceiling') continue
    if (Math.abs(x - s.center[0]) <= s.halfExtents[0] && Math.abs(z - s.center[2]) <= s.halfExtents[2]) {
      const topY = s.maxY
      if (topY <= maxSearchY && topY > bestY) {
        bestY = topY
        bestLabel = s.label
      }
    }
  }

  return { y: bestY, label: bestLabel }
}

/**
 * Steps craft object velocity + gravity and resolves placement/rebound against ALL
 * scanned WebXR AR room layers (floor, tables, desks, couches, walls).
 */
export function stepCraftObjectPhysics(
  obj: CraftPhysicsTarget,
  surfaces: readonly RoomSurfaceCollider[],
  floorY: number,
  fallbackBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  dt: number
): boolean {
  const cDt = Math.min(dt, 0.04)
  const spec = MATERIAL_PHYSICS[obj.kind]
  const box = computeWorldObjectBox(obj)
  const centerOffX = box.cx - obj.pos[0]
  const centerOffY = box.cy - obj.pos[1]
  const centerOffZ = box.cz - obj.pos[2]
  const rXZ = Math.max(box.hx, box.hz)
  const hy = box.hy

  const compact01 = Math.max(obj.crumpleFactor ?? 0, (obj.foldFactor ?? 0) * 0.75)
  const effectiveDrag = spec.airDragFlat * (1 - compact01) + spec.airDragCompact * compact01
  const effGravity = BASE_GRAVITY * (spec.gravityScale * (1 - compact01 * 0.4) + compact01 * 0.45)

  const horizDamp = Math.max(0, 1 - effectiveDrag * cDt)
  const vertDamp = Math.max(0, 1 - effectiveDrag * 0.85 * cDt)

  obj.vel[0] *= horizDamp
  obj.vel[2] *= horizDamp
  obj.vel[1] = obj.vel[1] * vertDamp + effGravity * cDt

  if (spec.flutterAmp > 0 && Math.abs(obj.vel[1]) > 0.25) {
    const phase = (obj.seed ?? 1) * 3.1 + obj.pos[1] * 14
    const flutterScale = spec.flutterAmp * (1 - compact01 * 0.85)
    obj.vel[0] += Math.sin(phase) * flutterScale * cDt * 3.5
    obj.vel[2] += Math.cos(phase * 0.8) * flutterScale * cDt * 3.5
  }

  obj.pos[0] += obj.vel[0] * cDt
  obj.pos[1] += obj.vel[1] * cDt
  obj.pos[2] += obj.vel[2] * cDt

  let touchedSurface = false
  const restitution = spec.restitution
  const slideKeep = Math.max(0.35, 1 - spec.friction * 0.75)

  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i]
    const cx = obj.pos[0] + centerOffX
    const cy = obj.pos[1] + centerOffY
    const cz = obj.pos[2] + centerOffZ

    if (s.orientation === 'horizontal') {
      if (s.label === 'ceiling') {
        const bottomY = s.minY
        if (cy + hy > bottomY && cy < bottomY + 0.25 && obj.vel[1] > 0) {
          obj.pos[1] = bottomY - hy - centerOffY
          obj.vel[1] = -obj.vel[1] * 0.3
        }
        continue
      }

      const dx = cx - s.center[0]
      const dz = cz - s.center[2]
      const u = Math.abs(dx * s.uAxis[0] + dz * s.uAxis[2])
      const v = Math.abs(dx * s.vAxis[0] + dz * s.vAxis[2])
      const insideRotated = u <= s.halfU + box.hx * 0.25 && v <= s.halfV + box.hz * 0.25
      const insideAABB =
        Math.abs(dx) <= s.halfExtents[0] + box.hx * 0.25 &&
        Math.abs(dz) <= s.halfExtents[2] + box.hz * 0.25

      if (insideRotated || insideAABB) {
        const topY = s.maxY
        if (cy - hy <= topY && cy >= topY - 0.14 && obj.vel[1] <= 0.45) {
          obj.pos[1] = topY + hy - centerOffY
          if (obj.vel[1] < -0.6) {
            obj.vel[1] = -obj.vel[1] * restitution
          } else {
            obj.vel[1] = 0
          }
          obj.vel[0] *= slideKeep
          obj.vel[2] *= slideKeep
          touchedSurface = true
        }
      }
    } else {
      const dx = cx - s.center[0]
      const dy = cy - s.center[1]
      const dz = cz - s.center[2]

      if (cy + hy < s.minY || cy - hy > s.maxY) continue

      const u = Math.abs(dx * s.uAxis[0] + dz * s.uAxis[2])
      if (u > s.halfU + rXZ) continue

      const dist = dx * s.normal[0] + dy * s.normal[1] + dz * s.normal[2]
      if (Math.abs(dist) < rXZ + 0.03) {
        const sign = dist >= 0 ? 1 : -1
        const push = rXZ + 0.03 - Math.abs(dist)
        obj.pos[0] += s.normal[0] * sign * push
        obj.pos[2] += s.normal[2] * sign * push
        const vn = obj.vel[0] * s.normal[0] + obj.vel[2] * s.normal[2]
        if (vn * sign < 0) {
          obj.vel[0] -= (1 + restitution) * vn * s.normal[0]
          obj.vel[2] -= (1 + restitution) * vn * s.normal[2]
        }
        touchedSurface = true
      }
    }
  }

  const clamped = clampInsideRoomWalls(
    obj.pos[0] + centerOffX,
    obj.pos[2] + centerOffZ,
    Math.min(box.hx, box.hz) + 0.02,
    surfaces,
    fallbackBounds
  )
  const clampedObjX = clamped[0] - centerOffX
  const clampedObjZ = clamped[1] - centerOffZ
  if (Math.abs(clampedObjX - obj.pos[0]) > 1e-5) {
    obj.pos[0] = clampedObjX
    obj.vel[0] *= -0.35
    touchedSurface = true
  }
  if (Math.abs(clampedObjZ - obj.pos[2]) > 1e-5) {
    obj.pos[2] = clampedObjZ
    obj.vel[2] *= -0.35
    touchedSurface = true
  }

  const curCenterY = obj.pos[1] + centerOffY
  if (curCenterY - hy < floorY) {
    obj.pos[1] = floorY + hy - centerOffY
    if (obj.vel[1] < -0.6) {
      obj.vel[1] = -obj.vel[1] * restitution
    } else {
      obj.vel[1] = 0
    }
    obj.vel[0] *= slideKeep
    obj.vel[2] *= slideKeep
    touchedSurface = true
  }

  return touchedSurface
}

/**
 * Multi-iteration solid collision & stable multi-layer stacking solver across ALL craft objects.
 * Prevents any object from passing through another, and stacks Wood/Metal plates & blocks solidly!
 */
export function resolveCraftObjectCollisions(
  objs: CraftPhysicsTarget[],
  surfaces: readonly RoomSurfaceCollider[],
  floorY: number,
  iterations = 4
): void {
  const n = objs.length
  if (n < 2) return

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) {
      const a = objs[i]
      for (let j = i + 1; j < n; j++) {
        const b = objs[j]
        if (a.isFixed && b.isFixed) continue

        const boxA = computeWorldObjectBox(a)
        const boxB = computeWorldObjectBox(b)

        const dx = boxB.cx - boxA.cx
        const dy = boxB.cy - boxA.cy
        const dz = boxB.cz - boxA.cz

        const overlapX = boxA.hx + boxB.hx - Math.abs(dx)
        const overlapY = boxA.hy + boxB.hy - Math.abs(dy)
        const overlapZ = boxA.hz + boxB.hz - Math.abs(dz)

        if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) continue

        const invMassA = a.isFixed ? 0 : 1 / Math.max(0.015, MATERIAL_PHYSICS[a.kind].massKg)
        const invMassB = b.isFixed ? 0 : 1 / Math.max(0.015, MATERIAL_PHYSICS[b.kind].massKg)
        const invSum = invMassA + invMassB
        if (invSum <= 0) continue

        const minHoriz = Math.min(overlapX, overlapZ)
        const stackThreshold = minHoriz * 1.15 + 0.018

        // Vertical stack / landing contact when vertical overlap is smallest (or sitting on plate/block)
        if (overlapY <= stackThreshold) {
          const bIsUpper = dy >= 0
          const upper = bIsUpper ? b : a
          const lower = bIsUpper ? a : b
          const upperBox = bIsUpper ? boxB : boxA
          const lowerBox = bIsUpper ? boxA : boxB

          // Determine if lower is resting on room floor/surface so upper absorbs stack lift cleanly
          const lowerSurf = findSupportingSurfaceY(
            lowerBox.cx,
            lowerBox.cz,
            surfaces,
            floorY,
            lowerBox.cy + lowerBox.hy + 0.04
          )
          const lowerGrounded = Boolean(lower.isFixed) || lowerBox.cy - lowerBox.hy <= lowerSurf.y + 0.025

          if (!upper.isFixed && (lowerGrounded || upper.vel[1] <= lower.vel[1] + 0.15)) {
            upper.pos[1] += overlapY
            if (upper.vel[1] < lower.vel[1]) {
              const relVy = upper.vel[1] - lower.vel[1]
              const rest = Math.min(0.28, (MATERIAL_PHYSICS[a.kind].restitution + MATERIAL_PHYSICS[b.kind].restitution) * 0.35)
              upper.vel[1] = relVy < -0.65 ? lower.vel[1] - relVy * rest : lower.vel[1]
            }
            // High stack surface friction keeps stacked Wood + Metal bridges/towers rock solid!
            const stackFriction = Math.min(
              0.85,
              (MATERIAL_PHYSICS[upper.kind].friction + MATERIAL_PHYSICS[lower.kind].friction) * 0.6
            )
            const keepXZ = 1 - stackFriction * 0.45
            upper.vel[0] *= keepXZ
            upper.vel[2] *= keepXZ
          } else {
            const wUpper = upper.isFixed ? 0 : 1 / Math.max(0.015, MATERIAL_PHYSICS[upper.kind].massKg)
            const wLower = lower.isFixed ? 0 : 1 / Math.max(0.015, MATERIAL_PHYSICS[lower.kind].massKg)
            const wTot = wUpper + wLower
            if (wTot > 0) {
              upper.pos[1] += overlapY * (wUpper / wTot)
              lower.pos[1] -= overlapY * (wLower / wTot)
            }
            if (upperBox.cy - upperBox.hy < lowerBox.cy + lowerBox.hy && !upper.isFixed) {
              upper.vel[1] = Math.max(0, upper.vel[1])
            }
          }
        } else {
          // Lateral solid contact (objects never slide through one another)
          const wA = invMassA / invSum
          const wB = invMassB / invSum
          if (overlapX <= overlapZ) {
            const signX = dx >= 0 ? 1 : -1
            a.pos[0] -= signX * overlapX * wA
            b.pos[0] += signX * overlapX * wB
            const relVx = (b.vel[0] - a.vel[0]) * signX
            if (relVx < 0) {
              const bounce = Math.min(0.35, (MATERIAL_PHYSICS[a.kind].restitution + MATERIAL_PHYSICS[b.kind].restitution) * 0.5)
              const impulse = -(1 + bounce) * relVx
              if (!a.isFixed) a.vel[0] -= signX * impulse * wA
              if (!b.isFixed) b.vel[0] += signX * impulse * wB
            }
          } else {
            const signZ = dz >= 0 ? 1 : -1
            a.pos[2] -= signZ * overlapZ * wA
            b.pos[2] += signZ * overlapZ * wB
            const relVz = (b.vel[2] - a.vel[2]) * signZ
            if (relVz < 0) {
              const bounce = Math.min(0.35, (MATERIAL_PHYSICS[a.kind].restitution + MATERIAL_PHYSICS[b.kind].restitution) * 0.5)
              const impulse = -(1 + bounce) * relVz
              if (!a.isFixed) a.vel[2] -= signZ * impulse * wA
              if (!b.isFixed) b.vel[2] += signZ * impulse * wB
            }
          }
        }
      }
    }

    // Re-clamp unheld bottom-most objects above real floor/table after multi-object contacts
    for (let i = 0; i < n; i++) {
      const obj = objs[i]
      if (obj.isFixed) continue
      const box = computeWorldObjectBox(obj)
      const centerOffY = box.cy - obj.pos[1]
      const surf = findSupportingSurfaceY(box.cx, box.cz, surfaces, floorY, box.cy + box.hy + 0.04)
      if (box.cy - box.hy < surf.y) {
        obj.pos[1] = surf.y + box.hy - centerOffY
        if (obj.vel[1] < 0) obj.vel[1] = 0
      }
    }
  }
}

/**
 * Raycasts against scanned room horizontal surfaces + real floor to place spawned craft objects
 * comfortably in front of the user rather than far away.
 */
export function raycastRoomPlacementPoint(
  origin: [number, number, number],
  dir: [number, number, number],
  surfaces: readonly RoomSurfaceCollider[],
  floorY = 0,
  maxDist = 1.25
): [number, number, number] {
  let bestT = maxDist
  let hitPoint: [number, number, number] | null = null

  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i]
    if (s.orientation === 'horizontal' && s.label !== 'ceiling' && Math.abs(dir[1]) > 0.05) {
      const topY = s.maxY
      const t = (topY - origin[1]) / dir[1]
      if (t > 0.25 && t < bestT) {
        const hx = origin[0] + dir[0] * t
        const hz = origin[2] + dir[2] * t
        if (
          Math.abs(hx - s.center[0]) <= s.halfExtents[0] &&
          Math.abs(hz - s.center[2]) <= s.halfExtents[2]
        ) {
          bestT = t
          hitPoint = [hx, topY + 0.09, hz]
        }
      }
    }
  }

  if (hitPoint) return hitPoint

  const reach = Math.min(0.82, maxDist * 0.72)
  return [
    origin[0] + dir[0] * reach,
    Math.max(floorY + 0.25, origin[1] + dir[1] * reach - 0.08),
    origin[2] + dir[2] * reach,
  ]
}
