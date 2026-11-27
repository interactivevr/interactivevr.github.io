export type CricketFormat = '1-over' | '10-over'

export type PitchMode = 'hard' | 'wet'

export type BowlingStyle = 'fast' | 'spin'

export type SpinDirection = 'off' | 'leg'

export type BatterStance = 'right' | 'left'

export type CricketRole = 'batter' | 'bowler' | 'wicketkeeper'

export type CricketBallPhase = 'ready' | 'bowled' | 'hit' | 'fielded' | 'dead'

export interface CricketBallNetState {
  phase: CricketBallPhase
  ownerId: string | null
  epoch: number
  pos: [number, number, number]
  vel: [number, number, number]
  spin: [number, number, number]
  bowlingStyle: BowlingStyle
  spinDir: SpinDirection
  bouncedOnPitch: boolean
  bouncedAfterHit: boolean
  hitByBat: boolean
  edgeContact: boolean
  timestamp: number
}

export interface CricketRoleAssignments {
  batter: string | 'ai'
  bowler: string | 'ai'
  wicketkeeper: string | 'ai'
}

// Authentic 22-yard cricket pitch dimensions (in meters)
export const PITCH_LENGTH = 20.12
export const BATTING_STUMPS_Z = 10.06
export const BOWLING_STUMPS_Z = -10.06
export const BATTING_CREASE_Z = 8.84
export const BOWLING_CREASE_Z = -8.84
export const WIDE_HALF_W = 1.32
export const PITCH_HALF_W = 1.52
export const CRICKET_BALL_RADIUS = 0.042 // Slightly generous for crisp VR readability
export const BOUNDARY_RX = 42.0
export const BOUNDARY_RZ = 46.0

export const STUMP_HEIGHT = 0.71
export const STUMP_SPREAD = 0.114 // outer stumps at -0.114, 0, +0.114 (22.86cm width)

export function getMaxBallsForFormat(format: CricketFormat): number {
  return format === '1-over' ? 6 : 60
}

export function getMaxWicketsForFormat(format: CricketFormat): number {
  return format === '1-over' ? 3 : 10
}

export function getCricketSpawn(
  role: CricketRole,
  stance: BatterStance
): { position: [number, number, number]; yaw: number } {
  if (role === 'batter') {
    const xOffset = stance === 'right' ? -0.48 : 0.48
    // Facing -Z (toward the bowler's end)
    return { position: [xOffset, 0, BATTING_CREASE_Z + 0.2], yaw: 0 }
  }
  if (role === 'wicketkeeper') {
    // Behind batting stumps facing -Z (watching bowler & bat)
    return { position: [0, 0, BATTING_STUMPS_Z + 2.35], yaw: 0 }
  }
  // Bowler at bowling crease facing +Z (toward the batter)
  return { position: [0.32, 0, BOWLING_STUMPS_Z - 0.55], yaw: Math.PI }
}

export interface OutfieldPosition {
  id: number
  label: string
  home: [number, number, number]
}

export const AI_FIELD_POSITIONS: readonly OutfieldPosition[] = [
  { id: 0, label: 'First Slip', home: [-1.45, 0, 12.8] },
  { id: 1, label: 'Point', home: [-16.5, 0, 9.2] },
  { id: 2, label: 'Cover', home: [-18.5, 0, -2.5] },
  { id: 3, label: 'Mid-Off', home: [-8.5, 0, -14.5] },
  { id: 4, label: 'Long-Off', home: [-15.5, 0, -28.5] },
  { id: 5, label: 'Long-On', home: [15.5, 0, -28.5] },
  { id: 6, label: 'Mid-On', home: [8.8, 0, -14.0] },
  { id: 7, label: 'Deep Midwicket', home: [23.0, 0, -8.5] },
  { id: 8, label: 'Square Leg', home: [17.5, 0, 8.8] },
  { id: 9, label: 'Fine Leg', home: [12.5, 0, 24.5] },
] as const
