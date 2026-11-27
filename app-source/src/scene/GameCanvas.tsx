import { Canvas, useThree } from '@react-three/fiber'
import { XR } from '@react-three/xr'
import { useEffect } from 'react'
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js'
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

function WebXRRendererController() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const activeGame = useGameStore((s) => s.activeGame)
  const xrMode = useGameStore((s) => s.xrMode)
  const xrSupported = useGameStore((s) => s.xrSupported)

  useEffect(() => {
    // Follow Three.js WebXR setup best practices:
    // 1. Explicitly enable WebXR on the WebGLRenderer so left/right stereo views render accurately
    // 2. Attach Three.js VRButton.createButton(gl) to document.body for standard ENTER VR / EXIT VR control
    // 3. Keep session state synced with store so R3F setAnimationLoop renders cleanly without blank frames
    gl.xr.enabled = true
    gl.xr.setReferenceSpaceType('local-floor')

    const vrButton = VRButton.createButton(gl, {
      optionalFeatures: [
        'local-floor',
        'bounded-floor',
        'layers',
        'hand-tracking',
        'plane-detection',
        'mesh-detection',
        'anchors',
        'hit-test',
      ],
    })
    vrButton.style.position = 'fixed'
    vrButton.style.bottom = '14px'
    vrButton.style.zIndex = '999'
    if (useGameStore.getState().xrMode === 'immersive-ar') {
      vrButton.style.display = 'none'
    } else if (gl.xr.isPresenting) {
      vrButton.textContent = 'EXIT VR'
    }

    const onVrButtonCaptureClick = (e: MouseEvent) => {
      const activeSession = gl.xr.getSession()
      if (activeSession) {
        e.preventDefault()
        e.stopImmediatePropagation()
        void activeSession.end()
      }
    }
    vrButton.addEventListener('click', onVrButtonCaptureClick, true)
    document.body.appendChild(vrButton)

    const onSessionStart = () => {
      gl.xr.enabled = true
      const state = useGameStore.getState()
      const currentMode = xrStore.getState().mode ?? 'immersive-vr'
      if (!state.inXR) {
        state.setInXR(true, currentMode)
      }
      if (!state.joined) {
        state.setPlatform('vr')
        state.setJoined(true)
      }
      vrButton.textContent = 'EXIT VR'
      vrButton.style.display = currentMode === 'immersive-ar' ? 'none' : ''
    }

    const onSessionEnd = () => {
      gl.xr.enabled = true
      useGameStore.getState().setInXR(false, null)
      vrButton.textContent = 'ENTER VR'
      vrButton.style.display = ''
      invalidate()
    }

    gl.xr.addEventListener('sessionstart', onSessionStart)
    gl.xr.addEventListener('sessionend', onSessionEnd)

    return () => {
      vrButton.removeEventListener('click', onVrButtonCaptureClick, true)
      gl.xr.removeEventListener('sessionstart', onSessionStart)
      gl.xr.removeEventListener('sessionend', onSessionEnd)
      vrButton.remove()
    }
  }, [gl, invalidate, xrSupported])

  useEffect(() => {
    const isAR = xrMode === 'immersive-ar' || (activeGame === 'myroom' && xrMode !== 'immersive-vr')
    gl.setClearColor(isAR ? 0x000000 : 0x0b1222, isAR ? 0 : 1)
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
      frameloop="always"
      dpr={[1, 1.5]}
      camera={{ fov: 72, near: 0.08, far: 180, position: [0, 1.62, 5.4] }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.xr.enabled = true
      }}
    >
      <XR store={xrStore}>
        <WebXRRendererController />
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
