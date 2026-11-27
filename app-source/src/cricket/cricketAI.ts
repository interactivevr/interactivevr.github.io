import { playBatHitSfx, playBoundaryCrowdSfx, playCricketCatchSfx } from '../audio/cricketSfx'
import { segmentSphereIntersects } from '../physics/ballPhysics'
import { useGameStore } from '../store/useGameStore'
import { applyBowledDeliveryToBall, predictPitchDropPoint } from './bowlingMechanics'
import { computeDeliveryVelocity } from './cricketPhysics'
import {
  AI_FIELD_POSITIONS,
  BATTING_CREASE_Z,
  BATTING_STUMPS_Z,
  BOWLING_STUMPS_Z,
  CRICKET_BALL_RADIUS,
  CricketSpinKind,
  WIDE_HALF_W,
} from './types'
import { cricketRuntime, resetCricketBallToBowler, useCricketStore } from './useCricketStore'

const FIELDER_SPRINT_SPEED = 10.6
const FIELDER_BACKUP_SPEED = 9.0

export function stepCricketAI(dt: number, localPeerId: string): void {
  const st = useCricketStore.getState()
  if (st.inningsOver) return

  const ball = cricketRuntime.ball
  const myId = localPeerId || 'local'

  const humanIds = Object.values(st.assignments).filter((v) => v !== 'ai')
  const sortedHumans = Array.from(new Set(humanIds)).sort()
  const isAIAuthority =
    sortedHumans.length === 0 || sortedHumans[0] === myId || sortedHumans[0] === 'local'

  // 1. AI Bowler athletic run-up & realistic overarm release
  if (st.assignments.bowler === 'ai') {
    if (ball.phase === 'ready') {
      const waitingForVRControllerTrigger =
        useGameStore.getState().inXR &&
        st.localCricketRole === 'batter' &&
        cricketRuntime.vrControllerActive &&
        !cricketRuntime.aiBowlRequested

      if (waitingForVRControllerTrigger) {
        cricketRuntime.aiBowlerWaiting = true
        st.setVrWaitingForBowlTrigger(true)
        cricketRuntime.aiBowlCooldownSec = cricketRuntime.aiBowlTotalSec
        const waitZ = BOWLING_STUMPS_Z - 5.2
        cricketRuntime.aiBowlerPos = [0.34, 0, waitZ]
        ball.pos = [0.52, 1.15, waitZ]
        ball.prevPos = [...ball.pos]
      } else {
        cricketRuntime.aiBowlerWaiting = false
        st.setVrWaitingForBowlTrigger(false)
        cricketRuntime.aiBowlCooldownSec -= dt
        const totalRunupSec = Math.max(0.35, cricketRuntime.aiBowlTotalSec)
        const progress = Math.max(0, Math.min(1, 1 - cricketRuntime.aiBowlCooldownSec / totalRunupSec))
        const runZ = BOWLING_STUMPS_Z - 5.2 + progress * 5.05 // smooth run-up from -15.26 to -10.2
        cricketRuntime.aiBowlerPos = [0.34, 0, runZ]

        // Keep ball in AI bowler's hand during run-up
        if (progress < 0.85) {
          ball.pos = [0.52, 1.15 + Math.sin(progress * Math.PI * 3) * 0.08, runZ]
        } else {
          // High overarm release gather point
          const armP = (progress - 0.85) / 0.15
          ball.pos = [0.46, 1.35 + armP * 0.72, runZ + 0.15]
        }
        ball.prevPos = [...ball.pos]

        if (isAIAuthority && cricketRuntime.aiBowlCooldownSec <= 0) {
          const style = st.bowlingStyle
          const aiRoll = Math.random()
          let spinKind: CricketSpinKind = 'fast'
          let spinDir = st.spinDir
          if (style === 'spin') {
            if (aiRoll < 0.35) {
              spinKind = st.spinDir === 'off' ? 'offbreak' : 'legbreak'
            } else if (aiRoll < 0.65) {
              spinKind = st.spinDir === 'off' ? 'legbreak' : 'offbreak'
              spinDir = spinKind === 'legbreak' ? 'leg' : 'off'
            } else if (aiRoll < 0.85) {
              spinKind = 'googly'
              spinDir = 'off'
            } else {
              spinKind = 'no-spin'
            }
          }
          const targetX = (Math.random() - 0.5) * 0.48
          const targetZ =
            style === 'fast'
              ? 3.8 + Math.random() * 4.2 // good length to yorker
              : 4.9 + Math.random() * 2.9 // flighted spinner length
          const releasePos: [number, number, number] = [0.42, 2.04, BOWLING_STUMPS_Z + 0.15]
          const power = 0.68 + Math.random() * 0.32
          const computed = computeDeliveryVelocity(
            releasePos,
            targetX,
            targetZ,
            style,
            spinDir,
            power
          )
          const spin: [number, number, number] =
            spinKind === 'no-spin'
              ? [0, 0, 0]
              : spinKind === 'googly'
                ? [Math.abs(computed.spin[0]), 0.9, 0]
                : computed.spin
          const drop = predictPitchDropPoint(releasePos, computed.vel, spin, style, spinKind)
          const spinRpm =
            spinKind === 'no-spin' || style === 'fast'
              ? 0
              : Math.round(1050 + power * 1100)

          applyBowledDeliveryToBall(ball, {
            ownerId: null,
            releasePos,
            vel: computed.vel,
            spin,
            bowlingStyle: style,
            spinDir,
            spinKind,
            spinRpm,
            dropPoint: drop.dropPoint,
            pitchLengthLabel: drop.lengthLabel,
          })
          cricketRuntime.onCricketBallSend?.(ball)
        }
      }
    } else if (ball.phase === 'bowled') {
      // Follow-through momentum slightly down pitch
      cricketRuntime.aiBowlerPos[2] = Math.min(
        BOWLING_STUMPS_Z + 1.4,
        cricketRuntime.aiBowlerPos[2] + dt * 2.5
      )
    } else if (ball.phase === 'hit' && !ball.bouncedAfterHit && isAIAuthority) {
      // AI Bowler Caught & Bowled check along swept ball path!
      const bp = cricketRuntime.aiBowlerPos
      const caught =
        ball.vel[2] < 0 &&
        segmentSphereIntersects(
          ball.prevPos[0],
          ball.prevPos[1],
          ball.prevPos[2],
          ball.pos[0],
          ball.pos[1],
          ball.pos[2],
          bp[0],
          1.28,
          bp[2],
          CRICKET_BALL_RADIUS + 1.05
        )
      if (caught) {
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
          banner: 'OUT! CAUGHT & BOWLED!',
        })
        cricketRuntime.onCricketBallSend?.(ball)
        cricketRuntime.onCricketStateSend?.(useCricketStore.getState().getSyncPayload())
        return
      }
    }
  }

  // 2. AI Batter batting
  if (st.assignments.batter === 'ai') {
    const xBase = st.batterStance === 'right' ? -0.48 : 0.48
    if (ball.phase === 'bowled') {
      const trackX = Math.max(-0.9, Math.min(0.9, ball.pos[0] * 0.45 + xBase * 0.55))
      cricketRuntime.aiBatterPos[0] += (trackX - cricketRuntime.aiBatterPos[0]) * Math.min(1, dt * 7)
      cricketRuntime.aiBatterPos[2] = BATTING_CREASE_Z + 0.18

      if (
        ball.pos[2] > BATTING_CREASE_Z - 1.1 &&
        ball.pos[2] < BATTING_CREASE_Z + 0.65 &&
        cricketRuntime.aiBatSwingPhase <= 0
      ) {
        cricketRuntime.aiBatSwingPhase = 1.0
        if (isAIAuthority && Math.abs(ball.pos[0] - xBase) < 0.85 && ball.pos[1] < 1.55) {
          const speed = Math.hypot(ball.vel[0], ball.vel[1], ball.vel[2])
          const missChance = speed > 22 ? 0.32 : 0.2
          const roll = Math.random()
          if (roll > missChance) {
            const isLofted = roll > 0.76
            const isEdge = roll < missChance + 0.12
            const shotAngle = (Math.random() - 0.5) * 2.15
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

  // 3. AI Wicketkeeper
  if (st.assignments.wicketkeeper === 'ai') {
    const targetX =
      ball.phase === 'bowled' || ball.phase === 'hit'
        ? Math.max(-2.2, Math.min(2.2, ball.pos[0]))
        : 0
    cricketRuntime.aiKeeperPos[0] += (targetX - cricketRuntime.aiKeeperPos[0]) * Math.min(1, dt * 8.5)

    if (isAIAuthority && (ball.phase === 'bowled' || (ball.phase === 'hit' && ball.vel[2] > 0))) {
      if (ball.pos[2] >= BATTING_STUMPS_Z + 1.1 && ball.pos[2] <= BATTING_STUMPS_Z + 3.4) {
        const dx = ball.pos[0] - cricketRuntime.aiKeeperPos[0]
        const dy = ball.pos[1] - 1.05
        if (Math.hypot(dx, dy) < 1.45) {
          const isWide =
            ball.phase === 'bowled' && !ball.hitByBat && Math.abs(ball.pos[0]) > WIDE_HALF_W
          const isCaughtBehind = ball.phase === 'hit' && !ball.bouncedAfterHit

          ball.phase = 'dead'
          ball.vel = [0, 0, 0]
          ball.epoch += 1
          playCricketCatchSfx()

          if (isCaughtBehind) {
            playBoundaryCrowdSfx(true)
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

  // 4. Smart Predictive Interception for All 10 AI Outfielders
  if (ball.phase === 'hit') {
    const leadX = ball.pos[0] + ball.vel[0] * 0.45
    const leadZ = ball.pos[2] + ball.vel[2] * 0.45

    let firstIdx = 0
    let firstDist = Infinity
    let secondIdx = 1
    let secondDist = Infinity

    for (let i = 0; i < cricketRuntime.fielders.length; i++) {
      const f = cricketRuntime.fielders[i]
      const d = Math.hypot(leadX - f.pos[0], leadZ - f.pos[2])
      if (d < firstDist) {
        secondDist = firstDist
        secondIdx = firstIdx
        firstDist = d
        firstIdx = i
      } else if (d < secondDist) {
        secondDist = d
        secondIdx = i
      }
    }

    for (let i = 0; i < cricketRuntime.fielders.length; i++) {
      const f = cricketRuntime.fielders[i]
      if (i === firstIdx || i === secondIdx) {
        const tx = i === firstIdx ? ball.pos[0] + ball.vel[0] * 0.22 : leadX
        const tz = i === firstIdx ? ball.pos[2] + ball.vel[2] * 0.22 : leadZ
        const dx = tx - f.pos[0]
        const dz = tz - f.pos[2]
        const dist = Math.hypot(dx, dz)
        const maxSpd = i === firstIdx ? FIELDER_SPRINT_SPEED : FIELDER_BACKUP_SPEED
        if (dist > 0.18) {
          const step = Math.min(dist, maxSpd * dt)
          f.pos[0] += (dx / dist) * step
          f.pos[2] += (dz / dist) * step
          f.yaw = Math.atan2(-dx, -dz)
          f.isRunning = true
        } else {
          f.isRunning = false
        }
      } else {
        f.isRunning = false
        f.yaw = Math.atan2(-(ball.pos[0] - f.pos[0]), -(ball.pos[2] - f.pos[2]))
      }
    }

    if (isAIAuthority && ball.maxDistanceFromPitch > 3.2) {
      // Swept-segment catch & ground intercept checks across closest chasers
      for (const idx of [firstIdx, secondIdx]) {
        const chaser = cricketRuntime.fielders[idx]
        if (!chaser) continue

        // Airborne catch check (2.15m dive reach!)
        if (!ball.bouncedAfterHit) {
          const caught = segmentSphereIntersects(
            ball.prevPos[0],
            ball.prevPos[1],
            ball.prevPos[2],
            ball.pos[0],
            ball.pos[1],
            ball.pos[2],
            chaser.pos[0],
            1.15,
            chaser.pos[2],
            CRICKET_BALL_RADIUS + 2.15
          )
          if (caught && ball.pos[1] <= 2.75) {
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
              banner: `OUT! CAUGHT BY ${AI_FIELD_POSITIONS[idx].label.toUpperCase()}!`,
            })
            cricketRuntime.onCricketBallSend?.(ball)
            cricketRuntime.onCricketStateSend?.(useCricketStore.getState().getSyncPayload())
            return
          }
        }

        // Ground fielding stop after bounce
        if (ball.bouncedAfterHit && ball.pos[1] <= 1.35) {
          const intercepted = segmentSphereIntersects(
            ball.prevPos[0],
            ball.prevPos[1],
            ball.prevPos[2],
            ball.pos[0],
            ball.pos[1],
            ball.pos[2],
            chaser.pos[0],
            0.45,
            chaser.pos[2],
            CRICKET_BALL_RADIUS + 1.45
          )
          if (intercepted) {
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
                  ? `STOPPED BY ${AI_FIELD_POSITIONS[idx].label.toUpperCase()} (DOT)`
                  : `${runsScored} RUN${runsScored > 1 ? 'S' : ''}!`,
            })
            cricketRuntime.onCricketBallSend?.(ball)
            cricketRuntime.onCricketStateSend?.(useCricketStore.getState().getSyncPayload())
            return
          }
        }
      }
    }
  } else {
    for (let i = 0; i < cricketRuntime.fielders.length; i++) {
      const f = cricketRuntime.fielders[i]
      const home = AI_FIELD_POSITIONS[i].home
      const dx = home[0] - f.pos[0]
      const dz = home[2] - f.pos[2]
      const d = Math.hypot(dx, dz)
      if (d > 0.15) {
        const step = Math.min(d, 5.5 * dt)
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

  // 5. Celebration delay: 3.0s on Wicket / 4 / 6, 1.9s on Dot / 1-3 runs
  if (ball.phase === 'dead' && isAIAuthority) {
    ball.deadTimerSec += dt
    const isCelebration =
      st.lastOutcomeKind === 'wicket' || st.lastOutcomeKind === 'four' || st.lastOutcomeKind === 'six'
    const delaySec = isCelebration ? 3.0 : 1.9
    if (ball.deadTimerSec >= delaySec) {
      resetCricketBallToBowler()
    }
  }
}
