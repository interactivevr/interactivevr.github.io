import { create } from 'zustand'
import { applyQuantizedDeform, createCraftMeshData, encodeDeformOffsets, RuntimeCraftMeshData } from './craftEngine'
import {
  ClayShapePreset,
  CraftDeformNetPayload,
  CraftMaterialKind,
  CraftObjectNetState,
  CraftShapePreset,
  getDefaultColorForKind,
  InkStroke2D,
  MAX_ROOM_CRAFT_OBJECTS,
  MyRoomOpponentMode,
  MyRoomToolMode,
  PaperShapePreset,
  RoomSurfaceCollider,
  WristToolKind,
} from './types'

export interface RuntimeCraftObject extends CraftObjectNetState {
  meshData: RuntimeCraftMeshData
  foldFactor: number
  strokes: InkStroke2D[]
  strokeVersion: number
  dirtyNetwork: boolean
  isHeldByLocal: boolean
}

export interface MyRoomAIRuntime {
  pos: [number, number, number]
  yaw: number
  initializedNearUser: boolean
  pullToUserActive: boolean
  sitBlend: number // 0 = standing, 1 = seated posture matching user
  isWalking: boolean
  walkPhase: number
  leftHand: [number, number, number]
  rightHand: [number, number, number]
  headWorldPos: [number, number, number]
  headReactPitch: number
  headReactYaw: number
  headReactRoll: number
  torsoReactPitch: number
  torsoReactRoll: number
  velXZ: [number, number]
  hairWorldPos: [number, number, number]
  hairPullTarget: [number, number, number] | null
  heldHandByUser: 'left' | 'right' | null
  touchedShoulderSide: 'left' | 'right' | null
  lookTarget: [number, number, number] | null
  holdingObjId: string | null
  collectedIds: string[]
  actionTimerSec: number
  actionMode: 'idle' | 'walk' | 'collect' | 'sculpt' | 'tear' | 'offer'
  targetObjId: string | null
}

export const myRoomRuntime = {
  objects: new Map<string, RuntimeCraftObject>(),
  surfaces: [] as RoomSurfaceCollider[],
  floorY: 0,
  roomBoundsXZ: { minX: -3.5, maxX: 3.5, minZ: -3.5, maxZ: 3.5 },
  leftWristPose: {
    pos: [-0.22, 1.15, -0.35] as [number, number, number],
    quat: [0, 0, 0, 1] as [number, number, number, number],
    valid: false,
  },
  rightIndexTip: {
    pos: [0.22, 1.15, -0.35] as [number, number, number],
    valid: false,
  },
  ai: {
    pos: [0, 0, -0.95] as [number, number, number],
    yaw: 0,
    initializedNearUser: false,
    pullToUserActive: false,
    sitBlend: 0,
    isWalking: false,
    walkPhase: 0,
    leftHand: [-0.22, 1.12, -1.05] as [number, number, number],
    rightHand: [0.22, 1.12, -1.05] as [number, number, number],
    headWorldPos: [0, 1.56, -1.25] as [number, number, number],
    headReactPitch: 0,
    headReactYaw: 0,
    headReactRoll: 0,
    torsoReactPitch: 0,
    torsoReactRoll: 0,
    velXZ: [0, 0] as [number, number],
    hairWorldPos: [0, 1.62, -1.22] as [number, number, number],
    hairPullTarget: null,
    heldHandByUser: null,
    touchedShoulderSide: null,
    lookTarget: null,
    holdingObjId: null,
    collectedIds: [],
    actionTimerSec: 1.4,
    actionMode: 'idle',
    targetObjId: null,
  } as MyRoomAIRuntime,
  onCraftObjectSend: null as ((obj: CraftObjectNetState, targetPeer?: string) => void) | null,
  onCraftDeformSend: null as ((deform: CraftDeformNetPayload) => void) | null,
  onCraftRemoveSend: null as ((id: string) => void) | null,
}

let _localObjSeq = 1

export function nextCraftObjectId(ownerId: string): string {
  const prefix = (ownerId || 'loc').slice(0, 6)
  return `${prefix}_${Date.now().toString(36)}_${_localObjSeq++}`
}

export function spawnRuntimeCraftObject(opts: {
  id?: string
  ownerId: string | null
  creatorId: string
  kind: CraftMaterialKind
  preset: CraftShapePreset
  color: string
  pos: [number, number, number]
  quat?: [number, number, number, number]
  vel?: [number, number, number]
  scale?: number
  crumpleFactor?: number
  foldFactor?: number
  tearGeneration?: number
  deformQ?: number[]
  deformSeed?: number
  strokes?: InkStroke2D[]
  broadcast?: boolean
}): RuntimeCraftObject {
  // Enforce object count cap cleanly by removing oldest unlocked piece if needed
  if (myRoomRuntime.objects.size >= MAX_ROOM_CRAFT_OBJECTS) {
    const firstKey = myRoomRuntime.objects.keys().next().value
    if (firstKey) {
      deleteRuntimeCraftObject(firstKey, opts.broadcast)
    }
  }

  const id = opts.id ?? nextCraftObjectId(opts.creatorId)
  const scale = opts.scale ?? 1.0
  const deformSeed = opts.deformSeed ?? Math.random() * 100
  const meshData = createCraftMeshData(opts.kind, opts.preset, scale, deformSeed)

  const deformQ =
    opts.deformQ && opts.deformQ.length === meshData.currPositions.length
      ? [...opts.deformQ]
      : encodeDeformOffsets(meshData.restPositions, meshData.currPositions)
  if (opts.deformQ && opts.deformQ.length === meshData.currPositions.length) {
    applyQuantizedDeform(meshData, deformQ)
  }

  const runtimeObj: RuntimeCraftObject = {
    id,
    ownerId: opts.ownerId,
    creatorId: opts.creatorId,
    kind: opts.kind,
    preset: opts.preset,
    color: opts.color,
    epoch: 1,
    pos: [...opts.pos],
    quat: opts.quat ? [...opts.quat] : [0, 0, 0, 1],
    vel: opts.vel ? [...opts.vel] : [0, 0.05, 0],
    scale,
    crumpleFactor: opts.crumpleFactor ?? 0,
    foldFactor: opts.foldFactor ?? 0,
    tearGeneration: opts.tearGeneration ?? 0,
    deformQ,
    deformSeed,
    strokes: opts.strokes ? opts.strokes.map((s) => ({ color: s.color, points: s.points.map((p) => [p[0], p[1]]) })) : [],
    strokeVersion: 0,
    timestamp: Date.now(),
    meshData,
    dirtyNetwork: false,
    isHeldByLocal: false,
  }

  myRoomRuntime.objects.set(id, runtimeObj)
  useMyRoomStore.getState().bumpObjectListVersion()

  if (opts.broadcast) {
    myRoomRuntime.onCraftObjectSend?.(stripToNetState(runtimeObj))
  }

  return runtimeObj
}

export function deleteRuntimeCraftObject(id: string, broadcast = true): void {
  const existing = myRoomRuntime.objects.get(id)
  if (!existing) return
  existing.meshData.geometry.dispose()
  myRoomRuntime.objects.delete(id)
  useMyRoomStore.getState().bumpObjectListVersion()
  if (broadcast) {
    myRoomRuntime.onCraftRemoveSend?.(id)
  }
}

export function clearAllMyRoomObjects(onlyCreatorId?: string): void {
  const toDelete: string[] = []
  myRoomRuntime.objects.forEach((obj, id) => {
    if (!onlyCreatorId || obj.creatorId === onlyCreatorId) {
      toDelete.push(id)
    }
  })
  toDelete.forEach((id) => deleteRuntimeCraftObject(id, true))
}

export function stripToNetState(obj: RuntimeCraftObject): CraftObjectNetState {
  return {
    id: obj.id,
    ownerId: obj.ownerId,
    creatorId: obj.creatorId,
    kind: obj.kind,
    preset: obj.preset,
    color: obj.color,
    epoch: obj.epoch,
    pos: [...obj.pos],
    quat: [...obj.quat],
    vel: [...obj.vel],
    scale: obj.scale,
    crumpleFactor: obj.crumpleFactor,
    foldFactor: obj.foldFactor,
    tearGeneration: obj.tearGeneration,
    deformQ: [...obj.deformQ],
    deformSeed: obj.deformSeed,
    strokes: obj.strokes.map((s) => ({ color: s.color, points: s.points.map((p) => [p[0], p[1]]) })),
    timestamp: obj.timestamp,
  }
}

export interface MyRoomStoreState {
  selectedKind: CraftMaterialKind
  selectedClayPreset: ClayShapePreset
  selectedPaperPreset: PaperShapePreset
  selectedColor: string
  toolMode: MyRoomToolMode
  activeTool: WristToolKind
  watchMenuOpen: boolean
  activeInkColor: string
  testerReadout: string
  testerIsLive: boolean
  showSelfBody: boolean
  opponentMode: MyRoomOpponentMode
  showRoomMesh: boolean
  scannedSurfaceCount: number
  objectCount: number
  objectListVersion: number
  statusHint: string | null

  setSelectedKind: (kind: CraftMaterialKind) => void
  setSelectedClayPreset: (preset: ClayShapePreset) => void
  setSelectedPaperPreset: (preset: PaperShapePreset) => void
  setSelectedColor: (color: string) => void
  setToolMode: (mode: MyRoomToolMode) => void
  setActiveTool: (tool: WristToolKind) => void
  setWatchMenuOpen: (open: boolean) => void
  setActiveInkColor: (color: string) => void
  setTesterState: (readout: string, isLive: boolean) => void
  setShowSelfBody: (show: boolean) => void
  setOpponentMode: (mode: MyRoomOpponentMode) => void
  setShowRoomMesh: (show: boolean) => void
  setScannedSurfaceCount: (count: number) => void
  setStatusHint: (hint: string | null) => void
  bumpObjectListVersion: () => void
  resetRoomSession: () => void
}

export const useMyRoomStore = create<MyRoomStoreState>((set) => ({
  selectedKind: 'clay',
  selectedClayPreset: 'sphere',
  selectedPaperPreset: 'sheet',
  selectedColor: getDefaultColorForKind('clay'),
  toolMode: 'sculpt-grab',
  activeTool: 'none',
  watchMenuOpen: true,
  activeInkColor: '#1e3a8a',
  testerReadout: 'READY',
  testerIsLive: false,
  showSelfBody: true,
  opponentMode: 'auto',
  showRoomMesh: false,
  scannedSurfaceCount: 0,
  objectCount: 0,
  objectListVersion: 0,
  statusHint: 'Tap Left Wrist Watch for Pen/Knife/Axe/Tester • Stack Wood Plates & Metal!',

  setSelectedKind: (selectedKind) =>
    set({
      selectedKind,
      selectedColor: getDefaultColorForKind(selectedKind),
    }),
  setSelectedClayPreset: (selectedClayPreset) => set({ selectedClayPreset }),
  setSelectedPaperPreset: (selectedPaperPreset) => set({ selectedPaperPreset }),
  setSelectedColor: (selectedColor) => set({ selectedColor }),
  setToolMode: (toolMode) => set({ toolMode }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setWatchMenuOpen: (watchMenuOpen) => set({ watchMenuOpen }),
  setActiveInkColor: (activeInkColor) => set({ activeInkColor }),
  setTesterState: (testerReadout, testerIsLive) => set({ testerReadout, testerIsLive }),
  setShowSelfBody: (showSelfBody) => set({ showSelfBody }),
  setOpponentMode: (opponentMode) => set({ opponentMode }),
  setShowRoomMesh: (showRoomMesh) => set({ showRoomMesh }),
  setScannedSurfaceCount: (scannedSurfaceCount) => set({ scannedSurfaceCount }),
  setStatusHint: (statusHint) => set({ statusHint }),
  bumpObjectListVersion: () =>
    set((s) => ({
      objectListVersion: s.objectListVersion + 1,
      objectCount: myRoomRuntime.objects.size,
    })),
  resetRoomSession: () => {
    clearAllMyRoomObjects()
    myRoomRuntime.surfaces = []
    myRoomRuntime.floorY = 0
    myRoomRuntime.roomBoundsXZ = { minX: -3.5, maxX: 3.5, minZ: -3.5, maxZ: 3.5 }
    myRoomRuntime.ai.holdingObjId = null
    myRoomRuntime.ai.initializedNearUser = false
    myRoomRuntime.ai.pullToUserActive = false
    myRoomRuntime.ai.collectedIds = []
    myRoomRuntime.ai.targetObjId = null
    myRoomRuntime.ai.hairPullTarget = null
    myRoomRuntime.ai.heldHandByUser = null
    myRoomRuntime.ai.velXZ = [0, 0]
    myRoomRuntime.ai.torsoReactPitch = 0
    myRoomRuntime.ai.torsoReactRoll = 0
    set((s) => ({
      objectCount: 0,
      objectListVersion: s.objectListVersion + 1,
      scannedSurfaceCount: 0,
      activeTool: 'none',
      testerReadout: 'READY',
      testerIsLive: false,
      statusHint: 'Room ready — tap Left Watch for Pen/Knife/Axe/Tester or build with Wood & Metal',
    }))
  },
}))
