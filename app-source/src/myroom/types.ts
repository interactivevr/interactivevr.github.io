export type CraftMaterialKind = 'clay' | 'paper'

export type ClayShapePreset = 'sphere' | 'cylinder' | 'box'

export type PaperShapePreset = 'sheet' | 'card'

export type CraftShapePreset = ClayShapePreset | PaperShapePreset

export type MyRoomToolMode = 'sculpt-grab' | 'place' | 'tear'

export type MyRoomOpponentMode = 'auto' | 'peer' | 'computer'

export interface CraftObjectNetState {
  id: string
  ownerId: string | null
  creatorId: string
  kind: CraftMaterialKind
  preset: CraftShapePreset
  color: string
  epoch: number
  pos: [number, number, number]
  quat: [number, number, number, number]
  vel: [number, number, number]
  scale: number
  crumpleFactor: number
  tearGeneration: number
  // Quantized Int8 displacements (-127..127 mapped to ±0.24m) relative to rest geometry
  deformQ: number[]
  deformSeed: number
  timestamp: number
}

export interface CraftDeformNetPayload {
  id: string
  ownerId: string | null
  epoch: number
  pos: [number, number, number]
  quat: [number, number, number, number]
  crumpleFactor: number
  deformQ: number[]
  timestamp: number
}

export interface RoomSurfaceCollider {
  id: string
  label: string
  orientation: 'horizontal' | 'vertical'
  center: [number, number, number]
  halfExtents: [number, number, number] // world AABB extents (x, y, z)
  uAxis: [number, number, number] // plane tangent U in world space
  vAxis: [number, number, number] // plane tangent V in world space
  halfU: number
  halfV: number
  minY: number
  maxY: number
  normal: [number, number, number]
}

export const CLAY_COLORS = [
  '#c85a32', // Terracotta
  '#2563eb', // Cobalt
  '#10b981', // Mint
  '#f59e0b', // Amber
  '#ec4899', // Rose
  '#e2e8f0', // Ivory
] as const

export const PAPER_COLORS = [
  '#f8fafc', // Crisp White
  '#d6b384', // Kraft Paper
  '#7dd3fc', // Sky Origami
  '#fbcfe8', // Sakura Pink
  '#fde68a', // Butter Yellow
] as const

export const MAX_ROOM_CRAFT_OBJECTS = 26
export const MAX_TEAR_GENERATION = 3
