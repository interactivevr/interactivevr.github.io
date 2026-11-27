import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { runtimeState } from '../store/useGameStore'
import { findSupportingSurfaceY, stepCraftObjectPhysics } from './roomPhysics'
import { myRoomRuntime, RuntimeCraftObject, useMyRoomStore } from './useMyRoomStore'

function createMaterialTexture(kind: 'clay' | 'paper'): THREE.CanvasTexture {
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
    // Crisp subtle page border so white paper stands out over light desks/floors in AR
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)'
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
  clayTex,
  paperTex,
}: {
  obj: RuntimeCraftObject
  clayTex: THREE.CanvasTexture
  paperTex: THREE.CanvasTexture
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const shadowRef = useRef<THREE.Mesh>(null)

  useEffect(() => {
    return () => {
      // Geometry disposal is managed when deleted in deleteRuntimeCraftObject
    }
  }, [obj.id])

  useFrame((_, delta) => {
    const live = myRoomRuntime.objects.get(obj.id)
    if (!live || !meshRef.current) return

    if (!live.isHeldByLocal && live.ownerId === null) {
      stepCraftObjectPhysics(
        {
          pos: live.pos,
          vel: live.vel,
          kind: live.kind,
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

    // Highlight subtly when near either local hand for effortless bare-hand grabbing in AR
    if (matRef.current) {
      const lp = runtimeState.localPose
      const dl = Math.hypot(live.pos[0] - lp.leftPos[0], live.pos[1] - lp.leftPos[1], live.pos[2] - lp.leftPos[2])
      const dr = Math.hypot(live.pos[0] - lp.rightPos[0], live.pos[1] - lp.rightPos[1], live.pos[2] - lp.rightPos[2])
      const nearHand = Math.min(dl, dr) < live.meshData.approxRadius + 0.17
      matRef.current.emissiveIntensity = live.isHeldByLocal ? 0.32 : nearHand ? 0.28 : 0.14
    }

    // Contact shadow on nearest supporting table/desk/floor directly underneath object
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

  const isPaper = obj.kind === 'paper'

  return (
    <group>
      <mesh ref={meshRef} geometry={obj.meshData.geometry} castShadow receiveShadow>
        <meshStandardMaterial
          ref={matRef}
          color={obj.color}
          emissive={obj.color}
          emissiveIntensity={0.14}
          map={isPaper ? paperTex : clayTex}
          roughness={isPaper ? 0.72 : 0.52}
          metalness={0.04}
          side={isPaper ? THREE.DoubleSide : THREE.FrontSide}
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

  const clayTex = useMemo(() => createMaterialTexture('clay'), [])
  const paperTex = useMemo(() => createMaterialTexture('paper'), [])

  useEffect(() => {
    return () => {
      clayTex.dispose()
      paperTex.dispose()
    }
  }, [clayTex, paperTex])

  // Keep unheld objects from overlapping/clipping into each other when resting on tables/floor
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
        <SingleCraftObjectView
          key={obj.id}
          obj={obj}
          clayTex={clayTex}
          paperTex={paperTex}
        />
      ))}
    </group>
  )
}
