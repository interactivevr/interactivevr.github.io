import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { p2pClient } from '../net/p2pClient'
import { TextLabel } from '../scene/TextLabel'
import { useGameStore } from '../store/useGameStore'
import { PeerInfo } from '../types/game'
import { xrStore } from '../xr/xrStore'
import { formatSpinKindLabel } from './bowlingMechanics'
import { InningsBallEvent, InningsSummarySnapshot, useCricketStore } from './useCricketStore'

function formatOvers(legalBalls: number): string {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`
}

function calcRunRate(runs: number, legalBalls: number): string {
  return legalBalls > 0 ? ((runs / legalBalls) * 6).toFixed(2) : '0.00'
}

function resolveParticipantName(
  id: string,
  localPeerId: string,
  playerName: string,
  peers: Record<string, PeerInfo>
): string {
  if (id === 'ai') return 'Computer AI'
  if (id === 'local' || (localPeerId && id === localPeerId)) return playerName || 'You'
  return peers[id]?.name ?? 'Peer Player'
}

interface OverGroup {
  overNum: number
  runs: number
  balls: InningsBallEvent[]
}

function groupLogByOver(log: InningsBallEvent[]): OverGroup[] {
  const groups: OverGroup[] = []
  let legalSeen = 0
  let currentOver = 1
  let currentGroup: OverGroup = { overNum: 1, runs: 0, balls: [] }

  for (let i = 0; i < log.length; i++) {
    const b = log[i]
    const overIdx = Math.floor(legalSeen / 6) + 1
    if (overIdx !== currentOver && currentGroup.balls.length > 0) {
      groups.push(currentGroup)
      currentOver = overIdx
      currentGroup = { overNum: currentOver, runs: 0, balls: [] }
    }
    currentGroup.balls.push(b)
    currentGroup.runs += b.runs
    if (!b.isWide) legalSeen += 1
  }
  if (currentGroup.balls.length > 0) {
    groups.push(currentGroup)
  }
  return groups
}

function VRScoreButton({
  position,
  label,
  color,
  width = 1.15,
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
        <boxGeometry args={[width, 0.3, 0.06]} />
        <meshStandardMaterial
          color={hovered ? '#ffffff' : color}
          emissive={color}
          emissiveIntensity={hovered ? 0.65 : 0.3}
        />
      </mesh>
      <TextLabel position={[0, 0, 0.04]} fontSize={0.088} color={hovered ? '#0f172a' : '#f8fafc'}>
        {label}
      </TextLabel>
    </group>
  )
}

/**
 * In-VR 3D Cricket Play Summary & Match Scorecard displayed directly ahead of the user
 * after an innings or full match completes in 1-Over or 10-Over mode.
 */
export function VRScorecardSummary() {
  const inXR = useGameStore((s) => s.inXR)
  const localPeerId = useGameStore((s) => s.localPeerId)
  const playerName = useGameStore((s) => s.playerName)
  const peers = useGameStore((s) => s.peers)

  const localRole = useCricketStore((s) => s.localCricketRole)
  const format = useCricketStore((s) => s.format)
  const pitchMode = useCricketStore((s) => s.pitchMode)
  const runs = useCricketStore((s) => s.runs)
  const inningsNumber = useCricketStore((s) => s.inningsNumber)
  const inningsOver = useCricketStore((s) => s.inningsOver)
  const targetScore = useCricketStore((s) => s.targetScore)
  const firstInnings = useCricketStore((s) => s.firstInningsSummary)
  const secondInnings = useCricketStore((s) => s.secondInningsSummary)
  const matchResult = useCricketStore((s) => s.matchResultBanner)
  const visible = useCricketStore((s) => s.scorecardSummaryVisible)

  const peerIds = Object.keys(peers)
  const activeSummary: InningsSummarySnapshot | null =
    inningsNumber === 2 ? secondInnings ?? firstInnings : firstInnings

  const cardTex = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 840
    const ctx = canvas.getContext('2d')!

    // Broadcast-grade dark navy & white cricket scorecard card
    ctx.fillStyle = '#090e1a'
    ctx.fillRect(0, 0, 1280, 840)

    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 6
    ctx.strokeRect(12, 12, 1256, 816)

    // Header banner
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(16, 16, 1248, 86)
    ctx.fillStyle = '#f8fafc'
    ctx.font = 'bold 36px Arial, sans-serif'
    ctx.textAlign = 'center'
    const title =
      inningsNumber === 2
        ? `FULL MATCH SCORECARD SUMMARY  •  ${format.toUpperCase()}`
        : `1ST INNINGS PLAY SUMMARY  •  ${format.toUpperCase()}`
    ctx.fillText(title, 640, 58)
    ctx.fillStyle = '#94a3b8'
    ctx.font = 'bold 20px "Courier New", monospace'
    ctx.fillText(`PITCH: ${pitchMode.toUpperCase()}  |  FORMAT: ${format.toUpperCase()}`, 640, 90)

    // Result / Target strip
    ctx.fillStyle = inningsNumber === 2 ? '#14532d' : '#1e3a8a'
    ctx.fillRect(32, 114, 1216, 58)
    ctx.fillStyle = '#fde047'
    ctx.font = 'bold 28px Arial, sans-serif'
    const headline =
      matchResult ||
      (inningsNumber === 1
        ? `1ST INNINGS COMPLETE! TARGET FOR 2ND INNINGS: ${runs + 1} RUNS`
        : `MATCH COMPLETE (${runs} vs TARGET ${targetScore ?? '-'})`)
    ctx.fillText(headline, 640, 152)

    // Table header
    const tableTop = 192
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(32, tableTop, 1216, 46)
    ctx.fillStyle = '#cbd5e1'
    ctx.font = 'bold 20px "Courier New", monospace'
    ctx.textAlign = 'left'
    ctx.fillText('INNINGS / BATTER', 52, tableTop + 30)
    ctx.textAlign = 'center'
    ctx.fillText('SCORE', 450, tableTop + 30)
    ctx.fillText('OVERS', 600, tableTop + 30)
    ctx.fillText('RR', 720, tableTop + 30)
    ctx.fillText('4s / 6s', 845, tableTop + 30)
    ctx.fillText('WD', 965, tableTop + 30)
    ctx.fillText('DOTS', 1065, tableTop + 30)
    ctx.fillText('MAX PACE', 1175, tableTop + 30)

    const drawInningsRow = (snap: InningsSummarySnapshot, rowIdx: number) => {
      const ry = tableTop + 50 + rowIdx * 78
      ctx.fillStyle = rowIdx % 2 === 0 ? '#0f172a' : '#131d33'
      ctx.fillRect(32, ry, 1216, 70)
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = 2
      ctx.strokeRect(32, ry, 1216, 70)

      const batName = resolveParticipantName(snap.batterId, localPeerId, playerName, peers)
      const bowlName = resolveParticipantName(snap.bowlerId, localPeerId, playerName, peers)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#38bdf8'
      ctx.font = 'bold 24px Arial, sans-serif'
      ctx.fillText(`${snap.inningsNumber === 1 ? '1ST INN' : '2ND INN'}: ${batName}`, 52, ry + 32)
      ctx.fillStyle = '#94a3b8'
      ctx.font = '18px Arial, sans-serif'
      ctx.fillText(`vs ${bowlName}`, 52, ry + 57)

      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 30px "Courier New", monospace'
      ctx.fillText(`${snap.runs}/${snap.wickets}`, 450, ry + 44)
      ctx.fillStyle = '#fbbf24'
      ctx.font = 'bold 24px "Courier New", monospace'
      ctx.fillText(formatOvers(snap.legalBalls), 600, ry + 44)
      ctx.fillStyle = '#34d399'
      ctx.fillText(calcRunRate(snap.runs, snap.legalBalls), 720, ry + 44)
      ctx.fillStyle = '#f8fafc'
      ctx.fillText(`${snap.fours} / ${snap.sixes}`, 845, ry + 44)
      ctx.fillText(`${snap.wides}`, 965, ry + 44)
      ctx.fillText(`${snap.dots}`, 1065, ry + 44)
      ctx.fillStyle = '#fb7185'
      ctx.fillText(snap.peakSpeedKmh > 0 ? `${snap.peakSpeedKmh} km/h` : '-', 1175, ry + 44)
    }

    if (firstInnings) drawInningsRow(firstInnings, 0)
    if (secondInnings) drawInningsRow(secondInnings, 1)

    // Over-by-Over Ball Breakdown for latest/featured innings
    const overSectionTop = secondInnings ? 406 : 332
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(32, overSectionTop, 1216, 820 - overSectionTop - 22)
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 2
    ctx.strokeRect(32, overSectionTop, 1216, 820 - overSectionTop - 22)

    ctx.textAlign = 'left'
    ctx.fillStyle = '#38bdf8'
    ctx.font = 'bold 22px Arial, sans-serif'
    ctx.fillText(
      `${activeSummary?.inningsNumber === 2 ? '2ND INNINGS' : '1ST INNINGS'} OVER-BY-OVER SUMMARY`,
      52,
      overSectionTop + 34
    )

    const overs = activeSummary ? groupLogByOver(activeSummary.ballLog) : []
    if (overs.length === 0) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = '22px "Courier New", monospace'
      ctx.fillText('NO DELIVERIES RECORDED', 52, overSectionTop + 80)
    } else {
      const twoCols = overs.length > 5
      const maxRows = Math.min(overs.length, 10)
      for (let i = 0; i < maxRows; i++) {
        const og = overs[i]
        const col = twoCols ? (i >= 5 ? 1 : 0) : 0
        const row = twoCols ? i % 5 : i
        const ox = 52 + col * 600
        const oy = overSectionTop + 68 + row * (twoCols ? 64 : 62)

        ctx.fillStyle = '#e2e8f0'
        ctx.font = 'bold 21px "Courier New", monospace'
        ctx.fillText(`O${og.overNum}:`, ox, oy)

        let bx = ox + 58
        og.balls.slice(0, 8).forEach((b) => {
          const pillW = 42
          const pillColor =
            b.label === 'W'
              ? '#dc2626'
              : b.label === '6'
                ? '#d97706'
                : b.label === '4'
                  ? '#0284c7'
                  : b.isWide
                    ? '#7c3aed'
                    : '#334155'
          ctx.fillStyle = pillColor
          ctx.fillRect(bx, oy - 22, pillW, 30)
          ctx.fillStyle = '#ffffff'
          ctx.textAlign = 'center'
          ctx.font = 'bold 18px "Courier New", monospace'
          ctx.fillText(b.label, bx + pillW / 2, oy - 1)
          bx += pillW + 6
        })

        ctx.textAlign = 'left'
        ctx.fillStyle = '#34d399'
        ctx.font = 'bold 20px "Courier New", monospace'
        ctx.fillText(`(${og.runs}r)`, bx + 4, oy)
      }

      // Latest delivery breakdown footer
      const lastBall = activeSummary?.ballLog[activeSummary.ballLog.length - 1]
      if (lastBall && lastBall.speedKmh > 0) {
        ctx.fillStyle = '#fde047'
        ctx.font = 'bold 20px "Courier New", monospace'
        ctx.fillText(
          `LAST BALL: ${lastBall.speedKmh} KM/H • ${formatSpinKindLabel(lastBall.spinKind)}${lastBall.spinRpm > 0 ? ` (${lastBall.spinRpm} RPM)` : ''} • ${lastBall.pitchLength || 'PITCH'}`,
          52,
          782
        )
      }
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    return tex
  }, [
    inningsNumber,
    format,
    pitchMode,
    runs,
    targetScore,
    matchResult,
    firstInnings,
    secondInnings,
    activeSummary,
    localPeerId,
    playerName,
    peers,
  ])

  useEffect(() => () => cardTex.dispose(), [cardTex])

  if (!inXR || !inningsOver || !visible) return null

  const boardPos: [number, number, number] =
    localRole === 'bowler'
      ? [0.32, 1.72, -5.4]
      : localRole === 'wicketkeeper'
        ? [0, 1.72, 7.6]
        : [-0.25, 1.72, 4.2]
  const boardRotY = localRole === 'bowler' ? Math.PI : 0

  const sync = () => p2pClient.broadcastCricketState()

  return (
    <group position={boardPos} rotation={[0, boardRotY, 0]}>
      <mesh>
        <boxGeometry args={[4.1, 2.7, 0.08]} />
        <meshStandardMaterial color="#090e1a" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.048]}>
        <planeGeometry args={[3.95, 2.58]} />
        <meshBasicMaterial map={cardTex} toneMapped={false} />
      </mesh>

      {inningsNumber === 1 ? (
        <VRScoreButton
          position={[-1.25, -1.56, 0.05]}
          width={1.35}
          label={`CHASE ${runs + 1} (2ND INN)`}
          color="#059669"
          onClick={() => {
            useCricketStore.getState().startSecondInnings(localPeerId, peerIds)
            sync()
          }}
        />
      ) : (
        <VRScoreButton
          position={[-1.25, -1.56, 0.05]}
          width={1.35}
          label="PLAY NEW MATCH"
          color="#059669"
          onClick={() => {
            useCricketStore.getState().resetMatch()
            sync()
          }}
        />
      )}

      <VRScoreButton
        position={[0.15, -1.56, 0.05]}
        width={1.1}
        label={inningsNumber === 1 ? 'NEW MATCH' : 'HIDE SUMMARY'}
        color="#0284c7"
        onClick={() => {
          if (inningsNumber === 1) {
            useCricketStore.getState().resetMatch()
            sync()
          } else {
            useCricketStore.getState().setScorecardSummaryVisible(false)
          }
        }}
      />

      <VRScoreButton
        position={[1.38, -1.56, 0.05]}
        width={1.05}
        label={inningsNumber === 1 ? 'HIDE SUMMARY' : 'MAIN LOBBY'}
        color="#7c3aed"
        onClick={() => {
          if (inningsNumber === 1) {
            useCricketStore.getState().setScorecardSummaryVisible(false)
          } else {
            void xrStore.getState().session?.end()
            void p2pClient.disconnect()
            useGameStore.getState().leaveRoomReset()
          }
        }}
      />
    </group>
  )
}

/**
 * Desktop Browser Cricket Play Summary & Match Scorecard Modal shown when innings/match finishes.
 */
export function DesktopScorecardSummaryModal() {
  const inXR = useGameStore((s) => s.inXR)
  const localPeerId = useGameStore((s) => s.localPeerId)
  const playerName = useGameStore((s) => s.playerName)
  const peers = useGameStore((s) => s.peers)

  const format = useCricketStore((s) => s.format)
  const pitchMode = useCricketStore((s) => s.pitchMode)
  const runs = useCricketStore((s) => s.runs)
  const inningsNumber = useCricketStore((s) => s.inningsNumber)
  const inningsOver = useCricketStore((s) => s.inningsOver)
  const firstInnings = useCricketStore((s) => s.firstInningsSummary)
  const secondInnings = useCricketStore((s) => s.secondInningsSummary)
  const matchResult = useCricketStore((s) => s.matchResultBanner)
  const visible = useCricketStore((s) => s.scorecardSummaryVisible)

  if (inXR || !inningsOver || !visible) return null

  const peerIds = Object.keys(peers)
  const sync = () => p2pClient.broadcastCricketState()
  const activeSummary: InningsSummarySnapshot | null =
    inningsNumber === 2 ? secondInnings ?? firstInnings : firstInnings
  const overGroups = activeSummary ? groupLogByOver(activeSummary.ballLog) : []

  const summaries: InningsSummarySnapshot[] = [
    ...(firstInnings ? [firstInnings] : []),
    ...(secondInnings ? [secondInnings] : []),
  ]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(2, 6, 23, 0.78)',
        backdropFilter: 'blur(8px)',
        padding: '16px',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '760px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0b1220',
          border: '2px solid #38bdf8',
          borderRadius: '16px',
          padding: '22px',
          color: '#f8fafc',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#38bdf8', fontWeight: 700, letterSpacing: '0.08em' }}>
              {format.toUpperCase()} • {pitchMode.toUpperCase()} PITCH
            </div>
            <h2 style={{ margin: '2px 0 0', fontSize: '1.4rem', fontWeight: 800 }}>
              {inningsNumber === 2 ? 'Full Match Scorecard Summary' : '1st Innings Play Summary'}
            </h2>
          </div>
          <button
            type="button"
            className="hud-btn"
            onClick={() => useCricketStore.getState().setScorecardSummaryVisible(false)}
          >
            Minimize
          </button>
        </div>

        <div
          style={{
            background: inningsNumber === 2 ? 'rgba(20, 83, 45, 0.7)' : 'rgba(30, 58, 138, 0.7)',
            border: '1px solid rgba(250, 204, 21, 0.45)',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '16px',
            color: '#fde047',
            fontWeight: 800,
            fontSize: '1.05rem',
            textAlign: 'center',
          }}
        >
          {matchResult || `1st Innings Total: ${runs} — Target for 2nd Innings: ${runs + 1}`}
        </div>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.88rem',
            marginBottom: '16px',
          }}
        >
          <thead>
            <tr style={{ background: '#1e293b', color: '#cbd5e1', textAlign: 'center' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>Innings / Batter</th>
              <th style={{ padding: '8px 6px' }}>Score</th>
              <th style={{ padding: '8px 6px' }}>Overs</th>
              <th style={{ padding: '8px 6px' }}>RR</th>
              <th style={{ padding: '8px 6px' }}>4s / 6s</th>
              <th style={{ padding: '8px 6px' }}>WD</th>
              <th style={{ padding: '8px 6px' }}>Dots</th>
              <th style={{ padding: '8px 6px' }}>Max Pace</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.inningsNumber} style={{ borderBottom: '1px solid #334155', textAlign: 'center' }}>
                <td style={{ padding: '10px', textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, color: '#38bdf8' }}>
                    {s.inningsNumber === 1 ? '1st Inn' : '2nd Inn'}:{' '}
                    {resolveParticipantName(s.batterId, localPeerId, playerName, peers)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    vs {resolveParticipantName(s.bowlerId, localPeerId, playerName, peers)}
                  </div>
                </td>
                <td style={{ fontWeight: 800, fontSize: '1.05rem' }}>
                  {s.runs}/{s.wickets}
                </td>
                <td style={{ color: '#fbbf24', fontWeight: 700 }}>{formatOvers(s.legalBalls)}</td>
                <td style={{ color: '#34d399', fontWeight: 700 }}>{calcRunRate(s.runs, s.legalBalls)}</td>
                <td>
                  {s.fours} / {s.sixes}
                </td>
                <td>{s.wides}</td>
                <td>{s.dots}</td>
                <td style={{ color: '#fb7185', fontWeight: 700 }}>
                  {s.peakSpeedKmh > 0 ? `${s.peakSpeedKmh} km/h` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '18px',
          }}
        >
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', marginBottom: '8px' }}>
            OVER-BY-OVER BREAKDOWN ({activeSummary?.inningsNumber === 2 ? '2ND INNINGS' : '1ST INNINGS'})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
            {overGroups.map((og) => (
              <div
                key={og.overNum}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#111c33',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontWeight: 800, color: '#94a3b8', fontSize: '0.82rem' }}>O{og.overNum}:</span>
                {og.balls.map((b, idx) => (
                  <span
                    key={idx}
                    title={
                      b.speedKmh > 0
                        ? `${b.speedKmh} km/h • ${formatSpinKindLabel(b.spinKind)}${b.spinRpm > 0 ? ` (${b.spinRpm} RPM)` : ''} • ${b.pitchLength}`
                        : b.label
                    }
                    style={{
                      minWidth: '24px',
                      height: '24px',
                      padding: '0 6px',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      background:
                        b.label === 'W'
                          ? '#dc2626'
                          : b.label === '6'
                            ? '#d97706'
                            : b.label === '4'
                              ? '#0284c7'
                              : b.isWide
                                ? '#7c3aed'
                                : '#334155',
                      color: '#fff',
                    }}
                  >
                    {b.label}
                  </span>
                ))}
                <span style={{ marginLeft: 'auto', fontWeight: 800, color: '#34d399', fontSize: '0.82rem' }}>
                  ({og.runs}r)
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
          {inningsNumber === 1 && (
            <button
              type="button"
              className="hud-btn active"
              onClick={() => {
                useCricketStore.getState().startSecondInnings(localPeerId, peerIds)
                sync()
              }}
            >
              Start 2nd Innings (Chase {runs + 1})
            </button>
          )}
          <button
            type="button"
            className="hud-btn"
            style={{ background: '#059669', borderColor: '#34d399' }}
            onClick={() => {
              useCricketStore.getState().resetMatch()
              sync()
            }}
          >
            Play New Match
          </button>
        </div>
      </div>
    </div>
  )
}
