import { computeTearSplitDeforms, encodeDeformOffsets, squeezeCraftWithPalm } from './craftEngine'
import { CLAY_COLORS, CraftShapePreset, PAPER_COLORS } from './types'
import {
  deleteRuntimeCraftObject,
  myRoomRuntime,
  spawnRuntimeCraftObject,
  stripToNetState,
  useMyRoomStore,
} from './useMyRoomStore'

const AI_MOVE_SPEED = 1.25
let _lastNetBroadcastSec = 0

export function stepMyRoomAI(dt: number, localPeerId: string, hasHumanPeers: boolean): void {
  const st = useMyRoomStore.getState()
  const aiActive =
    st.opponentMode === 'computer' || (st.opponentMode === 'auto' && !hasHumanPeers)

  if (!aiActive) return

  // Lowest peerId or solo client acts as AI authority
  const isAuthority = !hasHumanPeers || localPeerId === '' || localPeerId === 'local'
  if (!isAuthority) return

  const cDt = Math.min(dt, 0.05)
  const nowSec = performance.now() / 1000
  const ai = myRoomRuntime.ai
  ai.actionTimerSec -= cDt

  // Pick a horizontal surface height (e.g., scanned table/desk) near AI or y=0.85 virtual craft height
  let dropSurfaceY = 0.78
  for (let i = 0; i < myRoomRuntime.surfaces.length; i++) {
    const s = myRoomRuntime.surfaces[i]
    if (s.orientation === 'horizontal' && (s.label === 'table' || s.label === 'desk')) {
      dropSurfaceY = s.center[1] + s.halfExtents[1] + 0.08
      break
    }
  }

  // Smooth walking target toward center/table area
  const targetStandX = Math.sin(nowSec * 0.28) * 0.85
  const targetStandZ = -1.45 + Math.cos(nowSec * 0.21) * 0.35
  const dx = targetStandX - ai.pos[0]
  const dz = targetStandZ - ai.pos[2]
  const dist = Math.hypot(dx, dz)

  if (dist > 0.14 && ai.actionMode === 'walk') {
    const step = Math.min(dist, AI_MOVE_SPEED * cDt)
    ai.pos[0] += (dx / dist) * step
    ai.pos[2] += (dz / dist) * step
    ai.yaw = Math.atan2(-dx, -dz)
    ai.isWalking = true
    ai.walkPhase += cDt * 6.5
  } else {
    ai.isWalking = false
    ai.yaw = Math.atan2(-ai.pos[0], 0.4 - ai.pos[2]) // Face toward player workspace
  }

  // Position AI articulated hands cleanly in front of chest
  const cosY = Math.cos(ai.yaw)
  const sinY = Math.sin(ai.yaw)
  const fwdX = -sinY
  const fwdZ = -cosY
  const rightX = cosY
  const rightZ = -sinY
  const centerHoldX = ai.pos[0] + fwdX * 0.34
  const centerHoldY = 1.15
  const centerHoldZ = ai.pos[2] + fwdZ * 0.34

  const squeezeWave = ai.actionMode === 'sculpt' ? Math.sin(nowSec * 6.0) * 0.06 : 0
  const pullWave = ai.actionMode === 'tear' ? 0.24 : 0.12 - Math.abs(squeezeWave)

  ai.leftHand = [
    centerHoldX - rightX * pullWave,
    centerHoldY + squeezeWave * 0.3,
    centerHoldZ - rightZ * pullWave,
  ]
  ai.rightHand = [
    centerHoldX + rightX * pullWave,
    centerHoldY - squeezeWave * 0.3,
    centerHoldZ + rightZ * pullWave,
  ]

  // Manipulate held AI object
  const heldObj = ai.holdingObjId ? myRoomRuntime.objects.get(ai.holdingObjId) : null
  if (heldObj) {
    heldObj.ownerId = 'ai'
    heldObj.pos = [centerHoldX, centerHoldY, centerHoldZ]
    heldObj.vel = [0, 0, 0]

    if (ai.actionMode === 'sculpt') {
      const palmNorm: [number, number, number] = [rightX, 0.1, rightZ]
      const res = squeezeCraftWithPalm(
        heldObj.meshData,
        heldObj.kind,
        heldObj.pos,
        heldObj.quat,
        ai.leftHand,
        palmNorm,
        0.72,
        heldObj.deformSeed,
        heldObj.crumpleFactor,
        cDt
      )
      if (res.dirty) {
        heldObj.crumpleFactor = res.nextCrumple
        heldObj.deformQ = encodeDeformOffsets(
          heldObj.meshData.restPositions,
          heldObj.meshData.currPositions
        )
        if (nowSec - _lastNetBroadcastSec > 0.14) {
          _lastNetBroadcastSec = nowSec
          myRoomRuntime.onCraftDeformSend?.({
            id: heldObj.id,
            ownerId: 'ai',
            epoch: heldObj.epoch,
            pos: [...heldObj.pos],
            quat: [...heldObj.quat],
            crumpleFactor: heldObj.crumpleFactor,
            deformQ: [...heldObj.deformQ],
            timestamp: Date.now(),
          })
        }
      }
    }
  } else {
    ai.holdingObjId = null
  }

  // State transitions
  if (ai.actionTimerSec <= 0) {
    if (ai.actionMode === 'idle' || ai.actionMode === 'walk') {
      // Spawn or pick up an AI object to sculpt
      const usePaper = Math.random() < 0.45
      const kind = usePaper ? 'paper' : 'clay'
      const preset: CraftShapePreset = usePaper
        ? 'sheet'
        : Math.random() < 0.5
          ? 'sphere'
          : 'cylinder'
      const color = usePaper
        ? PAPER_COLORS[Math.floor(Math.random() * PAPER_COLORS.length)]
        : CLAY_COLORS[Math.floor(Math.random() * CLAY_COLORS.length)]

      const created = spawnRuntimeCraftObject({
        ownerId: 'ai',
        creatorId: 'ai',
        kind,
        preset,
        color,
        pos: [centerHoldX, centerHoldY, centerHoldZ],
        broadcast: true,
      })
      ai.holdingObjId = created.id
      ai.actionMode = 'sculpt'
      ai.actionTimerSec = 2.4 + Math.random() * 1.4
    } else if (ai.actionMode === 'sculpt') {
      if (heldObj && Math.random() < 0.42) {
        // Tear piece apart dramatically!
        const split = computeTearSplitDeforms(
          heldObj.meshData,
          heldObj.kind,
          heldObj.pos,
          heldObj.quat,
          ai.leftHand,
          ai.rightHand,
          heldObj.deformSeed,
          heldObj.tearGeneration
        )
        if (split.canTear) {
          const parentPos: [number, number, number] = [...heldObj.pos]
          const parentColor = heldObj.color
          const parentKind = heldObj.kind
          const parentPreset = heldObj.preset
          const nextGen = heldObj.tearGeneration + 1
          deleteRuntimeCraftObject(heldObj.id, true)
          ai.holdingObjId = null

          spawnRuntimeCraftObject({
            ownerId: null,
            creatorId: 'ai',
            kind: parentKind,
            preset: parentPreset,
            color: parentColor,
            pos: [
              parentPos[0] + split.leftOffsetWorld[0],
              Math.max(dropSurfaceY, parentPos[1]),
              parentPos[2] + split.leftOffsetWorld[2],
            ],
            vel: [-rightX * 0.45, 0.35, -rightZ * 0.45],
            scale: heldObj.scale * split.childScale,
            tearGeneration: nextGen,
            deformQ: split.leftDeformQ,
            broadcast: true,
          })
          spawnRuntimeCraftObject({
            ownerId: null,
            creatorId: 'ai',
            kind: parentKind,
            preset: parentPreset,
            color: parentColor,
            pos: [
              parentPos[0] + split.rightOffsetWorld[0],
              Math.max(dropSurfaceY, parentPos[1]),
              parentPos[2] + split.rightOffsetWorld[2],
            ],
            vel: [rightX * 0.45, 0.35, rightZ * 0.45],
            scale: heldObj.scale * split.childScale,
            tearGeneration: nextGen,
            deformQ: split.rightDeformQ,
            broadcast: true,
          })
          ai.actionMode = 'walk'
          ai.actionTimerSec = 2.0
          return
        }
      }

      // Drop sculpted creation gently toward player / room table
      if (heldObj) {
        heldObj.ownerId = null
        heldObj.vel = [fwdX * 0.75, 0.45, fwdZ * 0.75]
        heldObj.epoch += 1
        heldObj.timestamp = Date.now()
        myRoomRuntime.onCraftObjectSend?.(stripToNetState(heldObj))
        ai.holdingObjId = null
      }
      ai.actionMode = 'walk'
      ai.actionTimerSec = 2.2 + Math.random() * 1.4
    }
  }
}
