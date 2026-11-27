import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { stepCraftObjectPhysics } from './roomPhysics'
import { myRoomRuntime, RuntimeCraftObject, useMyRoomStore } from './useMyRoomStore'

function createMaterialTexture(kind: 'clay' | 'paper'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 256, 256)

  if (kind === 'paper') {
    // Crisp organic wood-pulp fibers & fine cellulose grain
    ctx.strokeStyle = 'rgba(180, 170, 155, 0.18)'
    for (let i = 0; i < 140; i++) {
      const x = ((i * 73) % 256)
      const y = ((i * 139) % 256)
      const len = 8 + (i % 16)
      const ang = (i * 0.7) % Math.PI
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len)
      ctx.stroke()
    }
  } else {
    // Matte polymer/modeling clay micro-dimples & subtle fingerprint grain
    for (let i = 0; i < 240; i++) {
      const x = (i * 53) % 256
      const y = (i * 97) % 256
      ctx.fillStyle = i % 2 === 0 ? 'rgba(0, 0, 0, 0.045)' : 'rgba(255, 255, 255, 0.06)'
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

  useEffect(() => {
    return () => {
      // Geometry disposal is managed when deleted in deleteRuntimeCraftObject
    }
  }, [obj.id])

  useFrame((_, delta) => {
    const live = myRoomRuntime.objects.get(obj.id)
    if (!live || !meshRef.current) return

    // Apply room surface gravity & bounce only when released (not actively held by player/AI)
    if (!live.isHeldByLocal && live.ownerId === null) {
      stepCraftObjectPhysics(
        {
          pos: live.pos,
          vel: live.vel,
          kind: live.kind,
          approxRadius: live.meshData.approxRadius,
        },
        myRoomRuntime.surfaces,
        delta
      )
    }

    meshRef.current.position.set(live.pos[0], live.pos[1], live.pos[2])
    meshRef.current.quaternion.set(live.quat[0], live.quat[1], live.quat[2], live.quat[3])
  })

  const isPaper = obj.kind === 'paper'

  return (
    <mesh ref={meshRef} geometry={obj.meshData.geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color={obj.color}
        map={isPaper ? paperTex : clayTex}
        roughness={isPaper ? 0.88 : 0.68}
        metalness={0.02}
        side={isPaper ? THREE.DoubleSide : THREE.FrontSide}
      />
    </mesh>
  )
}

export function CraftObjectsLayer() {
  // Subscribe cleanly only to structural list changes (add/remove), while vertices/transforms run zero-GC inside useFrame
  useMyRoomStore((s) => s.objectListVersion)

  const clayTex = useMemo(() => createMaterialTexture('clay'), [])
  const paperTex = useMemo(() => createMaterialTexture('paper'), [])

  useEffect(() => {
    return () => {
      clayTex.dispose()
      paperTex.dispose()
    }
  }, [clayTex, paperTex])

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
