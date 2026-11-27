import { playPitchBounceSfx, playStumpBreakSfx } from '../audio/cricketSfx'
import {
  BATTING_STUMPS_Z,
  BOUNDARY_RX,
  BOUNDARY_RZ,
  BowlingStyle,
  CRICKET_BALL_RADIUS,
  PitchMode,
  PITCH_HALF_W,
  SpinDirection,
  STUMP_HEIGHT,
  STUMP_SPREAD,
} from './types'
import { BatCollisionSegment, cricketRuntime, RuntimeCricketBall } from './useCricketStore'

const GRAVITY = -9.81

export interface CricketPhysicsStepResult {
  bouncedOnPitchNow: boolean
  bouncedOutfieldNow: boolean
  hitStumpsNow: boolean
  crossedBoundaryNow: boolean
  settled: boolean
}

function closestDistSegmentToSegment(
  p1: [number, number, number],
  q1: [number, number, number],
  p2: [number, number, number],
  q2: [number, number, number]
): { dist: number; tBat: number } {
  // Sample 5 points along ball segment and project onto bat segment (fast, zero allocations)
  const bx = q2[0] - p2[0]
  const by = q2[1] - p2[1]
  const bz = q2[2] - p2[2]
  const bLenSq = bx * bx + by * by + bz * bz

  let bestDistSq = Infinity
  let bestTBat = 0.5

  for (let i = 0; i <= 4; i++) {
    const u = i / 4
    const sx = p1[0] + (q1[0] - p1[0]) * u
    const sy = p1[1] + (q1[1] - p1[1]) * u
    const sz = p1[2] + (q1[2] - p1[2]) * u

    let t = 0
    if (bLenSq > 1e-7) {
      t = ((sx - p2[0]) * bx + (sy - p2[1]) * by + (sz - p2[2]) * bz) / bLenSq
      if (t < 0) t = 0
      else if (t > 1) t = 1
    }

    const cx = p2[0] + bx * t
    const cy = p2[1] + by * t
    const cz = p2[2] + bz * t

    const dx = sx - cx
    const dy = sy - cy
    const dz = sz - cz
    const dSq = dx * dx + dy * dy + dz * dz
    if (dSq < bestDistSq) {
      bestDistSq = dSq
      bestTBat = t
    }
  }

  return { dist: Math.sqrt(bestDistSq), tBat: bestTBat }
}

export function triggerStumpsBroken(impactVel: [number, number, number]): void {
  if (cricketRuntime.stumps.broken) return
  cricketRuntime.stumps.broken = true
  cricketRuntime.stumps.breakTimer = 0
  playStumpBreakSfx()

  // Knock outer/middle stumps and launch bails dramatically
  const dirZ = impactVel[2] >= 0 ? 1 : -1
  cricketRuntime.stumps.offsets[0] = { pos: [-0.08, 0.02, 0.14 * dirZ], rot: [0.35 * dirZ, 0.1, 0.42] }
  cricketRuntime.stumps.offsets[1] = { pos: [0.02, 0.03, 0.24 * dirZ], rot: [0.75 * dirZ, -0.2, -0.15] }
  cricketRuntime.stumps.offsets[2] = { pos: [0.09, 0.01, 0.12 * dirZ], rot: [0.28 * dirZ, 0.15, -0.38] }

  cricketRuntime.stumps.bails[0].vel = [-1.4, 3.8, 2.8 * dirZ]
  cricketRuntime.stumps.bails[1].vel = [1.5, 4.2, 3.1 * dirZ]
}

export function stepStumpsAndBails(dt: number): void {
  const st = cricketRuntime.stumps
  if (!st.broken) return
  const cDt = Math.min(dt, 0.05)
  st.breakTimer += cDt

  for (let i = 0; i < 2; i++) {
    const b = st.bails[i]
    if (b.pos[1] > 0.02 || b.vel[1] > 0) {
      b.vel[1] += GRAVITY * cDt
      b.pos[0] += b.vel[0] * cDt
      b.pos[1] += b.vel[1] * cDt
      b.pos[2] += b.vel[2] * cDt
      b.rot[0] += 8 * cDt
      b.rot[2] += 11 * cDt
      if (b.pos[1] <= 0.02) {
        b.pos[1] = 0.02
        b.vel[1] = -b.vel[1] * 0.35
        b.vel[0] *= 0.6
        b.vel[2] *= 0.6
        if (Math.abs(b.vel[1]) < 0.3) b.vel = [0, 0, 0]
      }
    }
  }
}

export function checkStumpHit(
  prevPos: [number, number, number],
  currPos: [number, number, number]
): boolean {
  const minZ = Math.min(prevPos[2], currPos[2])
  const maxZ = Math.max(prevPos[2], currPos[2])
  if (BATTING_STUMPS_Z < minZ - 0.06 || BATTING_STUMPS_Z > maxZ + 0.06) return false

  const dz = currPos[2] - prevPos[2]
  const t = Math.abs(dz) > 1e-5 ? Math.max(0, Math.min(1, (BATTING_STUMPS_Z - prevPos[2]) / dz)) : 0.5
  const xAtStumps = prevPos[0] + (currPos[0] - prevPos[0]) * t
  const yAtStumps = prevPos[1] + (currPos[1] - prevPos[1]) * t

  if (yAtStumps > STUMP_HEIGHT + CRICKET_BALL_RADIUS) return false
  if (Math.abs(xAtStumps) <= STUMP_SPREAD + CRICKET_BALL_RADIUS + 0.025) {
    return true
  }
  return false
}

export function checkBatHitBall(
  ball: RuntimeCricketBall,
  bat: BatCollisionSegment
): { hit: boolean; edge: boolean; hitSpeed: number } {
  if (!bat.active || ball.phase !== 'bowled') {
    return { hit: false, edge: false, hitSpeed: 0 }
  }

  // Only check when ball is in the batting zone
  if (ball.pos[2] < 6.4 || ball.pos[2] > 11.2) {
    return { hit: false, edge: false, hitSpeed: 0 }
  }

  const resCurr = closestDistSegmentToSegment(ball.prevPos, ball.pos, bat.currBase, bat.currTip)
  const resPrev = closestDistSegmentToSegment(ball.prevPos, ball.pos, bat.prevBase, bat.prevTip)
  const best = resCurr.dist <= resPrev.dist ? resCurr : resPrev

  const sweetRadius = CRICKET_BALL_RADIUS + 0.078
  const edgeRadius = CRICKET_BALL_RADIUS + 0.112
  if (best.dist > edgeRadius) {
    return { hit: false, edge: false, hitSpeed: 0 }
  }

  const isEdge = best.dist > sweetRadius
  const batSpeed = Math.hypot(bat.vel[0], bat.vel[1], bat.vel[2])

  // Blend bat face normal and swing direction; edge deflects more sideways/backward
  const [nx, ny, nz] = bat.faceNormal
  const [vx, vy, vz] = ball.vel

  let outX: number
  let outY: number
  let outZ: number

  if (isEdge) {
    // Thick edge goes diagonally backward/sideways toward slips or keeper
    const sideSign = ball.pos[0] >= (bat.currBase[0] + bat.currTip[0]) * 0.5 ? 1 : -1
    outX = sideSign * (5.5 + batSpeed * 0.45) + bat.vel[0] * 0.35
    outY = 2.8 + Math.random() * 2.4
    outZ = 4.2 + Math.abs(vz) * 0.25
  } else {
    // Clean bat impact: reflect incoming ball against bat face + transfer bat swing velocity
    const dot = vx * nx + vy * ny + vz * nz
    const refX = vx - 1.75 * dot * nx
    const refY = vy - 1.75 * dot * ny
    const refZ = vz - 1.75 * dot * nz

    // Sweet-spot multiplier increases closer to middle/lower half of blade (tBat ~ 0.6..0.9)
    const sweetSpot = 0.85 + Math.sin(Math.min(1, best.tBat) * Math.PI) * 0.35
    outX = refX * 0.38 + bat.vel[0] * 1.48 * sweetSpot
    outY = Math.max(0.8, refY * 0.32 + bat.vel[1] * 1.15 * sweetSpot + Math.min(4.8, batSpeed * 0.32))
    outZ = refZ * 0.35 + bat.vel[2] * 1.52 * sweetSpot

    // Ensure ball launches forward toward outfield if bat swing had low Z velocity
    if (outZ > -4.5 && batSpeed > 1.8) {
      outZ = -Math.max(7.5, batSpeed * 1.35)
    }
  }

  // Clamp realistic peak launch speed (34 m/s max clears 46m boundary nicely as a 6!)
  const speed = Math.hypot(outX, outY, outZ)
  const maxLaunch = 33.5
  if (speed > maxLaunch) {
    const s = maxLaunch / speed
    outX *= s
    outY *= s
    outZ *= s
  }

  ball.phase = 'hit'
  ball.hitByBat = true
  ball.edgeContact = isEdge
  ball.bouncedAfterHit = false
  ball.vel = [outX, outY, outZ]
  ball.epoch += 1
  ball.timestamp = Date.now()
  ball.deadTimerSec = 0
  ball.maxDistanceFromPitch = 0

  return { hit: true, edge: isEdge, hitSpeed: Math.min(maxLaunch, speed) }
}

export function stepCricketBallPhysics(
  ball: RuntimeCricketBall,
  pitchMode: PitchMode,
  dt: number
): CricketPhysicsStepResult {
  const cDt = Math.min(dt, 0.04)
  ball.prevPos = [ball.pos[0], ball.pos[1], ball.pos[2]]

  let bouncedOnPitchNow = false
  let bouncedOutfieldNow = false
  let hitStumpsNow = false
  let crossedBoundaryNow = false
  let settled = false

  // Air drag + Magnus swing/spin drift
  const drag = Math.max(0, 1 - 0.045 * cDt)
  ball.vel[0] *= drag
  ball.vel[2] *= drag
  ball.vel[1] += GRAVITY * cDt

  if (ball.phase === 'bowled') {
    if (ball.bowlingStyle === 'fast') {
      // Fast bowler air swing
      ball.vel[0] += ball.spin[0] * 0.55 * cDt
    } else {
      // Spinner drift & dip
      ball.vel[0] += ball.spin[0] * 0.28 * cDt
      ball.vel[1] -= 0.75 * cDt
    }
  }

  ball.pos[0] += ball.vel[0] * cDt
  ball.pos[1] += ball.vel[1] * cDt
  ball.pos[2] += ball.vel[2] * cDt

  // Ground / Pitch bounce
  if (ball.pos[1] <= CRICKET_BALL_RADIUS) {
    ball.pos[1] = CRICKET_BALL_RADIUS
    const onPitch = Math.abs(ball.pos[0]) <= PITCH_HALF_W && Math.abs(ball.pos[2]) <= 10.6

    if (ball.vel[1] < -0.45) {
      const impact = Math.abs(ball.vel[1])
      if (onPitch) {
        const isWet = pitchMode === 'wet'
        const restitution = isWet ? 0.49 : 0.78
        const paceKeep = isWet ? 0.62 : 0.93
        const turnFactor = isWet ? 0.68 : 1.38

        ball.vel[1] = -ball.vel[1] * restitution
        ball.vel[2] *= paceKeep
        ball.vel[0] *= isWet ? 0.72 : 0.9

        if (ball.phase === 'bowled' && !ball.bouncedOnPitch) {
          ball.bouncedOnPitch = true
          // Apply sideways spin/seam break off the pitch!
          ball.vel[0] += ball.spin[0] * turnFactor
          if (isWet && ball.bowlingStyle === 'fast') {
            // Wet pitch really deadens fast deliveries
            ball.vel[2] *= 0.84
          }
        }
        bouncedOnPitchNow = true
        playPitchBounceSfx(isWet, impact)
      } else {
        ball.vel[1] = -ball.vel[1] * 0.56
        ball.vel[0] *= 0.84
        ball.vel[2] *= 0.84
        bouncedOutfieldNow = true
        playPitchBounceSfx(true, impact * 0.8)
      }

      if (ball.phase === 'hit') {
        ball.bouncedAfterHit = true
      }
    } else {
      ball.vel[1] = 0
      const rollDamp = Math.max(0, 1 - 1.45 * cDt)
      ball.vel[0] *= rollDamp
      ball.vel[2] *= rollDamp
      if (ball.phase === 'hit') {
        ball.bouncedAfterHit = true
      }
      if (Math.hypot(ball.vel[0], ball.vel[2]) < 0.25) {
        ball.vel[0] = 0
        ball.vel[2] = 0
        settled = true
      }
    }
  }

  // Check batting stumps while ball is live
  if (ball.phase === 'bowled' || ball.phase === 'hit') {
    if (checkStumpHit(ball.prevPos, ball.pos)) {
      triggerStumpsBroken(ball.vel)
      ball.vel[0] *= 0.25
      ball.vel[1] = 1.5
      ball.vel[2] *= 0.25
      hitStumpsNow = true
    }
  }

  // Track max distance from batting crease for run scoring
  if (ball.phase === 'hit') {
    const dist = Math.hypot(ball.pos[0], ball.pos[2] - 8.5)
    if (dist > ball.maxDistanceFromPitch) {
      ball.maxDistanceFromPitch = dist
    }

    const normElliptical =
      (ball.pos[0] / BOUNDARY_RX) * (ball.pos[0] / BOUNDARY_RX) +
      (ball.pos[2] / BOUNDARY_RZ) * (ball.pos[2] / BOUNDARY_RZ)
    if (normElliptical >= 1.0) {
      crossedBoundaryNow = true
    }
  }

  return {
    bouncedOnPitchNow,
    bouncedOutfieldNow,
    hitStumpsNow,
    crossedBoundaryNow,
    settled,
  }
}

/**
 * Computes realistic parabolic release velocity & spin vector from release point to pitch landing spot.
 */
export function computeDeliveryVelocity(
  releasePos: [number, number, number],
  targetX: number,
  targetZ: number,
  style: BowlingStyle,
  spinDir: SpinDirection,
  power01 = 0.85
): { vel: [number, number, number]; spin: [number, number, number] } {
  const dx = targetX - releasePos[0]
  const dz = Math.max(3.5, targetZ - releasePos[2])
  const dy = CRICKET_BALL_RADIUS - releasePos[1]

  const speedForward =
    style === 'fast'
      ? 19.5 + power01 * 6.5 // 19.5 .. 26 m/s (crisp, readable in VR!)
      : 11.2 + power01 * 3.4 // 11.2 .. 14.6 m/s (looped flight for spinner!)

  const flightTime = dz / speedForward
  const vy = (dy - 0.5 * GRAVITY * flightTime * flightTime) / flightTime

  const spinSign = spinDir === 'off' ? 1 : -1
  const spinX =
    style === 'fast'
      ? spinSign * (0.45 + power01 * 0.45)
      : spinSign * (1.85 + power01 * 1.15)

  // Pre-compensate slightly for air swing so target marker remains intuitive
  const vx = dx / flightTime - spinX * (style === 'fast' ? 0.12 : 0.08)

  return {
    vel: [vx, vy, speedForward],
    spin: [spinX, 0, 0],
  }
}
