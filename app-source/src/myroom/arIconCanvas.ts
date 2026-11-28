import * as THREE from 'three'

export type ARIconKind =
  | 'clay'
  | 'paper'
  | 'cloth'
  | 'wood'
  | 'plate'
  | 'metal'
  | 'pull'
  | 'color'
  | 'scan'
  | 'ai'
  | 'gender'
  | 'mode'
  | 'produce'
  | 'delete'
  | 'clear'
  | 'darts'
  | 'board'
  | 'throw'
  | 'showcase'
  | 'body'
  | 'mic'
  | 'wipe'
  | 'dress'
  | 'lobby'
  | 'exit'
  | 'rotL'
  | 'rotR'
  | 'spin'
  | 'reset'
  | 'pen'
  | 'knife'
  | 'axe'
  | 'tester'
  | 'hands'
  | 'ink'
  | 'menu'
  | 'close'

const _panelTexCache = new Map<string, THREE.CanvasTexture>()
const _wristTexCache = new Map<string, THREE.CanvasTexture>()

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.min(r, w * 0.5, h * 0.5)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.lineTo(x + w - rad, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad)
  ctx.lineTo(x + w, y + h - rad)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h)
  ctx.lineTo(x + rad, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad)
  ctx.lineTo(x, y + rad)
  ctx.quadraticCurveTo(x, y, x + rad, y)
  ctx.closePath()
}

/**
 * Draws crisp custom vector icon glyphs centered inside (cx, cy) at given radius scale `s`.
 */
export function drawARVectorIcon(
  ctx: CanvasRenderingContext2D,
  icon: ARIconKind,
  cx: number,
  cy: number,
  s: number,
  fg = '#f8fafc',
  accent = '#38bdf8'
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.strokeStyle = fg
  ctx.fillStyle = fg
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(2, s * 0.14)

  switch (icon) {
    case 'pen': {
      ctx.rotate(-0.65)
      drawRoundedRectPath(ctx, -s * 0.16, -s * 0.52, s * 0.32, s * 0.72, s * 0.08)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-s * 0.16, s * 0.2)
      ctx.lineTo(0, s * 0.65)
      ctx.lineTo(s * 0.16, s * 0.2)
      ctx.closePath()
      ctx.fillStyle = accent
      ctx.fill()
      break
    }
    case 'knife': {
      ctx.rotate(-0.7)
      ctx.beginPath()
      ctx.moveTo(-s * 0.1, -s * 0.65)
      ctx.quadraticCurveTo(s * 0.32, -s * 0.2, s * 0.14, s * 0.25)
      ctx.lineTo(-s * 0.14, s * 0.25)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = accent
      ctx.fillRect(-s * 0.1, s * 0.26, s * 0.2, s * 0.42)
      break
    }
    case 'axe': {
      ctx.rotate(-0.55)
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.55)
      ctx.lineTo(0, s * 0.68)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.46)
      ctx.quadraticCurveTo(s * 0.62, -s * 0.52, s * 0.52, -s * 0.02)
      ctx.lineTo(0, -s * 0.16)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'tester': {
      ctx.beginPath()
      ctx.moveTo(s * 0.14, -s * 0.65)
      ctx.lineTo(-s * 0.28, s * 0.06)
      ctx.lineTo(s * 0.05, s * 0.06)
      ctx.lineTo(-s * 0.16, s * 0.68)
      ctx.lineTo(s * 0.32, -s * 0.08)
      ctx.lineTo(0, -s * 0.08)
      ctx.closePath()
      ctx.fillStyle = '#fde047'
      ctx.fill()
      break
    }
    case 'hands': {
      for (const fx of [-0.36, -0.14, 0.08, 0.3]) {
        ctx.beginPath()
        ctx.moveTo(s * fx, s * 0.15)
        ctx.lineTo(s * fx, -s * (0.48 - Math.abs(fx) * 0.4))
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(-s * 0.42, s * 0.22)
      ctx.lineTo(-s * 0.62, -s * 0.05)
      ctx.stroke()
      drawRoundedRectPath(ctx, -s * 0.4, s * 0.1, s * 0.78, s * 0.46, s * 0.18)
      ctx.fill()
      break
    }
    case 'ink': {
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.62)
      ctx.quadraticCurveTo(s * 0.54, s * 0.08, 0, s * 0.58)
      ctx.quadraticCurveTo(-s * 0.54, s * 0.08, 0, -s * 0.62)
      ctx.fillStyle = accent
      ctx.fill()
      ctx.stroke()
      break
    }
    case 'menu': {
      drawRoundedRectPath(ctx, -s * 0.56, -s * 0.44, s * 1.12, s * 0.88, s * 0.16)
      ctx.stroke()
      for (const ry of [-0.18, 0.12]) {
        for (const rx of [-0.28, 0.04]) {
          ctx.fillStyle = accent
          ctx.fillRect(s * rx, s * ry, s * 0.24, s * 0.14)
        }
      }
      break
    }
    case 'close': {
      ctx.beginPath()
      ctx.moveTo(-s * 0.42, -s * 0.42)
      ctx.lineTo(s * 0.42, s * 0.42)
      ctx.moveTo(s * 0.42, -s * 0.42)
      ctx.lineTo(-s * 0.42, s * 0.42)
      ctx.stroke()
      break
    }
    case 'clay': {
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.52, 0, Math.PI * 2)
      ctx.fillStyle = accent
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(-s * 0.18, -s * 0.18, s * 0.14, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.65)'
      ctx.fill()
      break
    }
    case 'paper': {
      ctx.beginPath()
      ctx.moveTo(-s * 0.42, -s * 0.55)
      ctx.lineTo(s * 0.18, -s * 0.55)
      ctx.lineTo(s * 0.44, -s * 0.28)
      ctx.lineTo(s * 0.44, s * 0.55)
      ctx.lineTo(-s * 0.42, s * 0.55)
      ctx.closePath()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(s * 0.18, -s * 0.55)
      ctx.lineTo(s * 0.18, -s * 0.28)
      ctx.lineTo(s * 0.44, -s * 0.28)
      ctx.stroke()
      break
    }
    case 'cloth': {
      ctx.beginPath()
      ctx.moveTo(-s * 0.55, -s * 0.22)
      ctx.quadraticCurveTo(-s * 0.18, -s * 0.52, s * 0.1, -s * 0.18)
      ctx.quadraticCurveTo(s * 0.38, s * 0.1, s * 0.56, -s * 0.22)
      ctx.lineTo(s * 0.52, s * 0.36)
      ctx.quadraticCurveTo(s * 0.16, s * 0.58, -s * 0.14, s * 0.3)
      ctx.quadraticCurveTo(-s * 0.36, s * 0.12, -s * 0.55, s * 0.36)
      ctx.closePath()
      ctx.stroke()
      break
    }
    case 'wood':
    case 'plate': {
      const h = icon === 'plate' ? 0.26 : 0.44
      drawRoundedRectPath(ctx, -s * 0.54, -s * h, s * 1.08, s * h * 2, s * 0.1)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-s * 0.4, 0)
      ctx.lineTo(s * 0.4, 0)
      ctx.stroke()
      break
    }
    case 'metal': {
      ctx.beginPath()
      ctx.moveTo(-s * 0.38, -s * 0.44)
      ctx.lineTo(s * 0.38, -s * 0.44)
      ctx.lineTo(s * 0.58, s * 0.38)
      ctx.lineTo(-s * 0.58, s * 0.38)
      ctx.closePath()
      ctx.fillStyle = 'rgba(226,232,240,0.28)'
      ctx.fill()
      ctx.stroke()
      break
    }
    case 'pull':
    case 'ai':
    case 'gender': {
      ctx.beginPath()
      ctx.arc(0, -s * 0.26, s * 0.24, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, s * 0.56, s * 0.48, Math.PI * 1.15, Math.PI * 1.85)
      ctx.stroke()
      if (icon === 'pull') {
        ctx.beginPath()
        ctx.moveTo(s * 0.34, 0)
        ctx.lineTo(s * 0.62, 0)
        ctx.lineTo(s * 0.48, -s * 0.16)
        ctx.stroke()
      }
      break
    }
    case 'darts':
    case 'board': {
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.56, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.12, 0, Math.PI * 2)
      ctx.fillStyle = '#fb7185'
      ctx.fill()
      break
    }
    case 'throw': {
      ctx.beginPath()
      ctx.moveTo(-s * 0.5, s * 0.45)
      ctx.lineTo(s * 0.48, -s * 0.45)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(s * 0.48, -s * 0.45)
      ctx.lineTo(s * 0.12, -s * 0.42)
      ctx.moveTo(s * 0.48, -s * 0.45)
      ctx.lineTo(s * 0.42, -s * 0.08)
      ctx.stroke()
      break
    }
    case 'scan':
    case 'showcase': {
      drawRoundedRectPath(ctx, -s * 0.52, -s * 0.46, s * 1.04, s * 0.92, s * 0.1)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-s * 0.52, 0)
      ctx.lineTo(s * 0.52, 0)
      ctx.moveTo(0, -s * 0.46)
      ctx.lineTo(0, s * 0.46)
      ctx.stroke()
      break
    }
    case 'mic': {
      drawRoundedRectPath(ctx, -s * 0.18, -s * 0.55, s * 0.36, s * 0.62, s * 0.18)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, -s * 0.05, s * 0.36, 0.15, Math.PI - 0.15)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, s * 0.32)
      ctx.lineTo(0, s * 0.58)
      ctx.stroke()
      break
    }
    case 'rotL':
    case 'rotR':
    case 'spin':
    case 'reset': {
      const ccw = icon === 'rotL'
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.45, ccw ? 0.35 * Math.PI : -0.8 * Math.PI, ccw ? 1.85 * Math.PI : 0.7 * Math.PI, false)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.12, 0, Math.PI * 2)
      ctx.fillStyle = accent
      ctx.fill()
      break
    }
    case 'delete':
    case 'clear':
    case 'wipe': {
      drawRoundedRectPath(ctx, -s * 0.34, -s * 0.3, s * 0.68, s * 0.78, s * 0.1)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-s * 0.48, -s * 0.32)
      ctx.lineTo(s * 0.48, -s * 0.32)
      ctx.moveTo(-s * 0.14, -s * 0.5)
      ctx.lineTo(s * 0.14, -s * 0.5)
      ctx.stroke()
      break
    }
    case 'dress': {
      ctx.beginPath()
      ctx.moveTo(-s * 0.24, -s * 0.5)
      ctx.lineTo(s * 0.24, -s * 0.5)
      ctx.lineTo(s * 0.45, s * 0.54)
      ctx.lineTo(-s * 0.45, s * 0.54)
      ctx.closePath()
      ctx.stroke()
      break
    }
    case 'lobby': {
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.58)
      ctx.lineTo(s * 0.54, -s * 0.08)
      ctx.lineTo(s * 0.38, -s * 0.08)
      ctx.lineTo(s * 0.38, s * 0.52)
      ctx.lineTo(-s * 0.38, s * 0.52)
      ctx.lineTo(-s * 0.38, -s * 0.08)
      ctx.lineTo(-s * 0.54, -s * 0.08)
      ctx.closePath()
      ctx.stroke()
      break
    }
    case 'exit': {
      ctx.beginPath()
      ctx.arc(0, 0.04 * s, s * 0.46, -Math.PI * 0.3, Math.PI * 1.3)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.58)
      ctx.lineTo(0, s * 0.02)
      ctx.stroke()
      break
    }
    default: {
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
  }
  ctx.restore()
}

/**
 * Creates a cached crisp rounded glass icon+label button CanvasTexture for the compact AR Studio Panel.
 */
export function getARPanelButtonTexture(
  label: string,
  icon: ARIconKind,
  accentColor: string,
  hovered = false,
  aspect = 0.17 / 0.06
): THREE.CanvasTexture {
  const cw = Math.max(192, Math.min(480, Math.round(96 * aspect)))
  const key = `${icon}|${label}|${accentColor}|${hovered ? 1 : 0}|${cw}`
  const existing = _panelTexCache.get(key)
  if (existing) return existing

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = 96
  const ctx = canvas.getContext('2d')!

  ctx.clearRect(0, 0, cw, 96)
  drawRoundedRectPath(ctx, 4, 4, cw - 8, 88, 20)
  ctx.fillStyle = hovered ? 'rgba(30, 58, 95, 0.96)' : 'rgba(15, 23, 42, 0.9)'
  ctx.fill()

  ctx.lineWidth = hovered ? 4 : 2.5
  ctx.strokeStyle = hovered ? '#f8fafc' : accentColor
  ctx.stroke()

  // Left circular icon badge (true 1:1 circle regardless of button width!)
  ctx.beginPath()
  ctx.arc(44, 48, 26, 0, Math.PI * 2)
  ctx.fillStyle = accentColor
  ctx.fill()

  drawARVectorIcon(ctx, icon, 44, 48, 21, '#ffffff', '#e0f2fe')

  // Concise high-contrast label
  ctx.fillStyle = '#f8fafc'
  ctx.font = 'bold 23px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label.slice(0, 16), 82, 49)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  _panelTexCache.set(key, tex)
  return tex
}

/**
 * Creates a cached compact wrist-dock square icon tile CanvasTexture.
 */
export function getWristTileTexture(
  label: string,
  icon: ARIconKind,
  color: string,
  active: boolean,
  hovered: boolean
): THREE.CanvasTexture {
  const key = `${icon}|${label}|${color}|${active ? 1 : 0}|${hovered ? 1 : 0}`
  const existing = _wristTexCache.get(key)
  if (existing) return existing

  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  ctx.clearRect(0, 0, 128, 128)
  drawRoundedRectPath(ctx, 4, 4, 120, 120, 26)
  ctx.fillStyle = active ? '#f8fafc' : hovered ? 'rgba(30, 41, 59, 0.96)' : 'rgba(15, 23, 42, 0.9)'
  ctx.fill()

  ctx.lineWidth = active ? 6 : 4
  ctx.strokeStyle = active ? color : hovered ? '#e2e8f0' : color
  ctx.stroke()

  drawARVectorIcon(ctx, icon, 64, 48, 30, active ? '#0f172a' : '#f8fafc', color)

  ctx.fillStyle = active ? '#0f172a' : '#e2e8f0'
  ctx.font = 'bold 21px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label.slice(0, 8), 64, 98)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  _wristTexCache.set(key, tex)
  return tex
}
