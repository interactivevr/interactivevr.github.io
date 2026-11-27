import { QRCodeSVG } from 'qrcode.react'
import { useMemo, useState } from 'react'
import { unlockAudioContext } from '../audio/sfx'
import { p2pClient } from '../net/p2pClient'
import { voiceAudio } from '../net/voiceAudio'
import { resetRuntimeBalls, useGameStore } from '../store/useGameStore'
import { GameMode, PlatformMode } from '../types/game'
import { xrStore } from '../xr/xrStore'

function randomRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

export function LobbyOverlay() {
  const roomId = useGameStore((s) => s.roomId)
  const playerName = useGameStore((s) => s.playerName)
  const gameMode = useGameStore((s) => s.gameMode)
  const xrSupported = useGameStore((s) => s.xrSupported)
  const micEnabled = useGameStore((s) => s.micEnabled)

  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState(false)

  const inviteUrl = useMemo(() => {
    if (typeof window === 'undefined') return `https://interactivevr.github.io/#room=${roomId}`
    const base = window.location.href.split('#')[0]
    return `${base}#room=${encodeURIComponent(roomId || 'CATCH1')}`
  }, [roomId])

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore clipboard restrictions
    }
  }

  const startSession = (targetPlatform: PlatformMode) => {
    if (joining) return
    const cleanRoom = roomId.trim() || 'CATCH1'
    useGameStore.getState().setRoomId(cleanRoom)
    useGameStore.getState().setPlatform(targetPlatform)
    resetRuntimeBalls(useGameStore.getState().gameMode)

    // Unlock Web Audio inside the user gesture before async calls
    unlockAudioContext()
    voiceAudio.resumeContext()

    // Enter WebXR synchronously within the user gesture when VR is chosen
    if (targetPlatform === 'vr') {
      void xrStore.enterVR().catch(() => {
        useGameStore
          .getState()
          .setStatusBanner('WebXR failed to open. Continuing in 3D browser view.')
      })
    }

    setJoining(true)
    useGameStore.getState().setJoined(true)
    void p2pClient.connect(cleanRoom).finally(() => setJoining(false))
  }

  const modeDescriptions: Record<GameMode, string> = {
    'twin-thrower': '2 Throwers face 1 Catcher across the court with 2 live balls.',
    rally: '2 players pass a shared ball back and forth to build a rally streak.',
    solo: 'Practice throwing and catching solo against the rebound target wall.',
  }

  return (
    <div className="lobby-backdrop">
      <div className="lobby-card">
        <div className="lobby-header">
          <div>
            <h1 className="lobby-title">VR Catch Arena</h1>
            <p className="lobby-subtitle">
              Cross-platform Meta Quest WebXR &amp; PC Browser catch with P2P 3D spatial voice
            </p>
          </div>
          <span className={`xr-pill ${xrSupported ? '' : 'muted'}`}>
            {xrSupported ? 'WebXR / Quest Ready' : 'PC Browser Mode'}
          </span>
        </div>

        <div className="lobby-grid">
          <div className="form-stack">
            <div className="field">
              <label htmlFor="player-name">Display Name</label>
              <input
                id="player-name"
                value={playerName}
                maxLength={20}
                onChange={(e) => useGameStore.getState().setPlayerName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div className="field">
              <label htmlFor="room-code">Room Code (Share with Friends)</label>
              <div className="row-inline">
                <input
                  id="room-code"
                  value={roomId}
                  maxLength={12}
                  onChange={(e) => useGameStore.getState().setRoomId(e.target.value)}
                  placeholder="CATCH1"
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => useGameStore.getState().setRoomId(randomRoomCode())}
                >
                  Random
                </button>
              </div>
            </div>

            <div className="field">
              <label>Game Mode</label>
              <div className="mode-pills">
                {(
                  [
                    { id: 'twin-thrower', label: '2 Throw + 1 Catch' },
                    { id: 'rally', label: '2P Rally' },
                    { id: 'solo', label: 'Solo Wall' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`mode-btn ${gameMode === m.id ? 'active' : ''}`}
                    onClick={() => useGameStore.getState().setGameMode(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                {modeDescriptions[gameMode]}
              </span>
            </div>

            <div className="row-inline" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                Peer Voice Audio: <strong>{micEnabled ? 'Mic Enabled' : 'Muted'}</strong>
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => voiceAudio.setMicEnabled(!micEnabled)}
              >
                {micEnabled ? 'Mute Mic' : 'Unmute Mic'}
              </button>
            </div>
          </div>

          <div className="qr-panel">
            <div className="qr-box">
              <QRCodeSVG value={inviteUrl} size={136} level="M" />
            </div>
            <p className="qr-caption">
              Open this link in <strong>Meta Quest Browser</strong> or another PC tab to join room{' '}
              <strong>{roomId || 'CATCH1'}</strong>.
            </p>
            <button type="button" className="btn-secondary" onClick={handleCopyInvite}>
              {copied ? 'Invite Link Copied!' : 'Copy Invite Link'}
            </button>
          </div>
        </div>

        <div className="actions-row">
          <button
            type="button"
            className="btn-primary"
            disabled={joining}
            onClick={() => startSession('pc')}
          >
            Join from PC Browser
          </button>
          <button
            type="button"
            className="btn-primary vr"
            disabled={joining || !xrSupported}
            title={
              xrSupported
                ? 'Launch immersive WebXR session on Meta Quest'
                : 'Open on Meta Quest Browser (HTTPS) to enter VR'
            }
            onClick={() => startSession('vr')}
          >
            {xrSupported ? 'Enter Meta Quest VR' : 'VR Headset Unavailable Here'}
          </button>
        </div>

        <div className="controls-summary">
          <div>
            <strong>Meta Quest VR:</strong> Squeeze <strong>Grip / Trigger</strong> (or Pinch) near a ball
            to grab/catch, swing and release to throw. Left thumbstick moves, right stick snap-turns.
          </div>
          <div>
            <strong>PC Browser:</strong> Click canvas to aim, <strong>WASD</strong> move, hold{' '}
            <strong>Right-Click / Space / E</strong> for Catch Mitt, hold <strong>Left-Click</strong>{' '}
            to charge &amp; throw.
          </div>
        </div>
      </div>
    </div>
  )
}
