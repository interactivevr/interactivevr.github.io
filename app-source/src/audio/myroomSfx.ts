import { CraftMaterialKind } from '../myroom/types'

let _ctx: AudioContext | null = null
let _lastPlayMs = 0

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!_ctx) {
    const AudioCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AudioCtor) {
      _ctx = new AudioCtor()
    }
  }
  if (_ctx && _ctx.state === 'suspended') {
    void _ctx.resume().catch(() => {})
  }
  return _ctx
}

export type MaterialSfxAction =
  | 'squeeze'
  | 'fold'
  | 'tear'
  | 'cut'
  | 'chop'
  | 'drop'
  | 'reject'
  | 'watch_tap'
  | 'pen_write'
  | 'tester_live'
  | 'tester_insulator'
  | 'dart_hit'
  | 'dart_bullseye'
  | 'dart_miss'
  | 'dart_win'

/**
 * Plays subtle procedural material feedback for squeezing, folding, tearing, cutting, tools, or watch taps.
 */
export function playMaterialActionSfx(kind: CraftMaterialKind, action: MaterialSfxAction): void {
  const nowMs = performance.now()
  if ((action === 'squeeze' || action === 'pen_write') && nowMs - _lastPlayMs < 135) return
  if ((action === 'reject' || action === 'tester_live' || action === 'tester_insulator') && nowMs - _lastPlayMs < 320) return
  _lastPlayMs = nowMs

  const ctx = ensureCtx()
  if (!ctx) return

  const t = ctx.currentTime
  try {
    if (action === 'watch_tap') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1180, t)
      osc.frequency.exponentialRampToValueAtTime(1640, t + 0.055)
      gain.gain.setValueAtTime(0.08, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.07)
      return
    }
    if (action === 'dart_hit' || action === 'dart_bullseye') {
      // Crisp sisal cork thud + celebratory tone on bullseye/treble
      const thud = ctx.createOscillator()
      const thudGain = ctx.createGain()
      thud.type = 'triangle'
      thud.frequency.setValueAtTime(145, t)
      thud.frequency.exponentialRampToValueAtTime(52, t + 0.07)
      thudGain.gain.setValueAtTime(0.18, t)
      thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
      thud.connect(thudGain).connect(ctx.destination)
      thud.start(t)
      thud.stop(t + 0.085)

      if (action === 'dart_bullseye') {
        const chime = ctx.createOscillator()
        const cGain = ctx.createGain()
        chime.type = 'sine'
        chime.frequency.setValueAtTime(880, t + 0.02)
        chime.frequency.setValueAtTime(1320, t + 0.1)
        cGain.gain.setValueAtTime(0.11, t + 0.02)
        cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28)
        chime.connect(cGain).connect(ctx.destination)
        chime.start(t + 0.02)
        chime.stop(t + 0.3)
      }
      return
    }
    if (action === 'dart_miss') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(320, t)
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.12)
      gain.gain.setValueAtTime(0.08, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.14)
      return
    }
    if (action === 'dart_win') {
      ;[523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        const st = t + idx * 0.09
        osc.frequency.setValueAtTime(freq, st)
        gain.gain.setValueAtTime(0.11, st)
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.22)
        osc.connect(gain).connect(ctx.destination)
        osc.start(st)
        osc.stop(st + 0.24)
      })
      return
    }
    if (action === 'tester_live') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(2150, t)
      gain.gain.setValueAtTime(0.06, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.15)
      return
    }
    if (action === 'tester_insulator') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(240, t)
      gain.gain.setValueAtTime(0.04, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.06)
      return
    }
    if (action === 'pen_write') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(1450, t)
      gain.gain.setValueAtTime(0.018, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.035)
      return
    }
    if (action === 'cut' || action === 'chop') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = action === 'chop' ? 'sawtooth' : 'triangle'
      osc.frequency.setValueAtTime(action === 'chop' ? 195 : 460, t)
      osc.frequency.exponentialRampToValueAtTime(action === 'chop' ? 68 : 185, t + (action === 'chop' ? 0.16 : 0.09))
      gain.gain.setValueAtTime(action === 'chop' ? 0.16 : 0.11, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.19)
      return
    }
    if (kind === 'metal' || (kind === 'wood' && action === 'reject')) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = kind === 'metal' ? 'triangle' : 'sine'
      osc.frequency.setValueAtTime(kind === 'metal' ? 920 : 260, t)
      osc.frequency.exponentialRampToValueAtTime(kind === 'metal' ? 680 : 140, t + 0.14)
      gain.gain.setValueAtTime(0.12, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'metal' ? 0.24 : 0.1))
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.25)
    } else if (kind === 'paper' || kind === 'cloth') {
      // Filtered noise burst for paper crinkle / rip or cloth rustle
      const bufferSize = Math.floor(ctx.sampleRate * (action === 'tear' ? 0.18 : 0.09))
      const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.45))
      }
      const src = ctx.createBufferSource()
      src.buffer = buf
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = kind === 'paper' ? (action === 'tear' ? 2800 : 1900) : 950
      const gain = ctx.createGain()
      gain.gain.value = kind === 'paper' ? 0.14 : 0.08
      src.connect(filter).connect(gain).connect(ctx.destination)
      src.start(t)
    } else {
      // Soft wet clay squish/thud
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(160, t)
      osc.frequency.exponentialRampToValueAtTime(75, t + 0.09)
      gain.gain.setValueAtTime(0.1, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.11)
    }
  } catch {
    // ignore WebAudio limits
  }
}
