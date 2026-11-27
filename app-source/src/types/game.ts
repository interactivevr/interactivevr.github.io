export type PlatformMode = 'vr' | 'pc'

export type ActiveGame = 'catch' | 'cricket'

export type GameMode = 'twin-thrower' | 'rally' | 'solo'

export type PlayerRole = 'catcher' | 'thrower' | 'rally'

export type BallMotionState = 'idle' | 'held' | 'flight'

export interface Vec3Tuple {
  x: number
  y: number
  z: number
}

export interface QuatTuple {
  x: number
  y: number
  z: number
  w: number
}

export type HandSide = 'left' | 'right'

export interface PeerPose {
  headPos: [number, number, number]
  headQuat: [number, number, number, number]
  leftPos: [number, number, number]
  leftQuat: [number, number, number, number]
  rightPos: [number, number, number]
  rightQuat: [number, number, number, number]
  leftCurls: [number, number, number, number, number]
  rightCurls: [number, number, number, number, number]
  leftGrabbing: boolean
  rightGrabbing: boolean
  catchingActive: boolean
}

export interface PeerInfo {
  id: string
  name: string
  platform: PlatformMode
  role: PlayerRole
  slotIndex: number
  color: string
  joinedAt: number
  muted: boolean
  speakingLevel: number
  rttMs: number
  clockOffsetMs: number
}

export interface BallNetState {
  id: number
  state: BallMotionState
  ownerId: string | null
  heldHand: HandSide | null
  lastThrowerId: string | null
  epoch: number
  pos: [number, number, number]
  vel: [number, number, number]
  angVel: [number, number, number]
  timestamp: number
  bouncedFloor: boolean
  spawnSlot: number
}

export interface ScoreState {
  catches: number
  streak: number
  bestStreak: number
  drops: number
  throws: number
}

export const COURT_HALF_W = 6.0
export const COURT_HALF_L = 8.5
export const COURT_WALL_H = 7.0
export const BALL_RADIUS = 0.115
export const GRAVITY = -9.81

export const AVATAR_COLORS = [
  '#38bdf8', // Sky
  '#fb7185', // Rose
  '#34d399', // Emerald
  '#fbbf24', // Amber
  '#c084fc', // Violet
] as const

export const BALL_COLORS = ['#ff6b2c', '#22d3ee'] as const

export interface SpawnSlot {
  role: PlayerRole
  position: [number, number, number]
  yaw: number
  label: string
}

export function getSpawnForSlot(mode: GameMode, slotIndex: number): SpawnSlot {
  if (mode === 'solo') {
    return {
      role: 'rally',
      position: [0, 0, 4.5],
      yaw: 0,
      label: 'Solo Practice Pad',
    }
  }
  if (mode === 'rally') {
    if (slotIndex % 2 === 0) {
      return { role: 'rally', position: [0, 0, 5.2], yaw: 0, label: 'South Pad' }
    }
    return { role: 'rally', position: [0, 0, -5.2], yaw: Math.PI, label: 'North Pad' }
  }
  // twin-thrower: slot 0 is Catcher, slots 1 & 2 are Throwers
  const mod = slotIndex % 3
  if (mod === 0) {
    return { role: 'catcher', position: [0, 0, 5.4], yaw: 0, label: 'Catcher Zone' }
  }
  if (mod === 1) {
    return { role: 'thrower', position: [-2.3, 0, -5.4], yaw: Math.PI, label: 'Thrower Left' }
  }
  return { role: 'thrower', position: [2.3, 0, -5.4], yaw: Math.PI, label: 'Thrower Right' }
}

export function getTeePositionForBall(ballId: number, mode: GameMode): [number, number, number] {
  if (mode === 'solo') {
    return [ballId === 0 ? -0.45 : 0.45, 1.05, 3.6]
  }
  if (mode === 'rally') {
    return ballId === 0 ? [0, 1.05, 4.2] : [0, 1.05, -4.2]
  }
  return ballId === 0 ? [-2.3, 1.05, -4.4] : [2.3, 1.05, -4.4]
}
