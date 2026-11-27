import { RoomSurfaceCollider } from './types'

const GRAVITY = -6.8 // Slightly softer sculpting gravity so clay & paper feel controllable in MR

export interface CraftPhysicsTarget {
  pos: [number, number, number]
  vel: [number, number, number]
  kind: 'clay' | 'paper'
  approxRadius: number
}

/**
 * Steps craft object velocity + gravity and resolves resting placement / rebound against
 * scanned WebXR AR room surfaces (floor, tables, desks, couches, walls).
 */
export function stepCraftObjectPhysics(
  obj: CraftPhysicsTarget,
  surfaces: readonly RoomSurfaceCollider[],
  dt: number
): boolean {
  const cDt = Math.min(dt, 0.04)
  const r = Math.max(0.035, obj.approxRadius * 0.72)

  // Paper experiences high air drag and gentle flutter settle
  const airDamp = obj.kind === 'paper' ? Math.max(0, 1 - 2.8 * cDt) : Math.max(0, 1 - 0.85 * cDt)
  const gravScale = obj.kind === 'paper' ? 0.58 : 1.0

  obj.vel[0] *= airDamp
  obj.vel[2] *= airDamp
  obj.vel[1] = obj.vel[1] * airDamp + GRAVITY * gravScale * cDt

  obj.pos[0] += obj.vel[0] * cDt
  obj.pos[1] += obj.vel[1] * cDt
  obj.pos[2] += obj.vel[2] * cDt

  let touchedSurface = false
  const restitution = obj.kind === 'clay' ? 0.14 : 0.05

  // Resolve scanned horizontal surfaces (tables, desks, floor, seats) & vertical walls
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i]
    if (s.orientation === 'horizontal') {
      const dx = Math.abs(obj.pos[0] - s.center[0])
      const dz = Math.abs(obj.pos[2] - s.center[2])
      if (dx <= s.halfExtents[0] + r * 0.4 && dz <= s.halfExtents[2] + r * 0.4) {
        const topY = s.center[1] + s.halfExtents[1]
        // Only land on top side if falling onto or resting near surface top
        if (obj.pos[1] - r <= topY && obj.pos[1] >= topY - 0.14 && obj.vel[1] <= 0.4) {
          obj.pos[1] = topY + r
          if (obj.vel[1] < -0.65) {
            obj.vel[1] = -obj.vel[1] * restitution
          } else {
            obj.vel[1] = 0
          }
          obj.vel[0] *= 0.72
          obj.vel[2] *= 0.72
          touchedSurface = true
        }
      }
    } else {
      // Vertical wall surface collision along wall normal
      const nx = s.normal[0]
      const nz = s.normal[2]
      const relX = obj.pos[0] - s.center[0]
      const relY = obj.pos[1] - s.center[1]
      const relZ = obj.pos[2] - s.center[2]

      if (
        Math.abs(relY) <= s.halfExtents[1] + r &&
        Math.hypot(relX - nx * (relX * nx + relZ * nz), relZ - nz * (relX * nx + relZ * nz)) <=
          Math.max(s.halfExtents[0], s.halfExtents[2]) + r
      ) {
        const dist = relX * nx + relZ * nz
        if (Math.abs(dist) < r + 0.04) {
          const sign = dist >= 0 ? 1 : -1
          const push = r + 0.04 - Math.abs(dist)
          obj.pos[0] += nx * sign * push
          obj.pos[2] += nz * sign * push
          const vn = obj.vel[0] * nx + obj.vel[2] * nz
          if (vn * sign < 0) {
            obj.vel[0] -= (1 + restitution) * vn * nx
            obj.vel[2] -= (1 + restitution) * vn * nz
          }
          touchedSurface = true
        }
      }
    }
  }

  // Fallback AR Guardian floor at y = 0 so objects never drop below real room floor
  if (obj.pos[1] - r < 0) {
    obj.pos[1] = r
    if (obj.vel[1] < -0.65) {
      obj.vel[1] = -obj.vel[1] * restitution
    } else {
      obj.vel[1] = 0
    }
    obj.vel[0] *= 0.72
    obj.vel[2] *= 0.72
    touchedSurface = true
  }

  // Clamp outer fallback room bounds in case no walls were scanned yet
  obj.pos[0] = Math.max(-5.5, Math.min(5.5, obj.pos[0]))
  obj.pos[2] = Math.max(-5.5, Math.min(5.5, obj.pos[2]))

  return touchedSurface
}

/**
 * Raycasts against scanned room surfaces + y=0 floor fallback to find a clean placement point.
 */
export function raycastRoomPlacementPoint(
  origin: [number, number, number],
  dir: [number, number, number],
  surfaces: readonly RoomSurfaceCollider[],
  maxDist = 4.0
): [number, number, number] {
  let bestT = maxDist
  let hitPoint: [number, number, number] | null = null

  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i]
    if (s.orientation === 'horizontal' && Math.abs(dir[1]) > 0.05) {
      const topY = s.center[1] + s.halfExtents[1]
      const t = (topY - origin[1]) / dir[1]
      if (t > 0.15 && t < bestT) {
        const hx = origin[0] + dir[0] * t
        const hz = origin[2] + dir[2] * t
        if (
          Math.abs(hx - s.center[0]) <= s.halfExtents[0] &&
          Math.abs(hz - s.center[2]) <= s.halfExtents[2]
        ) {
          bestT = t
          hitPoint = [hx, topY + 0.07, hz]
        }
      }
    }
  }

  if (!hitPoint && dir[1] < -0.05) {
    const tFloor = -origin[1] / dir[1]
    if (tFloor > 0.15 && tFloor < bestT) {
      hitPoint = [origin[0] + dir[0] * tFloor, 0.08, origin[2] + dir[2] * tFloor]
    }
  }

  return (
    hitPoint ?? [
      origin[0] + dir[0] * 0.85,
      Math.max(0.12, origin[1] + dir[1] * 0.85),
      origin[2] + dir[2] * 0.85,
    ]
  )
}
