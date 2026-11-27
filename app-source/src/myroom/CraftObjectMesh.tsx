import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { runtimeState } from '../store/useGameStore'
import {
  CraftPhysicsTarget,
  findSupportingSurfaceY,
  resolveCraftObjectCollisions,
  stepCraftObjectPhysics,
} from './roomPhysics'
import { CraftMaterialKind, InkStroke2D } from './types'
import {
  getCombinedRoomSurfaces,
  myRoomRuntime,
  RuntimeCraftObject,
  useMyRoomStore,
} from './useMyRoomStore'

function paintPaperBase(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 512, 512)
  ctx.strokeStyle = 'rgba(160, 150, 135, 0.18)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 160; i++) {
    const x = (i * 149) % 512
    const y = (i * 277) % 512
    const len = 14 + (i % 24)
    const ang = (i * 0.7) % Math.PI
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len)
    ctx.stroke()
  }
  // Subtle ruled lines & crisp border
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)'
  ctx.lineWidth = 2
  for (let y = 52; y < 480; y += 36) {
    ctx.beginPath()
    ctx.moveTo(22, y)
    ctx.lineTo(490, y)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(248, 113, 113, 0.25)'
  ctx.beginPath()
  ctx.moveTo(64, 16)
  ctx.lineTo(64, 496)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.42)'
  ctx.lineWidth = 6
  ctx.strokeRect(3, 3, 506, 506)
}

function redrawPaperCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: readonly InkStroke2D[]
): void {
  paintPaperBase(ctx)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let s = 0; s < strokes.length; s++) {
    const st = strokes[s]
    if (st.points.length === 0) continue
    ctx.strokeStyle = st.color
    ctx.fillStyle = st.color
    ctx.lineWidth = 5.5
    if (st.points.length === 1) {
      const [u, v] = st.points[0]
      ctx.beginPath()
      ctx.arc(u * 512, (1 - v) * 512, 3.2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.beginPath()
    ctx.moveTo(st.points[0][0] * 512, (1 - st.points[0][1]) * 512)
    for (let k = 1; k < st.points.length; k++) {
      ctx.lineTo(st.points[k][0] * 512, (1 - st.points[k][1]) * 512)
    }
    ctx.stroke()
  }
}

function createMaterialTexture(kind: CraftMaterialKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 256, 256)

  if (kind === 'paper') {
    canvas.width = 512
    canvas.height = 512
    paintPaperBase(ctx)
  } else if (kind === 'cloth') {
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
    for (let y = 0; y < 256; y += 3) {
      const wave = Math.sin(y * 0.08) * 14
      ctx.strokeStyle = y % 6 === 0 ? 'rgba(62, 32, 12, 0.32)' : 'rgba(92, 52, 24, 0.16)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.bezierCurveTo(85, y + wave, 170, y - wave, 256, y)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(62, 32, 12, 0.24)'
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, 252, 252)
  } else if (kind === 'metal') {
    for (let y = 0; y < 256; y += 2) {
      ctx.fillStyle = y % 4 === 0 ? 'rgba(255, 255, 255, 0.22)' : 'rgba(15, 23, 42, 0.14)'
      ctx.fillRect(0, y, 256, 1)
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, 252, 252)
  } else {
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
  sharedTexture,
}: {
  obj: RuntimeCraftObject
  sharedTexture: THREE.CanvasTexture
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const shadowRef = useRef<THREE.Mesh>(null)
  const lastStrokeVerRef = useRef(-1)
  const isSelected = useMyRoomStore((s) => s.selectedCraftId === obj.id)

  // Dedicated high-res ink canvas texture ONLY for writable Paper objects
  const paperInk = useMemo(() => {
    if (obj.kind !== 'paper') return null
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    paintPaperBase(ctx)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    return { canvas, ctx, tex }
  }, [obj.kind])

  useEffect(() => {
    return () => {
      paperInk?.tex.dispose()
    }
  }, [paperInk])

  useFrame(() => {
    const live = myRoomRuntime.objects.get(obj.id)
    if (!live || !meshRef.current) return

    meshRef.current.position.set(live.pos[0], live.pos[1], live.pos[2])
    meshRef.current.quaternion.set(live.quat[0], live.quat[1], live.quat[2], live.quat[3])

    if (paperInk && live.strokeVersion !== lastStrokeVerRef.current) {
      lastStrokeVerRef.current = live.strokeVersion
      redrawPaperCanvas(paperInk.ctx, live.strokes)
      paperInk.tex.needsUpdate = true
    }

    if (matRef.current) {
      const lp = runtimeState.localPose
      const dl = Math.hypot(live.pos[0] - lp.leftPos[0], live.pos[1] - lp.leftPos[1], live.pos[2] - lp.leftPos[2])
      const dr = Math.hypot(live.pos[0] - lp.rightPos[0], live.pos[1] - lp.rightPos[1], live.pos[2] - lp.rightPos[2])
      const nearHand = Math.min(dl, dr) < live.meshData.approxRadius + 0.17
      matRef.current.emissiveIntensity = live.isHeldByLocal ? 0.3 : isSelected ? 0.34 : nearHand ? 0.24 : 0.08
    }

    if (shadowRef.current) {
      const surf = findSupportingSurfaceY(
        live.pos[0],
        live.pos[2],
        getCombinedRoomSurfaces(),
        myRoomRuntime.floorY,
        live.pos[1] + 0.05
      )
      shadowRef.current.position.set(live.pos[0], surf.y + 0.005, live.pos[2])
      const h = Math.max(0, live.pos[1] - surf.y)
      const s = Math.max(0.3, 1.0 - h * 0.45) * Math.max(0.75, live.meshData.approxRadius / 0.1)
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
      <mesh
        ref={meshRef}
        geometry={obj.meshData.geometry}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation()
          useMyRoomStore.getState().setSelectedCraftId(obj.id)
        }}
      >
        <meshStandardMaterial
          ref={matRef}
          color={obj.color}
          emissive={obj.color}
          emissiveIntensity={0.08}
          map={paperInk ? paperInk.tex : sharedTexture}
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

  // Unified physics loop: gravity & room/furniture boundaries first, then 4-iteration solid stacking!
  useFrame((_, delta) => {
    const objs = Array.from(myRoomRuntime.objects.values())
    if (objs.length === 0) return

    const surfaces = getCombinedRoomSurfaces()
    const targets: CraftPhysicsTarget[] = []
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i]
      const isFixed = o.isHeldByLocal || o.ownerId !== null
      const t: CraftPhysicsTarget = {
        pos: o.pos,
        vel: o.vel,
        quat: o.quat,
        kind: o.kind,
        crumpleFactor: o.crumpleFactor,
        foldFactor: o.foldFactor ?? 0,
        seed: o.deformSeed,
        approxRadius: o.meshData.approxRadius,
        halfExtents: o.meshData.halfExtents,
        localCenter: o.meshData.localCenter,
        isFixed,
      }
      if (!isFixed) {
        stepCraftObjectPhysics(
          t,
          surfaces,
          myRoomRuntime.floorY,
          myRoomRuntime.roomBoundsXZ,
          delta
        )
      }
      targets.push(t)
    }

    resolveCraftObjectCollisions(targets, surfaces, myRoomRuntime.floorY, 4)
  })

  const objectList = Array.from(myRoomRuntime.objects.values())

  return (
    <group>
      {objectList.map((obj) => (
        <SingleCraftObjectView key={obj.id} obj={obj} sharedTexture={textures[obj.kind]} />
      ))}
    </group>
  )
}
