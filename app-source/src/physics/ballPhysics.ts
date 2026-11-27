import {
  BALL_RADIUS,
  COURT_HALF_L,
  COURT_HALF_W,
  COURT_WALL_H,
  GameMode,
  GRAVITY,
} from '../types/game'

export interface StepBallInput {
  pos: [number, number, number]
  vel: [number, number, number]
  bouncedFloor: boolean
  dt: number
  mode: GameMode
}

export interface StepBallOutput {
  hitFloorNow: boolean
  hitWallNow: boolean
  hitTargetWallNow: boolean
  impactSpeed: number
  settled: boolean
}

const FLOOR_RESTITUTION = 0.72
const WALL_RESTITUTION = 0.76
const AIR_DRAG = 0.12

/**
 * Advances a ball in flight deterministically without allocating temporary vectors.
 * Returns bounce event metadata for SFX and scoring.
 */
export function stepBallPhysics(ball: StepBallInput): StepBallOutput {
  const { pos, vel, dt, mode } = ball
  const clampedDt = Math.min(dt, 0.05)

  // Apply gravity and mild air drag
  const drag = Math.max(0, 1 - AIR_DRAG * clampedDt)
  vel[0] *= drag
  vel[1] += GRAVITY * clampedDt
  vel[2] *= drag

  pos[0] += vel[0] * clampedDt
  pos[1] += vel[1] * clampedDt
  pos[2] += vel[2] * clampedDt

  let hitFloorNow = false
  let hitWallNow = false
  let hitTargetWallNow = false
  let impactSpeed = 0
  let settled = false

  // Floor collision
  if (pos[1] <= BALL_RADIUS) {
    pos[1] = BALL_RADIUS
    if (vel[1] < -0.55) {
      impactSpeed = Math.abs(vel[1])
      vel[1] = -vel[1] * FLOOR_RESTITUTION
      vel[0] *= 0.88
      vel[2] *= 0.88
      hitFloorNow = true
    } else {
      vel[1] = 0
      const floorFriction = Math.max(0, 1 - 3.8 * clampedDt)
      vel[0] *= floorFriction
      vel[2] *= floorFriction
      if (Math.hypot(vel[0], vel[2]) < 0.08) {
        vel[0] = 0
        vel[2] = 0
        settled = true
      }
    }
  }

  // Ceiling collision
  if (pos[1] >= COURT_WALL_H - BALL_RADIUS) {
    pos[1] = COURT_WALL_H - BALL_RADIUS
    if (vel[1] > 0) {
      vel[1] = -vel[1] * WALL_RESTITUTION
      hitWallNow = true
    }
  }

  // Side walls
  const maxW = COURT_HALF_W - BALL_RADIUS
  if (pos[0] > maxW) {
    pos[0] = maxW
    if (vel[0] > 0) {
      impactSpeed = Math.max(impactSpeed, Math.abs(vel[0]))
      vel[0] = -vel[0] * WALL_RESTITUTION
      hitWallNow = true
    }
  } else if (pos[0] < -maxW) {
    pos[0] = -maxW
    if (vel[0] < 0) {
      impactSpeed = Math.max(impactSpeed, Math.abs(vel[0]))
      vel[0] = -vel[0] * WALL_RESTITUTION
      hitWallNow = true
    }
  }

  // Solo Practice rebound target wall at z = -5.4
  if (mode === 'solo' && pos[2] <= -5.4 + BALL_RADIUS && vel[2] < 0) {
    pos[2] = -5.4 + BALL_RADIUS
    impactSpeed = Math.max(impactSpeed, Math.abs(vel[2]))
    // Aim return arc nicely back toward the solo player pad (z ~ +4.2, y ~ 1.4)
    const distFromCenter = Math.hypot(pos[0], pos[1] - 1.8)
    const hitBullseye = distFromCenter < 1.65
    const returnVz = Math.min(10.5, Math.max(6.2, Math.abs(vel[2]) * 0.88 + 1.5))
    vel[2] = returnVz
    vel[0] = hitBullseye ? -pos[0] * 0.55 : -vel[0] * 0.65
    vel[1] = Math.min(6.8, Math.max(3.6, 4.6 - pos[1] * 0.35))
    hitTargetWallNow = true
  }

  // End walls
  const maxL = COURT_HALF_L - BALL_RADIUS
  if (pos[2] > maxL) {
    pos[2] = maxL
    if (vel[2] > 0) {
      impactSpeed = Math.max(impactSpeed, Math.abs(vel[2]))
      vel[2] = -vel[2] * WALL_RESTITUTION
      hitWallNow = true
    }
  } else if (pos[2] < -maxL) {
    pos[2] = -maxL
    if (vel[2] < 0) {
      impactSpeed = Math.max(impactSpeed, Math.abs(vel[2]))
      vel[2] = -vel[2] * WALL_RESTITUTION
      hitWallNow = true
    }
  }

  return {
    hitFloorNow,
    hitWallNow,
    hitTargetWallNow,
    impactSpeed,
    settled,
  }
}

/**
 * Continuous swept-segment vs sphere distance squared check.
 * Prevents fast-thrown balls from tunneling through VR hands or PC mitts between frames.
 */
export function segmentSphereIntersects(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  combinedRadius: number
): boolean {
  const abx = bx - ax
  const aby = by - ay
  const abz = bz - az
  const lenSq = abx * abx + aby * aby + abz * abz

  let t = 0
  if (lenSq > 1e-8) {
    t = ((cx - ax) * abx + (cy - ay) * aby + (cz - az) * abz) / lenSq
    if (t < 0) t = 0
    else if (t > 1) t = 1
  }

  const closestX = ax + abx * t
  const closestY = ay + aby * t
  const closestZ = az + abz * t

  const dx = cx - closestX
  const dy = cy - closestY
  const dz = cz - closestZ
  return dx * dx + dy * dy + dz * dz <= combinedRadius * combinedRadius
}

/**
 * Computes points along a parabolic trajectory preview for desktop aiming.
 */
export function computeTrajectoryPreview(
  origin: [number, number, number],
  velocity: [number, number, number],
  steps = 18,
  stepDt = 0.06
): [number, number, number][] {
  const points: [number, number, number][] = []
  let x = origin[0]
  let y = origin[1]
  let z = origin[2]
  let vx = velocity[0]
  let vy = velocity[1]
  let vz = velocity[2]

  for (let i = 0; i < steps; i++) {
    points.push([x, y, z])
    const drag = Math.max(0, 1 - AIR_DRAG * stepDt)
    vx *= drag
    vy += GRAVITY * stepDt
    vz *= drag
    x += vx * stepDt
    y += vy * stepDt
    z += vz * stepDt
    if (y < BALL_RADIUS) {
      points.push([x, BALL_RADIUS, z])
      break
    }
  }
  return points
}
