import { useState } from 'react'
import { p2pClient } from '../net/p2pClient'
import { voiceAudio } from '../net/voiceAudio'
import { resetAllBallsToTees } from '../physics/ballActions'
import { useGameStore } from '../store/useGameStore'
import { GameMode } from '../types/game'
import { xrStore } from '../xr/xrStore'
import { useFullscreen } from './useFullscreen'

export function DesktopHUD() {
  const roomId = useGameStore((s) => s.roomId)
  const localRole = useGameStore((s) => s.localRole)
  const gameMode = useGameStore((s) => s.gameMode)
  const scores = useGameStore((s) => s.scores)
  const peers = useGameStore((s) => s.peers)
  const micEnabled = useGameStore((s) => s.micEnabled)
  const micStatus = useGameStore((s) => s.micStatus)
  const xrSupported = useGameStore((s) => s.xrSupported)
  const inXR = useGameStore((s) => s.inXR)
  const throwCharge = useGameStore((s) => s.throwCharge)
  const desktopCatchActive = useGameStore((s) => s.desktopCatchActive)
  const heldBallCount = useGameStore((s) => s.heldBallCount)
  const pointerLocked = useGameStore((s) => s.pointerLocked)
  const statusBanner = useGameStore((s) => s.statusBanner)
  const connectionLabel = useGameStore((s) => s.connectionLabel)

  const [copied, setCopied] = useState(false)
  const { isFullscreen, toggleFullscreen } = useFullscreen()

  if (inXR) return null

  const peerList = Object.values(peers)

  const cycleMode = () => {
    const order: GameMode[] = ['twin-thrower', 'rally', 'solo']
    const next = order[(order.indexOf(gameMode) + 1) % order.length]
    useGameStore.getState().setGameMode(next)
    p2pClient.broadcastModeAndRoles()
    resetAllBallsToTees()
  }

  const copyLink = async () => {
    try {
      const base = window.location.href.split('#')[0]
      await navigator.clipboard.writeText(`${base}#room=${encodeURIComponent(roomId)}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // ignore
    }
  }

  const leaveRoom = async () => {
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    await p2pClient.disconnect()
    useGameStore.getState().leaveRoomReset()
  }

  return (
    <div className="hud-layer">
      <div className="hud-topbar">
        <div className="hud-card">
          <div className="hud-stat">
            <span className="hud-stat-label">Room</span>
            <span className="hud-stat-val">{roomId}</span>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">Role</span>
            <span className="hud-stat-val" style={{ color: localRole === 'catcher' ? '#34d399' : '#38bdf8' }}>
              {localRole.toUpperCase()}
            </span>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">Catches</span>
            <span className="hud-stat-val" style={{ color: '#34d399' }}>{scores.catches}</span>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">Streak / Best</span>
            <span className="hud-stat-val" style={{ color: '#fbbf24' }}>
              {scores.streak} / {scores.bestStreak}
            </span>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">Drops</span>
            <span className="hud-stat-val" style={{ color: '#fb7185' }}>{scores.drops}</span>
          </div>
        </div>

        <div className="hud-card">
          <button
            type="button"
            className={`hud-btn ${micEnabled && micStatus === 'active' ? 'active' : ''}`}
            onClick={() => {
              voiceAudio.resumeContext()
              if (micStatus === 'off' || micStatus === 'denied') {
                void voiceAudio.initLocalMic()
              } else {
                voiceAudio.setMicEnabled(!micEnabled)
                p2pClient.broadcastProfile()
              }
            }}
          >
            {micStatus === 'denied'
              ? 'Mic Blocked'
              : micStatus === 'unavailable'
                ? 'No Mic'
                : micEnabled
                  ? 'Mic: ON'
                  : 'Mic: MUTED'}
          </button>

          <button type="button" className="hud-btn" onClick={cycleMode}>
            Mode: {gameMode}
          </button>

          <button
            type="button"
            className="hud-btn"
            onClick={() => {
              useGameStore.getState().rotateRoles()
              p2pClient.broadcastModeAndRoles()
            }}
          >
            Rotate Roles
          </button>

          <button type="button" className="hud-btn" onClick={() => resetAllBallsToTees()}>
            Reset Balls
          </button>

          <button type="button" className="hud-btn" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy Invite'}
          </button>

          <button type="button" className="hud-btn" onClick={toggleFullscreen}>
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>

          {xrSupported && (
            <button
              type="button"
              className="hud-btn vr-enter"
              onClick={() => {
                voiceAudio.resumeContext()
                void xrStore.enterVR()
              }}
            >
              Enter VR
            </button>
          )}

          <button type="button" className="hud-btn danger" onClick={() => void leaveRoom()}>
            Leave
          </button>
        </div>
      </div>

      {statusBanner && <div className="status-toast">{statusBanner}</div>}

      <div className={`hud-crosshair ${desktopCatchActive ? 'catching' : ''}`} />

      {throwCharge > 0 && (
        <div className="charge-bar-wrap">
          <div className="charge-bar-fill" style={{ width: `${Math.round(throwCharge * 100)}%` }} />
        </div>
      )}

      <div className="hud-peers">
        <div className="peer-chip" style={{ borderColor: 'rgba(56, 189, 248, 0.35)' }}>
          <span className="peer-dot" style={{ backgroundColor: '#38bdf8' }} />
          <span>{connectionLabel}</span>
        </div>
        {peerList.length === 0 ? (
          <div className="peer-chip">
            <span className="peer-dot" style={{ backgroundColor: '#fbbf24' }} />
            <span>Waiting for peers in room {roomId}...</span>
          </div>
        ) : (
          peerList.map((p) => (
            <div key={p.id} className="peer-chip">
              <span
                className="peer-dot"
                style={{
                  backgroundColor: p.speakingLevel > 0.1 ? '#34d399' : p.color,
                  boxShadow: p.speakingLevel > 0.1 ? '0 0 8px #34d399' : 'none',
                }}
              />
              <span>
                {p.name} ({p.platform.toUpperCase()} • {p.role})
              </span>
              {p.rttMs > 0 && <span style={{ color: '#94a3b8' }}>{p.rttMs}ms</span>}
            </div>
          ))
        )}
      </div>

      <div className="hud-bottom-hint">
        {!pointerLocked
          ? 'Click arena to lock mouse aim • WASD Move'
          : heldBallCount > 0
            ? 'Holding Ball: Hold Left-Click to Charge & Release to Throw • Esc unlocks cursor'
            : 'Left-Click / F: Grab Ball • Hold Right-Click / Space / E: Catch Mitt • Esc unlocks cursor'}
      </div>
    </div>
  )
}
