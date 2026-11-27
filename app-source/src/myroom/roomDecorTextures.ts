import * as THREE from 'three'

/**
 * Renders 4 scenic Nature Canvas Paintings for Wallmates and Smart TV ambient channels:
 * 0 = Mountain Sunrise & Pine Lake
 * 1 = Lush Forest Waterfall
 * 2 = Golden Ocean Sunset
 * 3 = Autumn Birch Path
 */
export function createNatureSceneryTexture(variantIdx: number): THREE.CanvasTexture {
  const w = 512
  const h = 360
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const v = Math.abs(variantIdx) % 4

  if (v === 0) {
    // Mountain Sunrise & Turquoise Lake
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62)
    sky.addColorStop(0, '#1e3a8a')
    sky.addColorStop(0.55, '#fb7185')
    sky.addColorStop(1, '#fde047')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h * 0.62)

    // Glowing Rising Sun
    ctx.fillStyle = '#fef9c3'
    ctx.beginPath()
    ctx.arc(w * 0.52, h * 0.44, 44, 0, Math.PI * 2)
    ctx.fill()

    // Distant & foreground Mountain Peaks
    ctx.fillStyle = '#475569'
    ctx.beginPath()
    ctx.moveTo(0, h * 0.62)
    ctx.lineTo(110, 128)
    ctx.lineTo(220, h * 0.62)
    ctx.lineTo(340, 112)
    ctx.lineTo(445, h * 0.62)
    ctx.lineTo(w, 150)
    ctx.lineTo(w, h * 0.62)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#1e293b'
    ctx.beginPath()
    ctx.moveTo(0, h * 0.62)
    ctx.lineTo(75, 165)
    ctx.lineTo(175, h * 0.62)
    ctx.lineTo(290, 152)
    ctx.lineTo(410, h * 0.62)
    ctx.lineTo(w, 185)
    ctx.lineTo(w, h * 0.62)
    ctx.closePath()
    ctx.fill()

    // Snow caps
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(340, 112)
    ctx.lineTo(312, 145)
    ctx.lineTo(368, 145)
    ctx.closePath()
    ctx.fill()

    // Shimmering Alpine Lake
    const lake = ctx.createLinearGradient(0, h * 0.62, 0, h)
    lake.addColorStop(0, '#0284c7')
    lake.addColorStop(1, '#0f172a')
    ctx.fillStyle = lake
    ctx.fillRect(0, h * 0.62, w, h * 0.38)
    ctx.fillStyle = 'rgba(254, 240, 138, 0.45)'
    for (let y = 235; y < 345; y += 14) {
      ctx.fillRect(215 - (y - 230) * 0.25, y, 100 + (y - 230) * 0.5, 4)
    }

    // Foreground dark pine silhouettes
    ctx.fillStyle = '#064e3b'
    for (let x = 18; x < w; x += 48) {
      const ph = 42 + ((x * 17) % 34)
      ctx.beginPath()
      ctx.moveTo(x, h)
      ctx.lineTo(x + 18, h - ph)
      ctx.lineTo(x + 36, h)
      ctx.closePath()
      ctx.fill()
    }
  } else if (v === 1) {
    // Lush Emerald Forest & Cascading Waterfall
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#065f46')
    bg.addColorStop(0.55, '#047857')
    bg.addColorStop(1, '#022c22')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    // Mist Sunbeam rays
    ctx.fillStyle = 'rgba(253, 224, 71, 0.14)'
    ctx.beginPath()
    ctx.moveTo(120, 0)
    ctx.lineTo(310, h)
    ctx.lineTo(170, h)
    ctx.lineTo(40, 0)
    ctx.fill()

    // Cliff rocks
    ctx.fillStyle = '#3f3f46'
    ctx.fillRect(0, 105, 190, 210)
    ctx.fillRect(320, 105, 192, 210)

    // Bright Falling Water Curtain & Mist Foam
    const fall = ctx.createLinearGradient(0, 90, 0, 290)
    fall.addColorStop(0, '#bae6fd')
    fall.addColorStop(0.5, '#e0f2fe')
    fall.addColorStop(1, '#ffffff')
    ctx.fillStyle = fall
    ctx.fillRect(185, 88, 140, 195)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)'
    ctx.lineWidth = 4
    for (let x = 200; x < 318; x += 18) {
      ctx.beginPath()
      ctx.moveTo(x, 95)
      ctx.lineTo(x + ((x % 3) - 1) * 5, 278)
      ctx.stroke()
    }
    ctx.fillStyle = '#0284c7'
    ctx.fillRect(0, 275, w, 85)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
    ctx.beginPath()
    ctx.ellipse(255, 282, 110, 18, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (v === 2) {
    // Golden Ocean Sunset & Palm Silhouette
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.58)
    sky.addColorStop(0, '#4c1d95')
    sky.addColorStop(0.5, '#db2777')
    sky.addColorStop(1, '#f97316')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h * 0.58)

    ctx.fillStyle = '#fde047'
    ctx.beginPath()
    ctx.arc(w * 0.5, h * 0.52, 54, 0, Math.PI * 2)
    ctx.fill()

    const sea = ctx.createLinearGradient(0, h * 0.58, 0, h)
    sea.addColorStop(0, '#ea580c')
    sea.addColorStop(0.35, '#1d4ed8')
    sea.addColorStop(1, '#090d16')
    ctx.fillStyle = sea
    ctx.fillRect(0, h * 0.58, w, h * 0.42)

    ctx.fillStyle = 'rgba(254, 240, 138, 0.7)'
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(190 - i * 8, 222 + i * 16, 130 + i * 16, 6)
    }

    // Shore palm trunk silhouette
    ctx.strokeStyle = '#09090b'
    ctx.lineWidth = 14
    ctx.beginPath()
    ctx.moveTo(64, h)
    ctx.quadraticCurveTo(96, 210, 128, 126)
    ctx.stroke()
    for (let a = 0; a < 6; a++) {
      const ang = -0.3 + a * 0.9
      ctx.beginPath()
      ctx.lineWidth = 6
      ctx.moveTo(128, 126)
      ctx.quadraticCurveTo(128 + Math.cos(ang) * 42, 118 + Math.sin(ang) * 18, 128 + Math.cos(ang) * 74, 136 + Math.sin(ang) * 42)
      ctx.stroke()
    }
  } else {
    // Autumn Golden Birch Woodland Path
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.5)
    sky.addColorStop(0, '#38bdf8')
    sky.addColorStop(1, '#fef08a')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h * 0.5)

    ctx.fillStyle = '#b45309'
    ctx.fillRect(0, h * 0.5, w, h * 0.5)
    // Winding stone path
    ctx.fillStyle = '#d6d3d1'
    ctx.beginPath()
    ctx.moveTo(230, 182)
    ctx.lineTo(282, 182)
    ctx.lineTo(355, h)
    ctx.lineTo(155, h)
    ctx.closePath()
    ctx.fill()

    // Golden/Crimson tree canopies & pale birch trunks
    ;[75, 165, 345, 435].forEach((tx, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#ea580c' : '#eab308'
      ctx.beginPath()
      ctx.arc(tx, 108, 68, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#f5f5f4'
      ctx.fillRect(tx - 8, 110, 16, 175)
    })
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

export function createTVChannelTexture(channelIdx: number, powerOn: boolean): THREE.CanvasTexture {
  if (!powerOn) {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#030712'
    ctx.fillRect(0, 0, 64, 64)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }
  return createNatureSceneryTexture(channelIdx)
}

export function createClockFaceTexture(hours: number, minutes: number, seconds: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')!
  const cx = 128
  const cy = 128

  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.arc(cx, cy, 124, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(cx, cy, 118, 0, Math.PI * 2)
  ctx.stroke()

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI * 0.5
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = i % 3 === 0 ? 5 : 2.5
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * 94, cy + Math.sin(a) * 94)
    ctx.lineTo(cx + Math.cos(a) * 110, cy + Math.sin(a) * 110)
    ctx.stroke()
  }

  const secA = (seconds / 60) * Math.PI * 2 - Math.PI * 0.5
  const minA = ((minutes + seconds / 60) / 60) * Math.PI * 2 - Math.PI * 0.5
  const hrA = (((hours % 12) + minutes / 60) / 12) * Math.PI * 2 - Math.PI * 0.5

  // Hour hand
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(hrA) * 58, cy + Math.sin(hrA) * 58)
  ctx.stroke()

  // Minute hand
  ctx.lineWidth = 4.5
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(minA) * 86, cy + Math.sin(minA) * 86)
  ctx.stroke()

  // Second sweep hand
  ctx.strokeStyle = '#dc2626'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(secA) * 96, cy + Math.sin(secA) * 96)
  ctx.stroke()

  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.arc(cx, cy, 6, 0, Math.PI * 2)
  ctx.fill()

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

export function createFurnitureWoodTexture(baseHex: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = baseHex
  ctx.fillRect(0, 0, 256, 256)
  for (let y = 0; y < 256; y += 3) {
    ctx.strokeStyle = y % 6 === 0 ? 'rgba(30, 12, 4, 0.24)' : 'rgba(255, 225, 190, 0.12)'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.bezierCurveTo(80, y + Math.sin(y * 0.06) * 8, 175, y - Math.sin(y * 0.06) * 8, 256, y)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}
