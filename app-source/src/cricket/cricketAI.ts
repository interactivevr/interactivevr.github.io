import { playBatHitSfx, playBoundaryCrowdSfx, playCricketCatchSfx } from '../audio/cricketSfx'
import {
  AI_FIELD_POSITIONS,
  BATTING_CREASE_Z,
  BATTING_STUMPS_Z,
  BOWLING_STUMPS_Z,
  WIDE_HALF_W,
} from './types'
import { computeDeliveryVelocity } from './cricketPhysics'
import { cricketRuntime, resetCricketBallToBowler, useCricketStore } from './useCricketStore'

const FIELDER_RUN_SPEED = 7.4

export function stepCricketAI(dt: number, localPeerId: string): void {
  const st = useCricketStore.getState()
  if (st.inningsOver) return

  const ball = cricketRuntime.ball
  const myId = localPeerId || 'local'

  // Determine single authoritative peer to run AI decisions (lowest peerId or local when solo)
  const humanIds = Object.values(st.assignments).filter((v) => v !== 'ai')
  const sortedHumans = Array.from(new Set(humanIds)).sort()
  const isAIAuthority = sortedHumans.length === 0 || sortedHumans[0] === myId || sortedHumans[0] === 'local'

  // 1. AI Bowler run-up & delivery
  if (st.assignments.bowler === 'ai') {
    if (ball.phase === 'ready') {
      cricketRuntime.aiBowlCooldownSec -= dt
      const progress = Math.max(0, Math.min(1, 1 - cricketRuntime.aiBowlCooldownSec / 1.5))
      cricketRuntime.aiBowlerPos = [
        0.32,
        0,
        BOWLING_STUMPS_Z - 2.6 + progress * 2.1,
      ]

      if (isAIAuthority && cricketRuntime.aiBowlCooldownSec <= 0) {
        const style = st.bowlingStyle
        const spinDir = Math.random() < 0.72 ? st.spinDir : st.spinDir === 'off' ? 'leg' : 'off'
        const targetX = (Math.random() - 0.5) * 0.52
        const targetZ =
          style === 'fast'
            ? 3.6 + Math.random() * 4.4 // good length to yorker
            : 4.8 + Math.random() * 3.1 // flighted spinner length
        const releasePos: [number, number, number] = [0.32, 1.92, BOWLING_STUMPS_Z + 0.25]
        const { vel, spin } = computeDeliveryVelocity(
          releasePos,
          targetX,
          targetZ,
          style,
          spinDir,
          0.65 + Math.random() * 0.35
        )
        ball.phase = 'bowled'
        ball.ownerId = null
        ball.pos = [...releasePos]
        ball.prevPos = [...releasePos]
        ball.vel = vel
        ball.spin = spin
        ball.bowlingStyle = style
        ball.spinDir = spinDir
        ball.bouncedOnPitch = false
        ball.bouncedAfterHit = false
        ball.hitByBat = false
        ball.edgeContact = false
        ball.epoch += 1
        ball.timestamp = Date.now()
        cricketRuntime.onCricketBallSend?.(ball)
      }
    } else if (ball.phase === 'hit' && !ball.bouncedAfterHit && isAIAuthority) {
      // AI Bowler Caught & Bowled reflex check!
      const bp = cricketRuntime.aiBowlerPos
      const dx = ball.pos[0] - bp[0]
      const dz = ball.pos[2] - bp[2]
      const dy = ball.pos[1] - 1.25
      if (Math.hypot(dx, dy, dz) < 0.95 && ball.vel[2] < 0) {
        ball.phase = 'dead'
        ball.vel = [0, 0, 0]
        ball.epoch += 1
        playCricketCatchSfx()
        playBoundaryCrowdSfx(true)
        st.recordDeliveryOutcome({
          runsScored: 0,
          isWicket: true,
          isLegalBall: true,
          label: 'W',
          banner: 'OUT! CAUGHT & BOWLED BY AI!',
        })
        cricketRuntime.onCricketBallSend?.(ball)
        cricketRuntime.onCricketStateSend?.(useCricketStore.getState().getSyncPayload())
        return
      }
    }
  }

  // 2. AI Batter batting (when Bowler or Keeper is human!)
  if (st.assignments.batter === 'ai') {
    const xBase = st.batterStance === 'right' ? -0.48 : 0.48
    if (ball.phase === 'bowled') {
      // Track ball lateral line slightly while staying near crease
      const trackX = Math.max(-0.9, Math.min(0.9, ball.pos[0] * 0.45 + xBase * 0.55))
      cricketRuntime.aiBatterPos[0] += (trackX - cricketRuntime.aiBatterPos[0]) * Math.min(1, dt * 7)
      cricketRuntime.aiBatterPos[2] = BATTING_CREASE_Z + 0.18

      if (ball.pos[2] > BATTING_CREASE_Z - 1.1 && ball.pos[2] < BATTING_CREASE_Z + 0.65 && cricketRuntime.aiBatSwingPhase <= 0) {
        cricketRuntime.aiBatSwingPhase = 1.0
        if (isAIAuthority && Math.abs(ball.pos[0] - xBase) < 0.85 && ball.pos[1] < 1.55) {
          // Chance to hit cleanly, edge, or miss based on pitch & pace
          const speed = Math.hypot(ball.vel[0], ball.vel[1], ball.vel[2])
          const missChance = speed > 22 ? 0.34 : 0.22
          const roll = Math.random()
          if (roll > missChance) {
            const isLofted = roll > 0.76
            const isEdge = roll < missChance + 0.12
            const shotAngle = (Math.random() - 0.5) * 2.1 // spread across cover/straight/midwicket
            const launchSpeed = isEdge ? 12 : isLofted ? 25 + Math.random() * 8 : 16 + Math.random() * 8

            ball.phase = 'hit'
            ball.hitByBat = true
            ball.edgeContact = isEdge
            ball.bouncedAfterHit = false
            if (isEdge) {
              ball.vel = [(Math.random() > 0.5 ? 1 : -1) * 4.5, 3.2, 6.2]
            } else {
              ball.vel = [
                Math.sin(shotAngle) * launchSpeed,
                isLofted ? 9.5 + Math.random() * 4.5 : 1.4 + Math.random() * 2.2,
                -Math.cos(shotAngle) * launchSpeed,
              ]
            }
            ball.epoch += 1
            ball.timestamp = Date.now()
            playBatHitSfx(launchSpeed, isEdge)
            cricketRuntime.onCricketBallSend?.(ball)
          }
        }
      }
    } else {
      cricketRuntime.aiBatterPos[0] += (xBase - cricketRuntime.aiBatterPos[0]) * Math.min(1, dt * 4)
    }

    if (cricketRuntime.aiBatSwingPhase > 0) {
      cricketRuntime.aiBatSwingPhase = Math.max(0, cricketRuntime.aiBatSwingPhase - dt * 3.8)
    }
  }

  // 3. AI Wicketkeeper catching missed deliveries & edges behind stumps
  if (st.assignments.wicketkeeper === 'ai') {
    const targetX = ball.phase === 'bowled' || ball.phase === 'hit' ? Math.max(-2.2, Math.min(2.2, ball.pos[0])) : 0
    cricketRuntime.aiKeeperPos[0] += (targetX - cricketRuntime.aiKeeperPos[0]) * Math.min(1, dt * 8)

    if (isAIAuthority && (ball.phase === 'bowled' || (ball.phase === 'hit' && ball.vel[2] > 0))) {
      if (ball.pos[2] >= BATTING_STUMPS_Z + 1.15 && ball.pos[2] <= BATTING_STUMPS_Z + 3.2) {
        const dx = ball.pos[0] - cricketRuntime.aiKeeperPos[0]
        const dy = ball.pos[1] - 1.05
        if (Math.hypot(dx, dy) < 1.35) {
          const isWide =
            ball.phase === 'bowled' && !ball.hitByBat && Math.abs(ball.pos[0]) > WIDE_HALF_W
          const isCaughtBehind = ball.phase === 'hit' && !ball.bouncedAfterHit

          ball.phase = 'dead'
          ball.vel = [0, 0, 0]
          ball.epoch += 1
          playCricketCatchSfx()

          if (isCaughtBehind) {
            playBoundaryCrowdSfx(false)
            st.recordDeliveryOutcome({
              runsScored: 0,
              isWicket: true,
              isLegalBall: true,
              label: 'W',
              banner: 'OUT! CAUGHT BEHIND!',
            })
          } else if (isWide) {
            st.recordDeliveryOutcome({
              runsScored: 1,
              isWicket: false,
              isLegalBall: false,
              label: 'WD',
              banner: 'WIDE BALL (+1)',
            })
          } else {
            st.recordDeliveryOutcome({
              runsScored: 0,
              isWicket: false,
              isLegalBall: true,
              label: '0',
              banner: 'DOT BALL',
            })
          }
          cricketRuntime.onCricketBallSend?.(ball)
          cricketRuntime.onCricketStateSend?.(useCricketStore.getState().getSyncPayload())
          return
        }
      }
    }
  }

  // 4. Outfield AI Fielders chasing hit balls & catching aerial shots
  if (ball.phase === 'hit') {
    let closestIdx = 0
    let closestDist = Infinity
    for (let i = 0; i < cricketRuntime.fielders.length; i++) {
      const f = cricketRuntime.fielders[i]
      const d = Math.hypot(ball.pos[0] - f.pos[0], ball.pos[2] - f.pos[2])
      if (d < closestDist) {
        closestDist = d
        closestIdx = i
      }
    }

    for (let i = 0; i < cricketRuntime.fielders.length; i++) {
      const f = cricketRuntime.fielders[i]
      const isChaser = i === closestIdx
      if (isChaser) {
        const dx = ball.pos[0] - f.pos[0]
        const dz = ball.pos[2] - f.pos[2]
        const dist = Math.hypot(dx, dz)
        if (dist > 0.2) {
          const step = Math.min(dist, FIELDER_RUN_SPEED * dt)
          f.pos[0] += (dx / dist) * step
          f.pos[2] += (dz / dist) * step
          f.yaw = Math.atan2(-dx, -dz)
          f.isRunning = true
        }
      } else {
        f.isRunning = false
        f.yaw = Math.atan2(-(ball.pos[0] - f.pos[0]), -(ball.pos[2] - f.pos[2]))
      }
    }

    if (isAIAuthority) {
      const chaser = cricketRuntime.fielders[closestIdx]
      const dist2D = Math.hypot(ball.pos[0] - chaser.pos[0], ball.pos[2] - chaser.pos[2])

      // Airborne catch check (~2.0m dive reach!)
      if (!ball.bouncedAfterHit && dist2D < 2.0 && ball.pos[1] >= 0.12 && ball.pos[1] <= 2.35) {
        // Ensure ball has traveled away from the bat before fielder catches
        if (ball.maxDistanceFromPitch > 3.2) {
          chaser.diving = true
          ball.phase = 'dead'
          ball.vel = [0, 0, 0]
          ball.epoch += 1
          playCricketCatchSfx()
          playBoundaryCrowdSfx(true)
          st.recordDeliveryOutcome({
            runsScored: 0,
            isWicket: true,
            isLegalBall: true,
            label: 'W',
            banner: `OUT! CAUGHT AT ${AI_FIELD_POSITIONS[closestIdx].label.toUpperCase()}!`,
          })
          cricketRuntime.onCricketBallSend?.(ball)
          cricketRuntime.onCricketStateSend?.(useCricketStore.getState().getSyncPayload())
          return
        }
      }

      // Ground fielding pickup after bounce
      if (ball.bouncedAfterHit && dist2D < 1.15 && ball.pos[1] < 1.3 && ball.maxDistanceFromPitch > 2.5) {
        ball.phase = 'dead'
        ball.vel = [0, 0, 0]
        ball.epoch += 1
        playCricketCatchSfx()

        const d = ball.maxDistanceFromPitch
        const runsScored = d > 31 ? 3 : d > 20 ? 2 : d > 9 ? 1 : 0
        st.recordDeliveryOutcome({
          runsScored,
          isWicket: false,
          isLegalBall: true,
          label: `${runsScored}`,
          banner:
            runsScored === 0
              ? `FIELDED AT ${AI_FIELD_POSITIONS[closestIdx].label.toUpperCase()} (DOT)`
              : `${runsScored} RUN${runsScored > 1 ? 'S' : ''}!`,
        })
        cricketRuntime.onCricketBallSend?.(ball)
        cricketRuntime.onCricketStateSend?.(useCricketStore.getState().getSyncPayload())
      }
    }
  } else {
    // Return fielders smoothly toward home positions between balls
    for (let i = 0; i < cricketRuntime.fielders.length; i++) {
      const f = cricketRuntime.fielders[i]
      const home = AI_FIELD_POSITIONS[i].home
      const dx = home[0] - f.pos[0]
      const dz = home[2] - f.pos[2]
      const d = Math.hypot(dx, dz)
      if (d > 0.15) {
        const step = Math.min(d, 4.5 * dt)
        f.pos[0] += (dx / d) * step
        f.pos[2] += (dz / d) * step
        f.isRunning = true
      } else {
        f.isRunning = false
        f.diving = false
      }
      f.yaw = Math.atan2(-f.pos[0], 9 - f.pos[2])
    }
  }

  // 5. Auto-reset dead ball back to bowler after short celebration pause
  if (ball.phase === 'dead' && isAIAuthority) {
    ball.deadTimerSec += dt
    if (ball.deadTimerSec > 2.2) {
      resetCricketBallToBowler()
    }
  }
}
