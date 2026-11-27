import { CraftMaterialKind, MATERIAL_PHYSICS, RoomSurfaceCollider } from './types'

const BASE_GRAVITY = -9.81

export interface CraftPhysicsTarget {
  pos: [number, number, number]
  vel: [number, number, number]
  kind: CraftMaterialKind
  crumpleFactor?: number
  foldFactor?: number
  seed?: number
  approxRadius: number
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

  // Resolve oriented vertical wall planes so objects/opponents never pass outside scanned room walls
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i]
    if (s.orientation !== 'vertical') continue

    const dx = rx - s.center[0]
    const dz = rz - s.center[2]
    // Signed distance along plane normal (Quest wall normals typically point into room, check projection within wall span)
    const uProj = dx * s.uAxis[0] + dz * s.uAxis[2]
    if (Math.abs(uProj) > s.halfU + margin * 0.5) continue

    const signedDist = dx * s.normal[0] + dz * s.normal[2]
    // If wall normal points inward toward (0,0) center or room origin: keep on the interior side (>= margin)
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
  const r = Math.max(0.038, obj.approxRadius * 0.72)

  // Compacting (crumpling/folding) Paper or Cloth reduces air resistance smoothly like the real world
  const compact01 = Math.max(obj.crumpleFactor ?? 0, (obj.foldFactor ?? 0) * 0.75)
  const effectiveDrag =
    spec.airDragFlat * (1 - compact01) + spec.airDragCompact * compact01
  const effGravity =
    BASE_GRAVITY * (spec.gravityScale * (1 - compact01 * 0.4) + compact01 * 0.45)

  const horizDamp = Math.max(0, 1 - effectiveDrag * cDt)
  const vertDamp = Math.max(0, 1 - effectiveDrag * 0.85 * cDt)

  obj.vel[0] *= horizDamp
  obj.vel[2] *= horizDamp
  obj.vel[1] = obj.vel[1] * vertDamp + effGravity * cDt

  // Leaf-like lateral air flutter for flat Paper / light Cloth while falling in mid-air
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

  // 1. Resolve ALL scanned horizontal surfaces (tables, desks, couches, shelves, floor)
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i]
    if (s.orientation === 'horizontal') {
      if (s.label === 'ceiling') {
        const bottomY = s.minY
        if (obj.pos[1] + r > bottomY && obj.pos[1] < bottomY + 0.25 && obj.vel[1] > 0) {
          obj.pos[1] = bottomY - r
          obj.vel[1] = -obj.vel[1] * 0.3
        }
        continue
      }

      const dx = obj.pos[0] - s.center[0]
      const dz = obj.pos[2] - s.center[2]
      const u = Math.abs(dx * s.uAxis[0] + dz * s.uAxis[2])
      const v = Math.abs(dx * s.vAxis[0] + dz * s.vAxis[2])
      const insideRotated = u <= s.halfU + r * 0.35 && v <= s.halfV + r * 0.35
      const insideAABB =
        Math.abs(dx) <= s.halfExtents[0] + r * 0.35 && Math.abs(dz) <= s.halfExtents[2] + r * 0.35

      if (insideRotated || insideAABB) {
        const topY = s.maxY
        if (obj.pos[1] - r <= topY && obj.pos[1] >= topY - 0.16 && obj.vel[1] <= 0.45) {
          obj.pos[1] = topY + r
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
      // 2. Oriented Vertical Wall Plane / Furniture Side Collision
      const dx = obj.pos[0] - s.center[0]
      const dy = obj.pos[1] - s.center[1]
      const dz = obj.pos[2] - s.center[2]

      if (obj.pos[1] + r < s.minY || obj.pos[1] - r > s.maxY) continue

      const u = Math.abs(dx * s.uAxis[0] + dz * s.uAxis[2])
      if (u > s.halfU + r) continue

      const dist = dx * s.normal[0] + dy * s.normal[1] + dz * s.normal[2]
      if (Math.abs(dist) < r + 0.04) {
        const sign = dist >= 0 ? 1 : -1
        const push = r + 0.04 - Math.abs(dist)
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

  // 3. Enforce room inner wall perimeter so balls/clay/paper never escape outside your scanned walls
  const clamped = clampInsideRoomWalls(obj.pos[0], obj.pos[2], r + 0.03, surfaces, fallbackBounds)
  if (clamped[0] !== obj.pos[0]) {
    obj.pos[0] = clamped[0]
    obj.vel[0] *= -0.35
    touchedSurface = true
  }
  if (clamped[1] !== obj.pos[2]) {
    obj.pos[2] = clamped[1]
    obj.vel[2] *= -0.35
    touchedSurface = true
  }

  // 4. Calibrated AR real floor safeguard
  if (obj.pos[1] - r < floorY) {
    obj.pos[1] = floorY + r
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

  if (!hitPoint && dir[1] < -0.08) {
    const tFloor = (floorY - origin[1]) / dir[1]
    if (tFloor > 0.3 && tFloor < bestT) {
      hitPoint = [origin[0] + dir[0] * tFloor, floorY + 0.1, origin[2] + dir[2] * tFloor]
    }
  }

  // Default comfortable hand-reach spot 0.55m right in front of user's chest/gaze
  return (
    hitPoint ?? [
      origin[0] + dir[0] * 0.58,
      Math.max(floorY + 0.12, origin[1] + dir[1] * 0.45 - 0.16),
      origin[2] + dir[2] * 0.58,
    ]
  )
}
