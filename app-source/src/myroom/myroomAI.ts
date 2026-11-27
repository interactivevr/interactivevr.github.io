import * as THREE from 'three'
import { runtimeState } from '../store/useGameStore'
import { computeTearSplitDeforms, encodeDeformOffsets, squeezeCraftWithPalm } from './craftEngine'
import { clampInsideRoomWalls, findSupportingSurfaceY } from './roomPhysics'
import {
  CLOTH_COLORS,
  CLAY_COLORS,
  CraftMaterialKind,
  CraftShapePreset,
  MAX_ROOM_CRAFT_OBJECTS,
  PAPER_COLORS,
  RoomSurfaceCollider,
} from './types'
import {
  deleteRuntimeCraftObject,
  MyRoomAIRuntime,
  myRoomRuntime,
  spawnRuntimeCraftObject,
  stripToNetState,
  useMyRoomStore,
} from './useMyRoomStore'

const AI_MOVE_SPEED = 1.15
export const MIN_BODY_SEPARATION = 0.48
const _headQuat = new THREE.Quaternion()
const _userFwd = new THREE.Vector3()
let _lastNetBroadcastSec = 0

function normalizeAngleDelta(targetYaw: number, currentYaw: number): number {
  let diff = targetYaw - currentYaw
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return diff
}

/**
 * Computes obstacle-free XZ position respecting scanned room walls and tall furniture (tables/desks/couches/beds).
 */
function steerClearOfFurniture(
  x: number,
  z: number,
  surfaces: readonly RoomSurfaceCollider[],
  floorY: number
): [number, number] {
  let rx = x
  let rz = z
  const avatarPad = 0.36

  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i]
    if (s.orientation !== 'horizontal' || s.label === 'floor' || s.label === 'ceiling') continue
    // Walk around tables, desks, couches, beds, or chairs extending above ankle height
    if (s.maxY < floorY + 0.16) continue

    const halfX = s.halfExtents[0] + avatarPad
    const halfZ = s.halfExtents[2] + avatarPad
    const dx = rx - s.center[0]
    const dz = rz - s.center[2]
    if (Math.abs(dx) < halfX && Math.abs(dz) < halfZ) {
      const overlapX = halfX - Math.abs(dx)
      const overlapZ = halfZ - Math.abs(dz)
      if (overlapX < overlapZ) {
        rx += (dx >= 0 ? 1 : -1) * overlapX
      } else {
        rz += (dz >= 0 ? 1 : -1) * overlapZ
      }
    }
  }
  return [rx, rz]
}

/**
 * Enforces solid physical separation between the player's body and the Computer AI opponent
 * (applying momentum from hand/body pushes and sliding sideways around walls if cornered)
 * so the player never passes through the opponent's body mesh.
 */
export function resolveAIBodyCollision(
  ai: MyRoomAIRuntime,
  userHead: [number, number, number],
  userForwardXZ: [number, number],
  surfaces: readonly RoomSurfaceCollider[],
  floorY: number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  dt: number
): boolean {
  const cDt = Math.min(dt, 0.05)

  // 1. Apply momentum from hand/body nudges + smooth ground friction
  let nextX = ai.pos[0] + ai.velXZ[0] * cDt
  let nextZ = ai.pos[2] + ai.velXZ[1] * cDt
  const damp = Math.exp(-7.5 * cDt)
  ai.velXZ[0] *= damp
  ai.velXZ[1] *= damp
  ;[nextX, nextZ] = steerClearOfFurniture(nextX, nextZ, surfaces, floorY)
  ;[nextX, nextZ] = clampInsideRoomWalls(nextX, nextZ, 0.42, surfaces, bounds)

  // 2. Solid body-vs-body cylinder separation (cannot walk through AI body!)
  const dx = nextX - userHead[0]
  const dz = nextZ - userHead[2]
  const dist = Math.hypot(dx, dz)

  let bumped = false
  if (dist < MIN_BODY_SEPARATION) {
    bumped = true
    const nx = dist > 1e-4 ? dx / dist : userForwardXZ[0]
    const nz = dist > 1e-4 ? dz / dist : userForwardXZ[1]

    const candDirect = clampInsideRoomWalls(
      ...steerClearOfFurniture(
        userHead[0] + nx * MIN_BODY_SEPARATION,
        userHead[2] + nz * MIN_BODY_SEPARATION,
        surfaces,
        floorY
      ),
      0.42,
      surfaces,
      bounds
    )

    let chosenX = candDirect[0]
    let chosenZ = candDirect[1]
    let chosenDist = Math.hypot(chosenX - userHead[0], chosenZ - userHead[2])

    // If backed against a scanned room wall or table, sidestep tangentially so user still cannot pass through!
    if (chosenDist < MIN_BODY_SEPARATION - 0.05) {
      const tx = -nz
      const tz = nx
      const candLeft = clampInsideRoomWalls(
        ...steerClearOfFurniture(
          userHead[0] + tx * MIN_BODY_SEPARATION,
          userHead[2] + tz * MIN_BODY_SEPARATION,
          surfaces,
          floorY
        ),
        0.42,
        surfaces,
        bounds
      )
      const candRight = clampInsideRoomWalls(
        ...steerClearOfFurniture(
          userHead[0] - tx * MIN_BODY_SEPARATION,
          userHead[2] - tz * MIN_BODY_SEPARATION,
          surfaces,
          floorY
        ),
        0.42,
        surfaces,
        bounds
      )
      const dLeft = Math.hypot(candLeft[0] - userHead[0], candLeft[1] - userHead[2])
      const dRight = Math.hypot(candRight[0] - userHead[0], candRight[1] - userHead[2])
      if (dLeft > chosenDist && dLeft >= dRight) {
        chosenX = candLeft[0]
        chosenZ = candLeft[1]
        chosenDist = dLeft
      } else if (dRight > chosenDist) {
        chosenX = candRight[0]
        chosenZ = candRight[1]
        chosenDist = dRight
      }
    }

    const moveDelta = Math.hypot(chosenX - ai.pos[0], chosenZ - ai.pos[2])
    nextX = chosenX
    nextZ = chosenZ
    if (moveDelta > 0.002) {
      ai.isWalking = true
      ai.walkPhase += Math.min(0.45, moveDelta * 12)
      ai.torsoReactPitch = Math.max(-0.22, ai.torsoReactPitch - Math.min(0.14, moveDelta * 2.5))
    }
  }

  ai.pos[0] = nextX
  ai.pos[2] = nextZ
  return bumped
}

export function stepMyRoomAI(dt: number, localPeerId: string, hasHumanPeers: boolean): void {
  const st = useMyRoomStore.getState()
  const aiActive =
    st.opponentMode === 'computer' || (st.opponentMode === 'auto' && !hasHumanPeers)

  if (!aiActive) return

  const isAuthority = !hasHumanPeers || localPeerId === '' || localPeerId === 'local'
  if (!isAuthority) return

  const cDt = Math.min(dt, 0.05)
  const nowSec = performance.now() / 1000
  const ai = myRoomRuntime.ai
  const surfaces = myRoomRuntime.surfaces
  const floorY = myRoomRuntime.floorY
  const bounds = myRoomRuntime.roomBoundsXZ

  const userHead = runtimeState.localPose.headPos
  const userQ = runtimeState.localPose.headQuat
  _headQuat.set(userQ[0], userQ[1], userQ[2], userQ[3])
  _userFwd.set(0, 0, -1).applyQuaternion(_headQuat)
  _userFwd.y = 0
  if (_userFwd.lengthSq() < 1e-4) _userFwd.set(0, 0, -1)
  _userFwd.normalize()

  // Initial spawn right nearest to user (1.0m in front, clear of obstacles & inside walls!)
  const faceUserYaw = Math.atan2(-(userHead[0] - ai.pos[0]), -(userHead[2] - ai.pos[2]))
  if (!ai.initializedNearUser) {
    let initX = userHead[0] + _userFwd.x * 0.98
    let initZ = userHead[2] + _userFwd.z * 0.98
    ;[initX, initZ] = steerClearOfFurniture(initX, initZ, surfaces, floorY)
    ;[initX, initZ] = clampInsideRoomWalls(initX, initZ, 0.44, surfaces, bounds)
    ai.pos[0] = initX
    ai.pos[1] = floorY
    ai.pos[2] = initZ
    ai.yaw = Math.atan2(-(userHead[0] - initX), -(userHead[2] - initZ))
    ai.initializedNearUser = true
  }

  // 1. Match user's posture: take SITTING position if user is seated (<1.32m above floor), else STANDING
  const userEyeRelY = userHead[1] - floorY
  const targetSit = userEyeRelY < 1.32 ? 1 : 0
  ai.sitBlend += (targetSit - ai.sitBlend) * Math.min(1, cDt * 3.8)
  ai.pos[1] = floorY

  // 2. Check if user handed/offered or placed an uncollected object nearby to see & collect
  if (!ai.holdingObjId && !ai.targetObjId && !ai.pullToUserActive) {
    let bestGiftId: string | null = null
    let bestGiftDist = Infinity
    myRoomRuntime.objects.forEach((obj) => {
      if (obj.creatorId === 'ai' || ai.collectedIds.includes(obj.id)) return
      const dToAi = Math.hypot(obj.pos[0] - ai.pos[0], obj.pos[2] - ai.pos[2])
      const dToHands = Math.hypot(
        obj.pos[0] - (ai.leftHand[0] + ai.rightHand[0]) * 0.5,
        obj.pos[1] - (ai.leftHand[1] + ai.rightHand[1]) * 0.5,
        obj.pos[2] - (ai.leftHand[2] + ai.rightHand[2]) * 0.5
      )
      if ((obj.isHeldByLocal && dToHands < 0.65) || (!obj.isHeldByLocal && obj.ownerId === null && dToAi < 2.4)) {
        if (dToAi < bestGiftDist) {
          bestGiftDist = dToAi
          bestGiftId = obj.id
        }
      }
    })
    if (bestGiftId) {
      ai.targetObjId = bestGiftId
      ai.actionMode = 'collect'
      ai.actionTimerSec = 2.6
    }
  }

  const userInteractingWithBody =
    ai.heldHandByUser !== null || ai.hairPullTarget !== null || ai.touchedShoulderSide !== null

  // 3. Stationary 360-degree inspectable stance when idle:
  // Companion does NOT spin or chase user look direction, letting user freely walk around front/back/left/right/top/bottom!
  // Moves ONLY when actively pulled (pullToUserActive) or collecting a gifted object!
  let goalX = ai.pos[0]
  let goalZ = ai.pos[2]
  if (ai.pullToUserActive) {
    goalX = userHead[0] + _userFwd.x * 0.92
    goalZ = userHead[2] + _userFwd.z * 0.92
  }

  const giftObj = ai.targetObjId ? myRoomRuntime.objects.get(ai.targetObjId) : null
  if (!ai.pullToUserActive && giftObj && ai.actionMode === 'collect') {
    ai.lookTarget = [...giftObj.pos]
    const dirX = ai.pos[0] - giftObj.pos[0]
    const dirZ = ai.pos[2] - giftObj.pos[2]
    const dLen = Math.hypot(dirX, dirZ) || 1
    goalX = giftObj.pos[0] + (dirX / dLen) * 0.48
    goalZ = giftObj.pos[2] + (dirZ / dLen) * 0.48
  } else if (ai.pullToUserActive) {
    ai.lookTarget = [...userHead]
  } else {
    ai.lookTarget = null
  }

  ;[goalX, goalZ] = steerClearOfFurniture(goalX, goalZ, surfaces, floorY)
  ;[goalX, goalZ] = clampInsideRoomWalls(goalX, goalZ, 0.44, surfaces, bounds)

  const dx = goalX - ai.pos[0]
  const dz = goalZ - ai.pos[2]
  const distToGoal = Math.hypot(dx, dz)

  if (ai.pullToUserActive) {
    const distToUser = Math.hypot(userHead[0] - ai.pos[0], userHead[2] - ai.pos[2])
    if (distToUser <= 1.08 || distToGoal < 0.22) {
      ai.pullToUserActive = false
      ai.isWalking = false
    } else {
      const pullStep = Math.min(distToGoal, 2.35 * cDt)
      let nextX = ai.pos[0] + (dx / distToGoal) * pullStep
      let nextZ = ai.pos[2] + (dz / distToGoal) * pullStep
      ;[nextX, nextZ] = steerClearOfFurniture(nextX, nextZ, surfaces, floorY)
      ;[nextX, nextZ] = clampInsideRoomWalls(nextX, nextZ, 0.44, surfaces, bounds)
      ai.pos[0] = nextX
      ai.pos[2] = nextZ
      ai.isWalking = true
      ai.walkPhase += cDt * 8.5
    }
    ai.yaw += normalizeAngleDelta(faceUserYaw, ai.yaw) * Math.min(1, cDt * 8.0)
  } else if (ai.actionMode === 'collect' && giftObj && distToGoal > 0.24 && !userInteractingWithBody && ai.sitBlend <= 0.65) {
    const moveStep = Math.min(distToGoal, AI_MOVE_SPEED * cDt)
    let nextX = ai.pos[0] + (dx / distToGoal) * moveStep
    let nextZ = ai.pos[2] + (dz / distToGoal) * moveStep
    ;[nextX, nextZ] = steerClearOfFurniture(nextX, nextZ, surfaces, floorY)
    ;[nextX, nextZ] = clampInsideRoomWalls(nextX, nextZ, 0.44, surfaces, bounds)
    ai.pos[0] = nextX
    ai.pos[2] = nextZ
    ai.isWalking = true
    ai.walkPhase += cDt * 6.2
    const faceGiftYaw = Math.atan2(-(giftObj.pos[0] - ai.pos[0]), -(giftObj.pos[2] - ai.pos[2]))
    ai.yaw += normalizeAngleDelta(faceGiftYaw, ai.yaw) * Math.min(1, cDt * 5.0)
  } else {
    // Hold steady orientation so player can walk around & inspect all 360° angles seamlessly
    ai.isWalking = false
  }

  // Smooth spring decay for head & torso tactile reactions
  ai.headReactPitch *= Math.pow(0.08, cDt)
  ai.headReactYaw *= Math.pow(0.08, cDt)
  ai.headReactRoll *= Math.pow(0.08, cDt)
  ai.torsoReactPitch *= Math.pow(0.06, cDt)
  ai.torsoReactRoll *= Math.pow(0.06, cDt)

  // Always resolve solid physical body collision & momentum BEFORE placing arms/objects
  const bumpedByUser = resolveAIBodyCollision(
    ai,
    userHead,
    [_userFwd.x, _userFwd.z],
    surfaces,
    floorY,
    bounds,
    cDt
  )
  if (bumpedByUser) {
    useMyRoomStore.getState().setStatusHint('Companion stepped back from your body movement')
  }

  // 4. Arm & Hand Kinematics (facing user, seated vs standing height, welcoming offered object)
  const cosY = Math.cos(ai.yaw)
  const sinY = Math.sin(ai.yaw)
  const fwdX = -sinY
  const fwdZ = -cosY
  const rightX = cosY
  const rightZ = -sinY
  const shoulderHeight = floorY + 1.16 - ai.sitBlend * 0.36
  const holdCenterX = ai.pos[0] + fwdX * 0.36
  const holdCenterY = shoulderHeight - 0.04
  const holdCenterZ = ai.pos[2] + fwdZ * 0.36

  // Where objects collected beside her/him sit neatly (to AI's side on scanned table or floor)
  const getSideCollectionSpot = (slotIdx: number): [number, number, number] => {
    const sideSign = slotIdx % 2 === 0 ? 1 : -1
    const tier = Math.floor(slotIdx / 2)
    let cx = ai.pos[0] + rightX * sideSign * (0.48 + tier * 0.16) + fwdX * 0.18
    let cz = ai.pos[2] + rightZ * sideSign * (0.48 + tier * 0.16) + fwdZ * 0.18
    ;[cx, cz] = clampInsideRoomWalls(cx, cz, 0.22, surfaces, bounds)
    const surf = findSupportingSurfaceY(cx, cz, surfaces, floorY, floorY + 1.35)
    return [cx, surf.y + 0.09, cz]
  }

  // Welcoming open hand target if user holds an object close or AI reaches toward gift
  const offeringGift = giftObj && giftObj.isHeldByLocal
  if (ai.heldHandByUser !== 'left') {
    if (offeringGift && giftObj) {
      ai.leftHand = [
        giftObj.pos[0] - rightX * 0.11,
        giftObj.pos[1] - 0.04,
        giftObj.pos[2] - rightZ * 0.11,
      ]
    } else {
      const wave = ai.actionMode === 'sculpt' ? Math.sin(nowSec * 6.0) * 0.05 : 0
      const spread = ai.actionMode === 'tear' ? 0.24 : ai.holdingObjId ? 0.11 - Math.abs(wave) : 0.21
      ai.leftHand = [
        holdCenterX - rightX * spread,
        holdCenterY + wave * 0.4,
        holdCenterZ - rightZ * spread,
      ]
    }
  }
  if (ai.heldHandByUser !== 'right') {
    if (offeringGift && giftObj) {
      ai.rightHand = [
        giftObj.pos[0] + rightX * 0.11,
        giftObj.pos[1] - 0.04,
        giftObj.pos[2] + rightZ * 0.11,
      ]
    } else {
      const wave = ai.actionMode === 'sculpt' ? Math.sin(nowSec * 6.0) * 0.05 : 0
      const spread = ai.actionMode === 'tear' ? 0.24 : ai.holdingObjId ? 0.11 - Math.abs(wave) : 0.21
      ai.rightHand = [
        holdCenterX + rightX * spread,
        holdCenterY - wave * 0.4,
        holdCenterZ + rightZ * spread,
      ]
    }
  }

  // 5. Handle Collected/Created Held Object in AI's Hands
  const heldObj = ai.holdingObjId ? myRoomRuntime.objects.get(ai.holdingObjId) : null
  if (heldObj) {
    heldObj.ownerId = 'ai'
    heldObj.pos = [holdCenterX, holdCenterY, holdCenterZ]
    heldObj.vel = [0, 0, 0]

    if (ai.actionMode === 'sculpt') {
      const res = squeezeCraftWithPalm(
        heldObj.meshData,
        heldObj.kind,
        heldObj.pos,
        heldObj.quat,
        ai.leftHand,
        [rightX, 0.1, rightZ],
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

  // Pick up unheld offered gift once user releases it OR when AI walks close enough to reach it
  if (ai.actionMode === 'collect' && giftObj && !giftObj.isHeldByLocal && giftObj.ownerId === null) {
    const dReach = Math.hypot(giftObj.pos[0] - holdCenterX, giftObj.pos[2] - holdCenterZ)
    if (dReach < 0.85) {
      giftObj.ownerId = 'ai'
      giftObj.epoch += 1
      ai.holdingObjId = giftObj.id
      ai.targetObjId = null
      ai.actionMode = 'sculpt'
      ai.actionTimerSec = 1.6
      useMyRoomStore.getState().setStatusHint('Companion received your object & is shaping/collecting it!')
      myRoomRuntime.onCraftObjectSend?.(stripToNetState(giftObj))
      return
    }
  } else if (ai.actionMode === 'collect' && (!giftObj || (giftObj.ownerId !== null && !giftObj.isHeldByLocal))) {
    ai.targetObjId = null
    ai.actionMode = 'idle'
    ai.actionTimerSec = 1.2
  }

  // 6. State transitions (create Clay, Paper & Cloth objects, squeeze, place neatly beside self)
  ai.actionTimerSec -= cDt
  if (ai.actionTimerSec <= 0 && !userInteractingWithBody && !ai.pullToUserActive) {
    if (ai.actionMode === 'idle' || ai.actionMode === 'walk') {
      if (myRoomRuntime.objects.size < MAX_ROOM_CRAFT_OBJECTS - 3) {
        const roll = Math.random()
        const kind: CraftMaterialKind = roll < 0.38 ? 'clay' : roll < 0.72 ? 'paper' : 'cloth'
        const preset: CraftShapePreset =
          kind === 'paper'
            ? 'sheet'
            : kind === 'cloth'
              ? Math.random() < 0.5
                ? 'towel'
                : 'sheet'
              : Math.random() < 0.5
                ? 'sphere'
                : 'cylinder'
        const color =
          kind === 'paper'
            ? PAPER_COLORS[Math.floor(Math.random() * PAPER_COLORS.length)]
            : kind === 'cloth'
              ? CLOTH_COLORS[Math.floor(Math.random() * CLOTH_COLORS.length)]
              : CLAY_COLORS[Math.floor(Math.random() * CLAY_COLORS.length)]

        const created = spawnRuntimeCraftObject({
          ownerId: 'ai',
          creatorId: 'ai',
          kind,
          preset,
          color,
          pos: [holdCenterX, holdCenterY, holdCenterZ],
          broadcast: true,
        })
        ai.holdingObjId = created.id
        ai.actionMode = 'sculpt'
        ai.actionTimerSec = 2.2
      } else {
        ai.actionMode = 'idle'
        ai.actionTimerSec = 2.5
      }
    } else if (ai.actionMode === 'sculpt') {
      if (heldObj && heldObj.creatorId === 'ai' && Math.random() < 0.35) {
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
          const basePos: [number, number, number] = [...heldObj.pos]
          const k = heldObj.kind
          const pr = heldObj.preset
          const col = heldObj.color
          const ng = heldObj.tearGeneration + 1
          const ns = heldObj.scale * split.childScale
          deleteRuntimeCraftObject(heldObj.id, true)
          ai.holdingObjId = null

          const spotL = getSideCollectionSpot(ai.collectedIds.length)
          const spotR = getSideCollectionSpot(ai.collectedIds.length + 1)
          const lPiece = spawnRuntimeCraftObject({
            ownerId: null,
            creatorId: 'ai',
            kind: k,
            preset: pr,
            color: col,
            pos: [basePos[0] + split.leftOffsetWorld[0], basePos[1], basePos[2] + split.leftOffsetWorld[2]],
            vel: [(spotL[0] - basePos[0]) * 1.1, 0.3, (spotL[2] - basePos[2]) * 1.1],
            scale: ns,
            tearGeneration: ng,
            deformQ: split.leftDeformQ,
            broadcast: true,
          })
          const rPiece = spawnRuntimeCraftObject({
            ownerId: null,
            creatorId: 'ai',
            kind: k,
            preset: pr,
            color: col,
            pos: [basePos[0] + split.rightOffsetWorld[0], basePos[1], basePos[2] + split.rightOffsetWorld[2]],
            vel: [(spotR[0] - basePos[0]) * 1.1, 0.3, (spotR[2] - basePos[2]) * 1.1],
            scale: ns,
            tearGeneration: ng,
            deformQ: split.rightDeformQ,
            broadcast: true,
          })
          ai.collectedIds.push(lPiece.id, rPiece.id)
          ai.actionMode = 'idle'
          ai.actionTimerSec = 2.4
          return
        }
      }

      // Place finished / collected object neatly beside her/him on the room table or floor!
      if (heldObj) {
        const spot = getSideCollectionSpot(ai.collectedIds.length)
        heldObj.ownerId = null
        heldObj.vel = [(spot[0] - heldObj.pos[0]) * 1.4, 0.35, (spot[2] - heldObj.pos[2]) * 1.4]
        heldObj.epoch += 1
        heldObj.timestamp = Date.now()
        if (!ai.collectedIds.includes(heldObj.id)) {
          ai.collectedIds.push(heldObj.id)
        }
        myRoomRuntime.onCraftObjectSend?.(stripToNetState(heldObj))
        ai.holdingObjId = null
      }
      ai.actionMode = 'idle'
      ai.actionTimerSec = 2.2
    }
  }
}
