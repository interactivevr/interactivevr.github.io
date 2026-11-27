import * as THREE from 'three'
import { clampInsideRoomWalls } from './roomPhysics'
import { DARTBOARD_RADIUS, DartBoardPose, RoomSurfaceCollider } from './types'

// Official clock-face dartboard sector sequence clockwise starting from 12 o'clock (top)
export const DART_SECTOR_ORDER = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
] as const

const DART_GRAVITY = -9.81 * 0.56

export interface FlightDartState {
  id: string
  thrower: 'local' | 'opponent'
  throwerId: string
  throwIndex: number
  inFlight: boolean
  settled: boolean
  flightTimeSec: number
  pos: [number, number, number]
  prevPos: [number, number, number]
  vel: [number, number, number]
  quat: [number, number, number, number]
}

export interface DartHitEval {
  hitBoard: boolean
  score: number
  label: string
  isHighValue: boolean
}

/**
 * Evaluates official dartboard ring & sector score from local 2D board impact offsets
 * where +Y is up toward 20 and +X is to the right when facing the board.
 */
export function scoreDartboardHit(localX: number, localY: number): DartHitEval {
  const r = Math.hypot(localX, localY)
  if (r > DARTBOARD_RADIUS + 0.015) {
    return { hitBoard: false, score: 0, label: 'MISS', isHighValue: false }
  }

  // Scaled relative rings (0.24m outer surround, 0.215m double wire outside)
  const scale = DARTBOARD_RADIUS / 0.24
  if (r <= 0.014 * scale) {
    return { hitBoard: true, score: 50, label: 'BULL 50', isHighValue: true }
  }
  if (r <= 0.032 * scale) {
    return { hitBoard: true, score: 25, label: '25', isHighValue: false }
  }
  if (r > 0.218 * scale) {
    // Surrounded dark outer number rim — stuck on board frame cleanly as 0
    return { hitBoard: true, score: 0, label: 'RIM 0', isHighValue: false }
  }

  // Clockwise angle from 12 o'clock (+Y)
  const cwRad = Math.atan2(localX, localY)
  const shifted = (((cwRad + Math.PI / 20) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  const sectorIdx = Math.floor(shifted / (Math.PI / 10)) % 20
  const sector = DART_SECTOR_ORDER[sectorIdx]

  if (r >= 0.118 * scale && r <= 0.14 * scale) {
    return { hitBoard: true, score: sector * 3, label: `T${sector}`, isHighValue: sector >= 15 }
  }
  if (r >= 0.194 * scale && r <= 0.218 * scale) {
    return { hitBoard: true, score: sector * 2, label: `D${sector}`, isHighValue: sector >= 16 }
  }

  return { hitBoard: true, score: sector, label: `${sector}`, isHighValue: false }
}

/**
 * Mounts the AR dartboard flush onto the best scanned wall facing the user,
 * or places it on a portable AR tripod stand safely inside room boundaries ~2.1m ahead.
 */
export function findDartboardPlacement(
  headPos: [number, number, number],
  headForwardXZ: [number, number],
  surfaces: readonly RoomSurfaceCollider[],
  floorY: number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
): DartBoardPose {
  const fwdLen = Math.hypot(headForwardXZ[0], headForwardXZ[1]) || 1
  const fx = headForwardXZ[0] / fwdLen
  const fz = headForwardXZ[1] / fwdLen

  let bestWall: RoomSurfaceCollider | null = null
  let bestScore = Infinity

  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i]
    if (s.orientation !== 'vertical') continue
    if (s.label !== 'wall' && s.halfU < 0.35) continue

    const dx = s.center[0] - headPos[0]
    const dz = s.center[2] - headPos[2]
    const dist = Math.hypot(dx, dz)
    if (dist < 1.1 || dist > 4.2) continue

    const dirDot = (dx * fx + dz * fz) / dist
    if (dirDot < 0.35) continue

    // Wall normal should point inward toward player
    const originSide = -(s.center[0] - headPos[0]) * s.normal[0] - (s.center[2] - headPos[2]) * s.normal[2]
    const inwardSign = originSide >= 0 ? 1 : -1
    const nx = s.normal[0] * inwardSign
    const nz = s.normal[2] * inwardSign
    const facePlayerDot = -(nx * fx + nz * fz)
    if (facePlayerDot < 0.25) continue

    const score = dist - dirDot * 1.4
    if (score < bestScore) {
      bestScore = score
      bestWall = s
    }
  }

  const boardY = floorY + 1.58

  if (bestWall) {
    // Project user's look ray onto wall plane for intuitive natural centering along the wall
    const toUserX = headPos[0] - bestWall.center[0]
    const toUserZ = headPos[2] - bestWall.center[2]
    const inwardSign =
      toUserX * bestWall.normal[0] + toUserZ * bestWall.normal[2] >= 0 ? 1 : -1
    const nx = bestWall.normal[0] * inwardSign
    const nz = bestWall.normal[2] * inwardSign

    const projAlongU =
      (headPos[0] + fx * 1.9 - bestWall.center[0]) * bestWall.uAxis[0] +
      (headPos[2] + fz * 1.9 - bestWall.center[2]) * bestWall.uAxis[2]
    const clampedU = Math.max(-bestWall.halfU * 0.65, Math.min(bestWall.halfU * 0.65, projAlongU))

    const px = bestWall.center[0] + bestWall.uAxis[0] * clampedU + nx * 0.032
    const pz = bestWall.center[2] + bestWall.uAxis[2] * clampedU + nz * 0.032
    const yaw = Math.atan2(nx, nz)

    return {
      pos: [px, boardY, pz],
      normal: [nx, 0, nz],
      yaw,
      mountedOnWall: true,
    }
  }

  // Fallback: free-standing AR dartboard stand ~2.05m cleanly inside room walls
  const [standX, standZ] = clampInsideRoomWalls(
    headPos[0] + fx * 2.05,
    headPos[2] + fz * 2.05,
    0.32,
    surfaces,
    bounds
  )
  const nx = -fx
  const nz = -fz
  return {
    pos: [standX, boardY, standZ],
    normal: [nx, 0, nz],
    yaw: Math.atan2(nx, nz),
    mountedOnWall: false,
  }
}

const _fwd = new THREE.Vector3(0, 0, -1)
const _velVec = new THREE.Vector3()
const _alignQ = new THREE.Quaternion()

/**
 * Steps a flying steel-tip dart with aerodynamic nose alignment, checks exact dartboard plane impact,
 * and handles floor/wall misses cleanly.
 */
export function stepFlightDart(
  dart: FlightDartState,
  boardPose: DartBoardPose,
  floorY: number,
  dt: number
):
  | { status: 'flying' }
  | { status: 'board-hit'; localX: number; localY: number; evalHit: DartHitEval }
  | { status: 'miss' } {
  if (!dart.inFlight || dart.settled) return { status: 'flying' }

  const cDt = Math.min(dt, 0.035)
  dart.flightTimeSec += cDt
  dart.prevPos = [dart.pos[0], dart.pos[1], dart.pos[2]]

  const drag = Math.max(0, 1 - 0.14 * cDt)
  dart.vel[0] *= drag
  dart.vel[2] *= drag
  dart.vel[1] = dart.vel[1] * drag + DART_GRAVITY * cDt

  dart.pos[0] += dart.vel[0] * cDt
  dart.pos[1] += dart.vel[1] * cDt
  dart.pos[2] += dart.vel[2] * cDt

  const speed = Math.hypot(dart.vel[0], dart.vel[1], dart.vel[2])
  if (speed > 0.12) {
    _velVec.set(dart.vel[0] / speed, dart.vel[1] / speed, dart.vel[2] / speed)
    _alignQ.setFromUnitVectors(_fwd, _velVec)
    dart.quat = [_alignQ.x, _alignQ.y, _alignQ.z, _alignQ.w]
  }

  // Plane crossing test against dartboard front face (boardPose.normal points toward thrower)
  const bnX = boardPose.normal[0]
  const bnY = boardPose.normal[1]
  const bnZ = boardPose.normal[2]
  const dPrev =
    (dart.prevPos[0] - boardPose.pos[0]) * bnX +
    (dart.prevPos[1] - boardPose.pos[1]) * bnY +
    (dart.prevPos[2] - boardPose.pos[2]) * bnZ
  const dCurr =
    (dart.pos[0] - boardPose.pos[0]) * bnX +
    (dart.pos[1] - boardPose.pos[1]) * bnY +
    (dart.pos[2] - boardPose.pos[2]) * bnZ

  if (dPrev >= -0.025 && dCurr <= 0.015 && (dPrev - dCurr) > 1e-4) {
    const tCross = Math.max(0, Math.min(1, dPrev / (dPrev - dCurr)))
    const hx = dart.prevPos[0] + (dart.pos[0] - dart.prevPos[0]) * tCross
    const hy = dart.prevPos[1] + (dart.pos[1] - dart.prevPos[1]) * tCross
    const hz = dart.prevPos[2] + (dart.pos[2] - dart.prevPos[2]) * tCross

    // Board local right axis (+X when facing board front): Cross(Up(0,1,0), Normal)
    const rightX = bnZ
    const rightZ = -bnX
    const rLen = Math.hypot(rightX, rightZ) || 1
    const rx = rightX / rLen
    const rz = rightZ / rLen

    const relX = hx - boardPose.pos[0]
    const relY = hy - boardPose.pos[1]
    const relZ = hz - boardPose.pos[2]
    const localX = relX * rx + relZ * rz
    const localY = relY

    const radial = Math.hypot(localX, localY)
    if (radial <= DARTBOARD_RADIUS + 0.015) {
      dart.inFlight = false
      dart.settled = true
      dart.pos = [hx + bnX * 0.01, hy, hz + bnZ * 0.01]
      const evalHit = scoreDartboardHit(localX, localY)
      return { status: 'board-hit', localX, localY, evalHit }
    }
  }

  // Miss: hits floor or flies far / times out
  const distFromBoard = Math.hypot(
    dart.pos[0] - boardPose.pos[0],
    dart.pos[1] - boardPose.pos[1],
    dart.pos[2] - boardPose.pos[2]
  )
  if (dart.pos[1] <= floorY + 0.02 || dart.flightTimeSec > 2.4 || (dCurr < -0.55 && distFromBoard > 0.6)) {
    dart.inFlight = false
    dart.settled = true
    dart.vel = [0, 0, 0]
    return { status: 'miss' }
  }

  return { status: 'flying' }
}

/**
 * Computes realistic parabolic launch velocity for the Computer AI opponent throwing a dart to the board.
 */
export function computeAIDartThrowVelocity(
  startPos: [number, number, number],
  boardPose: DartBoardPose
): [number, number, number] {
  const bnX = boardPose.normal[0]
  const bnZ = boardPose.normal[2]
  const rightX = bnZ
  const rightZ = -bnX
  const rLen = Math.hypot(rightX, rightZ) || 1
  const rx = rightX / rLen
  const rz = rightZ / rLen

  // Aim mainly around high inner 20 / T20 / Bull with realistic ±5.5cm human variance
  const aimLocalX = (Math.random() - 0.5) * 0.11
  const aimLocalY = 0.075 + (Math.random() - 0.45) * 0.12

  const targetX = boardPose.pos[0] + rx * aimLocalX
  const targetY = boardPose.pos[1] + aimLocalY
  const targetZ = boardPose.pos[2] + rz * aimLocalX

  const dx = targetX - startPos[0]
  const dy = targetY - startPos[1]
  const dz = targetZ - startPos[2]
  const dist = Math.hypot(dx, dy, dz)
  const flightT = Math.max(0.28, Math.min(0.65, dist / 6.2))

  const vx = dx / flightT
  const vy = (dy - 0.5 * DART_GRAVITY * flightT * flightT) / flightT
  const vz = dz / flightT
  return [vx, vy, vz]
}

/**
 * Paints a sharp 1024×1024 regulation Bristle Dartboard CanvasTexture with sector numbers.
 */
export function createDartboardCanvasTexture(): THREE.CanvasTexture {
  const size = 1024
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  const cx = size * 0.5
  const cy = size * 0.5
  const R = size * 0.48

  // Black backboard surround
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.fill()

  const wireOuterR = R * 0.89
  const dblInnerR = R * 0.8
  const trpOuterR = R * 0.58
  const trpInnerR = R * 0.49
  const bullOuterR = R * 0.13
  const bullInnerR = R * 0.058

  for (let i = 0; i < 20; i++) {
    // Canvas angle 0 = +X right, -PI/2 = 12 o'clock top
    const aStart = -Math.PI * 0.5 - Math.PI / 20 + (i * Math.PI) / 10
    const aEnd = aStart + Math.PI / 10
    const even = i % 2 === 0

    // Outer double ring
    ctx.fillStyle = even ? '#dc2626' : '#16a34a'
    ctx.beginPath()
    ctx.arc(cx, cy, wireOuterR, aStart, aEnd)
    ctx.arc(cx, cy, dblInnerR, aEnd, aStart, true)
    ctx.closePath()
    ctx.fill()

    // Outer single
    ctx.fillStyle = even ? '#18181b' : '#f3e7c9'
    ctx.beginPath()
    ctx.arc(cx, cy, dblInnerR, aStart, aEnd)
    ctx.arc(cx, cy, trpOuterR, aEnd, aStart, true)
    ctx.closePath()
    ctx.fill()

    // Triple ring
    ctx.fillStyle = even ? '#dc2626' : '#16a34a'
    ctx.beginPath()
    ctx.arc(cx, cy, trpOuterR, aStart, aEnd)
    ctx.arc(cx, cy, trpInnerR, aEnd, aStart, true)
    ctx.closePath()
    ctx.fill()

    // Inner single
    ctx.fillStyle = even ? '#18181b' : '#f3e7c9'
    ctx.beginPath()
    ctx.arc(cx, cy, trpInnerR, aStart, aEnd)
    ctx.arc(cx, cy, bullOuterR, aEnd, aStart, true)
    ctx.closePath()
    ctx.fill()

    // Sector wire divider
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(aStart) * bullOuterR, cy + Math.sin(aStart) * bullOuterR)
    ctx.lineTo(cx + Math.cos(aStart) * wireOuterR, cy + Math.sin(aStart) * wireOuterR)
    ctx.stroke()
  }

  // Concentric spider wire rings
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 3
  ;[wireOuterR, dblInnerR, trpOuterR, trpInnerR, bullOuterR, bullInnerR].forEach((rr) => {
    ctx.beginPath()
    ctx.arc(cx, cy, rr, 0, Math.PI * 2)
    ctx.stroke()
  })

  // Outer Bull (25) & Inner Bullseye (50)
  ctx.fillStyle = '#16a34a'
  ctx.beginPath()
  ctx.arc(cx, cy, bullOuterR, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#dc2626'
  ctx.beginPath()
  ctx.arc(cx, cy, bullInnerR, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#f8fafc'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(cx, cy, bullInnerR, 0, Math.PI * 2)
  ctx.stroke()

  // Crisp sector numbers around the dark perimeter rim
  ctx.fillStyle = '#f8fafc'
  ctx.font = 'bold 34px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const numR = R * 0.94
  for (let i = 0; i < 20; i++) {
    const aMid = -Math.PI * 0.5 + (i * Math.PI) / 10
    ctx.fillText(
      String(DART_SECTOR_ORDER[i]),
      cx + Math.cos(aMid) * numR,
      cy + Math.sin(aMid) * numR
    )
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}
