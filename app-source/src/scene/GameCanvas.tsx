import { Canvas, useThree } from '@react-three/fiber'
import { XR } from '@react-three/xr'
import { useEffect } from 'react'
import { CricketArena } from '../cricket/CricketArena'
import { MyRoomArena } from '../myroom/MyRoomArena'
import { useGameStore } from '../store/useGameStore'
import { DesktopPlayerRig } from '../xr/DesktopPlayerRig'
import { xrStore } from '../xr/xrStore'
import { ArenaEnvironment } from './ArenaEnvironment'
import { BallManager } from './BallManager'
import { InWorldUI } from './InWorldUI'
import { LocalHandsAndRig } from './LocalHandsAndRig'
import { RemoteAvatars } from './RemoteAvatars'

function ARClearAlphaController() {
  const gl = useThree((s) => s.gl)
  const activeGame = useGameStore((s) => s.activeGame)
  const xrMode = useGameStore((s) => s.xrMode)

  useEffect(() => {
    const isAR = xrMode === 'immersive-ar' || activeGame === 'myroom'
    gl.setClearColor(0x000000, isAR ? 0 : 1)
  }, [gl, activeGame, xrMode])

  return null
}

export function GameCanvas() {
  const activeGame = useGameStore((s) => s.activeGame)
  useEffect(() => {
    let cancelled = false

    const checkXr = async () => {
      if (typeof navigator !== 'undefined' && 'xr' in navigator && navigator.xr) {
        try {
          const [vrSupported, arSupported] = await Promise.all([
            navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
            navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
          ])
          if (!cancelled) {
            useGameStore.getState().setXrSupported(vrSupported)
            useGameStore.getState().setArSupported(arSupported)
          }
        } catch {
          if (!cancelled) {
            useGameStore.getState().setXrSupported(false)
            useGameStore.getState().setArSupported(false)
          }
        }
      }
    }
    void checkXr()

    const unsub = xrStore.subscribe((xrState) => {
      const active = xrState.mode !== null
      useGameStore.getState().setInXR(active, xrState.mode)
      if (xrState.emulator) {
        useGameStore.getState().setXrSupported(true)
      }
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ fov: 72, near: 0.08, far: 180, position: [0, 1.62, 5.4] }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
    >
      <XR store={xrStore}>
        <ARClearAlphaController />
        {activeGame === 'cricket' ? (
          <CricketArena />
        ) : activeGame === 'myroom' ? (
          <MyRoomArena />
        ) : (
          <>
            <ArenaEnvironment />
            <DesktopPlayerRig />
            <LocalHandsAndRig />
            <BallManager />
            <RemoteAvatars />
            <InWorldUI />
          </>
        )}
      </XR>
    </Canvas>
  )
}
