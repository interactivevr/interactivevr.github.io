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

/**
 * Plays subtle procedural material feedback for squeezing, folding, tearing, impacts, or rigid knocks.
 */
export function playMaterialActionSfx(
  kind: CraftMaterialKind,
  action: 'squeeze' | 'fold' | 'tear' | 'drop' | 'reject'
): void {
  const nowMs = performance.now()
  if (action === 'squeeze' && nowMs - _lastPlayMs < 140) return
  if (action === 'reject' && nowMs - _lastPlayMs < 350) return
  _lastPlayMs = nowMs

  const ctx = ensureCtx()
  if (!ctx) return

  const t = ctx.currentTime
  try {
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
