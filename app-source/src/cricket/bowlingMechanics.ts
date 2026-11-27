import * as THREE from 'three'
import { HandSide } from '../types/game'
import {
  BATTING_STUMPS_Z,
  BOWLING_CREASE_Z,
  BowlingStyle,
  CRICKET_BALL_RADIUS,
  CricketSpinKind,
  PITCH_HALF_W,
  SpinDirection,
  WIDE_HALF_W,
} from './types'
import { RuntimeCricketBall, useCricketStore } from './useCricketStore'

const GRAVITY = -9.81

// Tuned stationary-runup VR bowling speed scales (preserves slow-vs-fast effort linearly)
const FAST_SPEED_SCALE = 1.72
const FAST_MIN_SPEED = 7.5
const FAST_MAX_SPEED = 39.5

const SPIN_SPEED_SCALE = 1.45
const SPIN_MIN_SPEED = 7.2
const SPIN_MAX_SPEED = 24.5

export interface PitchDropPrediction {
  dropPoint: [number, number] // [x, z]
  flightTimeSec: number
  onPitch: boolean
  lengthLabel: string
}

export interface AnalyzedVRDelivery {
  vel: [number, number, number]
  spin: [number, number, number]
  spinDir: SpinDirection
  spinKind: CricketSpinKind
  spinRpm: number
  releaseSpeedMps: number
  releaseSpeedKmh: number
  rawHandSpeedMps: number
  dropPoint: [number, number]
  pitchLengthLabel: string
  flightTimeSec: number
}

interface BowlingSample {
  t: number
  pos: [number, number, number]
  quat: [number, number, number, number]
  curls: [number, number, number, number, number]
  isHandTracking: boolean
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function formatSpinKindLabel(kind: CricketSpinKind): string {
  switch (kind) {
    case 'legbreak':
      return 'LEGBREAK'
    case 'offbreak':
      return 'OFFBREAK'
    case 'googly':
      return 'GOOGLY'
    case 'no-spin':
      return 'NO SPIN'
    case 'fast':
    default:
      return 'FAST'
  }
}

export function classifyPitchLength(dropX: number, dropZ: number): string {
  let prefix = ''
  if (Math.abs(dropX) > WIDE_HALF_W && dropZ <= BATTING_STUMPS_Z + 0.8) {
    prefix = 'WIDE '
  } else if (Math.abs(dropX) > PITCH_HALF_W) {
    prefix = 'OFF-PITCH '
  }

  if (dropZ > BATTING_STUMPS_Z - 0.35) return `${prefix}FULL TOSS`
  if (dropZ >= 7.1) return `${prefix}YORKER`
  if (dropZ >= 5.0) return `${prefix}FULL`
  if (dropZ >= 2.0) return `${prefix}GOOD LENGTH`
  if (dropZ >= -2.5) return `${prefix}SHORT`
  return `${prefix}BOUNCER`
}

/**
 * Simulates the exact air-drag, gravity, Magnus swing/drift & spin-dip forces used in stepCricketBallPhysics
 * to calculate the precise [x, z] pitch landing coordinates for both fast and spin bowling.
 */
export function predictPitchDropPoint(
  releasePos: [number, number, number],
  vel: [number, number, number],
  spin: [number, number, number],
  style: BowlingStyle,
  spinKind: CricketSpinKind
): PitchDropPrediction {
  const stepDt = 1 / 120
  let x = releasePos[0]
  let y = releasePos[1]
  let z = releasePos[2]
  let vx = vel[0]
  let vy = vel[1]
  let vz = vel[2]
  let elapsed = 0

  for (let i = 0; i < 360; i++) {
    const prevX = x
    const prevY = y
    const prevZ = z

    const drag = Math.max(0, 1 - 0.045 * stepDt)
    vx *= drag
    vz *= drag
    vy += GRAVITY * stepDt

    if (style === 'fast') {
      vx += spin[0] * 0.55 * stepDt
    } else if (spinKind !== 'no-spin') {
      vx += spin[0] * 0.28 * stepDt
      const dipAccel = 0.75 + Math.abs(spin[1]) * 0.38
      vy -= dipAccel * stepDt
    }

    x += vx * stepDt
    y += vy * stepDt
    z += vz * stepDt
    elapsed += stepDt

    if (y <= CRICKET_BALL_RADIUS) {
      const span = Math.max(1e-6, prevY - y)
      const alpha = clamp((prevY - CRICKET_BALL_RADIUS) / span, 0, 1)
      const dropX = prevX + (x - prevX) * alpha
      const dropZ = prevZ + (z - prevZ) * alpha
      const flightTimeSec = elapsed - stepDt * (1 - alpha)
      const onPitch =
        Math.abs(dropX) <= PITCH_HALF_W &&
        dropZ >= BOWLING_CREASE_Z - 0.5 &&
        dropZ <= BATTING_STUMPS_Z + 0.6
      return {
        dropPoint: [dropX, dropZ],
        flightTimeSec,
        onPitch,
        lengthLabel: classifyPitchLength(dropX, dropZ),
      }
    }
  }

  return {
    dropPoint: [x, z],
    flightTimeSec: elapsed,
    onPitch: Math.abs(x) <= PITCH_HALF_W && z <= BATTING_STUMPS_Z + 0.6,
    lengthLabel: classifyPitchLength(x, z),
  }
}

const _qPrev = new THREE.Quaternion()
const _qCurr = new THREE.Quaternion()
const _qPrevInv = new THREE.Quaternion()
const _dq = new THREE.Quaternion()
const _omegaWorld = new THREE.Vector3()
const _fingerDir = new THREE.Vector3()
const _palmNormal = new THREE.Vector3()
const _topVec = new THREE.Vector3()
const _axisTmp = new THREE.Vector3()

const MAX_SAMPLES = 36
const SAMPLE_KEEP_SEC = 0.38
const VEL_WINDOW_SEC = 0.14
const SPIN_WINDOW_SEC = 0.26

/**
 * Observes a VR bowler's hand/controller trajectory, palm orientation, wrist twist, and finger release
 * across the bowling action deployment to compute throwing speed, spin variation, spin RPM, and drop spot.
 */
export class BowlingActionTracker {
  private samples: BowlingSample[] = []

  reset(): void {
    this.samples.length = 0
  }

  push(
    pos: [number, number, number],
    quat: [number, number, number, number],
    curls: [number, number, number, number, number],
    isHandTracking: boolean,
    nowSec: number
  ): void {
    this.samples.push({
      t: nowSec,
      pos: [pos[0], pos[1], pos[2]],
      quat: [quat[0], quat[1], quat[2], quat[3]],
      curls: [curls[0], curls[1], curls[2], curls[3], curls[4]],
      isHandTracking,
    })
    while (this.samples.length > MAX_SAMPLES || (this.samples.length > 0 && nowSec - this.samples[0].t > SAMPLE_KEEP_SEC)) {
      this.samples.shift()
    }
  }

  /**
   * Inspects palm twist & facing orientation over the deployment window to read Legbreak, Offbreak,
   * Googly, No Spin, or Fast Seam along with spin angular intensity.
   */
  readPalmSpin(
    nowSec: number,
    style: BowlingStyle,
    side: HandSide,
    rawHandSpeed: number
  ): {
    spin: [number, number, number]
    spinDir: SpinDirection
    spinKind: CricketSpinKind
    spinRpm: number
  } {
    const windowSamples = this.samples.filter((s) => nowSec - s.t <= SPIN_WINDOW_SEC)
    if (windowSamples.length < 2) {
      return {
        spin: [0, 0, 0],
        spinDir: 'off',
        spinKind: style === 'fast' ? 'fast' : 'no-spin',
        spinRpm: 0,
      }
    }

    let netForearmRoll = 0
    let weightedForearmRoll = 0
    let forearmWeightSum = 0
    let absRollPeak = 0
    let pitchSnapPeak = 0
    let fingerFlickSum = 0

    for (let i = 1; i < windowSamples.length; i++) {
      const prev = windowSamples[i - 1]
      const curr = windowSamples[i]
      const dt = curr.t - prev.t
      if (dt < 0.002 || dt > 0.07) continue

      _qPrev.set(prev.quat[0], prev.quat[1], prev.quat[2], prev.quat[3])
      _qCurr.set(curr.quat[0], curr.quat[1], curr.quat[2], curr.quat[3])
      if (_qPrev.dot(_qCurr) < 0) {
        _qCurr.set(-_qCurr.x, -_qCurr.y, -_qCurr.z, -_qCurr.w)
      }

      _qPrevInv.copy(_qPrev).invert()
      _dq.multiplyQuaternions(_qCurr, _qPrevInv)

      const sinHalf = Math.hypot(_dq.x, _dq.y, _dq.z)
      if (sinHalf > 1e-4) {
        const angle = 2 * Math.atan2(sinHalf, clamp(_dq.w, -1, 1))
        _axisTmp.set(_dq.x / sinHalf, _dq.y / sinHalf, _dq.z / sinHalf)
        const angSpeed = angle / dt
        _omegaWorld.copy(_axisTmp).multiplyScalar(angSpeed)

        // Clockwise twist rate when looking outward along fingers (-Z in WebXR hand/controller space)
        _fingerDir.set(0, 0, -1).applyQuaternion(_qCurr).normalize()
        const cwRollRate = _omegaWorld.dot(_fingerDir)

        // Blend with world +Z roll when hand points forward down pitch
        const fwdWeight = clamp(_fingerDir.z, 0, 1) * 0.45
        const combinedRollRate = cwRollRate * (1 - fwdWeight) + _omegaWorld.z * fwdWeight

        netForearmRoll += combinedRollRate * dt
        const energyW = (0.35 + Math.abs(combinedRollRate)) * dt
        weightedForearmRoll += combinedRollRate * energyW
        forearmWeightSum += energyW

        if (Math.abs(combinedRollRate) > absRollPeak) {
          absRollPeak = Math.abs(combinedRollRate)
        }

        // Wrist flexion/extension snap around local +X (important for googly out-of-back-of-hand release)
        _axisTmp.set(1, 0, 0).applyQuaternion(_qCurr).normalize()
        const pitchSnap = Math.abs(_omegaWorld.dot(_axisTmp))
        if (pitchSnap > pitchSnapPeak) pitchSnapPeak = pitchSnap
      }

      if (curr.isHandTracking && prev.isHandTracking) {
        const idxRate = Math.abs(curr.curls[1] - prev.curls[1]) / dt
        const midRate = Math.abs(curr.curls[2] - prev.curls[2]) / dt
        const avgFingerRate = (idxRate + midRate) * 0.5
        if (avgFingerRate > 1.8) {
          fingerFlickSum = Math.min(4.5, fingerFlickSum + avgFingerRate * dt * 2.2)
        }
      }
    }

    // Use pre-unpinch sample (slightly before final release frame) for accurate palm pose during deployment
    const releasePoseIdx = Math.max(0, windowSamples.length - (windowSamples.length > 3 ? 2 : 1))
    const relSample = windowSamples[releasePoseIdx]
    _qCurr.set(relSample.quat[0], relSample.quat[1], relSample.quat[2], relSample.quat[3])

    if (relSample.isHandTracking) {
      _palmNormal.set(0, -1, 0).applyQuaternion(_qCurr).normalize()
      _topVec.set(0, 1, 0).applyQuaternion(_qCurr).normalize()
    } else {
      const inwardX = side === 'right' ? -1 : 1
      _palmNormal.set(inwardX, 0, 0).applyQuaternion(_qCurr).normalize()
      _topVec.set(0, 1, 0).applyQuaternion(_qCurr).normalize()
    }

    const avgRollRate = forearmWeightSum > 0 ? weightedForearmRoll / forearmWeightSum : 0
    const rollScore = avgRollRate + netForearmRoll * 4.2
    const handSign = side === 'right' ? 1 : -1

    // Detect Googly: palm turned backward toward bowler (back of hand facing batter) or controller flipped inverted,
    // while guarding against a normal downward follow-through (palm pointing straight down at ground: _palmNormal.y <= -0.55)
    const isPalmBackOfHand = relSample.isHandTracking
      ? (_palmNormal.z < -0.24 && _palmNormal.y > -0.55) || _palmNormal.z < -0.62
      : _topVec.y < -0.22 || _topVec.z < -0.30
    const activeMotion = rawHandSpeed > 1.4 || absRollPeak > 1.25 || pitchSnapPeak > 2.2

    // Fast mode: subtle seam/swing from wrist twist, otherwise straight fast pace
    if (style === 'fast') {
      if (Math.abs(rollScore) < 2.2 && Math.abs(netForearmRoll) < 0.25) {
        return { spin: [0, 0, 0], spinDir: 'off', spinKind: 'fast', spinRpm: 0 }
      }
      const swingSign = rollScore >= 0 ? -1 : 1
      const norm = clamp((absRollPeak + Math.abs(netForearmRoll) * 3.0 - 1.8) / 10.0, 0, 1)
      const swingX = swingSign * (0.28 + norm * 0.72)
      const seamRpm = Math.round(280 + norm * 620)
      return {
        spin: [swingX, 0, 0],
        spinDir: swingSign >= 0 ? 'off' : 'leg',
        spinKind: 'fast',
        spinRpm: seamRpm,
      }
    }

    // Spin mode: Googly vs Legbreak vs Offbreak vs No Spin
    if (isPalmBackOfHand && activeMotion) {
      // Googly spins in the opposite lateral direction to that hand's Legbreak with sharper topspin dip
      const googlyBreakSign = handSign // Right-arm googly breaks +X (into RH batter); Left-arm breaks -X
      const actionOmega = Math.max(2.2, absRollPeak * 0.75 + pitchSnapPeak * 0.65 + fingerFlickSum)
      const intensity = clamp((actionOmega - 1.8) / 10.5, 0, 1)
      const spinMag = 1.45 + intensity * 2.85
      const rpm = Math.round(980 + intensity * 1680)
      return {
        spin: [googlyBreakSign * spinMag, 0.9 + intensity * 0.5, 0],
        spinDir: googlyBreakSign >= 0 ? 'off' : 'leg',
        spinKind: 'googly',
        spinRpm: rpm,
      }
    }

    const hasSignificantTwist = Math.abs(rollScore) >= 1.65 || Math.abs(netForearmRoll) >= 0.20 || absRollPeak >= 2.1
    if (!hasSignificantTwist) {
      return {
        spin: [0, 0, 0],
        spinDir: 'off',
        spinKind: 'no-spin',
        spinRpm: 0,
      }
    }

    // Clockwise twist around forward direction (+Z) makes bottom of ball push +X, so pitch friction turns -X.
    // Right hand: clockwise roll = Legbreak (-X break); counter-clockwise roll = Offbreak (+X break).
    // Left hand mirrors anatomical supination/pronation while keeping true torque turn direction.
    const isClockwise = rollScore >= 0
    const spinXSign = isClockwise ? -1 : 1
    const spinKind: CricketSpinKind =
      side === 'right'
        ? isClockwise
          ? 'legbreak'
          : 'offbreak'
        : isClockwise
          ? 'offbreak'
          : 'legbreak'

    const omegaIntensity = Math.min(18, absRollPeak * 0.8 + Math.abs(avgRollRate) * 0.55 + Math.abs(netForearmRoll) * 3.2 + fingerFlickSum)
    const intensity = clamp((omegaIntensity - 1.4) / 11.2, 0, 1)
    const spinMag = 0.8 + intensity * 3.65 // 0.8 .. 4.45
    const rpm = Math.round(480 + intensity * 2220) // 480 .. 2700 RPM

    return {
      spin: [spinXSign * spinMag, 0.25 + intensity * 0.55, 0],
      spinDir: spinXSign >= 0 ? 'off' : 'leg',
      spinKind,
      spinRpm: rpm,
    }
  }

  /**
   * Computes true VR delivery velocity from observed hand swing speed & release trajectory,
   * detects spin variation & RPM from palm movement, and calculates the exact pitch drop coordinates.
   */
  analyzeDelivery(
    nowSec: number,
    releasePos: [number, number, number],
    style: BowlingStyle,
    side: HandSide
  ): AnalyzedVRDelivery {
    const velWindow = this.samples.filter((s) => nowSec - s.t <= VEL_WINDOW_SEC)

    interface SegVel {
      vx: number
      vy: number
      vz: number
      speed: number
      dt: number
    }
    const segs: SegVel[] = []
    for (let i = 1; i < velWindow.length; i++) {
      const a = velWindow[i - 1]
      const b = velWindow[i]
      const dt = b.t - a.t
      if (dt < 0.002 || dt > 0.065) continue
      const vx = (b.pos[0] - a.pos[0]) / dt
      const vy = (b.pos[1] - a.pos[1]) / dt
      const vz = (b.pos[2] - a.pos[2]) / dt
      segs.push({ vx, vy, vz, speed: Math.hypot(vx, vy, vz), dt })
    }

    // Isolate the forward delivery arc toward the batter (+Z) so wind-up backswing does not cancel forward velocity
    const forwardSegs = segs.filter((s) => s.vz > 0.65)
    const activeSegs = forwardSegs.length > 0 ? forwardSegs : segs

    let peakRawSpeed = 0
    for (let i = 0; i < activeSegs.length; i++) {
      if (activeSegs[i].speed > peakRawSpeed) {
        peakRawSpeed = activeSegs[i].speed
      }
    }

    let dirX = 0
    let dirY = 0
    let dirZ = 1
    if (activeSegs.length > 0 && peakRawSpeed > 0.5) {
      let sumVx = 0
      let sumVy = 0
      let sumVz = 0
      let wSum = 0
      const cutoff = peakRawSpeed * 0.55
      for (let i = 0; i < activeSegs.length; i++) {
        const s = activeSegs[i]
        if (s.speed < cutoff) continue
        const w = s.speed * (1 + i * 0.25)
        sumVx += s.vx * w
        sumVy += s.vy * w
        sumVz += s.vz * w
        wSum += w
      }
      if (wSum > 0) {
        const nx = sumVx / wSum
        const ny = sumVy / wSum
        const nz = sumVz / wSum
        const nLen = Math.hypot(nx, ny, nz)
        if (nLen > 1e-4) {
          dirX = nx / nLen
          dirY = ny / nLen
          dirZ = nz / nLen
        }
      }
    }

    const rawHandSpeedMps = clamp(peakRawSpeed, 0, 28)

    // Keep forward vector pointing toward the cricket pitch corridor
    if (dirZ < 0.35) {
      dirZ = 0.96
      dirX = clamp(dirX, -0.18, 0.18)
      dirY = clamp(dirY, -0.12, 0.24)
      const len = Math.hypot(dirX, dirY, dirZ)
      dirX /= len
      dirY /= len
      dirZ /= len
    }

    const lateralTan = clamp(dirX / dirZ, -0.22, 0.22)
    let elevTan = dirY / dirZ
    if (style === 'fast') {
      elevTan = clamp(elevTan, -0.22, 0.28)
    } else {
      // Natural spin loop offset while preserving full short-to-tossed-up variation from hand elevation
      elevTan = clamp(elevTan + 0.075, -0.12, 0.52)
    }

    const dirLen = Math.hypot(lateralTan, elevTan, 1)
    const unitX = lateralTan / dirLen
    const unitY = elevTan / dirLen
    const unitZ = 1 / dirLen

    const bowlSpeed =
      rawHandSpeedMps < 0.85
        ? style === 'fast'
          ? FAST_MIN_SPEED + 2.0
          : SPIN_MIN_SPEED + 1.5
        : style === 'fast'
          ? clamp(rawHandSpeedMps * FAST_SPEED_SCALE, FAST_MIN_SPEED, FAST_MAX_SPEED)
          : clamp(rawHandSpeedMps * SPIN_SPEED_SCALE, SPIN_MIN_SPEED, SPIN_MAX_SPEED)

    const vel: [number, number, number] = [unitX * bowlSpeed, unitY * bowlSpeed, unitZ * bowlSpeed]

    const { spin, spinDir, spinKind, spinRpm } = this.readPalmSpin(nowSec, style, side, rawHandSpeedMps)
    const drop = predictPitchDropPoint(releasePos, vel, spin, style, spinKind)
    const releaseSpeedMps = Math.hypot(vel[0], vel[1], vel[2])

    return {
      vel,
      spin,
      spinDir,
      spinKind,
      spinRpm,
      releaseSpeedMps,
      releaseSpeedKmh: Math.round(releaseSpeedMps * 3.6),
      rawHandSpeedMps,
      dropPoint: drop.dropPoint,
      pitchLengthLabel: drop.lengthLabel,
      flightTimeSec: drop.flightTimeSec,
    }
  }
}

/**
 * Shared helper to populate all physics and delivery-telemetry fields when any bowler (VR, PC, or AI) releases the ball.
 */
export function applyBowledDeliveryToBall(
  ball: RuntimeCricketBall,
  opts: {
    ownerId: string | null
    releasePos: [number, number, number]
    vel: [number, number, number]
    spin: [number, number, number]
    bowlingStyle: BowlingStyle
    spinDir: SpinDirection
    spinKind: CricketSpinKind
    spinRpm: number
    dropPoint: [number, number]
    pitchLengthLabel: string
  }
): number {
  const speedMps = Math.hypot(opts.vel[0], opts.vel[1], opts.vel[2])
  const speedKmh = Math.round(speedMps * 3.6)

  ball.phase = 'bowled'
  ball.ownerId = opts.ownerId
  ball.pos = [...opts.releasePos]
  ball.prevPos = [...opts.releasePos]
  ball.vel = [...opts.vel]
  ball.spin = [...opts.spin]
  ball.bowlingStyle = opts.bowlingStyle
  ball.spinDir = opts.spinDir
  ball.spinKind = opts.spinKind
  ball.spinRpm = opts.spinRpm
  ball.releaseSpeedMps = speedMps
  ball.predictedDropPos = [...opts.dropPoint]
  ball.pitchLengthLabel = opts.pitchLengthLabel
  ball.bouncedOnPitch = false
  ball.bouncedAfterHit = false
  ball.hitByBat = false
  ball.edgeContact = false
  ball.epoch += 1
  ball.timestamp = Date.now()

  const st = useCricketStore.getState()
  st.setLivePalmSpinHint(null)
  st.setDeliveryTelemetry({
    speedKmh,
    spinKind: opts.spinKind,
    spinRpm: opts.spinRpm,
    dropPoint: opts.dropPoint,
    pitchLengthLabel: opts.pitchLengthLabel,
  })

  return speedMps
}

