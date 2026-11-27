/**
 * Procedural Web Audio API sound effects so zero external audio files are needed.
 * Shares the Three.js AudioListener context once unlocked by user interaction.
 */

let sharedContext: AudioContext | null = null

export function setSfxAudioContext(ctx: AudioContext): void {
  sharedContext = ctx
}

function getContext(): AudioContext | null {
  if (sharedContext) {
    if (sharedContext.state === 'suspended') {
      void sharedContext.resume()
    }
    return sharedContext
  }
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  sharedContext = new Ctor()
  return sharedContext
}

export function unlockAudioContext(): AudioContext | null {
  const ctx = getContext()
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume()
  }
  return ctx
}

export function playThrowSfx(speed = 10): void {
  const ctx = getContext()
  if (!ctx || ctx.state !== 'running') return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  const norm = Math.min(1, Math.max(0.2, speed / 18))
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(190 + norm * 160, now)
  osc.frequency.exponentialRampToValueAtTime(75, now + 0.14)

  gain.gain.setValueAtTime(0.001, now)
  gain.gain.linearRampToValueAtTime(0.14 * norm, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.16)
}

export function playCatchSfx(streak = 1): void {
  const ctx = getContext()
  if (!ctx || ctx.state !== 'running') return

  const now = ctx.currentTime
  // Tactile mitt thump
  const thump = ctx.createOscillator()
  const thumpGain = ctx.createGain()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(240, now)
  thump.frequency.exponentialRampToValueAtTime(80, now + 0.09)
  thumpGain.gain.setValueAtTime(0.22, now)
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
  thump.connect(thumpGain)
  thumpGain.connect(ctx.destination)
  thump.start(now)
  thump.stop(now + 0.11)

  // Ascending streak chime
  const semitoneBoost = Math.min(12, Math.max(0, streak - 1))
  const baseFreq = 523.25 * Math.pow(2, semitoneBoost / 12)
  const chime = ctx.createOscillator()
  const chimeGain = ctx.createGain()
  chime.type = 'sine'
  chime.frequency.setValueAtTime(baseFreq, now + 0.02)
  chime.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.16)
  chimeGain.gain.setValueAtTime(0.001, now + 0.02)
  chimeGain.gain.linearRampToValueAtTime(0.11, now + 0.04)
  chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24)
  chime.connect(chimeGain)
  chimeGain.connect(ctx.destination)
  chime.start(now + 0.02)
  chime.stop(now + 0.26)
}

export function playBounceSfx(impactSpeed = 5): void {
  const ctx = getContext()
  if (!ctx || ctx.state !== 'running') return

  const intensity = Math.min(1, Math.max(0.08, impactSpeed / 14))
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(140 + intensity * 70, now)
  osc.frequency.exponentialRampToValueAtTime(52, now + 0.08)

  gain.gain.setValueAtTime(0.15 * intensity, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.1)
}

export function playDropSfx(): void {
  const ctx = getContext()
  if (!ctx || ctx.state !== 'running') return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(185, now)
  osc.frequency.exponentialRampToValueAtTime(92, now + 0.22)

  gain.gain.setValueAtTime(0.07, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.25)
}
