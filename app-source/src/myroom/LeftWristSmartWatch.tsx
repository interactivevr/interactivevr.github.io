import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { playMaterialActionSfx } from '../audio/myroomSfx'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { ARIconKind, getWristTileTexture } from './arIconCanvas'
import { WristToolKind } from './types'
import { myRoomRuntime, useMyRoomStore } from './useMyRoomStore'

const WATCH_TOOLS: ReadonlyArray<{
  id: WristToolKind
  label: string
  icon: ARIconKind
  color: string
  offset: [number, number, number]
}> = [
  { id: 'pen', label: 'PEN', icon: 'pen', color: '#2563eb', offset: [-0.06, 0.044, 0.02] },
  { id: 'knife', label: 'KNIFE', icon: 'knife', color: '#dc2626', offset: [-0.02, 0.044, 0.02] },
  { id: 'axe', label: 'AXE', icon: 'axe', color: '#d97706', offset: [0.02, 0.044, 0.02] },
  { id: 'tester', label: 'TESTER', icon: 'tester', color: '#eab308', offset: [0.06, 0.044, 0.02] },
  { id: 'none', label: 'HANDS', icon: 'hands', color: '#475569', offset: [-0.06, 0.004, 0.02] },
]

const INK_COLORS = ['#1e3a8a', '#0f172a', '#dc2626', '#15803d'] as const

const _wristWorldPos = new THREE.Vector3()
const _wristWorldQuat = new THREE.Quaternion()
const _wristOffset = new THREE.Vector3()
const _btnWorld = new THREE.Vector3()
const _watchFaceWorld = new THREE.Vector3()
const _toolGripWorld = new THREE.Vector3()
const _toolQuat = new THREE.Quaternion()

/**
 * Computes active right-hand tool tip & axis in world space without React re-renders.
 */
export function computeRightToolWorldTransform(
  tool: WristToolKind,
  handPos: [number, number, number],
  handQuat: [number, number, number, number],
  hasController: boolean
): {
  tipPos: [number, number, number]
  cutNormal: [number, number, number]
} {
  _toolQuat.set(handQuat[0], handQuat[1], handQuat[2], handQuat[3])

  // Forward projection along pointer/grip direction (knife/axe blade, pen nib, or tester probe tip)
  const len = tool === 'axe' ? 0.21 : tool === 'knife' ? 0.165 : tool === 'tester' ? 0.175 : 0.125
  const fwdLocal = hasController
    ? new THREE.Vector3(0, -0.02, -len)
    : new THREE.Vector3(0, -0.015, -len)
  fwdLocal.applyQuaternion(_toolQuat)

  // Cut plane normal is perpendicular to blade edge (side-to-side X axis of right hand/blade)
  const bladeNormalLocal = new THREE.Vector3(1, 0, 0).applyQuaternion(_toolQuat).normalize()

  return {
    tipPos: [handPos[0] + fwdLocal.x, handPos[1] + fwdLocal.y, handPos[2] + fwdLocal.z],
    cutNormal: [bladeNormalLocal.x, bladeNormalLocal.y, bladeNormalLocal.z],
  }
}

/**
 * Interactive 3D Smart Watch attached cleanly to the player's left wrist.
 * Clicking/poking the watch face opens/closes Machinery selection (Pen, Knife, Axe, Electric Tester, Hands).
 */
export function LeftWristSmartWatch() {
  const activeTool = useMyRoomStore((s) => s.activeTool)
  const watchMenuOpen = useMyRoomStore((s) => s.watchMenuOpen)
  const activeInkColor = useMyRoomStore((s) => s.activeInkColor)
  const testerReadout = useMyRoomStore((s) => s.testerReadout)
  const testerIsLive = useMyRoomStore((s) => s.testerIsLive)
  const vrMenuVisible = useGameStore((s) => s.vrMenuVisible)

  const watchRootRef = useRef<THREE.Group>(null)
  const faceMeshRef = useRef<THREE.Mesh>(null)
  const buttonMeshRefs = useRef<Record<string, THREE.Mesh | null>>({})
  const lastTapMsRef = useRef(0)
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null)

  const screenCanvas = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return { canvas, ctx, tex }
  }, [])

  useEffect(() => {
    return () => {
      screenCanvas.tex.dispose()
    }
  }, [screenCanvas])

  useEffect(() => {
    const { ctx, tex } = screenCanvas
    ctx.fillStyle = '#090d16'
    ctx.fillRect(0, 0, 256, 256)

    // Watch bezel accent ring
    ctx.strokeStyle = testerIsLive && activeTool === 'tester' ? '#22c55e' : '#38bdf8'
    ctx.lineWidth = 8
    ctx.strokeRect(10, 10, 236, 236)

    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    ctx.fillStyle = '#f8fafc'
    ctx.font = 'bold 54px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${hh}:${mm}`, 128, 78)

    ctx.fillStyle = activeTool === 'none' ? '#94a3b8' : '#38bdf8'
    ctx.font = 'bold 26px sans-serif'
    ctx.fillText(`TOOL: ${activeTool.toUpperCase()}`, 128, 126)

    if (activeTool === 'tester') {
      ctx.fillStyle = testerIsLive ? '#22c55e' : '#facc15'
      ctx.font = 'bold 21px sans-serif'
      ctx.fillText(testerReadout.slice(0, 20), 128, 168)
    } else if (activeTool === 'pen') {
      ctx.fillStyle = activeInkColor
      ctx.fillRect(72, 144, 112, 22)
      ctx.fillStyle = '#e2e8f0'
      ctx.font = 'bold 18px sans-serif'
      ctx.fillText('INK READY', 128, 192)
    } else {
      ctx.fillStyle = '#fde047'
      ctx.font = 'bold 20px sans-serif'
      ctx.fillText(watchMenuOpen ? 'TAP TOOL ABOVE' : 'TAP WATCH MENU', 128, 174)
    }

    ctx.fillStyle = '#64748b'
    ctx.font = '16px sans-serif'
    ctx.fillText('MR WORKBENCH OS', 128, 224)
    tex.needsUpdate = true
  }, [screenCanvas, activeTool, watchMenuOpen, activeInkColor, testerReadout, testerIsLive])

  const selectTool = (tool: WristToolKind) => {
    playMaterialActionSfx('metal', 'watch_tap')
    const store = useMyRoomStore.getState()
    store.setActiveTool(tool)
    if (tool === 'tester') {
      store.setTesterState('TOUCH METAL/OBJECT', false)
      store.setStatusHint('Electric Tester active: touch probe tip onto Metal or Wood!')
    } else if (tool === 'pen') {
      store.setStatusHint('Pen ready: bring nib near any Paper sheet to write!')
    } else if (tool === 'knife') {
      store.setStatusHint('Knife equipped: slice across Wood or Paper to cut cleanly!')
    } else if (tool === 'axe') {
      store.setStatusHint('Axe equipped: swing axe head through Wood to chop!')
    } else {
      store.setStatusHint('Hands free: pinch, grab, fold Paper, or squeeze Clay')
    }
  }

  useFrame(() => {
    const root = watchRootRef.current
    if (!root) return

    const wp = myRoomRuntime.leftWristPose
    const lp = runtimeState.localPose
    if (wp.valid) {
      _wristWorldPos.set(wp.pos[0], wp.pos[1], wp.pos[2])
      _wristWorldQuat.set(wp.quat[0], wp.quat[1], wp.quat[2], wp.quat[3])
      // Dorsal back of left wrist + tilted slightly toward eyes
      _wristOffset.set(0.008, 0.024, 0.015).applyQuaternion(_wristWorldQuat)
      root.position.copy(_wristWorldPos).add(_wristOffset)
      root.quaternion.copy(_wristWorldQuat)
      root.rotateX(-0.35)
    } else {
      // Fallback anchored slightly behind left controller grip
      _wristWorldPos.set(lp.leftPos[0], lp.leftPos[1], lp.leftPos[2])
      _wristWorldQuat.set(lp.leftQuat[0], lp.leftQuat[1], lp.leftQuat[2], lp.leftQuat[3])
      _wristOffset.set(0.018, 0.028, 0.055).applyQuaternion(_wristWorldQuat)
      root.position.copy(_wristWorldPos).add(_wristOffset)
      root.quaternion.copy(_wristWorldQuat)
      root.rotateX(-0.45)
    }

    // Finger-poke / right-hand tap interaction directly on watch face & tray tiles
    const nowMs = performance.now()
    if (nowMs - lastTapMsRef.current < 380) return

    const pokePos = myRoomRuntime.rightIndexTip.valid ? myRoomRuntime.rightIndexTip.pos : lp.rightPos

    if (watchMenuOpen) {
      for (let i = 0; i < WATCH_TOOLS.length; i++) {
        const item = WATCH_TOOLS[i]
        const mesh = buttonMeshRefs.current[item.id]
        if (!mesh) continue
        mesh.getWorldPosition(_btnWorld)
        const d = Math.hypot(pokePos[0] - _btnWorld.x, pokePos[1] - _btnWorld.y, pokePos[2] - _btnWorld.z)
        if (d < 0.03) {
          lastTapMsRef.current = nowMs
          selectTool(item.id)
          return
        }
      }

      const inkBtn = buttonMeshRefs.current['ink_next']
      if (inkBtn) {
        inkBtn.getWorldPosition(_btnWorld)
        const d = Math.hypot(pokePos[0] - _btnWorld.x, pokePos[1] - _btnWorld.y, pokePos[2] - _btnWorld.z)
        if (d < 0.028) {
          lastTapMsRef.current = nowMs
          const cur = useMyRoomStore.getState().activeInkColor
          const idx = INK_COLORS.indexOf(cur as (typeof INK_COLORS)[number])
          const next = INK_COLORS[(idx + 1) % INK_COLORS.length]
          useMyRoomStore.getState().setActiveInkColor(next)
          playMaterialActionSfx('metal', 'watch_tap')
          return
        }
      }

      const menuToggleBtn = buttonMeshRefs.current['toggle_menu']
      if (menuToggleBtn) {
        menuToggleBtn.getWorldPosition(_btnWorld)
        const d = Math.hypot(pokePos[0] - _btnWorld.x, pokePos[1] - _btnWorld.y, pokePos[2] - _btnWorld.z)
        if (d < 0.03) {
          lastTapMsRef.current = nowMs
          useGameStore.getState().toggleVrMenu()
          playMaterialActionSfx('metal', 'watch_tap')
          return
        }
      }

      const closeDockBtn = buttonMeshRefs.current['close_dock']
      if (closeDockBtn) {
        closeDockBtn.getWorldPosition(_btnWorld)
        const d = Math.hypot(pokePos[0] - _btnWorld.x, pokePos[1] - _btnWorld.y, pokePos[2] - _btnWorld.z)
        if (d < 0.028) {
          lastTapMsRef.current = nowMs
          useMyRoomStore.getState().setWatchMenuOpen(false)
          playMaterialActionSfx('metal', 'watch_tap')
          return
        }
      }
    }

    if (faceMeshRef.current) {
      faceMeshRef.current.getWorldPosition(_watchFaceWorld)
      const dFace = Math.hypot(
        pokePos[0] - _watchFaceWorld.x,
        pokePos[1] - _watchFaceWorld.y,
        pokePos[2] - _watchFaceWorld.z
      )
      if (dFace < 0.048) {
        lastTapMsRef.current = nowMs
        playMaterialActionSfx('metal', 'watch_tap')
        useMyRoomStore.getState().setWatchMenuOpen(!useMyRoomStore.getState().watchMenuOpen)
      }
    }
  })

  return (
    <group ref={watchRootRef}>
      {/* Silicone wrist band */}
      <mesh rotation={[Math.PI * 0.5, 0, 0]} position={[0, -0.016, 0]}>
        <torusGeometry args={[0.028, 0.0065, 10, 24]} />
        <meshStandardMaterial color="#1e293b" roughness={0.78} />
      </mesh>

      {/* Titanium Smartwatch Chassis */}
      <mesh position={[0, 0.004, 0]}>
        <boxGeometry args={[0.044, 0.011, 0.05]} />
        <meshStandardMaterial color="#334155" metalness={0.82} roughness={0.28} />
      </mesh>
      {/* Side crown dial */}
      <mesh position={[0.024, 0.004, 0.006]} rotation={[0, 0, Math.PI * 0.5]}>
        <cylinderGeometry args={[0.004, 0.004, 0.006, 12]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Interactive OLED Watch Display */}
      <mesh
        ref={faceMeshRef}
        position={[0, 0.0105, 0]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        onClick={(e) => {
          e.stopPropagation()
          playMaterialActionSfx('metal', 'watch_tap')
          useMyRoomStore.getState().setWatchMenuOpen(!watchMenuOpen)
        }}
      >
        <planeGeometry args={[0.036, 0.042]} />
        <meshBasicMaterial map={screenCanvas.tex} />
      </mesh>

      {/* Compact Floating Wrist Dock: Sleek Icon Badges + Main Menu Show/Hide Toggle */}
      {watchMenuOpen && (
        <group position={[0, 0.062, -0.012]} rotation={[-0.45, 0, 0]}>
          <mesh position={[0, 0.024, 0.008]}>
            <boxGeometry args={[0.172, 0.086, 0.004]} />
            <meshStandardMaterial color="#0b1220" transparent opacity={0.92} roughness={0.35} />
          </mesh>

          {WATCH_TOOLS.map((item) => {
            const isSelected = activeTool === item.id
            const isHovered = hoveredBtn === item.id
            const tileTex = getWristTileTexture(item.label, item.icon, item.color, isSelected, isHovered)
            return (
              <mesh
                key={item.id}
                position={item.offset}
                ref={(el) => {
                  buttonMeshRefs.current[item.id] = el
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  selectTool(item.id)
                }}
                onPointerOver={(e) => {
                  e.stopPropagation()
                  setHoveredBtn(item.id)
                }}
                onPointerOut={() => setHoveredBtn(null)}
              >
                <planeGeometry args={[0.036, 0.036]} />
                <meshBasicMaterial map={tileTex} transparent />
              </mesh>
            )
          })}

          {/* Ink Color Picker Tile */}
          <mesh
            position={[-0.02, 0.004, 0.02]}
            ref={(el) => {
              buttonMeshRefs.current['ink_next'] = el
            }}
            onClick={(e) => {
              e.stopPropagation()
              const idx = INK_COLORS.indexOf(activeInkColor as (typeof INK_COLORS)[number])
              useMyRoomStore.getState().setActiveInkColor(INK_COLORS[(idx + 1) % INK_COLORS.length])
              playMaterialActionSfx('metal', 'watch_tap')
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHoveredBtn('ink_next')
            }}
            onPointerOut={() => setHoveredBtn(null)}
          >
            <planeGeometry args={[0.036, 0.036]} />
            <meshBasicMaterial
              map={getWristTileTexture('INK', 'ink', activeInkColor, false, hoveredBtn === 'ink_next')}
              transparent
            />
          </mesh>

          {/* Show / Hide Main Menu Board Toggle (Accessible directly during Hand Tracking) */}
          <mesh
            position={[0.02, 0.004, 0.02]}
            ref={(el) => {
              buttonMeshRefs.current['toggle_menu'] = el
            }}
            onClick={(e) => {
              e.stopPropagation()
              useGameStore.getState().toggleVrMenu()
              playMaterialActionSfx('metal', 'watch_tap')
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHoveredBtn('toggle_menu')
            }}
            onPointerOut={() => setHoveredBtn(null)}
          >
            <planeGeometry args={[0.036, 0.036]} />
            <meshBasicMaterial
              map={getWristTileTexture(
                vrMenuVisible ? 'HIDE' : 'MENU',
                'menu',
                '#0ea5e9',
                vrMenuVisible,
                hoveredBtn === 'toggle_menu'
              )}
              transparent
            />
          </mesh>

          {/* Compact Close Wrist Dock Button */}
          <mesh
            position={[0.06, 0.004, 0.02]}
            ref={(el) => {
              buttonMeshRefs.current['close_dock'] = el
            }}
            onClick={(e) => {
              e.stopPropagation()
              useMyRoomStore.getState().setWatchMenuOpen(false)
              playMaterialActionSfx('metal', 'watch_tap')
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHoveredBtn('close_dock')
            }}
            onPointerOut={() => setHoveredBtn(null)}
          >
            <planeGeometry args={[0.036, 0.036]} />
            <meshBasicMaterial
              map={getWristTileTexture('CLOSE', 'close', '#64748b', false, hoveredBtn === 'close_dock')}
              transparent
            />
          </mesh>
        </group>
      )}
    </group>
  )
}

/**
 * Renders the currently equipped Watch Machinery tool (Pen, Knife, Axe, or Electric Tester)
 * right in the player's right hand/controller.
 */
export function RightHandActiveToolView() {
  const activeTool = useMyRoomStore((s) => s.activeTool)
  const activeInkColor = useMyRoomStore((s) => s.activeInkColor)
  const testerIsLive = useMyRoomStore((s) => s.testerIsLive)
  const toolGroupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    const grp = toolGroupRef.current
    if (!grp) return
    const lp = runtimeState.localPose
    _toolGripWorld.set(lp.rightPos[0], lp.rightPos[1], lp.rightPos[2])
    grp.position.copy(_toolGripWorld)
    grp.quaternion.set(lp.rightQuat[0], lp.rightQuat[1], lp.rightQuat[2], lp.rightQuat[3])
  })

  if (activeTool === 'none') return null

  return (
    <group ref={toolGroupRef}>
      {activeTool === 'pen' && (
        <group rotation={[Math.PI * 0.5, 0, 0]} position={[0, -0.015, -0.055]}>
          {/* Machined barrel */}
          <mesh>
            <cylinderGeometry args={[0.006, 0.007, 0.125, 14]} />
            <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Grip collar */}
          <mesh position={[0, -0.042, 0]}>
            <cylinderGeometry args={[0.0068, 0.0065, 0.028, 14]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.88} roughness={0.22} />
          </mesh>
          {/* Tapered nib cone pointing -Z in world */}
          <mesh position={[0, -0.072, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.0055, 0.024, 14]} />
            <meshStandardMaterial color={activeInkColor} emissive={activeInkColor} emissiveIntensity={0.4} />
          </mesh>
        </group>
      )}

      {activeTool === 'knife' && (
        <group position={[0, -0.01, -0.04]}>
          {/* Contoured black handle */}
          <mesh rotation={[Math.PI * 0.5, 0, 0]}>
            <boxGeometry args={[0.016, 0.024, 0.1]} />
            <meshStandardMaterial color="#1e293b" roughness={0.65} />
          </mesh>
          {/* Bolster */}
          <mesh position={[0, 0, -0.054]}>
            <boxGeometry args={[0.017, 0.026, 0.012]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.25} />
          </mesh>
          {/* Sharp steel craft blade extending along -Z */}
          <mesh position={[0, 0.002, -0.105]}>
            <boxGeometry args={[0.003, 0.024, 0.095]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.94} roughness={0.14} />
          </mesh>
        </group>
      )}

      {activeTool === 'axe' && (
        <group position={[0, -0.01, -0.06]}>
          {/* Solid hickory wood shaft */}
          <mesh rotation={[Math.PI * 0.5, 0, 0]} position={[0, 0, -0.04]}>
            <cylinderGeometry args={[0.011, 0.013, 0.24, 12]} />
            <meshStandardMaterial color="#92400e" roughness={0.72} />
          </mesh>
          {/* Heavy steel axe head */}
          <mesh position={[0, -0.018, -0.145]}>
            <boxGeometry args={[0.014, 0.068, 0.078]} />
            <meshStandardMaterial color="#475569" metalness={0.86} roughness={0.26} />
          </mesh>
          {/* Honed sharp silver cutting bit edge */}
          <mesh position={[0, -0.054, -0.145]}>
            <boxGeometry args={[0.004, 0.014, 0.082]} />
            <meshStandardMaterial color="#f8fafc" metalness={0.95} roughness={0.12} />
          </mesh>
        </group>
      )}

      {activeTool === 'tester' && (
        <group position={[0, -0.015, -0.05]}>
          {/* Translucent amber insulated handle with live neon LED bulb inside */}
          <mesh rotation={[Math.PI * 0.5, 0, 0]}>
            <cylinderGeometry args={[0.011, 0.013, 0.095, 14]} />
            <meshStandardMaterial
              color={testerIsLive ? '#22c55e' : '#f59e0b'}
              emissive={testerIsLive ? '#22c55e' : '#f59e0b'}
              emissiveIntensity={testerIsLive ? 1.4 : 0.28}
              transparent
              opacity={0.85}
            />
          </mesh>
          {/* Top metal grounding cap */}
          <mesh rotation={[Math.PI * 0.5, 0, 0]} position={[0, 0, 0.05]}>
            <cylinderGeometry args={[0.01, 0.01, 0.008, 12]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.18} />
          </mesh>
          {/* Insulated black collar + metallic steel probe tip */}
          <mesh rotation={[Math.PI * 0.5, 0, 0]} position={[0, 0, -0.085]}>
            <cylinderGeometry args={[0.0032, 0.0035, 0.085, 10]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.92} roughness={0.15} />
          </mesh>
        </group>
      )}
    </group>
  )
}
