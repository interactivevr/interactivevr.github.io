import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { runtimeState } from '../store/useGameStore'
import { findSupportingSurfaceY, stepCraftObjectPhysics } from './roomPhysics'
import { CraftMaterialKind } from './types'
import { myRoomRuntime, RuntimeCraftObject, useMyRoomStore } from './useMyRoomStore'

function createMaterialTexture(kind: CraftMaterialKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 256, 256)

  if (kind === 'paper') {
    ctx.strokeStyle = 'rgba(160, 150, 135, 0.22)'
    for (let i = 0; i < 140; i++) {
      const x = (i * 73) % 256
      const y = (i * 139) % 256
      const len = 8 + (i % 16)
      const ang = (i * 0.7) % Math.PI
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)'
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, 252, 252)
  } else if (kind === 'cloth') {
    // Crisp linen weave & decorative border threads
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)'
    for (let y = 0; y < 256; y += 6) {
      ctx.fillRect(0, y, 256, 2)
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)'
    for (let x = 0; x < 256; x += 6) {
      ctx.fillRect(x, 0, 2, 256)
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
    ctx.lineWidth = 6
    ctx.strokeRect(8, 8, 240, 240)
  } else if (kind === 'wood') {
    // Natural organic wood grain lines & knots
    for (let y = 0; y < 256; y += 3) {
      const wave = Math.sin(y * 0.08) * 14
      ctx.strokeStyle = y % 6 === 0 ? 'rgba(62, 32, 12, 0.28)' : 'rgba(92, 52, 24, 0.14)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.bezierCurveTo(85, y + wave, 170, y - wave, 256, y)
      ctx.stroke()
    }
  } else if (kind === 'metal') {
    // Brushed metallic sheen striations
    for (let y = 0; y < 256; y += 2) {
      ctx.fillStyle = y % 4 === 0 ? 'rgba(255, 255, 255, 0.18)' : 'rgba(15, 23, 42, 0.12)'
      ctx.fillRect(0, y, 256, 1)
    }
  } else {
    // Matte polymer/modeling clay micro-dimples
    for (let i = 0; i < 240; i++) {
      const x = (i * 53) % 256
      const y = (i * 97) % 256
      ctx.fillStyle = i % 2 === 0 ? 'rgba(0, 0, 0, 0.045)' : 'rgba(255, 255, 255, 0.08)'
      ctx.beginPath()
      ctx.arc(x, y, 2 + (i % 4), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}

function SingleCraftObjectView({
  obj,
  textures,
}: {
  obj: RuntimeCraftObject
  textures: Record<CraftMaterialKind, THREE.CanvasTexture>
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const shadowRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    const live = myRoomRuntime.objects.get(obj.id)
    if (!live || !meshRef.current) return

    if (!live.isHeldByLocal && live.ownerId === null) {
      stepCraftObjectPhysics(
        {
          pos: live.pos,
          vel: live.vel,
          kind: live.kind,
          crumpleFactor: live.crumpleFactor,
          foldFactor: live.foldFactor ?? 0,
          seed: live.deformSeed,
          approxRadius: live.meshData.approxRadius,
        },
        myRoomRuntime.surfaces,
        myRoomRuntime.floorY,
        myRoomRuntime.roomBoundsXZ,
        delta
      )
    }

    meshRef.current.position.set(live.pos[0], live.pos[1], live.pos[2])
    meshRef.current.quaternion.set(live.quat[0], live.quat[1], live.quat[2], live.quat[3])

    if (matRef.current) {
      const lp = runtimeState.localPose
      const dl = Math.hypot(live.pos[0] - lp.leftPos[0], live.pos[1] - lp.leftPos[1], live.pos[2] - lp.leftPos[2])
      const dr = Math.hypot(live.pos[0] - lp.rightPos[0], live.pos[1] - lp.rightPos[1], live.pos[2] - lp.rightPos[2])
      const nearHand = Math.min(dl, dr) < live.meshData.approxRadius + 0.17
      matRef.current.emissiveIntensity = live.isHeldByLocal ? 0.3 : nearHand ? 0.24 : 0.1
    }

    if (shadowRef.current) {
      const surf = findSupportingSurfaceY(
        live.pos[0],
        live.pos[2],
        myRoomRuntime.surfaces,
        myRoomRuntime.floorY,
        live.pos[1] + 0.05
      )
      shadowRef.current.position.set(live.pos[0], surf.y + 0.006, live.pos[2])
      const h = Math.max(0, live.pos[1] - surf.y)
      const s = Math.max(0.25, 1.0 - h * 0.45) * Math.max(0.75, live.meshData.approxRadius / 0.1)
      shadowRef.current.scale.setScalar(s)
    }
  })

  const doubleSided = obj.kind === 'paper' || obj.kind === 'cloth'
  const roughness =
    obj.kind === 'metal'
      ? 0.24
      : obj.kind === 'wood'
        ? 0.62
        : obj.kind === 'cloth'
          ? 0.92
          : obj.kind === 'paper'
            ? 0.78
            : 0.54
  const metalness = obj.kind === 'metal' ? 0.86 : 0.04

  return (
    <group>
      <mesh ref={meshRef} geometry={obj.meshData.geometry} castShadow receiveShadow>
        <meshStandardMaterial
          ref={matRef}
          color={obj.color}
          emissive={obj.color}
          emissiveIntensity={0.1}
          map={textures[obj.kind]}
          roughness={roughness}
          metalness={metalness}
          side={doubleSided ? THREE.DoubleSide : THREE.FrontSide}
        />
      </mesh>
      <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.11, 18]} />
        <meshBasicMaterial color="#020617" transparent opacity={0.34} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function CraftObjectsLayer() {
  useMyRoomStore((s) => s.objectListVersion)

  const textures = useMemo<Record<CraftMaterialKind, THREE.CanvasTexture>>(
    () => ({
      clay: createMaterialTexture('clay'),
      paper: createMaterialTexture('paper'),
      cloth: createMaterialTexture('cloth'),
      wood: createMaterialTexture('wood'),
      metal: createMaterialTexture('metal'),
    }),
    []
  )

  useEffect(() => {
    return () => {
      Object.values(textures).forEach((tex) => tex.dispose())
    }
  }, [textures])

  useFrame((_, delta) => {
    const objs = Array.from(myRoomRuntime.objects.values())
    const len = objs.length
    const pushScale = Math.min(1, delta * 14)
    for (let i = 0; i < len; i++) {
      const a = objs[i]
      if (a.isHeldByLocal || a.ownerId !== null) continue
      for (let j = i + 1; j < len; j++) {
        const b = objs[j]
        if (b.isHeldByLocal || b.ownerId !== null) continue
        const dx = b.pos[0] - a.pos[0]
        const dy = b.pos[1] - a.pos[1]
        const dz = b.pos[2] - a.pos[2]
        if (Math.abs(dy) > 0.16) continue
        const minD = (a.meshData.approxRadius + b.meshData.approxRadius) * 0.78
        const d = Math.hypot(dx, dz)
        if (d < minD && d > 1e-4) {
          const overlap = (minD - d) * 0.5 * pushScale
          const nx = dx / d
          const nz = dz / d
          a.pos[0] -= nx * overlap
          a.pos[2] -= nz * overlap
          b.pos[0] += nx * overlap
          b.pos[2] += nz * overlap
        }
      }
    }
  })

  const objectList = Array.from(myRoomRuntime.objects.values())

  return (
    <group>
      {objectList.map((obj) => (
        <SingleCraftObjectView key={obj.id} obj={obj} textures={textures} />
      ))}
    </group>
  )
}
