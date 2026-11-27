import { create } from 'zustand'
import { createCraftMeshData, encodeDeformOffsets, RuntimeCraftMeshData } from './craftEngine'
import {
  CLAY_COLORS,
  ClayShapePreset,
  CraftDeformNetPayload,
  CraftMaterialKind,
  CraftObjectNetState,
  CraftShapePreset,
  MAX_ROOM_CRAFT_OBJECTS,
  MyRoomOpponentMode,
  MyRoomToolMode,
  PAPER_COLORS,
  PaperShapePreset,
  RoomSurfaceCollider,
} from './types'

export interface RuntimeCraftObject extends CraftObjectNetState {
  meshData: RuntimeCraftMeshData
  dirtyNetwork: boolean
  isHeldByLocal: boolean
}

export interface MyRoomAIRuntime {
  pos: [number, number, number]
  yaw: number
  isWalking: boolean
  walkPhase: number
  leftHand: [number, number, number]
  rightHand: [number, number, number]
  holdingObjId: string | null
  actionTimerSec: number
  actionMode: 'idle' | 'walk' | 'sculpt' | 'tear'
}

export const myRoomRuntime = {
  objects: new Map<string, RuntimeCraftObject>(),
  surfaces: [] as RoomSurfaceCollider[],
  roomOriginOffset: [0, 0, 0] as [number, number, number],
  ai: {
    pos: [0, 0, -1.65] as [number, number, number],
    yaw: 0,
    isWalking: false,
    walkPhase: 0,
    leftHand: [-0.24, 1.12, -1.42] as [number, number, number],
    rightHand: [0.24, 1.12, -1.42] as [number, number, number],
    holdingObjId: null,
    actionTimerSec: 1.5,
    actionMode: 'idle',
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
  tearGeneration?: number
  deformQ?: number[]
  deformSeed?: number
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
    tearGeneration: opts.tearGeneration ?? 0,
    deformQ,
    deformSeed,
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
    tearGeneration: obj.tearGeneration,
    deformQ: [...obj.deformQ],
    deformSeed: obj.deformSeed,
    timestamp: obj.timestamp,
  }
}

export interface MyRoomStoreState {
  selectedKind: CraftMaterialKind
  selectedClayPreset: ClayShapePreset
  selectedPaperPreset: PaperShapePreset
  selectedColor: string
  toolMode: MyRoomToolMode
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
  selectedColor: CLAY_COLORS[0],
  toolMode: 'sculpt-grab',
  opponentMode: 'auto',
  showRoomMesh: true,
  scannedSurfaceCount: 0,
  objectCount: 0,
  objectListVersion: 0,
  statusHint: 'Scan room surfaces & pinch/squeeze clay or paper with your palms',

  setSelectedKind: (selectedKind) =>
    set({
      selectedKind,
      selectedColor: selectedKind === 'clay' ? CLAY_COLORS[0] : PAPER_COLORS[0],
    }),
  setSelectedClayPreset: (selectedClayPreset) => set({ selectedClayPreset }),
  setSelectedPaperPreset: (selectedPaperPreset) => set({ selectedPaperPreset }),
  setSelectedColor: (selectedColor) => set({ selectedColor }),
  setToolMode: (toolMode) => set({ toolMode }),
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
    myRoomRuntime.ai.holdingObjId = null
    set((s) => ({
      objectCount: 0,
      objectListVersion: s.objectListVersion + 1,
      scannedSurfaceCount: 0,
      statusHint: 'Room ready — create Clay or Paper objects to sculpt & share',
    }))
  },
}))
