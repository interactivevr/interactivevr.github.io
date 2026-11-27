import { create } from 'zustand'
import {
  AI_FIELD_POSITIONS,
  BatterStance,
  BOWLING_STUMPS_Z,
  BowlingStyle,
  CricketBallNetState,
  CricketFormat,
  CricketRole,
  CricketRoleAssignments,
  CricketSpinKind,
  getMaxBallsForFormat,
  getMaxWicketsForFormat,
  PitchMode,
  SpinDirection,
} from './types'

export interface InningsBallEvent {
  ballNum: number
  overText: string
  label: string
  runs: number
  isWicket: boolean
  isWide: boolean
  speedKmh: number
  spinKind: CricketSpinKind
  spinRpm: number
  pitchLength: string
}

export interface InningsSummarySnapshot {
  inningsNumber: 1 | 2
  batterId: string
  bowlerId: string
  runs: number
  wickets: number
  legalBalls: number
  fours: number
  sixes: number
  wides: number
  dots: number
  peakSpeedKmh: number
  ballLog: InningsBallEvent[]
}

function buildInningsSummary(opts: {
  inningsNumber: 1 | 2
  batterId: string
  bowlerId: string
  runs: number
  wickets: number
  legalBalls: number
  ballLog: InningsBallEvent[]
}): InningsSummarySnapshot {
  let fours = 0
  let sixes = 0
  let wides = 0
  let dots = 0
  let peakSpeedKmh = 0
  for (let i = 0; i < opts.ballLog.length; i++) {
    const b = opts.ballLog[i]
    if (b.runs === 4 && !b.isWide) fours += 1
    else if (b.runs >= 6) sixes += 1
    if (b.isWide) wides += 1
    if (b.runs === 0 && !b.isWicket && !b.isWide) dots += 1
    if (b.speedKmh > peakSpeedKmh) peakSpeedKmh = b.speedKmh
  }
  return {
    inningsNumber: opts.inningsNumber,
    batterId: opts.batterId,
    bowlerId: opts.bowlerId,
    runs: opts.runs,
    wickets: opts.wickets,
    legalBalls: opts.legalBalls,
    fours,
    sixes,
    wides,
    dots,
    peakSpeedKmh,
    ballLog: opts.ballLog,
  }
}

export interface RuntimeCricketBall extends CricketBallNetState {
  prevPos: [number, number, number]
  deadTimerSec: number
  fieldedTimeSec: number
  maxDistanceFromPitch: number
}

export interface StumpVisualState {
  broken: boolean
  breakTimer: number
  offsets: Array<{ pos: [number, number, number]; rot: [number, number, number] }>
  bails: Array<{ pos: [number, number, number]; vel: [number, number, number]; rot: [number, number, number] }>
}

export interface AIFielderRuntime {
  id: number
  pos: [number, number, number]
  yaw: number
  isRunning: boolean
  diving: boolean
}

export interface BatCollisionSegment {
  prevBase: [number, number, number]
  prevTip: [number, number, number]
  currBase: [number, number, number]
  currTip: [number, number, number]
  vel: [number, number, number]
  faceNormal: [number, number, number]
  active: boolean
}

function createReadyBall(style: BowlingStyle, spinDir: SpinDirection): RuntimeCricketBall {
  const startPos: [number, number, number] = [0.32, 1.35, BOWLING_STUMPS_Z - 0.1]
  return {
    phase: 'ready',
    ownerId: null,
    epoch: 1,
    pos: [...startPos],
    prevPos: [...startPos],
    vel: [0, 0, 0],
    spin: [0, 0, 0],
    bowlingStyle: style,
    spinDir,
    spinKind: style === 'fast' ? 'fast' : 'no-spin',
    spinRpm: 0,
    releaseSpeedMps: 0,
    predictedDropPos: null,
    pitchLengthLabel: '',
    bouncedOnPitch: false,
    bouncedAfterHit: false,
    hitByBat: false,
    edgeContact: false,
    timestamp: Date.now(),
    deadTimerSec: 0,
    fieldedTimeSec: 0,
    maxDistanceFromPitch: 0,
  }
}

export const cricketRuntime = {
  ball: createReadyBall('fast', 'off') as RuntimeCricketBall,
  bat: {
    prevBase: [0, 0.9, 8.8] as [number, number, number],
    prevTip: [0, 0.25, 8.8] as [number, number, number],
    currBase: [0, 0.9, 8.8] as [number, number, number],
    currTip: [0, 0.25, 8.8] as [number, number, number],
    vel: [0, 0, 0] as [number, number, number],
    faceNormal: [0, 0.2, -1] as [number, number, number],
    active: false,
  } as BatCollisionSegment,
  stumps: {
    broken: false,
    breakTimer: 0,
    offsets: [
      { pos: [0, 0, 0], rot: [0, 0, 0] },
      { pos: [0, 0, 0], rot: [0, 0, 0] },
      { pos: [0, 0, 0], rot: [0, 0, 0] },
    ],
    bails: [
      { pos: [-0.055, 0.72, 0], vel: [0, 0, 0], rot: [0, 0, 0] },
      { pos: [0.055, 0.72, 0], vel: [0, 0, 0], rot: [0, 0, 0] },
    ],
  } as StumpVisualState,
  fielders: AI_FIELD_POSITIONS.map((f) => ({
    id: f.id,
    pos: [...f.home] as [number, number, number],
    yaw: Math.atan2(-f.home[0], 9 - f.home[2]),
    isRunning: false,
    diving: false,
  })) as AIFielderRuntime[],
  aiBowlCooldownSec: 1.55,
  aiBowlTotalSec: 1.55,
  vrControllerActive: false,
  aiBowlRequested: false,
  aiBowlerWaiting: false,
  aiBatSwingPhase: 0,
  aiKeeperPos: [0, 0, 12.1] as [number, number, number],
  aiBowlerPos: [0.32, 0, BOWLING_STUMPS_Z - 0.55] as [number, number, number],
  aiBatterPos: [-0.48, 0, 9.04] as [number, number, number],
  onCricketBallSend: null as ((ball: CricketBallNetState) => void) | null,
  onCricketStateSend: null as ((payload: CricketStateSyncPayload) => void) | null,
}

export type CricketOutcomeKind = 'none' | 'wicket' | 'six' | 'four' | 'runs' | 'dot'

export interface CricketStateSyncPayload {
  format: CricketFormat
  pitchMode: PitchMode
  bowlingStyle: BowlingStyle
  spinDir: SpinDirection
  batterStance: BatterStance
  runs: number
  wickets: number
  legalBalls: number
  targetScore: number | null
  inningsNumber: 1 | 2
  inningsOver: boolean
  recentBalls: string[]
  eventBanner: string | null
  lastOutcomeKind: CricketOutcomeKind
  lastDeliverySpeedKmh: number
  lastDeliverySpinKind: CricketSpinKind
  lastDeliverySpinRpm: number
  lastDropPoint: [number, number] | null
  lastPitchLengthLabel: string
  currentInningsLog: InningsBallEvent[]
  firstInningsSummary: InningsSummarySnapshot | null
  secondInningsSummary: InningsSummarySnapshot | null
  matchResultBanner: string | null
  scorecardSummaryVisible: boolean
  assignments: CricketRoleAssignments
}

export function resetCricketBallToBowler(style?: BowlingStyle, spinDir?: SpinDirection): void {
  const st = useCricketStore.getState()
  const nextStyle = style ?? st.bowlingStyle
  const nextSpin = spinDir ?? st.spinDir
  const prevEpoch = cricketRuntime.ball.epoch
  const fresh = createReadyBall(nextStyle, nextSpin)
  fresh.epoch = prevEpoch + 1
  const bowlerAssignee = st.assignments.bowler
  fresh.ownerId = bowlerAssignee === 'ai' ? null : bowlerAssignee
  cricketRuntime.ball = fresh

  // Reset stumps & bails upright
  cricketRuntime.stumps.broken = false
  cricketRuntime.stumps.breakTimer = 0
  cricketRuntime.stumps.offsets.forEach((o) => {
    o.pos = [0, 0, 0]
    o.rot = [0, 0, 0]
  })
  cricketRuntime.stumps.bails[0] = { pos: [-0.055, 0.72, 0], vel: [0, 0, 0], rot: [0, 0, 0] }
  cricketRuntime.stumps.bails[1] = { pos: [0.055, 0.72, 0], vel: [0, 0, 0], rot: [0, 0, 0] }

  // Reset AI fielders smoothly toward home
  AI_FIELD_POSITIONS.forEach((f, idx) => {
    cricketRuntime.fielders[idx].pos = [...f.home]
    cricketRuntime.fielders[idx].isRunning = false
    cricketRuntime.fielders[idx].diving = false
  })
  cricketRuntime.aiBowlCooldownSec = 1.55
  cricketRuntime.aiBowlTotalSec = 1.55
  cricketRuntime.aiBowlRequested = false
  cricketRuntime.aiBowlerWaiting = false
  useCricketStore.setState({ lastOutcomeKind: 'none', vrWaitingForBowlTrigger: false })
  cricketRuntime.onCricketBallSend?.(fresh)
}

export interface CricketStoreState {
  format: CricketFormat
  pitchMode: PitchMode
  bowlingStyle: BowlingStyle
  spinDir: SpinDirection
  batterStance: BatterStance
  preferredLocalRole: CricketRole
  localCricketRole: CricketRole
  assignments: CricketRoleAssignments
  aiBowlerEnabled: boolean
  aiBatterEnabled: boolean
  aiKeeperEnabled: boolean
  runs: number
  wickets: number
  legalBalls: number
  targetScore: number | null
  inningsNumber: 1 | 2
  inningsOver: boolean
  recentBalls: string[]
  eventBanner: string | null
  lastOutcomeKind: CricketOutcomeKind
  lastDeliverySpeedKmh: number
  lastDeliverySpinKind: CricketSpinKind
  lastDeliverySpinRpm: number
  lastDropPoint: [number, number] | null
  lastPitchLengthLabel: string
  livePalmSpinHint: CricketSpinKind | null
  vrWaitingForBowlTrigger: boolean
  currentInningsLog: InningsBallEvent[]
  firstInningsSummary: InningsSummarySnapshot | null
  secondInningsSummary: InningsSummarySnapshot | null
  matchResultBanner: string | null
  scorecardSummaryVisible: boolean
  bowlerCharge: number
  bowlerCatchActive: boolean
  keeperCatchActive: boolean
  batSwingPulse: number
  pitchTarget: [number, number] // [x, z] target landing spot for PC bowler

  setFormat: (format: CricketFormat) => void
  setPitchMode: (mode: PitchMode) => void
  setBowlingStyle: (style: BowlingStyle) => void
  setSpinDir: (dir: SpinDirection) => void
  setBatterStance: (stance: BatterStance) => void
  setPreferredLocalRole: (role: CricketRole) => void
  setRoleController: (role: CricketRole, mode: 'human' | 'ai') => void
  recomputeCricketAssignments: (localPeerId: string, peerIds: string[]) => void
  rotateCricketRoles: (localPeerId: string, peerIds: string[]) => void
  setBowlerCharge: (charge: number) => void
  setBowlerCatchActive: (active: boolean) => void
  setKeeperCatchActive: (active: boolean) => void
  setBatSwingPulse: (pulse: number) => void
  setPitchTarget: (x: number, z: number) => void
  setEventBanner: (banner: string | null) => void
  setLivePalmSpinHint: (hint: CricketSpinKind | null) => void
  setVrWaitingForBowlTrigger: (waiting: boolean) => void
  setScorecardSummaryVisible: (visible: boolean) => void
  setDeliveryTelemetry: (opts: {
    speedKmh: number
    spinKind: CricketSpinKind
    spinRpm: number
    dropPoint: [number, number] | null
    pitchLengthLabel: string
  }) => void
  recordDeliveryOutcome: (opts: {
    runsScored: number
    isWicket: boolean
    isLegalBall: boolean
    label: string
    banner: string
  }) => void
  startSecondInnings: (localPeerId: string, peerIds: string[]) => void
  resetMatch: () => void
  applyNetworkCricketState: (payload: CricketStateSyncPayload, localPeerId: string) => void
  getSyncPayload: () => CricketStateSyncPayload
}

export const useCricketStore = create<CricketStoreState>((set, get) => ({
  format: '1-over',
  pitchMode: 'hard',
  bowlingStyle: 'fast',
  spinDir: 'off',
  batterStance: 'right',
  preferredLocalRole: 'batter',
  localCricketRole: 'batter',
  assignments: {
    batter: 'local',
    bowler: 'ai',
    wicketkeeper: 'ai',
  },
  aiBowlerEnabled: true,
  aiBatterEnabled: false,
  aiKeeperEnabled: true,
  runs: 0,
  wickets: 0,
  legalBalls: 0,
  targetScore: null,
  inningsNumber: 1,
  inningsOver: false,
  recentBalls: [],
  eventBanner: null,
  lastOutcomeKind: 'none',
  lastDeliverySpeedKmh: 0,
  lastDeliverySpinKind: 'fast',
  lastDeliverySpinRpm: 0,
  lastDropPoint: null,
  lastPitchLengthLabel: '',
  livePalmSpinHint: null,
  vrWaitingForBowlTrigger: false,
  currentInningsLog: [],
  firstInningsSummary: null,
  secondInningsSummary: null,
  matchResultBanner: null,
  scorecardSummaryVisible: false,
  bowlerCharge: 0,
  bowlerCatchActive: false,
  keeperCatchActive: false,
  batSwingPulse: 0,
  pitchTarget: [0.05, 5.2],

  setFormat: (format) => {
    set({
      format,
      runs: 0,
      wickets: 0,
      legalBalls: 0,
      inningsOver: false,
      recentBalls: [],
      targetScore: null,
      inningsNumber: 1,
      currentInningsLog: [],
      firstInningsSummary: null,
      secondInningsSummary: null,
      matchResultBanner: null,
      scorecardSummaryVisible: false,
      eventBanner: `${format.toUpperCase()} MATCH STARTED`,
    })
    resetCricketBallToBowler()
  },

  setPitchMode: (pitchMode) => set({ pitchMode, eventBanner: pitchMode === 'hard' ? 'HARD PITCH: High bounce & turn!' : 'WET PITCH: Slow & low, tough for pacers' }),
  setBowlingStyle: (bowlingStyle) => set({ bowlingStyle }),
  setSpinDir: (spinDir) => set({ spinDir }),
  setBatterStance: (batterStance) => set({ batterStance }),
  setPreferredLocalRole: (preferredLocalRole) => set({ preferredLocalRole }),

  setRoleController: (role, mode) => {
    const st = get()
    const nextAi = {
      aiBatterEnabled: role === 'batter' ? mode === 'ai' : st.aiBatterEnabled,
      aiBowlerEnabled: role === 'bowler' ? mode === 'ai' : st.aiBowlerEnabled,
      aiKeeperEnabled: role === 'wicketkeeper' ? mode === 'ai' : st.aiKeeperEnabled,
    }
    set(nextAi)
  },

  recomputeCricketAssignments: (localPeerId, peerIds) => {
    const st = get()
    const myId = localPeerId || 'local'
    const allSorted = Array.from(new Set([myId, ...peerIds])).sort()

    if (allSorted.length === 1) {
      const localRole = st.preferredLocalRole
      const assignments: CricketRoleAssignments = {
        batter: localRole === 'batter' ? myId : st.aiBatterEnabled ? 'ai' : 'ai',
        bowler: localRole === 'bowler' ? myId : st.aiBowlerEnabled ? 'ai' : 'ai',
        wicketkeeper: localRole === 'wicketkeeper' ? myId : 'ai',
      }
      set({
        localCricketRole: localRole,
        assignments,
        aiBatterEnabled: assignments.batter === 'ai',
        aiBowlerEnabled: assignments.bowler === 'ai',
        aiKeeperEnabled: assignments.wicketkeeper === 'ai',
      })
      return
    }

    // Multi-peer assignment: assign human peers deterministically in sorted order
    // keeping optional AI for any unoccupied role (or if user explicitly toggled AI)
    const rolesOrder: CricketRole[] = ['batter', 'bowler', 'wicketkeeper']
    const assignments: CricketRoleAssignments = {
      batter: 'ai',
      bowler: 'ai',
      wicketkeeper: 'ai',
    }
    allSorted.forEach((id, idx) => {
      const role = rolesOrder[idx % rolesOrder.length]
      assignments[role] = id
    })

    let localRole: CricketRole = 'batter'
    if (assignments.bowler === myId) localRole = 'bowler'
    else if (assignments.wicketkeeper === myId) localRole = 'wicketkeeper'

    set({
      localCricketRole: localRole,
      assignments,
      aiBatterEnabled: assignments.batter === 'ai',
      aiBowlerEnabled: assignments.bowler === 'ai',
      aiKeeperEnabled: assignments.wicketkeeper === 'ai',
    })
  },

  rotateCricketRoles: (localPeerId, peerIds) => {
    const st = get()
    const myId = localPeerId || 'local'
    const allSorted = Array.from(new Set([myId, ...peerIds])).sort()

    if (allSorted.length === 1) {
      const order: CricketRole[] = ['batter', 'bowler', 'wicketkeeper']
      const nextRole = order[(order.indexOf(st.localCricketRole) + 1) % order.length]
      const assignments: CricketRoleAssignments = {
        batter: nextRole === 'batter' ? myId : 'ai',
        bowler: nextRole === 'bowler' ? myId : 'ai',
        wicketkeeper: nextRole === 'wicketkeeper' ? myId : 'ai',
      }
      set({
        preferredLocalRole: nextRole,
        localCricketRole: nextRole,
        assignments,
        aiBatterEnabled: assignments.batter === 'ai',
        aiBowlerEnabled: assignments.bowler === 'ai',
        aiKeeperEnabled: assignments.wicketkeeper === 'ai',
      })
      resetCricketBallToBowler()
      return
    }

    // Rotate current human assignments: batter -> bowler -> wicketkeeper -> batter
    const prev = st.assignments
    const occupied: Array<{ role: CricketRole; id: string }> = (
      ['batter', 'bowler', 'wicketkeeper'] as CricketRole[]
    )
      .filter((r) => prev[r] !== 'ai')
      .map((r) => ({ role: r, id: prev[r] }))

    const nextAssign: CricketRoleAssignments = {
      batter: 'ai',
      bowler: 'ai',
      wicketkeeper: 'ai',
    }

    if (occupied.length === 2) {
      // 2 peers swap cleanly between batter & bowler (or through keeper)
      nextAssign[occupied[0].role] = occupied[1].id
      nextAssign[occupied[1].role] = occupied[0].id
    } else if (occupied.length >= 3) {
      nextAssign.batter = prev.wicketkeeper
      nextAssign.bowler = prev.batter
      nextAssign.wicketkeeper = prev.bowler
    }

    let localRole: CricketRole = 'batter'
    if (nextAssign.bowler === myId) localRole = 'bowler'
    else if (nextAssign.wicketkeeper === myId) localRole = 'wicketkeeper'

    set({
      localCricketRole: localRole,
      assignments: nextAssign,
      aiBatterEnabled: nextAssign.batter === 'ai',
      aiBowlerEnabled: nextAssign.bowler === 'ai',
      aiKeeperEnabled: nextAssign.wicketkeeper === 'ai',
    })
    resetCricketBallToBowler()
  },

  setBowlerCharge: (bowlerCharge) => set({ bowlerCharge }),
  setBowlerCatchActive: (bowlerCatchActive) => set({ bowlerCatchActive }),
  setKeeperCatchActive: (keeperCatchActive) => set({ keeperCatchActive }),
  setBatSwingPulse: (batSwingPulse) => set({ batSwingPulse }),
  setPitchTarget: (x, z) =>
    set({
      pitchTarget: [
        Math.max(-1.05, Math.min(1.05, x)),
        Math.max(-2.0, Math.min(8.6, z)),
      ],
    }),
  setEventBanner: (eventBanner) => set({ eventBanner }),
  setLivePalmSpinHint: (livePalmSpinHint) => {
    if (get().livePalmSpinHint !== livePalmSpinHint) {
      set({ livePalmSpinHint })
    }
  },
  setVrWaitingForBowlTrigger: (vrWaitingForBowlTrigger) => {
    if (get().vrWaitingForBowlTrigger !== vrWaitingForBowlTrigger) {
      set({ vrWaitingForBowlTrigger })
    }
  },
  setScorecardSummaryVisible: (scorecardSummaryVisible) => set({ scorecardSummaryVisible }),
  setDeliveryTelemetry: ({ speedKmh, spinKind, spinRpm, dropPoint, pitchLengthLabel }) =>
    set({
      lastDeliverySpeedKmh: speedKmh,
      lastDeliverySpinKind: spinKind,
      lastDeliverySpinRpm: spinRpm,
      lastDropPoint: dropPoint,
      lastPitchLengthLabel: pitchLengthLabel,
    }),

  recordDeliveryOutcome: ({ runsScored, isWicket, isLegalBall, label, banner }) => {
    const st = get()
    if (st.inningsOver) return

    const nextRuns = st.runs + runsScored
    const nextWickets = st.wickets + (isWicket ? 1 : 0)
    const nextBalls = st.legalBalls + (isLegalBall ? 1 : 0)
    const maxBalls = getMaxBallsForFormat(st.format)
    const maxWickets = getMaxWicketsForFormat(st.format)

    const chasedTarget = st.targetScore !== null && nextRuns >= st.targetScore
    const inningsDone =
      chasedTarget || nextBalls >= maxBalls || nextWickets >= maxWickets

    let finalBanner = banner
    if (chasedTarget) {
      finalBanner = `TARGET CHASED! BATTER WINS (${nextRuns}/${nextWickets})`
    } else if (inningsDone) {
      finalBanner = `INNINGS OVER: ${nextRuns}/${nextWickets}`
    }

    const outcomeKind: CricketOutcomeKind = isWicket
      ? 'wicket'
      : runsScored >= 6
        ? 'six'
        : runsScored === 4
          ? 'four'
          : runsScored > 0
            ? 'runs'
            : 'dot'

    const ballEvent: InningsBallEvent = {
      ballNum: nextBalls,
      overText: `${Math.floor(Math.max(0, nextBalls - (isLegalBall ? 1 : 0)) / 6)}.${(Math.max(0, nextBalls - (isLegalBall ? 1 : 0)) % 6) + 1}`,
      label,
      runs: runsScored,
      isWicket,
      isWide: !isLegalBall,
      speedKmh: st.lastDeliverySpeedKmh,
      spinKind: st.lastDeliverySpinKind,
      spinRpm: st.lastDeliverySpinRpm,
      pitchLength: st.lastPitchLengthLabel,
    }
    const nextLog = [...st.currentInningsLog, ballEvent]

    let nextFirstSummary = st.firstInningsSummary
    let nextSecondSummary = st.secondInningsSummary
    let nextMatchResult = st.matchResultBanner

    if (inningsDone) {
      const snap = buildInningsSummary({
        inningsNumber: st.inningsNumber,
        batterId: st.assignments.batter,
        bowlerId: st.assignments.bowler,
        runs: nextRuns,
        wickets: nextWickets,
        legalBalls: nextBalls,
        ballLog: nextLog,
      })
      if (st.inningsNumber === 1) {
        nextFirstSummary = snap
      } else {
        nextSecondSummary = snap
        if (st.targetScore !== null) {
          if (chasedTarget) {
            const wktsLeft = Math.max(1, maxWickets - nextWickets)
            nextMatchResult = `2ND INNINGS WON BY ${wktsLeft} WICKET${wktsLeft > 1 ? 'S' : ''}!`
          } else if (nextRuns === st.targetScore - 1) {
            nextMatchResult = `MATCH TIED! (${nextRuns} - ${nextRuns})`
          } else {
            const runMargin = st.targetScore - 1 - nextRuns
            nextMatchResult = `1ST INNINGS WON BY ${runMargin} RUN${runMargin > 1 ? 'S' : ''}!`
          }
          finalBanner = nextMatchResult
        }
      }
    }

    set({
      runs: nextRuns,
      wickets: nextWickets,
      legalBalls: nextBalls,
      inningsOver: inningsDone,
      recentBalls: [...st.recentBalls.slice(-11), label],
      eventBanner: finalBanner,
      lastOutcomeKind: outcomeKind,
      currentInningsLog: nextLog,
      firstInningsSummary: nextFirstSummary,
      secondInningsSummary: nextSecondSummary,
      matchResultBanner: nextMatchResult,
      scorecardSummaryVisible: inningsDone ? true : st.scorecardSummaryVisible,
    })
  },

  startSecondInnings: (localPeerId, peerIds) => {
    const st = get()
    const target = st.runs + 1
    set({
      targetScore: target,
      inningsNumber: 2,
      runs: 0,
      wickets: 0,
      legalBalls: 0,
      inningsOver: false,
      recentBalls: [],
      currentInningsLog: [],
      secondInningsSummary: null,
      matchResultBanner: null,
      scorecardSummaryVisible: false,
      eventBanner: `2ND INNINGS: CHASE ${target} RUNS!`,
    })
    get().rotateCricketRoles(localPeerId, peerIds)
  },

  resetMatch: () => {
    const st = get()
    set({
      runs: 0,
      wickets: 0,
      legalBalls: 0,
      targetScore: null,
      inningsNumber: 1,
      inningsOver: false,
      recentBalls: [],
      currentInningsLog: [],
      firstInningsSummary: null,
      secondInningsSummary: null,
      matchResultBanner: null,
      scorecardSummaryVisible: false,
      eventBanner: 'NEW MATCH READY!',
    })
    resetCricketBallToBowler(st.bowlingStyle, st.spinDir)
  },

  applyNetworkCricketState: (payload, localPeerId) => {
    const myId = localPeerId || 'local'
    let localRole: CricketRole = get().localCricketRole
    if (payload.assignments.batter === myId) localRole = 'batter'
    else if (payload.assignments.bowler === myId) localRole = 'bowler'
    else if (payload.assignments.wicketkeeper === myId) localRole = 'wicketkeeper'

    set({
      format: payload.format,
      pitchMode: payload.pitchMode,
      bowlingStyle: payload.bowlingStyle,
      spinDir: payload.spinDir,
      batterStance: payload.batterStance,
      runs: payload.runs,
      wickets: payload.wickets,
      legalBalls: payload.legalBalls,
      targetScore: payload.targetScore,
      inningsNumber: payload.inningsNumber,
      inningsOver: payload.inningsOver,
      recentBalls: payload.recentBalls,
      eventBanner: payload.eventBanner,
      lastOutcomeKind: payload.lastOutcomeKind ?? 'none',
      lastDeliverySpeedKmh: payload.lastDeliverySpeedKmh ?? get().lastDeliverySpeedKmh,
      lastDeliverySpinKind: payload.lastDeliverySpinKind ?? get().lastDeliverySpinKind,
      lastDeliverySpinRpm: payload.lastDeliverySpinRpm ?? get().lastDeliverySpinRpm,
      lastDropPoint: payload.lastDropPoint ?? get().lastDropPoint,
      lastPitchLengthLabel: payload.lastPitchLengthLabel ?? get().lastPitchLengthLabel,
      currentInningsLog: payload.currentInningsLog ?? get().currentInningsLog,
      firstInningsSummary: payload.firstInningsSummary ?? null,
      secondInningsSummary: payload.secondInningsSummary ?? null,
      matchResultBanner: payload.matchResultBanner ?? null,
      scorecardSummaryVisible: payload.scorecardSummaryVisible ?? payload.inningsOver,
      assignments: payload.assignments,
      localCricketRole: localRole,
      aiBatterEnabled: payload.assignments.batter === 'ai',
      aiBowlerEnabled: payload.assignments.bowler === 'ai',
      aiKeeperEnabled: payload.assignments.wicketkeeper === 'ai',
    })
  },

  getSyncPayload: () => {
    const st = get()
    return {
      format: st.format,
      pitchMode: st.pitchMode,
      bowlingStyle: st.bowlingStyle,
      spinDir: st.spinDir,
      batterStance: st.batterStance,
      runs: st.runs,
      wickets: st.wickets,
      legalBalls: st.legalBalls,
      targetScore: st.targetScore,
      inningsNumber: st.inningsNumber,
      inningsOver: st.inningsOver,
      recentBalls: st.recentBalls,
      eventBanner: st.eventBanner,
      lastOutcomeKind: st.lastOutcomeKind,
      lastDeliverySpeedKmh: st.lastDeliverySpeedKmh,
      lastDeliverySpinKind: st.lastDeliverySpinKind,
      lastDeliverySpinRpm: st.lastDeliverySpinRpm,
      lastDropPoint: st.lastDropPoint,
      lastPitchLengthLabel: st.lastPitchLengthLabel,
      currentInningsLog: st.currentInningsLog,
      firstInningsSummary: st.firstInningsSummary,
      secondInningsSummary: st.secondInningsSummary,
      matchResultBanner: st.matchResultBanner,
      scorecardSummaryVisible: st.scorecardSummaryVisible,
      assignments: st.assignments,
    }
  },
}))
