import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

export interface TextLabelProps {
  children: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  fontSize?: number
  color?: string
  outlineColor?: string
  outlineWidth?: number
  anchorX?: 'left' | 'center' | 'right'
  anchorY?: 'top' | 'middle' | 'bottom'
}

export function TextLabel({
  children,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  fontSize = 0.2,
  color = '#f8fafc',
  outlineColor = '#020617',
  outlineWidth = 0,
  anchorX = 'center',
  anchorY = 'middle',
}: TextLabelProps) {
  const text = String(children)

  const { texture, width, height } = useMemo(() => {
    const pxHeight = 72
    const paddingX = 28
    const paddingY = 16
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

    const font = `700 ${pxHeight}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
    ctx.font = font
    const metrics = ctx.measureText(text || ' ')
    const textWidth = Math.max(24, Math.ceil(metrics.width))

    canvas.width = Math.min(2048, textWidth + paddingX * 2)
    canvas.height = pxHeight + paddingY * 2

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const cx = canvas.width / 2
    const cy = canvas.height / 2

    if (outlineWidth > 0) {
      ctx.lineJoin = 'round'
      ctx.lineWidth = Math.max(4, Math.round(outlineWidth * 500))
      ctx.strokeStyle = outlineColor
      ctx.strokeText(text, cx, cy, canvas.width - paddingX)
    }

    ctx.fillStyle = color
    ctx.fillText(text, cx, cy, canvas.width - paddingX)

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.needsUpdate = true

    const worldHeight = fontSize * ((pxHeight + paddingY * 2) / pxHeight)
    const worldWidth = worldHeight * (canvas.width / canvas.height)

    return { texture: tex, width: worldWidth, height: worldHeight }
  }, [text, fontSize, color, outlineColor, outlineWidth])

  useEffect(() => {
    return () => {
      texture.dispose()
    }
  }, [texture])

  const offsetX = anchorX === 'left' ? width / 2 : anchorX === 'right' ? -width / 2 : 0
  const offsetY = anchorY === 'bottom' ? height / 2 : anchorY === 'top' ? -height / 2 : 0

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[offsetX, offsetY, 0]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          map={texture}
          transparent
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
