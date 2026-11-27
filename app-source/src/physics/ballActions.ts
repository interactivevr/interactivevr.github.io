import { playCatchSfx, playThrowSfx } from '../audio/sfx'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { getTeePositionForBall, HandSide } from '../types/game'

function recountLocalHeldBalls(localPeerId: string): void {
  const count = runtimeState.balls.filter(
    (b) => b.state === 'held' && b.ownerId === localPeerId
  ).length
  useGameStore.getState().setHeldBallCount(count)
}

export function getFirstHeldBallByLocal(): number | null {
  const localPeerId = useGameStore.getState().localPeerId
  const found = runtimeState.balls.find(
    (b) => b.state === 'held' && (b.ownerId === localPeerId || (!localPeerId && b.ownerId === 'local'))
  )
  return found ? found.id : null
}

export function claimBallLocally(ballId: number, hand: HandSide): boolean {
  const ball = runtimeState.balls[ballId]
  if (!ball) return false

  const store = useGameStore.getState()
  const localId = store.localPeerId || 'local'

  // Check if another hand already holds this exact ball locally
  if (ball.state === 'held' && ball.ownerId === localId) {
    return false
  }

  const wasInFlight = ball.state === 'flight'
  const thrownByPeer = ball.lastThrowerId !== null && ball.lastThrowerId !== localId
  const isCleanSoloRebound = store.gameMode === 'solo' && ball.lastThrowerId === localId && !ball.bouncedFloor
  const isCleanCatch = wasInFlight && !ball.bouncedFloor && (thrownByPeer || isCleanSoloRebound)

  ball.state = 'held'
  ball.ownerId = localId
  ball.heldHand = hand
  ball.epoch += 1
  ball.vel = [0, 0, 0]
  ball.angVel = [0, 0, 0]
  ball.timestamp = Date.now()
  ball.settledSec = 0
  ball.lastLocalEditAt = performance.now()

  if (isCleanCatch) {
    const nextStreak = store.scores.streak + 1
    store.applyScoreEvent('catch')
    runtimeState.onScoreEventSend?.({ kind: 'catch' })
    playCatchSfx(nextStreak)
  } else {
    playCatchSfx(1)
  }

  recountLocalHeldBalls(localId)
  runtimeState.onBallStateSend?.(ball)
  return true
}

export function throwBallLocally(
  ballId: number,
  origin: [number, number, number],
  velocity: [number, number, number]
): void {
  const ball = runtimeState.balls[ballId]
  if (!ball) return

  const store = useGameStore.getState()
  const localId = store.localPeerId || 'local'

  ball.state = 'flight'
  ball.ownerId = localId
  ball.heldHand = null
  ball.lastThrowerId = localId
  ball.bouncedFloor = false
  ball.epoch += 1
  ball.pos = [origin[0], origin[1], origin[2]]
  ball.prevPos = [origin[0], origin[1], origin[2]]
  ball.vel = [velocity[0], velocity[1], velocity[2]]
  ball.angVel = [
    (Math.random() - 0.5) * 8,
    (Math.random() - 0.5) * 6,
    (Math.random() - 0.5) * 8,
  ]
  ball.timestamp = Date.now()
  ball.settledSec = 0
  ball.lastLocalEditAt = performance.now()

  const speed = Math.hypot(velocity[0], velocity[1], velocity[2])
  playThrowSfx(speed)
  store.applyScoreEvent('throw')
  runtimeState.onScoreEventSend?.({ kind: 'throw' })
  recountLocalHeldBalls(localId)
  runtimeState.onBallStateSend?.(ball)
}

export function resetAllBallsToTees(): void {
  const store = useGameStore.getState()
  const mode = store.gameMode
  runtimeState.balls.forEach((ball, index) => {
    const tee = getTeePositionForBall(index, mode)
    ball.state = 'idle'
    ball.ownerId = null
    ball.heldHand = null
    ball.lastThrowerId = null
    ball.bouncedFloor = false
    ball.epoch += 1
    ball.pos = [...tee]
    ball.prevPos = [...tee]
    ball.vel = [0, 0, 0]
    ball.angVel = [0, 0, 0]
    ball.timestamp = Date.now()
    ball.settledSec = 0
    ball.lastLocalEditAt = performance.now()
    runtimeState.onBallStateSend?.(ball)
  })
  store.setHeldBallCount(0)
}
