import { useEffect } from 'react'
import { CricketHUD } from './cricket/CricketHUD'
import { p2pClient } from './net/p2pClient'
import { GameCanvas } from './scene/GameCanvas'
import { useGameStore } from './store/useGameStore'
import { DesktopHUD } from './ui/DesktopHUD'
import { LobbyOverlay } from './ui/LobbyOverlay'

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
      {!joined ? <LobbyOverlay /> : activeGame === 'cricket' ? <CricketHUD /> : <DesktopHUD />}
    </div>
  )
}
