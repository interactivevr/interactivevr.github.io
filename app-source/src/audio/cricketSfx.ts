import { runtimeState } from '../store/useGameStore'

function getCtx(): AudioContext | null {
  const ctx = runtimeState.audioListener?.context
  if (!ctx) return null
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }
  return ctx
}

export function playBatHitSfx(power = 12, isEdge = false): void {
  const ctx = getCtx()
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  const intensity = Math.min(1, Math.max(0.25, power / 24))

  // Willow knock transient
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = isEdge ? 'triangle' : 'sine'
  osc.frequency.setValueAtTime(isEdge ? 580 : 340 + intensity * 140, now)
  osc.frequency.exponentialRampToValueAtTime(isEdge ? 190 : 95, now + 0.085)

  gain.gain.setValueAtTime(0.32 * intensity, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.1)
}

export function playStumpBreakSfx(): void {
  const ctx = getCtx()
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime

  ;[0, 0.045, 0.095].forEach((delay, idx) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(620 - idx * 95, now + delay)
    osc.frequency.exponentialRampToValueAtTime(140, now + delay + 0.075)
    gain.gain.setValueAtTime(0.16, now + delay)
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.08)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now + delay)
    osc.stop(now + delay + 0.085)
  })
}

export function playPitchBounceSfx(isWet: boolean, impactSpeed = 7): void {
  const ctx = getCtx()
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  const norm = Math.min(1, Math.max(0.15, impactSpeed / 14))

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(isWet ? 105 : 220, now)
  osc.frequency.exponentialRampToValueAtTime(isWet ? 42 : 68, now + 0.065)

  gain.gain.setValueAtTime(0.14 * norm, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.08)
}

export function playCricketCatchSfx(): void {
  const ctx = getCtx()
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(280, now)
  osc.frequency.exponentialRampToValueAtTime(75, now + 0.1)
  gain.gain.setValueAtTime(0.24, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.12)
}

export function playBoundaryCrowdSfx(isSix: boolean): void {
  const ctx = getCtx()
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  const duration = isSix ? 1.35 : 0.9

  // Crowd applause/roar via bandpass filtered white noise buffer
  const sampleCount = Math.floor(ctx.sampleRate * duration)
  const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < sampleCount; i++) {
    data[i] = Math.random() * 2 - 1
  }

  const src = ctx.createBufferSource()
  src.buffer = buf

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(isSix ? 1150 : 880, now)
  filter.Q.setValueAtTime(0.7, now)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.001, now)
  gain.gain.linearRampToValueAtTime(isSix ? 0.18 : 0.12, now + 0.14)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

  src.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  src.start(now)
  src.stop(now + duration + 0.02)
}
