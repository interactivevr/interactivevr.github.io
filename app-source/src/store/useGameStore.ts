import * as THREE from 'three'
import { create } from 'zustand'
import {
  AVATAR_COLORS,
  BallNetState,
  GameMode,
  getSpawnForSlot,
  getTeePositionForBall,
  HandSide,
  PeerInfo,
  PeerPose,
  PlatformMode,
  PlayerRole,
  ScoreState,
} from '../types/game'

export interface RuntimeBall extends BallNetState {
  prevPos: [number, number, number]
  settledSec: number
  lastLocalEditAt: number
}

export interface InterpolatedRemotePose {
  target: PeerPose
  current: PeerPose
  lastRecvAt: number
}

function createEmptyPose(): PeerPose {
  return {
    headPos: [0, 1.6, 0],
    headQuat: [0, 0, 0, 1],
    leftPos: [-0.22, 1.25, -0.3],
    leftQuat: [0, 0, 0, 1],
    rightPos: [0.22, 1.25, -0.3],
    rightQuat: [0, 0, 0, 1],
    leftGrabbing: false,
    rightGrabbing: false,
    catchingActive: false,
  }
}

function createInitialBalls(mode: GameMode): RuntimeBall[] {
  return [0, 1].map((id) => {
    const pos = getTeePositionForBall(id, mode)
    return {
      id,
      state: 'idle',
      ownerId: null,
      heldHand: null,
      lastThrowerId: null,
      epoch: 1,
      pos: [...pos],
      prevPos: [...pos],
      vel: [0, 0, 0],
      angVel: [0, 0, 0],
      timestamp: Date.now(),
      bouncedFloor: false,
      spawnSlot: id,
      settledSec: 0,
      lastLocalEditAt: 0,
    }
  })
}

/**
 * High-frequency mutable state updated inside useFrame & WebRTC callbacks without
 * triggering React component re-renders.
 */
export const runtimeState = {
  balls: createInitialBalls('twin-thrower') as RuntimeBall[],
  localPose: createEmptyPose(),
  remotePoses: {} as Record<string, InterpolatedRemotePose>,
  remoteStreams: {} as Record<string, MediaStream>,
  audioListener: null as THREE.AudioListener | null,
  localPlayerPos: [0, 0, 5.4] as [number, number, number],
  localPlayerYaw: 0,
  aimTargetPos: [0, 1.4, -5.4] as [number, number, number],
  trajectoryPoints: [] as [number, number, number][],
  onBallStateSend: null as ((ball: BallNetState) => void) | null,
  onScoreEventSend: null as ((event: { kind: 'catch' | 'drop' | 'throw' }) => void) | null,
}

export function resetRuntimeBalls(mode: GameMode): void {
  const next = createInitialBalls(mode)
  for (let i = 0; i < next.length; i++) {
    const prevEpoch = runtimeState.balls[i]?.epoch ?? 1
    next[i].epoch = prevEpoch + 1
    runtimeState.balls[i] = next[i]
  }
}

export function getOrCreateRemotePose(peerId: string): InterpolatedRemotePose {
  if (!runtimeState.remotePoses[peerId]) {
    runtimeState.remotePoses[peerId] = {
      target: createEmptyPose(),
      current: createEmptyPose(),
      lastRecvAt: performance.now(),
    }
  }
  return runtimeState.remotePoses[peerId]
}

export interface GameStoreState {
  joined: boolean
  roomId: string
  playerName: string
  platform: PlatformMode
  gameMode: GameMode
  localPeerId: string
  localColor: string
  localSlot: number
  localRole: PlayerRole
  roleRotationOffset: number
  peers: Record<string, PeerInfo>
  scores: ScoreState
  micEnabled: boolean
  micStatus: 'off' | 'connecting' | 'active' | 'denied' | 'unavailable'
  xrSupported: boolean
  inXR: boolean
  pointerLocked: boolean
  throwCharge: number
  desktopCatchActive: boolean
  heldBallCount: number
  statusBanner: string | null
  connectionLabel: string

  setRoomId: (roomId: string) => void
  setPlayerName: (name: string) => void
  setPlatform: (platform: PlatformMode) => void
  setGameMode: (mode: GameMode) => void
  setLocalPeerId: (id: string) => void
  setJoined: (joined: boolean) => void
  setMicEnabled: (enabled: boolean) => void
  setMicStatus: (status: GameStoreState['micStatus']) => void
  setXrSupported: (supported: boolean) => void
  setInXR: (inXR: boolean) => void
  setPointerLocked: (locked: boolean) => void
  setThrowCharge: (charge: number) => void
  setDesktopCatchActive: (active: boolean) => void
  setHeldBallCount: (count: number) => void
  setStatusBanner: (banner: string | null) => void
  setConnectionLabel: (label: string) => void
  upsertPeer: (peer: PeerInfo) => void
  removePeer: (peerId: string) => void
  setPeerSpeaking: (peerId: string, level: number) => void
  setPeerRtt: (peerId: string, rttMs: number, clockOffsetMs: number) => void
  recomputeSlots: () => void
  rotateRoles: () => void
  applyScoreEvent: (kind: 'catch' | 'drop' | 'throw') => void
  resetScores: () => void
  leaveRoomReset: () => void
}

function getInitialRoomFromUrl(): string {
  if (typeof window === 'undefined') return 'CATCH1'
  const hash = window.location.hash
  const match = hash.match(/room=([A-Za-z0-9_-]+)/i)
  if (match?.[1]) return match[1].toUpperCase().slice(0, 12)
  const search = new URLSearchParams(window.location.search).get('room')
  if (search) return search.toUpperCase().slice(0, 12)
  return 'CATCH1'
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  joined: false,
  roomId: getInitialRoomFromUrl(),
  playerName: `Player-${Math.floor(100 + Math.random() * 899)}`,
  platform: 'pc',
  gameMode: 'twin-thrower',
  localPeerId: '',
  localColor: AVATAR_COLORS[0],
  localSlot: 0,
  localRole: 'catcher',
  roleRotationOffset: 0,
  peers: {},
  scores: {
    catches: 0,
    streak: 0,
    bestStreak: 0,
    drops: 0,
    throws: 0,
  },
  micEnabled: true,
  micStatus: 'off',
  xrSupported: false,
  inXR: false,
  pointerLocked: false,
  throwCharge: 0,
  desktopCatchActive: false,
  heldBallCount: 0,
  statusBanner: null,
  connectionLabel: 'Offline',

  setRoomId: (roomId) => set({ roomId: roomId.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12) }),
  setPlayerName: (playerName) => set({ playerName }),
  setPlatform: (platform) => set({ platform }),
  setGameMode: (gameMode) => {
    resetRuntimeBalls(gameMode)
    set({ gameMode })
    get().recomputeSlots()
  },
  setLocalPeerId: (localPeerId) => set({ localPeerId }),
  setJoined: (joined) => set({ joined }),
  setMicEnabled: (micEnabled) => set({ micEnabled }),
  setMicStatus: (micStatus) => set({ micStatus }),
  setXrSupported: (xrSupported) => set({ xrSupported }),
  setInXR: (inXR) => set({ inXR, platform: inXR ? 'vr' : get().platform }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setThrowCharge: (throwCharge) => set({ throwCharge }),
  setDesktopCatchActive: (desktopCatchActive) => set({ desktopCatchActive }),
  setHeldBallCount: (heldBallCount) => set({ heldBallCount }),
  setStatusBanner: (statusBanner) => set({ statusBanner }),
  setConnectionLabel: (connectionLabel) => set({ connectionLabel }),

  upsertPeer: (peer) => {
    set((state) => ({
      peers: {
        ...state.peers,
        [peer.id]: {
          ...state.peers[peer.id],
          ...peer,
        },
      },
    }))
    get().recomputeSlots()
  },

  removePeer: (peerId) => {
    delete runtimeState.remotePoses[peerId]
    delete runtimeState.remoteStreams[peerId]
    set((state) => {
      const next = { ...state.peers }
      delete next[peerId]
      return { peers: next }
    })
    get().recomputeSlots()
  },

  setPeerSpeaking: (peerId, level) =>
    set((state) => {
      const existing = state.peers[peerId]
      if (!existing || Math.abs(existing.speakingLevel - level) < 0.08) return state
      return {
        peers: {
          ...state.peers,
          [peerId]: { ...existing, speakingLevel: level },
        },
      }
    }),

  setPeerRtt: (peerId, rttMs, clockOffsetMs) =>
    set((state) => {
      const existing = state.peers[peerId]
      if (!existing) return state
      return {
        peers: {
          ...state.peers,
          [peerId]: { ...existing, rttMs, clockOffsetMs },
        },
      }
    }),

  recomputeSlots: () => {
    const state = get()
    const { localPeerId, peers, gameMode, roleRotationOffset } = state
    if (!localPeerId) return

    // Deterministic sorted order by peerId ensures every client agrees on everyone's pad & role!
    const allIds = Array.from(new Set([localPeerId, ...Object.keys(peers)])).sort()
    const count = allIds.length
    const effectiveMode: GameMode =
      gameMode === 'solo' || count === 1
        ? gameMode
        : count === 2 && gameMode === 'twin-thrower'
          ? 'twin-thrower'
          : gameMode

    const updatedPeers: Record<string, PeerInfo> = { ...peers }
    let localSlot = 0
    let localRole: PlayerRole = 'catcher'
    let localColor: string = AVATAR_COLORS[0]

    allIds.forEach((id, idx) => {
      const rotatedSlot = (idx + roleRotationOffset) % Math.max(1, count)
      const spawn = getSpawnForSlot(effectiveMode, rotatedSlot)
      const color = AVATAR_COLORS[idx % AVATAR_COLORS.length]
      if (id === localPeerId) {
        localSlot = rotatedSlot
        localRole = spawn.role
        localColor = color
        runtimeState.localPlayerPos = [...spawn.position]
        runtimeState.localPlayerYaw = spawn.yaw
      } else if (updatedPeers[id]) {
        updatedPeers[id] = {
          ...updatedPeers[id],
          slotIndex: rotatedSlot,
          role: spawn.role,
          color,
        }
      }
    })

    set({
      localSlot,
      localRole,
      localColor,
      peers: updatedPeers,
    })
  },

  rotateRoles: () => {
    set((state) => ({ roleRotationOffset: state.roleRotationOffset + 1 }))
    get().recomputeSlots()
  },

  applyScoreEvent: (kind) =>
    set((state) => {
      const prev = state.scores
      if (kind === 'throw') {
        return { scores: { ...prev, throws: prev.throws + 1 } }
      }
      if (kind === 'catch') {
        const nextStreak = prev.streak + 1
        return {
          scores: {
            ...prev,
            catches: prev.catches + 1,
            streak: nextStreak,
            bestStreak: Math.max(prev.bestStreak, nextStreak),
          },
        }
      }
      return {
        scores: {
          ...prev,
          drops: prev.drops + 1,
          streak: 0,
        },
      }
    }),

  resetScores: () =>
    set({
      scores: {
        catches: 0,
        streak: 0,
        bestStreak: 0,
        drops: 0,
        throws: 0,
      },
    }),

  leaveRoomReset: () => {
    Object.keys(runtimeState.remotePoses).forEach((k) => delete runtimeState.remotePoses[k])
    Object.keys(runtimeState.remoteStreams).forEach((k) => delete runtimeState.remoteStreams[k])
    resetRuntimeBalls('twin-thrower')
    set({
      joined: false,
      peers: {},
      micStatus: 'off',
      connectionLabel: 'Offline',
      heldBallCount: 0,
      throwCharge: 0,
      desktopCatchActive: false,
      statusBanner: null,
    })
  },
}))

export type { HandSide }
