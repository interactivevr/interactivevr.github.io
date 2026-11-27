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
  getMaxBallsForFormat,
  getMaxWicketsForFormat,
  PitchMode,
  SpinDirection,
} from './types'

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
  aiBowlCooldownSec: 1.8,
  aiBatSwingPhase: 0,
  aiKeeperPos: [0, 0, 12.1] as [number, number, number],
  aiBowlerPos: [0.32, 0, BOWLING_STUMPS_Z - 0.55] as [number, number, number],
  aiBatterPos: [-0.48, 0, 9.04] as [number, number, number],
  onCricketBallSend: null as ((ball: CricketBallNetState) => void) | null,
  onCricketStateSend: null as ((payload: CricketStateSyncPayload) => void) | null,
}

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
  cricketRuntime.aiBowlCooldownSec = 1.6
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
  bowlerCharge: 0,
  bowlerCatchActive: false,
  keeperCatchActive: false,
  batSwingPulse: 0,
  pitchTarget: [0.05, 5.2],

  setFormat: (format) => {
    set({ format, runs: 0, wickets: 0, legalBalls: 0, inningsOver: false, recentBalls: [], targetScore: null, inningsNumber: 1, eventBanner: `${format.toUpperCase()} MATCH STARTED` })
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

    set({
      runs: nextRuns,
      wickets: nextWickets,
      legalBalls: nextBalls,
      inningsOver: inningsDone,
      recentBalls: [...st.recentBalls.slice(-11), label],
      eventBanner: finalBanner,
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
      assignments: st.assignments,
    }
  },
}))
