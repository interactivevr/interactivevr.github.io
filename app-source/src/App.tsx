import { useEffect } from 'react'
import { CricketHUD } from './cricket/CricketHUD'
import { p2pClient } from './net/p2pClient'
import { GameCanvas } from './scene/GameCanvas'
import { useGameStore } from './store/useGameStore'
import { DesktopHUD } from './ui/DesktopHUD'
import { LobbyOverlay } from './ui/LobbyOverlay'
import { xrStore } from './xr/xrStore'

function MyRoomFallbackHUD() {
  const inXR = useGameStore((s) => s.inXR)
  const arSupported = useGameStore((s) => s.arSupported)
  if (inXR) return null

  return (
    <div className="hud-layer">
      <div className="hud-topbar">
        <div className="hud-card">
          <div className="hud-stat">
            <span className="hud-stat-label">MyRoom Mixed Reality</span>
            <span className="hud-stat-val" style={{ color: '#38bdf8' }}>
              {arSupported ? 'Ready to Enter AR' : 'Meta Quest / AR Device Required'}
            </span>
          </div>
          {arSupported && (
            <button type="button" className="hud-btn vr-enter" onClick={() => void xrStore.enterAR()}>
              Enter AR Mode
            </button>
          )}
          <button
            type="button"
            className="hud-btn danger"
            onClick={() => {
              void p2pClient.disconnect()
              useGameStore.getState().leaveRoomReset()
            }}
          >
            Back to Lobby
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const joined = useGameStore((s) => s.joined)
  const activeGame = useGameStore((s) => s.activeGame)

  useEffect(() => {
    const onHashChange = () => {
      const match = window.location.hash.match(/room=([A-Za-z0-9_-]+)/i)
      if (match?.[1] && !useGameStore.getState().joined) {
        useGameStore.getState().setRoomId(match[1])
      }
    }
    const onBeforeUnload = () => {
      void p2pClient.disconnect()
    }
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  return (
    <div className="app-root">
      <GameCanvas />
      {!joined ? (
        <LobbyOverlay />
      ) : activeGame === 'cricket' ? (
        <CricketHUD />
      ) : activeGame === 'myroom' ? (
        <MyRoomFallbackHUD />
      ) : (
        <DesktopHUD />
      )}
    </div>
  )
}
