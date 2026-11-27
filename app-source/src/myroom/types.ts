export type CraftMaterialKind = 'clay' | 'paper' | 'cloth' | 'wood' | 'metal'

export type ClayShapePreset = 'sphere' | 'cylinder' | 'box'
export type PaperShapePreset = 'sheet' | 'card'
export type CraftShapePreset =
  | 'sphere'
  | 'cylinder'
  | 'box'
  | 'sheet'
  | 'card'
  | 'towel'
  | 'plank'
  | 'plate'
  | 'block'

export type WristToolKind = 'none' | 'pen' | 'knife' | 'axe' | 'tester'

export interface InkStroke2D {
  color: string
  points: Array<[number, number]>
}

export type MyRoomToolMode = 'sculpt-grab' | 'place' | 'tear'

export type MyRoomOpponentMode = 'auto' | 'peer' | 'computer'

export interface MaterialPhysicsSpec {
  label: string
  massKg: number
  airDragFlat: number
  airDragCompact: number
  gravityScale: number
  flutterAmp: number
  restitution: number
  friction: number
  throwGain: number
  maxThrowSpeed: number
  canSqueeze: boolean
  canFold: boolean
  canTear: boolean
}

export const MATERIAL_PHYSICS: Record<CraftMaterialKind, MaterialPhysicsSpec> = {
  paper: {
    label: 'Paper',
    massKg: 0.015,
    airDragFlat: 5.8,
    airDragCompact: 2.1,
    gravityScale: 0.34, // Flat paper drifts slowly; crumpled ball drops faster via compact drag
    flutterAmp: 0.55,
    restitution: 0.02,
    friction: 0.35,
    throwGain: 0.72,
    maxThrowSpeed: 4.5,
    canSqueeze: false, // Paper only folds/cuts/writes — squeezing disabled per spec!
    canFold: true,
    canTear: true,
  },
  cloth: {
    label: 'Cloth',
    massKg: 0.18,
    airDragFlat: 2.8,
    airDragCompact: 1.5,
    gravityScale: 0.78,
    flutterAmp: 0.14,
    restitution: 0.02,
    friction: 0.55,
    throwGain: 0.85,
    maxThrowSpeed: 6.2,
    canSqueeze: true,
    canFold: true,
    canTear: true,
  },
  clay: {
    label: 'Clay',
    massKg: 0.68,
    airDragFlat: 0.45,
    airDragCompact: 0.45,
    gravityScale: 1.0,
    flutterAmp: 0,
    restitution: 0.06, // Heavy plasticine thud, minimal bounce
    friction: 0.65,
    throwGain: 0.92,
    maxThrowSpeed: 7.8,
    canSqueeze: true,
    canFold: false,
    canTear: true,
  },
  wood: {
    label: 'Wood',
    massKg: 1.45,
    airDragFlat: 0.18,
    airDragCompact: 0.18,
    gravityScale: 1.08,
    flutterAmp: 0,
    restitution: 0.36, // Crisp solid hardwood bounce
    friction: 0.5,
    throwGain: 0.74, // Heavy inertia resists effortless flicks
    maxThrowSpeed: 6.5,
    canSqueeze: false,
    canFold: false,
    canTear: false,
  },
  metal: {
    label: 'Metal',
    massKg: 3.4,
    airDragFlat: 0.08,
    airDragCompact: 0.08,
    gravityScale: 1.18, // Heavy dense steel/brass drops quickly!
    flutterAmp: 0,
    restitution: 0.25,
    friction: 0.42,
    throwGain: 0.52, // Dense weight feels noticeably heavy when thrown
    maxThrowSpeed: 4.8,
    canSqueeze: false,
    canFold: false,
    canTear: false,
  },
}

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
  foldFactor?: number
  tearGeneration: number
  // Quantized Int8 displacements (-127..127 mapped to ±0.26m) relative to rest geometry
  deformQ: number[]
  deformSeed: number
  strokes?: InkStroke2D[]
  timestamp: number
}

export interface CraftDeformNetPayload {
  id: string
  ownerId: string | null
  epoch: number
  pos: [number, number, number]
  quat: [number, number, number, number]
  crumpleFactor: number
  foldFactor?: number
  deformQ: number[]
  strokes?: InkStroke2D[]
  timestamp: number
}

export interface RoomSurfaceCollider {
  id: string
  label: string
  orientation: 'horizontal' | 'vertical'
  center: [number, number, number]
  halfExtents: [number, number, number]
  uAxis: [number, number, number]
  vAxis: [number, number, number]
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

export const CLOTH_COLORS = [
  '#dc2626', // Crimson Scarf
  '#1d4ed8', // Denim Blue
  '#f1f5f9', // Linen Cotton
  '#0f766e', // Emerald Textile
  '#d97706', // Mustard Knit
] as const

export const WOOD_COLORS = [
  '#b47b48', // Warm Oak
  '#784624', // Rich Walnut
  '#d9ab75', // Pine Wood
] as const

export const METAL_COLORS = [
  '#cbd5e1', // Brushed Steel
  '#d99b43', // Solid Brass
  '#94a3b8', // Cast Iron
] as const

export function getDefaultColorForKind(kind: CraftMaterialKind): string {
  switch (kind) {
    case 'paper':
      return PAPER_COLORS[0]
    case 'cloth':
      return CLOTH_COLORS[0]
    case 'wood':
      return WOOD_COLORS[0]
    case 'metal':
      return METAL_COLORS[0]
    case 'clay':
    default:
      return CLAY_COLORS[0]
  }
}

export function getAllPaletteColors(): string[] {
  return [...CLAY_COLORS, ...PAPER_COLORS, ...CLOTH_COLORS, ...WOOD_COLORS, ...METAL_COLORS]
}

export const MAX_ROOM_CRAFT_OBJECTS = 26
export const MAX_TEAR_GENERATION = 3
