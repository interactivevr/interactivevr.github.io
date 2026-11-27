import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { playMaterialActionSfx } from '../audio/myroomSfx'
import { TextLabel } from '../scene/TextLabel'
import { useGameStore } from '../store/useGameStore'
import {
  createClockFaceTexture,
  createFurnitureWoodTexture,
  createNatureSceneryTexture,
  createTVChannelTexture,
} from './roomDecorTextures'
import { clampInsideRoomWalls, findSupportingSurfaceY } from './roomPhysics'
import {
  ROOM_DECOR_CATALOG,
  RoomDecorKind,
  RoomSurfaceCollider,
  WALLMATE_SCENERY_NAMES,
} from './types'
import {
  clearAllMyRoomDecor,
  deleteRuntimeDecor,
  getCombinedRoomSurfaces,
  myRoomRuntime,
  RuntimeRoomDecor,
  spawnRuntimeDecor,
  stripDecorToNetState,
  useMyRoomStore,
} from './useMyRoomStore'

const _camPos = new THREE.Vector3()
const _camDir = new THREE.Vector3()

/**
 * Computes optimal AR placement for any Showcase item (Wallmates/Clocks snap flush to scanned walls;
 * Lamps/TVs/Plants snap onto scanned desks OR spawned AR Tables/Showcases; Furniture rests on floor).
 */
export function computeDecorPlacement(
  kind: RoomDecorKind,
  headPos: [number, number, number],
  headDir3D: [number, number, number],
  surfaces: readonly RoomSurfaceCollider[],
  floorY: number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
): { pos: [number, number, number]; yaw: number } {
  const spec = ROOM_DECOR_CATALOG[kind]
  const hy = spec.halfExtents[1]
  const hz = spec.halfExtents[2]

  const fwdLenXZ = Math.hypot(headDir3D[0], headDir3D[2]) || 1
  const fx = headDir3D[0] / fwdLenXZ
  const fz = headDir3D[2] / fwdLenXZ
  const faceUserYaw = Math.atan2(-fx, -fz)

  if (spec.mount === 'wall') {
    let bestWall: RoomSurfaceCollider | null = null
    let bestScore = Infinity
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i]
      if (s.orientation !== 'vertical') continue
      if (s.label !== 'wall' && s.halfU < 0.35) continue
      const dx = s.center[0] - headPos[0]
      const dz = s.center[2] - headPos[2]
      const dist = Math.hypot(dx, dz)
      if (dist < 0.8 || dist > 4.6) continue
      const dot = (dx * fx + dz * fz) / dist
      if (dot < 0.25) continue
      const score = dist - dot * 1.4
      if (score < bestScore) {
        bestScore = score
        bestWall = s
      }
    }

    const mountY = floorY + (kind === 'clock' ? 1.88 : 1.56)
    if (bestWall) {
      const toUserX = headPos[0] - bestWall.center[0]
      const toUserZ = headPos[2] - bestWall.center[2]
      const inwardSign =
        toUserX * bestWall.normal[0] + toUserZ * bestWall.normal[2] >= 0 ? 1 : -1
      const nx = bestWall.normal[0] * inwardSign
      const nz = bestWall.normal[2] * inwardSign
      const projU =
        (headPos[0] + fx * 1.8 - bestWall.center[0]) * bestWall.uAxis[0] +
        (headPos[2] + fz * 1.8 - bestWall.center[2]) * bestWall.uAxis[2]
      const clampedU = Math.max(-bestWall.halfU * 0.72, Math.min(bestWall.halfU * 0.72, projU))
      return {
        pos: [
          bestWall.center[0] + bestWall.uAxis[0] * clampedU + nx * (hz + 0.015),
          mountY,
          bestWall.center[2] + bestWall.uAxis[2] * clampedU + nz * (hz + 0.015),
        ],
        yaw: Math.atan2(nx, nz),
      }
    }

    const [wx, wz] = clampInsideRoomWalls(headPos[0] + fx * 1.65, headPos[2] + fz * 1.65, 0.25, surfaces, bounds)
    return { pos: [wx, mountY, wz], yaw: faceUserYaw }
  }

  if (spec.mount === 'tabletop') {
    // Raycast onto real room tables OR spawned AR Tables / Showcases first!
    let bestT = 2.6
    let hitPt: [number, number, number] | null = null
    if (Math.abs(headDir3D[1]) > 0.05) {
      for (let i = 0; i < surfaces.length; i++) {
        const s = surfaces[i]
        if (s.orientation !== 'horizontal' || s.label === 'ceiling') continue
        const t = (s.maxY - headPos[1]) / headDir3D[1]
        if (t > 0.3 && t < bestT) {
          const hx = headPos[0] + headDir3D[0] * t
          const hzPt = headPos[2] + headDir3D[2] * t
          if (
            Math.abs(hx - s.center[0]) <= s.halfExtents[0] &&
            Math.abs(hzPt - s.center[2]) <= s.halfExtents[2]
          ) {
            bestT = t
            hitPt = [hx, s.maxY + hy, hzPt]
          }
        }
      }
    }
    if (hitPt) {
      return { pos: hitPt, yaw: faceUserYaw }
    }
    // Check directly ahead ~1.15m for any Table / Showcase / Desk top even if looking horizontally!
    const ax = headPos[0] + fx * 1.15
    const az = headPos[2] + fz * 1.15
    const sup = findSupportingSurfaceY(ax, az, surfaces, floorY, 1.85)
    const [cx, cz] = clampInsideRoomWalls(ax, az, 0.3, surfaces, bounds)
    return { pos: [cx, sup.y + hy, cz], yaw: faceUserYaw }
  }

  // Floor furniture (Table, Showcase, Sofa, Rug)
  const reach = kind === 'sofa' || kind === 'rug' ? 1.55 : 1.3
  const [fxPos, fzPos] = clampInsideRoomWalls(
    headPos[0] + fx * reach,
    headPos[2] + fz * reach,
    Math.min(spec.halfExtents[0], spec.halfExtents[2]) + 0.08,
    surfaces,
    bounds
  )
  return {
    pos: [fxPos, floorY + hy, fzPos],
    yaw: faceUserYaw,
  }
}

/**
 * Nearest scanned wall snap helper used when dropping moved Wallmates, Clocks, or TVs.
 */
export function snapDecorNearWallIfClose(
  decor: RuntimeRoomDecor,
  surfaces: readonly RoomSurfaceCollider[],
  maxSnapDist = 0.34
): boolean {
  const spec = ROOM_DECOR_CATALOG[decor.kind]
  if (spec.mount !== 'wall' && decor.kind !== 'tv') return false

  let closestWall: RoomSurfaceCollider | null = null
  let closestDist = maxSnapDist
  let closestNx = 0
  let closestNz = 1
  let projectedU = 0

  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i]
    if (s.orientation !== 'vertical') continue
    const dx = decor.pos[0] - s.center[0]
    const dz = decor.pos[2] - s.center[2]
    const uProj = dx * s.uAxis[0] + dz * s.uAxis[2]
    if (Math.abs(uProj) > s.halfU + 0.15) continue
    const signed = dx * s.normal[0] + dz * s.normal[2]
    const absD = Math.abs(signed)
    if (absD < closestDist) {
      closestDist = absD
      closestWall = s
      const sign = signed >= 0 ? 1 : -1
      closestNx = s.normal[0] * sign
      closestNz = s.normal[2] * sign
      projectedU = uProj
    }
  }

  if (!closestWall) return false
  const offset = spec.halfExtents[2] * decor.scale + 0.015
  decor.pos[0] = closestWall.center[0] + closestWall.uAxis[0] * projectedU + closestNx * offset
  decor.pos[2] = closestWall.center[2] + closestWall.uAxis[2] * projectedU + closestNz * offset
  decor.yaw = Math.atan2(closestNx, closestNz)
  return true
}

function SingleDecorItemView({
  item,
  woodTex,
}: {
  item: RuntimeRoomDecor
  woodTex: THREE.CanvasTexture
}) {
  const grpRef = useRef<THREE.Group>(null)
  const clockTexRef = useRef<THREE.CanvasTexture | null>(null)
  const clockMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const lastSecRef = useRef(-1)

  const selectedDecorId = useMyRoomStore((s) => s.selectedDecorId)
  const isSelected = selectedDecorId === item.id

  const screenTex = useMemo(() => {
    if (item.kind === 'wallmate') return createNatureSceneryTexture(item.variantIdx)
    if (item.kind === 'tv') return createTVChannelTexture(item.variantIdx, item.powerOn)
    return null
  }, [item.kind, item.variantIdx, item.powerOn])

  useEffect(() => {
    return () => {
      screenTex?.dispose()
      clockTexRef.current?.dispose()
    }
  }, [screenTex])

  useFrame(() => {
    const live = myRoomRuntime.decorItems.get(item.id)
    if (!live || !grpRef.current) return
    grpRef.current.position.set(live.pos[0], live.pos[1], live.pos[2])
    grpRef.current.rotation.set(0, live.yaw, 0)
    grpRef.current.scale.setScalar(live.scale)

    if (live.kind === 'clock' && clockMatRef.current) {
      const now = new Date()
      const sec = now.getSeconds()
      if (sec !== lastSecRef.current) {
        lastSecRef.current = sec
        clockTexRef.current?.dispose()
        clockTexRef.current = createClockFaceTexture(now.getHours(), now.getMinutes(), sec)
        clockMatRef.current.map = clockTexRef.current
        clockMatRef.current.needsUpdate = true
      }
    }
  })

  const selectOrInteract = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    const live = myRoomRuntime.decorItems.get(item.id)
    if (!live) return
    useMyRoomStore.getState().setSelectedDecorId(item.id)
    if (live.kind === 'lamp' || live.kind === 'tv') {
      live.powerOn = !live.powerOn
      live.epoch += 1
      live.timestamp = Date.now()
      useMyRoomStore.getState().bumpDecorVersion()
      myRoomRuntime.onDecorSend?.(stripDecorToNetState(live))
      playMaterialActionSfx('metal', 'watch_tap')
    } else if (live.kind === 'wallmate') {
      live.variantIdx = (live.variantIdx + 1) % WALLMATE_SCENERY_NAMES.length
      live.epoch += 1
      useMyRoomStore.getState().bumpDecorVersion()
      myRoomRuntime.onDecorSend?.(stripDecorToNetState(live))
      playMaterialActionSfx('paper', 'fold')
    }
  }

  const spec = ROOM_DECOR_CATALOG[item.kind]

  return (
    <group
      ref={grpRef}
      position={item.pos}
      rotation={[0, item.yaw, 0]}
      scale={item.scale}
      onClick={selectOrInteract}
    >
      {/* Wallmate (Nature Scenery Framed Canvas Painting) */}
      {item.kind === 'wallmate' && (
        <group>
          {/* Gallery wooden frame box */}
          <mesh position={[0, 0, -0.012]} castShadow receiveShadow>
            <boxGeometry args={[0.92, 0.64, 0.036]} />
            <meshStandardMaterial color={item.color} map={woodTex} roughness={0.55} />
          </mesh>
          {/* Cream matte border */}
          <mesh position={[0, 0, 0.008]}>
            <boxGeometry args={[0.84, 0.56, 0.008]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.85} />
          </mesh>
          {/* Scenic nature artwork */}
          <mesh position={[0, 0, 0.014]}>
            <planeGeometry args={[0.78, 0.5]} />
            <meshBasicMaterial map={screenTex ?? undefined} />
          </mesh>
        </group>
      )}

      {/* Designer Table Lamp with Warm Glowing Lampshade */}
      {item.kind === 'lamp' && (
        <group>
          {/* Weighted Base */}
          <mesh position={[0, -0.195, 0]} castShadow>
            <cylinderGeometry args={[0.082, 0.095, 0.03, 20]} />
            <meshStandardMaterial color="#b45309" metalness={0.75} roughness={0.28} />
          </mesh>
          {/* Brass Stem */}
          <mesh position={[0, -0.06, 0]} castShadow>
            <cylinderGeometry args={[0.014, 0.016, 0.25, 12]} />
            <meshStandardMaterial color="#d97706" metalness={0.85} roughness={0.24} />
          </mesh>
          {/* Inner Warm Bulb */}
          <mesh position={[0, 0.08, 0]}>
            <sphereGeometry args={[0.032, 12, 10]} />
            <meshStandardMaterial
              color={item.powerOn ? '#fef08a' : '#94a3b8'}
              emissive={item.powerOn ? '#fde047' : '#000000'}
              emissiveIntensity={item.powerOn ? 1.8 : 0}
            />
          </mesh>
          {/* Pleated Linen Drum Lampshade */}
          <mesh position={[0, 0.1, 0]} castShadow>
            <cylinderGeometry args={[0.105, 0.14, 0.18, 22, 1, false]} />
            <meshStandardMaterial
              color={item.color}
              emissive={item.powerOn ? '#f59e0b' : '#000000'}
              emissiveIntensity={item.powerOn ? 0.55 : 0}
              roughness={0.8}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Downward warm light pool aura when lamp is switched ON */}
          {item.powerOn && (
            <mesh position={[0, -0.04, 0]}>
              <coneGeometry args={[0.24, 0.34, 18, 1, true]} />
              <meshBasicMaterial
                color="#fef08a"
                transparent
                opacity={0.1}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>
      )}

      {/* Slim 4K Smart TV with Animated Ambient Channels & Stand Feet */}
      {item.kind === 'tv' && (
        <group>
          <mesh position={[0, 0.03, -0.012]} castShadow>
            <boxGeometry args={[0.96, 0.54, 0.028]} />
            <meshStandardMaterial color="#0f172a" metalness={0.6} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.03, 0.005]}>
            <planeGeometry args={[0.91, 0.49]} />
            <meshStandardMaterial
              map={screenTex ?? undefined}
              emissive="#ffffff"
              emissiveMap={screenTex ?? undefined}
              emissiveIntensity={item.powerOn ? 0.72 : 0}
              roughness={item.powerOn ? 0.2 : 0.08}
              metalness={item.powerOn ? 0.05 : 0.4}
            />
          </mesh>
          {/* Power LED dot */}
          <mesh position={[0.42, -0.228, 0.005]}>
            <sphereGeometry args={[0.006, 8, 6]} />
            <meshBasicMaterial color={item.powerOn ? '#22c55e' : '#ef4444'} />
          </mesh>
          {/* Dual Y-Legs */}
          {[-0.28, 0.28].map((lx, k) => (
            <group key={k} position={[lx, -0.265, 0]}>
              <mesh>
                <boxGeometry args={[0.025, 0.06, 0.022]} />
                <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.25} />
              </mesh>
              <mesh position={[0, -0.025, 0.01]}>
                <boxGeometry args={[0.025, 0.014, 0.14]} />
                <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* Designer Dining / Coffee / Work Table (Solid Tabletop Surface for Lamps, TV & Crafts!) */}
      {item.kind === 'table' && (
        <group>
          {/* Chamfered Wood Tabletop flush at +hy = +0.37 */}
          <mesh position={[0, 0.345, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.96, 0.05, 0.58]} />
            <meshStandardMaterial color={item.color} map={woodTex} roughness={0.52} />
          </mesh>
          {/* Recessed Steel Under-Apron Frame */}
          <mesh position={[0, 0.295, 0]}>
            <boxGeometry args={[0.84, 0.05, 0.46]} />
            <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.45} />
          </mesh>
          {/* 4 Tapered Legs reaching floor (-0.37) */}
          {[
            [-0.4, -0.21],
            [0.4, -0.21],
            [-0.4, 0.21],
            [0.4, 0.21],
          ].map(([lx, lz], idx) => (
            <mesh key={idx} position={[lx, -0.015, lz]} castShadow>
              <cylinderGeometry args={[0.026, 0.018, 0.69, 12]} />
              <meshStandardMaterial color={item.color} map={woodTex} roughness={0.55} />
            </mesh>
          ))}
        </group>
      )}

      {/* Tall Modern Curio Display Showcase Cabinet (Top & Middle Shelf Support Surfaces!) */}
      {item.kind === 'showcase' && (
        <group>
          {/* Top Cap Board (+hy = +0.72) */}
          <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.72, 0.04, 0.36]} />
            <meshStandardMaterial color={item.color} map={woodTex} roughness={0.5} />
          </mesh>
          {/* Middle Display Shelf */}
          <mesh position={[0, -0.06, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.66, 0.032, 0.33]} />
            <meshStandardMaterial color="#bae6fd" transparent opacity={0.62} roughness={0.12} />
          </mesh>
          {/* Lower Base Plinth */}
          <mesh position={[0, -0.66, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.72, 0.12, 0.36]} />
            <meshStandardMaterial color={item.color} map={woodTex} roughness={0.5} />
          </mesh>
          {/* Left & Right Side Uprights */}
          {[-0.34, 0.34].map((sx, idx) => (
            <mesh key={idx} position={[sx, 0.02, 0]} castShadow>
              <boxGeometry args={[0.04, 1.38, 0.35]} />
              <meshStandardMaterial color={item.color} map={woodTex} roughness={0.55} />
            </mesh>
          ))}
          {/* Back Panel */}
          <mesh position={[0, 0.02, -0.165]} receiveShadow>
            <boxGeometry args={[0.68, 1.38, 0.02]} />
            <meshStandardMaterial color="#1e1b18" roughness={0.78} />
          </mesh>
          {/* Warm Top Interior Showcase LED Strip */}
          <mesh position={[0, 0.665, 0.12]}>
            <boxGeometry args={[0.62, 0.016, 0.02]} />
            <meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={item.powerOn ? 1.35 : 0} />
          </mesh>
        </group>
      )}

      {/* Upholstered Cozy 2-Seat Sofa */}
      {item.kind === 'sofa' && (
        <group>
          {/* Plinth & Seat Deck */}
          <mesh position={[0, -0.14, 0.02]} castShadow receiveShadow>
            <boxGeometry args={[1.34, 0.24, 0.66]} />
            <meshStandardMaterial color={item.color} roughness={0.85} />
          </mesh>
          {/* Twin Plush Seat Cushions */}
          {[-0.29, 0.29].map((cx, k) => (
            <mesh key={k} position={[cx, 0.02, 0.05]} castShadow receiveShadow>
              <boxGeometry args={[0.56, 0.12, 0.56]} />
              <meshStandardMaterial color={item.color} roughness={0.9} />
            </mesh>
          ))}
          {/* Backrest */}
          <mesh position={[0, 0.18, -0.24]} rotation={[-0.1, 0, 0]} castShadow>
            <boxGeometry args={[1.34, 0.42, 0.16]} />
            <meshStandardMaterial color={item.color} roughness={0.88} />
          </mesh>
          {/* Left & Right Armrests */}
          {[-0.6, 0.6].map((ax, k) => (
            <mesh key={k} position={[ax, 0.04, 0.02]} castShadow>
              <boxGeometry args={[0.14, 0.34, 0.64]} />
              <meshStandardMaterial color={item.color} roughness={0.88} />
            </mesh>
          ))}
          {/* Accent Throw Pillows */}
          <mesh position={[-0.44, 0.16, -0.06]} rotation={[0.25, 0.3, -0.2]}>
            <boxGeometry args={[0.22, 0.22, 0.08]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.85} />
          </mesh>
          <mesh position={[0.44, 0.16, -0.06]} rotation={[0.25, -0.3, 0.2]}>
            <boxGeometry args={[0.22, 0.22, 0.08]} />
            <meshStandardMaterial color="#fb7185" roughness={0.85} />
          </mesh>
          {/* 4 Dark Oak Feet */}
          {[
            [-0.58, -0.24],
            [0.58, -0.24],
            [-0.58, 0.26],
            [0.58, 0.26],
          ].map(([fx, fz], k) => (
            <mesh key={k} position={[fx, -0.32, fz]}>
              <cylinderGeometry args={[0.024, 0.016, 0.12, 10]} />
              <meshStandardMaterial color="#78350f" roughness={0.6} />
            </mesh>
          ))}
        </group>
      )}

      {/* Ceramic Potted Tropical Plant */}
      {item.kind === 'plant' && (
        <group>
          <mesh position={[0, -0.14, 0]} castShadow>
            <cylinderGeometry args={[0.115, 0.085, 0.22, 18]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.45} />
          </mesh>
          <mesh position={[0, -0.04, 0]}>
            <cylinderGeometry args={[0.105, 0.105, 0.02, 16]} />
            <meshStandardMaterial color="#3f2817" roughness={0.95} />
          </mesh>
          {[0, 0.9, 1.8, 2.7, 3.6, 4.5, 5.4].map((ang, k) => (
            <group key={k} rotation={[0, ang, 0]} position={[0, -0.02, 0]}>
              <mesh position={[0.06, 0.11 + (k % 2) * 0.05, 0]} rotation={[0, 0, -0.42 - (k % 3) * 0.14]}>
                <capsuleGeometry args={[0.032, 0.16, 4, 8]} />
                <meshStandardMaterial color={k % 2 === 0 ? item.color : '#16a34a'} roughness={0.65} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* Live Working Analog Wall Clock */}
      {item.kind === 'clock' && (
        <group>
          <mesh rotation={[Math.PI * 0.5, 0, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.18, 0.032, 28]} />
            <meshStandardMaterial color={item.color} metalness={0.82} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0, 0.018]}>
            <circleGeometry args={[0.162, 28]} />
            <meshBasicMaterial ref={clockMatRef} />
          </mesh>
        </group>
      )}

      {/* Woven Textured Floor Area Rug */}
      {item.kind === 'rug' && (
        <group>
          <mesh receiveShadow>
            <boxGeometry args={[1.6, 0.016, 1.1]} />
            <meshStandardMaterial color={item.color} roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.002, 0]} receiveShadow>
            <boxGeometry args={[1.44, 0.016, 0.94]} />
            <meshStandardMaterial color="#f5d0a9" roughness={0.94} />
          </mesh>
        </group>
      )}

      {/* Selection Corner Halo Indicator */}
      {isSelected && (
        <mesh position={[0, -spec.halfExtents[1] + 0.01, 0]} rotation={[-Math.PI * 0.5, 0, 0]}>
          <ringGeometry
            args={[
              Math.max(spec.halfExtents[0], spec.halfExtents[2]) + 0.04,
              Math.max(spec.halfExtents[0], spec.halfExtents[2]) + 0.075,
              32,
            ]}
          />
          <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.72} />
        </mesh>
      )}
    </group>
  )
}

export function RoomDecorLayer() {
  useMyRoomStore((s) => s.decorVersion)
  const woodTex = useMemo(() => createFurnitureWoodTexture('#a16228'), [])
  useEffect(() => () => woodTex.dispose(), [woodTex])

  const items = Array.from(myRoomRuntime.decorItems.values())

  return (
    <group>
      {items.map((item) => (
        <SingleDecorItemView key={item.id} item={item} woodTex={woodTex} />
      ))}
    </group>
  )
}

function ShowcaseButton({
  position,
  label,
  color,
  width = 0.25,
  onClick,
}: {
  position: [number, number, number]
  label: string
  color: string
  width?: number
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <group position={position}>
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[width, 0.088, 0.022]} />
        <meshStandardMaterial
          color={hovered ? '#ffffff' : color}
          emissive={color}
          emissiveIntensity={hovered ? 0.65 : 0.28}
        />
      </mesh>
      <TextLabel position={[0, 0, 0.015]} fontSize={0.023} color={hovered ? '#0f172a' : '#f8fafc'}>
        {label}
      </TextLabel>
    </group>
  )
}

/**
 * Interactive Room Redesign Showcase Catalog Panel:
 * Spawn & customize Wallmate (Nature Scenery), Table Lamp, Smart TV, Table, Showcase, Sofa, Plant, Clock, Rug.
 */
export function InARShowcasePanel() {
  const showcaseOpen = useMyRoomStore((s) => s.showcaseOpen)
  const decorCount = useMyRoomStore((s) => s.decorCount)
  const selectedDecorId = useMyRoomStore((s) => s.selectedDecorId)
  useMyRoomStore((s) => s.decorVersion)

  const localPeerId = useGameStore((s) => s.localPeerId)
  const camera = useThree((s) => s.camera)

  const panelPoseRef = useRef<{ pos: [number, number, number]; yaw: number }>({
    pos: [0.56, 1.18, -0.78],
    yaw: -0.45,
  })
  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (showcaseOpen && !prevOpenRef.current) {
      camera.getWorldPosition(_camPos)
      camera.getWorldDirection(_camDir)
      const fwdXZ = new THREE.Vector3(_camDir.x, 0, _camDir.z)
      if (fwdXZ.lengthSq() < 1e-4) fwdXZ.set(0, 0, -1)
      fwdXZ.normalize()
      const rightX = -fwdXZ.z
      const rightZ = fwdXZ.x
      panelPoseRef.current = {
        pos: [
          _camPos.x + fwdXZ.x * 0.92 + rightX * 0.44,
          Math.max(myRoomRuntime.floorY + 0.88, _camPos.y - 0.1),
          _camPos.z + fwdXZ.z * 0.92 + rightZ * 0.44,
        ],
        yaw: Math.atan2(-fwdXZ.x, -fwdXZ.z) - 0.42,
      }
    }
    prevOpenRef.current = showcaseOpen
  }, [showcaseOpen, camera])

  if (!showcaseOpen) return null

  const spawnDecor = (kind: RoomDecorKind) => {
    camera.getWorldPosition(_camPos)
    camera.getWorldDirection(_camDir)
    const surfaces = getCombinedRoomSurfaces()
    const placement = computeDecorPlacement(
      kind,
      [_camPos.x, _camPos.y, _camPos.z],
      [_camDir.x, _camDir.y, _camDir.z],
      surfaces,
      myRoomRuntime.floorY,
      myRoomRuntime.roomBoundsXZ
    )
    const variantIdx =
      kind === 'wallmate' ? Math.floor(Math.random() * WALLMATE_SCENERY_NAMES.length) : 0
    spawnRuntimeDecor({
      creatorId: localPeerId || 'local',
      kind,
      variantIdx,
      pos: placement.pos,
      yaw: placement.yaw,
      broadcast: true,
    })
    playMaterialActionSfx('wood', 'fold')
    useMyRoomStore
      .getState()
      .setStatusHint(
        `Placed ${ROOM_DECOR_CATALOG[kind].label}! Grab to reposition or customize via Showcase.`
      )
  }

  const selItem = selectedDecorId ? myRoomRuntime.decorItems.get(selectedDecorId) : null

  return (
    <group position={panelPoseRef.current.pos} rotation={[0, panelPoseRef.current.yaw, 0]}>
      <mesh>
        <boxGeometry args={[0.92, 0.88, 0.025]} />
        <meshStandardMaterial color="#0b1220" transparent opacity={0.94} roughness={0.48} />
      </mesh>
      <TextLabel position={[0, 0.37, 0.018]} fontSize={0.03} color="#fbbf24">
        {`ROOM REDESIGN SHOWCASE  •  PLACED: ${decorCount}`}
      </TextLabel>
      <TextLabel position={[0, 0.315, 0.018]} fontSize={0.02} color="#e2e8f0">
        {selItem
          ? `Selected: ${ROOM_DECOR_CATALOG[selItem.kind].label}${
              selItem.kind === 'wallmate'
                ? ` (${WALLMATE_SCENERY_NAMES[selItem.variantIdx % WALLMATE_SCENERY_NAMES.length]})`
                : ''
            }`
          : 'Tap any decor item to add or place onto scanned walls, tables & floor'}
      </TextLabel>

      {/* Catalog Row 1: Wallmate, Table Lamp, Smart TV */}
      <ShowcaseButton
        position={[-0.28, 0.21, 0.016]}
        label="WALLMATE (NATURE)"
        color="#059669"
        onClick={() => spawnDecor('wallmate')}
      />
      <ShowcaseButton
        position={[0, 0.21, 0.016]}
        label="TABLE LAMP"
        color="#d97706"
        onClick={() => spawnDecor('lamp')}
      />
      <ShowcaseButton
        position={[0.28, 0.21, 0.016]}
        label="SMART TV"
        color="#2563eb"
        onClick={() => spawnDecor('tv')}
      />

      {/* Catalog Row 2: Table, Showcase, Sofa */}
      <ShowcaseButton
        position={[-0.28, 0.095, 0.016]}
        label="TABLE"
        color="#92400e"
        onClick={() => spawnDecor('table')}
      />
      <ShowcaseButton
        position={[0, 0.095, 0.016]}
        label="SHOWCASE"
        color="#78350f"
        onClick={() => spawnDecor('showcase')}
      />
      <ShowcaseButton
        position={[0.28, 0.095, 0.016]}
        label="LOUNGE SOFA"
        color="#475569"
        onClick={() => spawnDecor('sofa')}
      />

      {/* Catalog Row 3: Plant, Wall Clock, Area Rug */}
      <ShowcaseButton
        position={[-0.28, -0.02, 0.016]}
        label="POTTED PLANT"
        color="#15803d"
        onClick={() => spawnDecor('plant')}
      />
      <ShowcaseButton
        position={[0, -0.02, 0.016]}
        label="WALL CLOCK"
        color="#4f46e5"
        onClick={() => spawnDecor('clock')}
      />
      <ShowcaseButton
        position={[0.28, -0.02, 0.016]}
        label="AREA RUG"
        color="#9a3412"
        onClick={() => spawnDecor('rug')}
      />

      {/* Customization Row 4: Scene/Channel/Color, Power On/Off, Rotate +45° */}
      <ShowcaseButton
        position={[-0.28, -0.145, 0.016]}
        label={selItem?.kind === 'wallmate' ? 'NEXT SCENERY' : selItem?.kind === 'tv' ? 'NEXT CHANNEL' : 'STYLE / COLOR'}
        color="#0284c7"
        onClick={() => {
          if (!selItem) return
          const colors = ['#92400e', '#5c3419', '#0f172a', '#f8fafc', '#334155', '#15803d', '#9a3412']
          if (selItem.kind === 'wallmate' || selItem.kind === 'tv') {
            selItem.variantIdx = (selItem.variantIdx + 1) % WALLMATE_SCENERY_NAMES.length
          } else {
            selItem.color = colors[(colors.indexOf(selItem.color) + 1) % colors.length]
          }
          selItem.epoch += 1
          useMyRoomStore.getState().bumpDecorVersion()
          myRoomRuntime.onDecorSend?.(stripDecorToNetState(selItem))
        }}
      />
      <ShowcaseButton
        position={[0, -0.145, 0.016]}
        label={selItem ? (selItem.powerOn ? 'LIGHT/TV: ON' : 'LIGHT/TV: OFF') : 'POWER TOGGLE'}
        color={selItem?.powerOn ? '#eab308' : '#334155'}
        onClick={() => {
          if (!selItem) return
          selItem.powerOn = !selItem.powerOn
          selItem.epoch += 1
          useMyRoomStore.getState().bumpDecorVersion()
          myRoomRuntime.onDecorSend?.(stripDecorToNetState(selItem))
        }}
      />
      <ShowcaseButton
        position={[0.28, -0.145, 0.016]}
        label="ROTATE +45°"
        color="#0d9488"
        onClick={() => {
          if (!selItem) return
          selItem.yaw += Math.PI * 0.25
          selItem.epoch += 1
          useMyRoomStore.getState().bumpDecorVersion()
          myRoomRuntime.onDecorSend?.(stripDecorToNetState(selItem))
        }}
      />

      {/* Utility Row 5: Remove Selected, Clear All Decor, Close Panel */}
      <ShowcaseButton
        position={[-0.28, -0.26, 0.016]}
        label="DELETE SEL"
        color="#d97706"
        onClick={() => {
          if (selectedDecorId) deleteRuntimeDecor(selectedDecorId, true)
        }}
      />
      <ShowcaseButton
        position={[0, -0.26, 0.016]}
        label="CLEAR DECOR"
        color="#b91c1c"
        onClick={() => clearAllMyRoomDecor()}
      />
      <ShowcaseButton
        position={[0.28, -0.26, 0.016]}
        label="CLOSE PANEL"
        color="#64748b"
        onClick={() => useMyRoomStore.getState().setShowcaseOpen(false)}
      />
    </group>
  )
}
