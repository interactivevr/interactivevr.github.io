export interface PoseSample {
  x: number
  y: number
  z: number
  t: number // seconds (performance.now() / 1000)
}

const MAX_SAMPLES = 10
const WINDOW_SEC = 0.11

/**
 * Tracks a rolling ring buffer of recent hand/controller positions to compute smooth,
 * jitter-free release velocities for natural VR ball throwing.
 */
export class ThrowVelocityEstimator {
  private samples: PoseSample[] = []

  reset(): void {
    this.samples.length = 0
  }

  push(x: number, y: number, z: number, timeSec: number): void {
    this.samples.push({ x, y, z, t: timeSec })
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift()
    }
  }

  computeVelocity(nowSec: number, gain = 1.18, maxSpeed = 20): [number, number, number] {
    const valid = this.samples.filter((s) => nowSec - s.t <= WINDOW_SEC)
    if (valid.length < 2) {
      return [0, 1.5, 0]
    }

    // Weighted average over adjacent segments (heavier weight on most recent frames before release)
    let sumVx = 0
    let sumVy = 0
    let sumVz = 0
    let weightSum = 0

    for (let i = 1; i < valid.length; i++) {
      const prev = valid[i - 1]
      const curr = valid[i]
      const dt = curr.t - prev.t
      if (dt < 0.002) continue

      const w = i * i
      sumVx += ((curr.x - prev.x) / dt) * w
      sumVy += ((curr.y - prev.y) / dt) * w
      sumVz += ((curr.z - prev.z) / dt) * w
      weightSum += w
    }

    if (weightSum <= 0) {
      return [0, 1.5, 0]
    }

    let vx = (sumVx / weightSum) * gain
    let vy = (sumVy / weightSum) * gain
    let vz = (sumVz / weightSum) * gain

    // Slight upward release lift for natural VR throwing feel
    const horizSpeed = Math.hypot(vx, vz)
    if (horizSpeed > 2.2) {
      vy += Math.min(1.6, horizSpeed * 0.12)
    }

    const speed = Math.hypot(vx, vy, vz)
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed
      vx *= scale
      vy *= scale
      vz *= scale
    }

    return [vx, vy, vz]
  }
}
