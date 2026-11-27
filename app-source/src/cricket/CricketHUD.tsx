import { useState } from 'react'
import { p2pClient } from '../net/p2pClient'
import { voiceAudio } from '../net/voiceAudio'
import { useGameStore } from '../store/useGameStore'
import { xrStore } from '../xr/xrStore'
import { getMaxBallsForFormat, getMaxWicketsForFormat } from './types'
import { resetCricketBallToBowler, useCricketStore } from './useCricketStore'

export function CricketHUD() {
  const roomId = useGameStore((s) => s.roomId)
  const peers = useGameStore((s) => s.peers)
  const localPeerId = useGameStore((s) => s.localPeerId)
  const micEnabled = useGameStore((s) => s.micEnabled)
  const micStatus = useGameStore((s) => s.micStatus)
  const xrSupported = useGameStore((s) => s.xrSupported)
  const inXR = useGameStore((s) => s.inXR)
  const pointerLocked = useGameStore((s) => s.pointerLocked)
  const connectionLabel = useGameStore((s) => s.connectionLabel)

  const format = useCricketStore((s) => s.format)
  const pitchMode = useCricketStore((s) => s.pitchMode)
  const bowlingStyle = useCricketStore((s) => s.bowlingStyle)
  const spinDir = useCricketStore((s) => s.spinDir)
  const batterStance = useCricketStore((s) => s.batterStance)
  const localRole = useCricketStore((s) => s.localCricketRole)
  const assignments = useCricketStore((s) => s.assignments)
  const runs = useCricketStore((s) => s.runs)
  const wickets = useCricketStore((s) => s.wickets)
  const legalBalls = useCricketStore((s) => s.legalBalls)
  const targetScore = useCricketStore((s) => s.targetScore)
  const inningsNumber = useCricketStore((s) => s.inningsNumber)
  const inningsOver = useCricketStore((s) => s.inningsOver)
  const recentBalls = useCricketStore((s) => s.recentBalls)
  const eventBanner = useCricketStore((s) => s.eventBanner)
  const bowlerCharge = useCricketStore((s) => s.bowlerCharge)
  const bowlerCatchActive = useCricketStore((s) => s.bowlerCatchActive)
  const keeperCatchActive = useCricketStore((s) => s.keeperCatchActive)

  const [copied, setCopied] = useState(false)

  if (inXR) return null

  const maxBalls = getMaxBallsForFormat(format)
  const maxWickets = getMaxWicketsForFormat(format)
  const oversText = `${Math.floor(legalBalls / 6)}.${legalBalls % 6} / ${Math.floor(maxBalls / 6)}.0`
  const peerList = Object.values(peers)
  const peerIds = Object.keys(peers)

  const sync = () => {
    p2pClient.broadcastCricketState()
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

  const assigneeLabel = (val: string) => {
    if (val === 'ai') return 'Computer AI'
    if (val === localPeerId || val === 'local') return 'You'
    return peers[val]?.name ?? 'Peer'
  }

  return (
    <div className="hud-layer">
      <div className="hud-topbar">
        <div className="hud-card">
          <div className="hud-stat">
            <span className="hud-stat-label">Cricket • Inn {inningsNumber}</span>
            <span className="hud-stat-val" style={{ color: '#34d399' }}>
              {runs}/{wickets} <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>({maxWickets}w)</span>
            </span>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">Overs</span>
            <span className="hud-stat-val" style={{ color: '#fbbf24' }}>
              {oversText}
            </span>
          </div>
          {targetScore !== null && (
            <div className="hud-stat">
              <span className="hud-stat-label">Target</span>
              <span className="hud-stat-val" style={{ color: '#fb923c' }}>{targetScore}</span>
            </div>
          )}
          <div className="hud-stat">
            <span className="hud-stat-label">Your Role</span>
            <span className="hud-stat-val" style={{ color: '#38bdf8' }}>
              {localRole.toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {recentBalls.map((b, i) => (
              <span
                key={i}
                style={{
                  minWidth: '22px',
                  height: '22px',
                  padding: '0 5px',
                  borderRadius: '999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  background:
                    b === 'W'
                      ? '#dc2626'
                      : b === '6'
                        ? '#f59e0b'
                        : b === '4'
                          ? '#0284c7'
                          : 'rgba(51,65,85,0.85)',
                  color: '#fff',
                }}
              >
                {b}
              </span>
            ))}
          </div>
        </div>

        <div className="hud-card">
          <button
            type="button"
            className="hud-btn"
            onClick={() => {
              useCricketStore.getState().setFormat(format === '1-over' ? '10-over' : '1-over')
              sync()
            }}
          >
            {format === '1-over' ? '1 Over' : '10 Overs'}
          </button>

          <button
            type="button"
            className="hud-btn"
            onClick={() => {
              useCricketStore.getState().setPitchMode(pitchMode === 'hard' ? 'wet' : 'hard')
              sync()
            }}
          >
            Pitch: {pitchMode.toUpperCase()}
          </button>

          <button
            type="button"
            className="hud-btn"
            onClick={() => {
              useCricketStore.getState().setBowlingStyle(bowlingStyle === 'fast' ? 'spin' : 'fast')
              sync()
            }}
          >
            Bowler: {bowlingStyle.toUpperCase()}
          </button>

          {bowlingStyle === 'spin' && (
            <button
              type="button"
              className="hud-btn"
              onClick={() => {
                useCricketStore.getState().setSpinDir(spinDir === 'off' ? 'leg' : 'off')
                sync()
              }}
            >
              {spinDir === 'off' ? 'Off-Spin' : 'Leg-Spin'}
            </button>
          )}

          <button
            type="button"
            className="hud-btn"
            onClick={() => {
              useCricketStore.getState().setBatterStance(batterStance === 'right' ? 'left' : 'right')
              sync()
            }}
          >
            Stance: {batterStance === 'right' ? 'RH' : 'LH'}
          </button>

          <button
            type="button"
            className="hud-btn"
            onClick={() => {
              useCricketStore.getState().rotateCricketRoles(localPeerId, peerIds)
              sync()
            }}
          >
            Swap Role
          </button>

          {inningsOver ? (
            <button
              type="button"
              className="hud-btn active"
              onClick={() => {
                if (inningsNumber === 1) {
                  useCricketStore.getState().startSecondInnings(localPeerId, peerIds)
                } else {
                  useCricketStore.getState().resetMatch()
                }
                sync()
              }}
            >
              {inningsNumber === 1 ? 'Chase Target (2nd Inn)' : 'New Match'}
            </button>
          ) : (
            <button
              type="button"
              className="hud-btn"
              onClick={() => {
                resetCricketBallToBowler()
                sync()
              }}
            >
              Next Ball
            </button>
          )}

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
            {micEnabled ? 'Mic: ON' : 'Mic: MUTED'}
          </button>

          <button type="button" className="hud-btn" onClick={copyLink}>
            {copied ? 'Copied!' : 'Invite'}
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

      {eventBanner && <div className="status-toast">{eventBanner}</div>}

      <div
        className={`hud-crosshair ${bowlerCatchActive || keeperCatchActive ? 'catching' : ''}`}
      />

      {bowlerCharge > 0 && (
        <div className="charge-bar-wrap">
          <div className="charge-bar-fill" style={{ width: `${Math.round(bowlerCharge * 100)}%` }} />
        </div>
      )}

      <div className="hud-peers">
        <div className="peer-chip" style={{ borderColor: 'rgba(56, 189, 248, 0.35)' }}>
          <span className="peer-dot" style={{ backgroundColor: '#38bdf8' }} />
          <span>{connectionLabel}</span>
        </div>
        <div className="peer-chip">
          <span className="peer-dot" style={{ backgroundColor: '#2563eb' }} />
          <span>Batter: {assigneeLabel(assignments.batter)}</span>
        </div>
        <div className="peer-chip">
          <span className="peer-dot" style={{ backgroundColor: '#059669' }} />
          <span>Bowler: {assigneeLabel(assignments.bowler)}</span>
        </div>
        <div className="peer-chip">
          <span className="peer-dot" style={{ backgroundColor: '#0ea5e9' }} />
          <span>Keeper: {assigneeLabel(assignments.wicketkeeper)}</span>
        </div>
        {peerList.map((p) => (
          <div key={p.id} className="peer-chip">
            <span
              className="peer-dot"
              style={{
                backgroundColor: p.speakingLevel > 0.1 ? '#34d399' : p.color,
              }}
            />
            <span>
              {p.name} ({p.platform.toUpperCase()})
            </span>
          </div>
        ))}
      </div>

      <div className="hud-bottom-hint">
        {!pointerLocked
          ? 'Click stadium to lock aim • WASD Footwork'
          : localRole === 'batter'
            ? 'Batter: Left-Click Swing Bat • Shift+Click Lofted Sixer Shot • WASD Move • Esc unlocks'
            : localRole === 'bowler'
              ? 'Bowler: Aim yellow ring on pitch • Hold Left-Click to Bowl • Hold Right-Click/Space: Caught & Bowled'
              : 'Wicketkeeper: Hold Right-Click / Space / E to catch behind stumps!'}
      </div>
    </div>
  )
}
