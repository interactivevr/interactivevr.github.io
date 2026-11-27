import { joinRoom, Room, TurnServerConfig } from 'trystero'
import { getOrCreateRemotePose, runtimeState, useGameStore } from '../store/useGameStore'
import {
  AVATAR_COLORS,
  BallNetState,
  GameMode,
  PeerPose,
  PlatformMode,
} from '../types/game'
import { voiceAudio } from './voiceAudio'

const APP_ID = 'interactivevr-github-io-catch-v1'

type HelloPayload = {
  name: string
  platform: PlatformMode
  joinedAt: number
  micMuted: boolean
}

type PoseArrayPayload = number[]

type BallPayload = {
  id: number
  state: 'idle' | 'held' | 'flight'
  ownerId: string | null
  heldHand: 'left' | 'right' | null
  lastThrowerId: string | null
  epoch: number
  pos: [number, number, number]
  vel: [number, number, number]
  angVel: [number, number, number]
  timestamp: number
  bouncedFloor: boolean
  spawnSlot: number
}

type ScorePayload = {
  kind: 'catch' | 'drop' | 'throw'
}

type ModePayload = {
  gameMode: GameMode
  roleRotationOffset: number
}

type ClockPingPayload = {
  t0: number
}

type ClockPongPayload = {
  t0: number
  t1: number
}

function resolveTurnConfig(): TurnServerConfig[] | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem('vr_catch_turn_config')
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as TurnServerConfig[]
    return Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function packPose(pose: PeerPose): PoseArrayPayload {
  const flags =
    (pose.leftGrabbing ? 1 : 0) |
    (pose.rightGrabbing ? 2 : 0) |
    (pose.catchingActive ? 4 : 0)
  return [
    Number(pose.headPos[0].toFixed(3)),
    Number(pose.headPos[1].toFixed(3)),
    Number(pose.headPos[2].toFixed(3)),
    Number(pose.headQuat[0].toFixed(3)),
    Number(pose.headQuat[1].toFixed(3)),
    Number(pose.headQuat[2].toFixed(3)),
    Number(pose.headQuat[3].toFixed(3)),
    Number(pose.leftPos[0].toFixed(3)),
    Number(pose.leftPos[1].toFixed(3)),
    Number(pose.leftPos[2].toFixed(3)),
    Number(pose.leftQuat[0].toFixed(3)),
    Number(pose.leftQuat[1].toFixed(3)),
    Number(pose.leftQuat[2].toFixed(3)),
    Number(pose.leftQuat[3].toFixed(3)),
    Number(pose.rightPos[0].toFixed(3)),
    Number(pose.rightPos[1].toFixed(3)),
    Number(pose.rightPos[2].toFixed(3)),
    Number(pose.rightQuat[0].toFixed(3)),
    Number(pose.rightQuat[1].toFixed(3)),
    Number(pose.rightQuat[2].toFixed(3)),
    Number(pose.rightQuat[3].toFixed(3)),
    flags,
  ]
}

function unpackPose(arr: PoseArrayPayload, target: PeerPose): void {
  if (!Array.isArray(arr) || arr.length < 22) return
  target.headPos[0] = arr[0]
  target.headPos[1] = arr[1]
  target.headPos[2] = arr[2]
  target.headQuat[0] = arr[3]
  target.headQuat[1] = arr[4]
  target.headQuat[2] = arr[5]
  target.headQuat[3] = arr[6]
  target.leftPos[0] = arr[7]
  target.leftPos[1] = arr[8]
  target.leftPos[2] = arr[9]
  target.leftQuat[0] = arr[10]
  target.leftQuat[1] = arr[11]
  target.leftQuat[2] = arr[12]
  target.leftQuat[3] = arr[13]
  target.rightPos[0] = arr[14]
  target.rightPos[1] = arr[15]
  target.rightPos[2] = arr[16]
  target.rightQuat[0] = arr[17]
  target.rightQuat[1] = arr[18]
  target.rightQuat[2] = arr[19]
  target.rightQuat[3] = arr[20]
  const flags = arr[21] | 0
  target.leftGrabbing = (flags & 1) !== 0
  target.rightGrabbing = (flags & 2) !== 0
  target.catchingActive = (flags & 4) !== 0
}

class P2PGameClient {
  private room: Room | null = null
  private sendHelloFn: ((data: HelloPayload, target?: string) => void) | null = null
  private sendPoseFn: ((data: PoseArrayPayload) => void) | null = null
  private sendBallFn: ((data: BallPayload, target?: string) => void) | null = null
  private sendScoreFn: ((data: ScorePayload) => void) | null = null
  private sendModeFn: ((data: ModePayload, target?: string) => void) | null = null
  private poseInterval: number | null = null
  private localJoinedAt = Date.now()

  async connect(roomId: string): Promise<void> {
    await this.disconnect()

    const store = useGameStore.getState()
    store.setConnectionLabel('Connecting to P2P relays...')
    this.localJoinedAt = Date.now()

    const turnConfig = resolveTurnConfig()
    const room = joinRoom(
      {
        appId: APP_ID,
        ...(turnConfig ? { turnConfig } : {}),
        rtcConfig: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
          ],
        },
      },
      roomId
    )
    this.room = room

    const selfInfo = await room.getSelf()
    useGameStore.getState().setLocalPeerId(selfInfo.peerId)
    useGameStore.getState().recomputeSlots()
    useGameStore.getState().setConnectionLabel(`Room ${roomId} • Connected`)

    if (typeof window !== 'undefined') {
      window.location.hash = `room=${encodeURIComponent(roomId)}`
    }

    const helloAction = room.makeAction<HelloPayload>('hello')
    const poseAction = room.makeAction<PoseArrayPayload>('pose')
    const ballAction = room.makeAction<BallPayload>('ball')
    const scoreAction = room.makeAction<ScorePayload>('score')
    const modeAction = room.makeAction<ModePayload>('mode')
    const clkPingAction = room.makeAction<ClockPingPayload>('clkP')
    const clkPongAction = room.makeAction<ClockPongPayload>('clkA')

    this.sendHelloFn = (data, target) => {
      void helloAction.send(data, target ? { target } : undefined).catch(() => {})
    }
    this.sendPoseFn = (data) => {
      if (Object.keys(useGameStore.getState().peers).length === 0) return
      void poseAction.send(data).catch(() => {})
    }
    this.sendBallFn = (data, target) => {
      if (Object.keys(useGameStore.getState().peers).length === 0) return
      void ballAction.send(data, target ? { target } : undefined).catch(() => {})
    }
    this.sendScoreFn = (data) => {
      if (Object.keys(useGameStore.getState().peers).length === 0) return
      void scoreAction.send(data).catch(() => {})
    }
    this.sendModeFn = (data, target) => {
      if (Object.keys(useGameStore.getState().peers).length === 0) return
      void modeAction.send(data, target ? { target } : undefined).catch(() => {})
    }

    runtimeState.onBallStateSend = (ball: BallNetState) => {
      this.sendBallFn?.({
        id: ball.id,
        state: ball.state,
        ownerId: ball.ownerId,
        heldHand: ball.heldHand,
        lastThrowerId: ball.lastThrowerId,
        epoch: ball.epoch,
        pos: [...ball.pos],
        vel: [...ball.vel],
        angVel: [...ball.angVel],
        timestamp: ball.timestamp,
        bouncedFloor: ball.bouncedFloor,
        spawnSlot: ball.spawnSlot,
      })
    }

    runtimeState.onScoreEventSend = (evt) => {
      this.sendScoreFn?.(evt)
    }

    helloAction.onMessage((data, { peerId }) => {
      const existing = useGameStore.getState().peers[peerId]
      useGameStore.getState().upsertPeer({
        id: peerId,
        name: data.name || `Player-${peerId.slice(0, 4)}`,
        platform: data.platform,
        role: existing?.role ?? 'thrower',
        slotIndex: existing?.slotIndex ?? 1,
        color: existing?.color ?? AVATAR_COLORS[1],
        joinedAt: data.joinedAt,
        muted: data.micMuted,
        speakingLevel: existing?.speakingLevel ?? 0,
        rttMs: existing?.rttMs ?? 0,
        clockOffsetMs: existing?.clockOffsetMs ?? 0,
      })
    })

    poseAction.onMessage((arr, { peerId }) => {
      const remote = getOrCreateRemotePose(peerId)
      unpackPose(arr, remote.target)
      remote.lastRecvAt = performance.now()
    })

    ballAction.onMessage((incoming, { peerId }) => {
      const localBall = runtimeState.balls[incoming.id]
      if (!localBall) return
      // Accept higher epoch, or same epoch updates from current owner
      const sameOwnerUpdate = incoming.epoch === localBall.epoch && incoming.ownerId === localBall.ownerId
      if (incoming.epoch > localBall.epoch || sameOwnerUpdate) {
        const peerInfo = useGameStore.getState().peers[peerId]
        const offsetMs = peerInfo?.clockOffsetMs ?? 0
        const elapsedSec =
          incoming.state === 'flight'
            ? Math.max(0, Math.min(0.35, (Date.now() - (incoming.timestamp + offsetMs)) / 1000))
            : 0

        localBall.state = incoming.state
        localBall.ownerId = incoming.ownerId
        localBall.heldHand = incoming.heldHand
        localBall.lastThrowerId = incoming.lastThrowerId
        localBall.epoch = incoming.epoch
        localBall.angVel = [...incoming.angVel]
        localBall.timestamp = incoming.timestamp
        localBall.bouncedFloor = incoming.bouncedFloor
        localBall.spawnSlot = incoming.spawnSlot
        localBall.settledSec = 0

        if (incoming.state === 'flight' && elapsedSec > 0.005) {
          // Extrapolate forward by half-RTT clock compensation
          localBall.vel = [
            incoming.vel[0],
            incoming.vel[1] - 9.81 * elapsedSec,
            incoming.vel[2],
          ]
          localBall.pos = [
            incoming.pos[0] + incoming.vel[0] * elapsedSec,
            Math.max(0.115, incoming.pos[1] + incoming.vel[1] * elapsedSec - 0.5 * 9.81 * elapsedSec * elapsedSec),
            incoming.pos[2] + incoming.vel[2] * elapsedSec,
          ]
          localBall.prevPos = [...localBall.pos]
        } else {
          localBall.pos = [...incoming.pos]
          localBall.prevPos = [...incoming.pos]
          localBall.vel = [...incoming.vel]
        }
      }
    })

    scoreAction.onMessage((data) => {
      useGameStore.getState().applyScoreEvent(data.kind)
    })

    modeAction.onMessage((data) => {
      const curr = useGameStore.getState()
      if (curr.gameMode !== data.gameMode || curr.roleRotationOffset !== data.roleRotationOffset) {
        useGameStore.setState({
          gameMode: data.gameMode,
          roleRotationOffset: data.roleRotationOffset,
        })
        curr.recomputeSlots()
      }
    })

    clkPingAction.onMessage((data, { peerId }) => {
      void clkPongAction.send({ t0: data.t0, t1: Date.now() }, { target: peerId }).catch(() => {})
    })

    clkPongAction.onMessage((data, { peerId }) => {
      const t2 = Date.now()
      const rtt = Math.max(0, t2 - data.t0)
      // localTime ~= remoteTime + clockOffset -> remoteTimestamp + clockOffset ~= localTime
      const clockOffset = t2 - rtt / 2 - data.t1
      useGameStore.getState().setPeerRtt(peerId, rtt, clockOffset)
    })

    room.onPeerJoin(({ peerId }) => {
      const st = useGameStore.getState()
      st.setStatusBanner(`Player joined! Syncing voice & arena...`)
      window.setTimeout(() => {
        if (useGameStore.getState().statusBanner?.startsWith('Player joined')) {
          useGameStore.getState().setStatusBanner(null)
        }
      }, 3000)

      this.sendHelloFn?.(
        {
          name: st.playerName,
          platform: st.inXR ? 'vr' : st.platform,
          joinedAt: this.localJoinedAt,
          micMuted: !st.micEnabled,
        },
        peerId
      )

      // Lowest peerId shares authoritative room mode & ball snapshot
      const allSorted = [st.localPeerId, ...Object.keys(st.peers), peerId].filter(Boolean).sort()
      if (allSorted[0] === st.localPeerId) {
        this.sendModeFn?.(
          { gameMode: st.gameMode, roleRotationOffset: st.roleRotationOffset },
          peerId
        )
        runtimeState.balls.forEach((b) => this.sendBallFn?.(b, peerId))
      }

      const stream = voiceAudio.getLocalStream()
      if (stream) {
        void room.addStream(stream, { target: peerId }).catch(() => {})
      }

      void clkPingAction.send({ t0: Date.now() }, { target: peerId }).catch(() => {})
    })

    room.onPeerLeave(({ peerId }) => {
      voiceAudio.unregisterRemoteStream(peerId)
      useGameStore.getState().removePeer(peerId)
      // Release any ball held by disconnected peer
      runtimeState.balls.forEach((ball) => {
        if (ball.ownerId === peerId && ball.state === 'held') {
          ball.state = 'flight'
          ball.ownerId = null
          ball.heldHand = null
          ball.epoch += 1
        }
      })
    })

    room.onPeerStream((stream, { peerId }) => {
      voiceAudio.registerRemoteStream(peerId, stream)
    })

    room.onError((err) => {
      if (err.code === 'peer-connect-failed' && !err.turnConfigured) {
        useGameStore
          .getState()
          .setStatusBanner('Direct P2P NAT blocked for a peer. Same Wi-Fi or TURN relay may be needed.')
      }
    })

    // Initialize local mic and broadcast stream if granted
    const localStream = await voiceAudio.initLocalMic()
    if (localStream && this.room === room) {
      void room.addStream(localStream).catch(() => {})
    }

    // 33 Hz compact pose loop
    this.poseInterval = window.setInterval(() => {
      this.sendPoseFn?.(packPose(runtimeState.localPose))
      voiceAudio.sampleSpeakingLevels()
    }, 30)
  }

  broadcastProfile(): void {
    const st = useGameStore.getState()
    this.sendHelloFn?.({
      name: st.playerName,
      platform: st.inXR ? 'vr' : st.platform,
      joinedAt: this.localJoinedAt,
      micMuted: !st.micEnabled,
    })
  }

  broadcastModeAndRoles(): void {
    const st = useGameStore.getState()
    this.sendModeFn?.({
      gameMode: st.gameMode,
      roleRotationOffset: st.roleRotationOffset,
    })
  }

  broadcastBall(ball: BallNetState): void {
    this.sendBallFn?.(ball)
  }

  async disconnect(): Promise<void> {
    if (this.poseInterval !== null) {
      window.clearInterval(this.poseInterval)
      this.poseInterval = null
    }
    runtimeState.onBallStateSend = null
    runtimeState.onScoreEventSend = null
    this.sendHelloFn = null
    this.sendPoseFn = null
    this.sendBallFn = null
    this.sendScoreFn = null
    this.sendModeFn = null

    if (this.room) {
      try {
        await this.room.leave()
      } catch {
        // ignore
      }
      this.room = null
    }
    voiceAudio.disposeAll()
  }
}

export const p2pClient = new P2PGameClient()
