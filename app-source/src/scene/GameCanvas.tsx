import { Canvas } from '@react-three/fiber'
import { XR } from '@react-three/xr'
import { useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import { DesktopPlayerRig } from '../xr/DesktopPlayerRig'
import { xrStore } from '../xr/xrStore'
import { ArenaEnvironment } from './ArenaEnvironment'
import { BallManager } from './BallManager'
import { InWorldUI } from './InWorldUI'
import { LocalHandsAndRig } from './LocalHandsAndRig'
import { RemoteAvatars } from './RemoteAvatars'

export function GameCanvas() {
  useEffect(() => {
    let cancelled = false

    const checkXr = async () => {
      if (typeof navigator !== 'undefined' && 'xr' in navigator && navigator.xr) {
        try {
          const supported = await navigator.xr.isSessionSupported('immersive-vr')
          if (!cancelled) {
            useGameStore.getState().setXrSupported(supported)
          }
        } catch {
          if (!cancelled) {
            useGameStore.getState().setXrSupported(false)
          }
        }
      }
    }
    void checkXr()

    const unsub = xrStore.subscribe((xrState) => {
      const active = xrState.mode !== null
      useGameStore.getState().setInXR(active)
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
      camera={{ fov: 72, near: 0.08, far: 120, position: [0, 1.62, 5.4] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <XR store={xrStore}>
        <ArenaEnvironment />
        <DesktopPlayerRig />
        <LocalHandsAndRig />
        <BallManager />
        <RemoteAvatars />
        <InWorldUI />
      </XR>
    </Canvas>
  )
}
