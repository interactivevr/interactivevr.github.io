import * as THREE from 'three'
import { AvatarGender } from '../types/game'
import { AthleteLookProfile } from './HumanFace'

export const UNITY_BONES = {
  Hips: 0,
  Spine: 1,
  Chest: 2,
  Neck: 3,
  Head: 4,
  LeftShoulder: 5,
  LeftUpperArm: 6,
  LeftLowerArm: 7,
  LeftHand: 8,
  RightShoulder: 9,
  RightUpperArm: 10,
  RightLowerArm: 11,
  RightHand: 12,
  LeftUpperLeg: 13,
  LeftLowerLeg: 14,
  LeftFoot: 15,
  RightUpperLeg: 16,
  RightLowerLeg: 17,
  RightFoot: 18,
} as const

export const BONE_COUNT = 19

// Material slots inside SkinnedMesh geometry:
// 0 = Skin, 1 = Upper Garment (Shirt/Jacket/Jersey), 2 = Trousers/Pants, 3 = Sneakers, 4 = Accent/Belt/Trim
export type UnityMatSlot = 0 | 1 | 2 | 3 | 4

export interface UnityHumanoidRigSpec {
  gender: AvatarGender
  shoulderX: number
  hipX: number
  hipsY: number
  shoulderY: number
  upperArmLen: number
  forearmLen: number
  thighLen: number
  shinLen: number
  footHeight: number
  headY: number
}

export function getUnityRigSpec(gender: AvatarGender): UnityHumanoidRigSpec {
  const isFemale = gender === 'female'
  return {
    gender,
    shoulderX: isFemale ? 0.172 : 0.205,
    hipX: isFemale ? 0.102 : 0.098,
    hipsY: 0.88,
    shoulderY: 1.36,
    upperArmLen: 0.28,
    forearmLen: 0.25,
    thighLen: 0.41,
    shinLen: 0.39,
    footHeight: 0.08,
    headY: 1.54,
  }
}

export function createUnitySkeleton(spec: UnityHumanoidRigSpec): {
  rootBone: THREE.Bone
  bones: THREE.Bone[]
  skeleton: THREE.Skeleton
} {
  const bones: THREE.Bone[] = Array.from({ length: BONE_COUNT }, (_, i) => {
    const b = new THREE.Bone()
    b.name = Object.keys(UNITY_BONES)[i] ?? `Bone${i}`
    return b
  })

  // Spine chain (0 -> 1 -> 2 -> 3 -> 4)
  bones[UNITY_BONES.Hips].position.set(0, spec.hipsY, 0)
  bones[UNITY_BONES.Spine].position.set(0, 0.14, 0)
  bones[UNITY_BONES.Chest].position.set(0, 0.18, 0)
  bones[UNITY_BONES.Neck].position.set(0, 0.2, 0.004)
  bones[UNITY_BONES.Head].position.set(0, 0.14, -0.004)

  bones[UNITY_BONES.Hips].add(bones[UNITY_BONES.Spine])
  bones[UNITY_BONES.Spine].add(bones[UNITY_BONES.Chest])
  bones[UNITY_BONES.Chest].add(bones[UNITY_BONES.Neck])
  bones[UNITY_BONES.Neck].add(bones[UNITY_BONES.Head])

  // Arms attached cleanly to Chest (0.16 above Chest = 1.36m world Y)
  const clavX = spec.shoulderX * 0.48
  const upperOffset = spec.shoulderX - clavX
  bones[UNITY_BONES.LeftShoulder].position.set(-clavX, 0.16, 0)
  bones[UNITY_BONES.LeftUpperArm].position.set(-upperOffset, 0, 0)
  bones[UNITY_BONES.LeftLowerArm].position.set(0, -spec.upperArmLen, 0)
  bones[UNITY_BONES.LeftHand].position.set(0, -spec.forearmLen, 0)
  bones[UNITY_BONES.Chest].add(bones[UNITY_BONES.LeftShoulder])
  bones[UNITY_BONES.LeftShoulder].add(bones[UNITY_BONES.LeftUpperArm])
  bones[UNITY_BONES.LeftUpperArm].add(bones[UNITY_BONES.LeftLowerArm])
  bones[UNITY_BONES.LeftLowerArm].add(bones[UNITY_BONES.LeftHand])

  bones[UNITY_BONES.RightShoulder].position.set(clavX, 0.16, 0)
  bones[UNITY_BONES.RightUpperArm].position.set(upperOffset, 0, 0)
  bones[UNITY_BONES.RightLowerArm].position.set(0, -spec.upperArmLen, 0)
  bones[UNITY_BONES.RightHand].position.set(0, -spec.forearmLen, 0)
  bones[UNITY_BONES.Chest].add(bones[UNITY_BONES.RightShoulder])
  bones[UNITY_BONES.RightShoulder].add(bones[UNITY_BONES.RightUpperArm])
  bones[UNITY_BONES.RightUpperArm].add(bones[UNITY_BONES.RightLowerArm])
  bones[UNITY_BONES.RightLowerArm].add(bones[UNITY_BONES.RightHand])

  // Legs attached to Hips
  bones[UNITY_BONES.LeftUpperLeg].position.set(-spec.hipX, -0.03, 0)
  bones[UNITY_BONES.LeftLowerLeg].position.set(0, -spec.thighLen, 0)
  bones[UNITY_BONES.LeftFoot].position.set(0, -spec.shinLen, 0)
  bones[UNITY_BONES.Hips].add(bones[UNITY_BONES.LeftUpperLeg])
  bones[UNITY_BONES.LeftUpperLeg].add(bones[UNITY_BONES.LeftLowerLeg])
  bones[UNITY_BONES.LeftLowerLeg].add(bones[UNITY_BONES.LeftFoot])

  bones[UNITY_BONES.RightUpperLeg].position.set(spec.hipX, -0.03, 0)
  bones[UNITY_BONES.RightLowerLeg].position.set(0, -spec.thighLen, 0)
  bones[UNITY_BONES.RightFoot].position.set(0, -spec.shinLen, 0)
  bones[UNITY_BONES.Hips].add(bones[UNITY_BONES.RightUpperLeg])
  bones[UNITY_BONES.RightUpperLeg].add(bones[UNITY_BONES.RightLowerLeg])
  bones[UNITY_BONES.RightLowerLeg].add(bones[UNITY_BONES.RightFoot])

  bones[UNITY_BONES.Hips].updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones)
  return { rootBone: bones[UNITY_BONES.Hips], bones, skeleton }
}

interface LoftRing {
  center: [number, number, number]
  rx: number
  rz: number
  frontScale?: number
  backScale?: number
  weights: Array<[number, number]>
  matSlot: UnityMatSlot
  /** Optional subtle anatomical cross-section modulator per angle theta (0..2pi, -Z is pi) */
  shapeFn?: (theta: number, x: number, z: number) => [number, number, number]
}

class SkinnedMeshAccumulator {
  positions: number[] = []
  uvs: number[] = []
  skinIndices: number[] = []
  skinWeights: number[] = []
  indicesByMat: Record<UnityMatSlot, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] }

  addLoftedTube(rings: LoftRing[], radialSegs = 24, capBottom = false, capTop = false): void {
    const startVert = this.positions.length / 3
    const rowLen = radialSegs + 1

    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r]
      const v = r / Math.max(1, rings.length - 1)

      // Normalize 4 bone weights
      const bi = [0, 0, 0, 0]
      const bw = [0, 0, 0, 0]
      let wSum = 0
      for (let k = 0; k < Math.min(4, ring.weights.length); k++) {
        bi[k] = ring.weights[k][0]
        bw[k] = ring.weights[k][1]
        wSum += bw[k]
      }
      if (wSum > 0) {
        for (let k = 0; k < 4; k++) bw[k] /= wSum
      } else {
        bw[0] = 1
      }

      for (let s = 0; s <= radialSegs; s++) {
        const u = s / radialSegs
        const theta = u * Math.PI * 2
        const sinT = Math.sin(theta)
        const cosT = Math.cos(theta)
        const frontW = cosT < 0 ? (ring.frontScale ?? 1.0) : (ring.backScale ?? 1.0)
        let lx = sinT * ring.rx
        let lz = cosT * ring.rz * frontW
        let ly = 0

        if (ring.shapeFn) {
          const [dx, dy, dz] = ring.shapeFn(theta, lx, lz)
          lx += dx
          ly += dy
          lz += dz
        }

        this.positions.push(ring.center[0] + lx, ring.center[1] + ly, ring.center[2] + lz)
        this.uvs.push(u, v)
        this.skinIndices.push(bi[0], bi[1], bi[2], bi[3])
        this.skinWeights.push(bw[0], bw[1], bw[2], bw[3])
      }
    }

    for (let r = 0; r < rings.length - 1; r++) {
      // Assign strip material to higher ring or transitioning ring cleanly
      const slot = rings[r].matSlot
      const triList = this.indicesByMat[slot]
      for (let s = 0; s < radialSegs; s++) {
        const a = startVert + r * rowLen + s
        const b = a + 1
        const c = startVert + (r + 1) * rowLen + s
        const d = c + 1
        triList.push(a, c, b, b, c, d)
      }
    }

    if (capBottom && rings.length > 0) {
      const r0 = rings[0]
      const cIdx = this.positions.length / 3
      this.positions.push(r0.center[0], r0.center[1], r0.center[2])
      this.uvs.push(0.5, 0)
      const [b0, b1, b2, b3] = [
        r0.weights[0]?.[0] ?? 0,
        r0.weights[1]?.[0] ?? 0,
        0,
        0,
      ]
      const w0 = r0.weights[0]?.[1] ?? 1
      const w1 = r0.weights[1]?.[1] ?? 0
      const ws = w0 + w1 || 1
      this.skinIndices.push(b0, b1, b2, b3)
      this.skinWeights.push(w0 / ws, w1 / ws, 0, 0)
      const triList = this.indicesByMat[r0.matSlot]
      for (let s = 0; s < radialSegs; s++) {
        triList.push(cIdx, startVert + s, startVert + s + 1)
      }
    }

    if (capTop && rings.length > 0) {
      const rLast = rings[rings.length - 1]
      const topStart = startVert + (rings.length - 1) * rowLen
      const cIdx = this.positions.length / 3
      this.positions.push(rLast.center[0], rLast.center[1], rLast.center[2])
      this.uvs.push(0.5, 1)
      const w0 = rLast.weights[0]?.[1] ?? 1
      const w1 = rLast.weights[1]?.[1] ?? 0
      const ws = w0 + w1 || 1
      this.skinIndices.push(rLast.weights[0]?.[0] ?? 0, rLast.weights[1]?.[0] ?? 0, 0, 0)
      this.skinWeights.push(w0 / ws, w1 / ws, 0, 0)
      const triList = this.indicesByMat[rLast.matSlot]
      for (let s = 0; s < radialSegs; s++) {
        triList.push(cIdx, topStart + s + 1, topStart + s)
      }
    }
  }

  buildGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2))
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinIndices, 4))
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinWeights, 4))

    const mergedIndices: number[] = []
    let cursor = 0
    for (let slot = 0 as UnityMatSlot; slot <= 4; slot = (slot + 1) as UnityMatSlot) {
      const arr = this.indicesByMat[slot]
      if (arr.length > 0) {
        geo.addGroup(cursor, arr.length, slot)
        for (let i = 0; i < arr.length; i++) mergedIndices.push(arr[i])
        cursor += arr.length
      }
    }
    geo.setIndex(mergedIndices)
    geo.computeVertexNormals()
    return geo
  }
}

/**
 * Generates a single continuous multi-material Unity Humanoid SkinnedMesh BufferGeometry
 * (Torso + Jacket/Shirt + Belt + Pants + Seamless 2-bone Arms + Contoured Legs + Layered Sneakers).
 */
export function buildUnityBodyGeometry(
  spec: UnityHumanoidRigSpec,
  hideNeckForFirstPerson = false
): THREE.BufferGeometry {
  const isF = spec.gender === 'female'
  const acc = new SkinnedMeshAccumulator()
  const B = UNITY_BONES

  // Anatomical spine groove & pectoral / back musculature wave helper
  const torsoContour = (spinePinch: number, pecDepth: number) => (theta: number) => {
    const cosT = Math.cos(theta)
    const sinT = Math.sin(theta)
    // Back center spine furrow (+Z -> cosT > 0) and chest sternum / bust highlight (-Z -> cosT < 0)
    const backGroove = cosT > 0.7 ? -Math.pow((cosT - 0.7) / 0.3, 2) * spinePinch : 0
    const frontSplit =
      cosT < -0.35
        ? Math.sin(Math.abs(sinT) * Math.PI) * pecDepth * Math.abs(cosT + 0.35)
        : 0
    return [0, 0, backGroove - frontSplit] as [number, number, number]
  }

  // 1. CONTINUOUS PELVIS -> BELT -> WAIST -> CHEST -> SHOULDERS -> NECK LOFT
  const torsoRings: LoftRing[] = [
    // Pelvis base (inside trousers seat)
    {
      center: [0, 0.79, 0.008],
      rx: isF ? 0.145 : 0.132,
      rz: 0.092,
      weights: [[B.Hips, 1]],
      matSlot: 2,
    },
    // Full hip / glute volume
    {
      center: [0, 0.87, 0.012],
      rx: isF ? 0.178 : 0.162,
      rz: isF ? 0.128 : 0.114,
      frontScale: 0.92,
      backScale: isF ? 1.18 : 1.08,
      weights: [[B.Hips, 0.9], [B.Spine, 0.1]],
      matSlot: 2,
      shapeFn: torsoContour(0.01, 0),
    },
    // Belt / Waistband trim ring
    {
      center: [0, 0.945, 0.006],
      rx: isF ? 0.156 : 0.154,
      rz: 0.11,
      weights: [[B.Hips, 0.65], [B.Spine, 0.35]],
      matSlot: 4,
    },
    // Shirt / Jacket lower hem
    {
      center: [0, 0.985, 0.004],
      rx: isF ? 0.14 : 0.15,
      rz: 0.104,
      weights: [[B.Hips, 0.3], [B.Spine, 0.7]],
      matSlot: 1,
      shapeFn: torsoContour(0.008, 0),
    },
    // Narrow anatomical waist / navel level
    {
      center: [0, 1.06, 0.002],
      rx: isF ? 0.122 : 0.148,
      rz: isF ? 0.092 : 0.105,
      frontScale: 1.04,
      backScale: 0.96,
      weights: [[B.Spine, 0.72], [B.Chest, 0.2], [B.Hips, 0.08]],
      matSlot: 1,
      shapeFn: torsoContour(0.011, 0.004),
    },
    // Ribcage / Mid-back
    {
      center: [0, 1.16, 0],
      rx: isF ? 0.144 : 0.168,
      rz: isF ? 0.108 : 0.12,
      frontScale: 1.08,
      backScale: 0.95,
      weights: [[B.Spine, 0.25], [B.Chest, 0.75]],
      matSlot: 1,
      shapeFn: torsoContour(0.012, isF ? 0.018 : 0.01),
    },
    // Chest / Bust / Shoulder blade peak
    {
      center: [0, 1.26, -0.004],
      rx: isF ? 0.164 : 0.188,
      rz: isF ? 0.128 : 0.13,
      frontScale: isF ? 1.2 : 1.14,
      backScale: 0.95,
      weights: [[B.Chest, 0.94], [B.Spine, 0.06]],
      matSlot: 1,
      shapeFn: torsoContour(0.014, isF ? 0.024 : 0.014),
    },
    // Upper chest / Shoulder yoke
    {
      center: [0, 1.35, -0.002],
      rx: isF ? 0.172 : 0.202,
      rz: 0.106,
      frontScale: 1.06,
      backScale: 0.98,
      weights: [[B.Chest, 1]],
      matSlot: 1,
      shapeFn: torsoContour(0.009, 0.005),
    },
    // Clavicle collar line & jacket neckband
    {
      center: [0, 1.405, 0.004],
      rx: isF ? 0.104 : 0.122,
      rz: 0.078,
      weights: [[B.Chest, 0.78], [B.Neck, 0.22]],
      matSlot: 4,
    },
  ]

  if (!hideNeckForFirstPerson) {
    torsoRings.push(
      // Lower anatomical neck (skin)
      {
        center: [0, 1.43, 0.005],
        rx: isF ? 0.048 : 0.059,
        rz: isF ? 0.048 : 0.058,
        weights: [[B.Chest, 0.3], [B.Neck, 0.7]],
        matSlot: 0,
      },
      // Mid neck
      {
        center: [0, 1.485, 0.004],
        rx: isF ? 0.044 : 0.054,
        rz: isF ? 0.045 : 0.054,
        weights: [[B.Neck, 0.75], [B.Head, 0.25]],
        matSlot: 0,
      },
      // Cranial neck insertion tucked inside skull base
      {
        center: [0, 1.54, 0.0],
        rx: isF ? 0.046 : 0.055,
        rz: 0.05,
        weights: [[B.Head, 0.85], [B.Neck, 0.15]],
        matSlot: 0,
      }
    )
  }

  acc.addLoftedTube(torsoRings, 28, true, true)

  // 2. CONTINUOUS STITCHED LEFT & RIGHT ARMS (Shoulder Deltoid -> Sleeve -> Elbow -> Forearm -> Wrist)
  const buildSkinnedArm = (sideSign: -1 | 1) => {
    const shBone = sideSign < 0 ? B.LeftShoulder : B.RightShoulder
    const uaBone = sideSign < 0 ? B.LeftUpperArm : B.RightUpperArm
    const laBone = sideSign < 0 ? B.LeftLowerArm : B.RightLowerArm
    const hdBone = sideSign < 0 ? B.LeftHand : B.RightHand

    const sx = sideSign * spec.shoulderX
    const sy = spec.shoulderY
    const elbowY = sy - spec.upperArmLen
    const wristY = elbowY - spec.forearmLen

    // Inner shoulder socket overlaps chest smoothly for zero armpit gap
    const armScale = isF ? 0.85 : 1.0
    const armRings: LoftRing[] = [
      // Tucked shoulder anchor inside torso yoke
      {
        center: [sx - sideSign * 0.048, sy - 0.005, 0],
        rx: 0.052 * armScale,
        rz: 0.052 * armScale,
        weights: [[B.Chest, 0.75], [shBone, 0.25]],
        matSlot: 1,
      },
      // Deltoid cap outer crest
      {
        center: [sx, sy + 0.005, 0],
        rx: 0.058 * armScale,
        rz: 0.056 * armScale,
        weights: [[shBone, 0.35], [uaBone, 0.65]],
        matSlot: 1,
      },
      // Deltoid taper into sleeve
      {
        center: [sx, sy - 0.06, 0],
        rx: 0.053 * armScale,
        rz: 0.051 * armScale,
        weights: [[uaBone, 1]],
        matSlot: 1,
      },
      // Bicep belly (end of jacket/t-shirt short-sleeve cuff area, rolled 3/4 sleeve -> wrist cuff look)
      {
        center: [sx, sy - 0.145, -0.003],
        rx: 0.048 * armScale,
        rz: 0.049 * armScale,
        weights: [[uaBone, 1]],
        matSlot: 1,
      },
      // Rolled sleeve trim above elbow
      {
        center: [sx, sy - 0.21, -0.002],
        rx: 0.046 * armScale,
        rz: 0.046 * armScale,
        weights: [[uaBone, 0.92], [laBone, 0.08]],
        matSlot: 4,
      },
      // Upper arm distal transition (skin)
      {
        center: [sx, sy - 0.235, 0],
        rx: 0.039 * armScale,
        rz: 0.039 * armScale,
        weights: [[uaBone, 0.75], [laBone, 0.25]],
        matSlot: 0,
      },
      // Elbow bend crease (50/50 smooth linear-blend joint!)
      {
        center: [sx, elbowY, 0.004],
        rx: 0.038 * armScale,
        rz: 0.039 * armScale,
        weights: [[uaBone, 0.5], [laBone, 0.5]],
        matSlot: 0,
      },
      // Proximal forearm extensor muscle
      {
        center: [sx, elbowY - 0.055, -0.002],
        rx: 0.041 * armScale,
        rz: 0.04 * armScale,
        weights: [[laBone, 0.85], [uaBone, 0.15]],
        matSlot: 0,
      },
      // Mid forearm taper
      {
        center: [sx, elbowY - 0.14, 0],
        rx: 0.033 * armScale,
        rz: 0.032 * armScale,
        weights: [[laBone, 1]],
        matSlot: 0,
      },
      // Narrow anatomical wrist
      {
        center: [sx, wristY + 0.025, 0],
        rx: 0.026 * armScale,
        rz: 0.023 * armScale,
        weights: [[laBone, 0.7], [hdBone, 0.3]],
        matSlot: 0,
      },
      {
        center: [sx, wristY, 0],
        rx: 0.025 * armScale,
        rz: 0.021 * armScale,
        weights: [[hdBone, 0.92], [laBone, 0.08]],
        matSlot: 0,
      },
    ]

    acc.addLoftedTube(armRings, 18, true, true)
  }

  buildSkinnedArm(-1)
  buildSkinnedArm(1)

  // 3. CONTINUOUS STITCHED LEGS & ANATOMICAL FOOTWEAR (Hip -> Thigh -> Knee -> Calf -> Ankle -> Layered Sneaker)
  const buildSkinnedLeg = (sideSign: -1 | 1) => {
    const ulBone = sideSign < 0 ? B.LeftUpperLeg : B.RightUpperLeg
    const llBone = sideSign < 0 ? B.LeftLowerLeg : B.RightLowerLeg
    const ftBone = sideSign < 0 ? B.LeftFoot : B.RightFoot

    const hx = sideSign * spec.hipX
    const hipY = spec.hipsY - 0.03 // 0.85
    const kneeY = hipY - spec.thighLen // 0.44
    const ankleY = kneeY - spec.shinLen // 0.05
    const legScale = isF ? 0.94 : 1.0

    const legRings: LoftRing[] = [
      // Upper hip socket bridging smoothly into pelvis mesh
      {
        center: [hx * 0.88, hipY + 0.03, 0.005],
        rx: 0.084 * legScale,
        rz: 0.086 * legScale,
        weights: [[B.Hips, 0.48], [ulBone, 0.52]],
        matSlot: 2,
      },
      // Upper thigh / quad
      {
        center: [hx, hipY - 0.06, -0.003],
        rx: 0.082 * legScale,
        rz: 0.084 * legScale,
        weights: [[B.Hips, 0.14], [ulBone, 0.86]],
        matSlot: 2,
      },
      // Mid thigh taper
      {
        center: [hx, hipY - 0.21, -0.005],
        rx: 0.07 * legScale,
        rz: 0.072 * legScale,
        weights: [[ulBone, 1]],
        matSlot: 2,
      },
      // Above knee
      {
        center: [hx, kneeY + 0.055, -0.002],
        rx: 0.058 * legScale,
        rz: 0.06 * legScale,
        weights: [[ulBone, 0.85], [llBone, 0.15]],
        matSlot: 2,
      },
      // Knee joint blend ring (patella front forward, popliteal crease back)
      {
        center: [hx, kneeY, -0.005],
        rx: 0.054 * legScale,
        rz: 0.058 * legScale,
        frontScale: 1.08,
        backScale: 0.92,
        weights: [[ulBone, 0.5], [llBone, 0.5]],
        matSlot: 2,
      },
      // Below knee
      {
        center: [hx, kneeY - 0.055, 0.002],
        rx: 0.053 * legScale,
        rz: 0.056 * legScale,
        weights: [[ulBone, 0.15], [llBone, 0.85]],
        matSlot: 2,
      },
      // Gastrocnemius calf belly (+Z posterior bulge)
      {
        center: [hx, kneeY - 0.14, 0.008],
        rx: 0.054 * legScale,
        rz: 0.06 * legScale,
        backScale: 1.15,
        weights: [[llBone, 1]],
        matSlot: 2,
      },
      // Distal shin taper
      {
        center: [hx, ankleY + 0.09, 0.004],
        rx: 0.044 * legScale,
        rz: 0.046 * legScale,
        weights: [[llBone, 1]],
        matSlot: 2,
      },
      // Trouser cuff trim band
      {
        center: [hx, ankleY + 0.032, 0.002],
        rx: 0.045 * legScale,
        rz: 0.046 * legScale,
        weights: [[llBone, 0.72], [ftBone, 0.28]],
        matSlot: 4,
      },
      // Sneaker padded ankle collar
      {
        center: [hx, ankleY + 0.015, 0.002],
        rx: 0.044,
        rz: 0.048,
        weights: [[ftBone, 0.85], [llBone, 0.15]],
        matSlot: 3,
      },
      // Sneaker tongue / mid-vamp extending forward along -Z
      {
        center: [hx, 0.032, -0.038],
        rx: 0.047,
        rz: 0.105,
        frontScale: 1.06,
        backScale: 0.94,
        weights: [[ftBone, 1]],
        matSlot: 3,
      },
      // Rubber midsole welt & clean bottom tread face (y = 0.002)
      {
        center: [hx, 0.012, -0.042],
        rx: 0.049,
        rz: 0.112,
        frontScale: 1.04,
        backScale: 0.96,
        weights: [[ftBone, 1]],
        matSlot: 4,
      },
    ]

    acc.addLoftedTube(legRings, 18, false, true)
  }

  buildSkinnedLeg(-1)
  buildSkinnedLeg(1)

  return acc.buildGeometry()
}

/**
 * Generates an anatomically sculpted continuous 3D Head mesh (recessed orbital eye sockets,
 * continuous nasal bridge + tip + nostrils, zygomatic cheekbones, upper/lower lip bow,
 * sculpted chin & temporal ears — facing -Z!).
 */
export function buildUnitySculptedHeadGeometry(gender: AvatarGender): THREE.BufferGeometry {
  const isF = gender === 'female'
  const uSegs = 56
  const vSegs = 40
  const geo = new THREE.SphereGeometry(0.118, uSegs, vSegs)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute

  // Align UV center (u = 0.5) cleanly with front face (-Z)!!
  // Three's SphereGeometry starts u=0 at -X and rotates around Y; let's inspect vertex world coords directly!
  const gaussian = (dx: number, dy: number, sx: number, sy: number) =>
    Math.exp(-((dx * dx) / (sx * sx) + (dy * dy) / (sy * sy)))

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i)
    let y = pos.getY(i)
    let z = pos.getZ(i)

    // Base human cranial elongation (taller head, subtle temple narrow, deeper occipital back)
    x *= isF ? 0.87 : 0.92
    y *= 1.09
    z *= 0.98

    // Chin & Jaw taper on lower anterior half (y < -0.01)
    if (y < 0) {
      const low = Math.min(1, Math.abs(y) / 0.13)
      const jawNarrow = isF ? 1 - low * 0.34 : 1 - low * 0.22
      x *= jawNarrow
      if (z < 0) {
        // Bring chin forward slightly and sculpt under-chin plane flat for bottom inspection!
        z -= Math.pow(low, 1.8) * 0.012
      } else {
        // Taper back of neck/occiput slightly inward
        z *= 1 - low * 0.18
      }
    }

    // Check front hemisphere (-Z) for facial landmark sculpting
    if (z < -0.02) {
      const fWeight = Math.min(1, (-z - 0.02) / 0.075)

      // 1. Recessed Eye Sockets (orbital cavities around (±0.036, +0.016))
      const leftEyeDist = gaussian(x + 0.036, y - 0.016, 0.025, 0.017)
      const rightEyeDist = gaussian(x - 0.036, y - 0.016, 0.025, 0.017)
      const socketDepth = Math.max(leftEyeDist, rightEyeDist)
      z += socketDepth * 0.019 * fWeight

      // 2. Brow Ridge (supraorbital arch just above sockets)
      const leftBrow = gaussian(x + 0.034, y - 0.038, 0.028, 0.011)
      const rightBrow = gaussian(x - 0.034, y - 0.038, 0.028, 0.011)
      const glabella = gaussian(x, y - 0.035, 0.016, 0.012)
      z -= (Math.max(leftBrow, rightBrow) * 0.0085 + glabella * 0.0055) * (isF ? 0.65 : 1.0) * fWeight

      // 3. Sculpted Continuous Nasal Bridge, Nasal Tip & Nostrils
      const bridge = gaussian(x, y - 0.005, 0.013, 0.03)
      const tip = gaussian(x, y + 0.022, 0.014, 0.013)
      const alarL = gaussian(x + 0.014, y + 0.025, 0.009, 0.008)
      const alarR = gaussian(x - 0.014, y + 0.025, 0.009, 0.008)
      z -= (bridge * 0.016 + tip * 0.026 + (alarL + alarR) * 0.01) * fWeight
      y -= tip * 0.004 * fWeight

      // 4. Zygomatic Cheekbones (warm sculpted cheeks below/outside eyes)
      const cheekL = gaussian(x + 0.056, y + 0.014, 0.026, 0.02)
      const cheekR = gaussian(x - 0.056, y + 0.014, 0.026, 0.02)
      const cheekPush = Math.max(cheekL, cheekR) * 0.009 * fWeight
      z -= cheekPush
      x += Math.sign(x) * Math.max(cheekL, cheekR) * 0.004 * fWeight

      // 5. Upper & Lower Lips + Mouth Crease + Mentolabial Dip
      const upperLip = gaussian(x, y + 0.048, 0.024, 0.0075)
      const lowerLip = gaussian(x, y + 0.058, 0.021, 0.008)
      const mouthGroove = gaussian(x, y + 0.053, 0.025, 0.0032)
      const chinBoss = gaussian(x, y + 0.088, 0.024, 0.016)
      z -= (upperLip * 0.01 + lowerLip * 0.0095 - mouthGroove * 0.005 + chinBoss * 0.008) * fWeight
    }

    // Subtle ear pinna bulge on temporal sides (±X)
    const earMask = gaussian(Math.abs(x) - 0.1, y + 0.006, 0.022, 0.026) * gaussian(z - 0.012, 0, 0.024, 1)
    if (Math.abs(x) > 0.085 && Math.abs(y + 0.006) < 0.04) {
      x += Math.sign(x) * earMask * 0.018
    }

    // Write planar cylindrical UV centered accurately on the front face (-Z = (0.5, 0.5))!
    const thetaFront = Math.atan2(x, -z) // -PI..+PI, 0 strictly straight ahead (-Z)
    const u = 0.5 + thetaFront / (Math.PI * 2)
    const v = Math.max(0.02, Math.min(0.98, (y + 0.13) / 0.265))
    uv.setXY(i, u, v)
    pos.setXYZ(i, x, y, z)
  }

  geo.computeVertexNormals()
  return geo
}

/**
 * Creates Unity-grade PBR Albedo + Tangent-Space Bump Map textures for Clothing / Trousers / Shoes / Skin.
 */
export function createUnityBodyTextures(opts: {
  topColor: string
  pantsColor: string
  shoeColor: string
  accentColor: string
  skinColor: string
  gender: AvatarGender
  uniformStyle: 'casual' | 'sport' | 'cricket'
}): {
  clothAlbedo: THREE.CanvasTexture
  clothBump: THREE.CanvasTexture
  pantsAlbedo: THREE.CanvasTexture
} {
  // 1. Upper Garment Texture (front placket/zipper, pocket/chest emblem, rear shoulder yoke & seam!)
  const cCanvas = document.createElement('canvas')
  cCanvas.width = 512
  cCanvas.height = 512
  const ctx = cCanvas.getContext('2d')!
  ctx.fillStyle = opts.topColor
  ctx.fillRect(0, 0, 512, 512)

  // Subtle fabric micro-weave + ambient occlusion vertical fold shading
  for (let y = 0; y < 512; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.045)'
    ctx.fillRect(0, y, 512, 1)
  }
  for (let x = 0; x < 512; x += 6) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.035)'
    ctx.fillRect(x, 0, 1, 512)
  }

  // UV seam mapping for our LoftTube:
  // theta = 0 -> u=0/1 is +Z BACK; theta = PI -> u=0.5 is -Z FRONT!
  // Front zipper / athletic placket along u=0.5 (x=256)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.25)'
  ctx.fillRect(253, 45, 6, 420)
  ctx.fillStyle = opts.accentColor
  ctx.fillRect(255, 55, 2, 400)

  // Shoulder yoke stripe (v = 0.65..0.75 -> y = 128..178) & left-chest emblem
  ctx.fillStyle = opts.accentColor
  if (opts.uniformStyle === 'sport' || opts.uniformStyle === 'cricket') {
    ctx.fillRect(0, 340, 512, 22)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(288, 300, 34, 18)
  } else {
    // Casual streetwear chest stripe & subtle jacket panel shading + back yoke seam
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fillRect(0, 326, 512, 10)
    ctx.fillStyle = opts.accentColor
    ctx.fillRect(290, 304, 28, 12)
  }

  // Back vertical spine panel stitch around u=0 & u=1 (x=0..8 & 504..512)
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'
  ctx.lineWidth = 3
  ctx.strokeRect(4, 30, 504, 440)

  // Bottom hem shadow
  const hemGrad = ctx.createLinearGradient(0, 440, 0, 512)
  hemGrad.addColorStop(0, 'rgba(0,0,0,0)')
  hemGrad.addColorStop(1, 'rgba(0,0,0,0.26)')
  ctx.fillStyle = hemGrad
  ctx.fillRect(0, 440, 512, 72)

  const clothAlbedo = new THREE.CanvasTexture(cCanvas)
  clothAlbedo.colorSpace = THREE.SRGBColorSpace
  clothAlbedo.wrapS = THREE.RepeatWrapping
  clothAlbedo.needsUpdate = true

  // 2. Normal/Bump Height Map for crisp fabric weave & garment creases
  const bCanvas = document.createElement('canvas')
  bCanvas.width = 256
  bCanvas.height = 256
  const bCtx = bCanvas.getContext('2d')!
  bCtx.fillStyle = '#808080'
  bCtx.fillRect(0, 0, 256, 256)
  for (let y = 0; y < 256; y += 2) {
    bCtx.fillStyle = y % 4 === 0 ? '#969696' : '#6c6c6c'
    bCtx.fillRect(0, y, 256, 1)
  }
  bCtx.fillStyle = '#ffffff'
  bCtx.fillRect(127, 20, 2, 210)
  const clothBump = new THREE.CanvasTexture(bCanvas)
  clothBump.wrapS = THREE.RepeatWrapping
  clothBump.wrapT = THREE.RepeatWrapping
  clothBump.needsUpdate = true

  // 3. Trousers Texture (side outseam, rear pocket outlines, slight knee wash fade)
  const pCanvas = document.createElement('canvas')
  pCanvas.width = 256
  pCanvas.height = 256
  const pCtx = pCanvas.getContext('2d')!
  pCtx.fillStyle = opts.pantsColor
  pCtx.fillRect(0, 0, 256, 256)
  for (let y = 0; y < 256; y += 3) {
    pCtx.fillStyle = y % 6 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.045)'
    pCtx.fillRect(0, y, 256, 1)
  }
  // Subtle knee fade around front (u=0.5 -> x=128)
  const kneeFade = pCtx.createRadialGradient(128, 132, 8, 128, 132, 46)
  kneeFade.addColorStop(0, 'rgba(255,255,255,0.08)')
  kneeFade.addColorStop(1, 'rgba(255,255,255,0)')
  pCtx.fillStyle = kneeFade
  pCtx.fillRect(60, 80, 136, 104)
  // Rear pocket trim near u=0 / u=1 (top belt region)
  pCtx.strokeStyle = 'rgba(255,255,255,0.12)'
  pCtx.lineWidth = 2
  pCtx.strokeRect(12, 22, 34, 34)
  pCtx.strokeRect(210, 22, 34, 34)

  const pantsAlbedo = new THREE.CanvasTexture(pCanvas)
  pantsAlbedo.colorSpace = THREE.SRGBColorSpace
  pantsAlbedo.wrapS = THREE.RepeatWrapping
  pantsAlbedo.needsUpdate = true

  return { clothAlbedo, clothBump, pantsAlbedo }
}

/**
 * Generates an anatomically aligned 512×512 Facial Skin & Detail UV Texture matching buildUnitySculptedHeadGeometry UVs.
 * Center (u=0.5, x=256) is front face (-Z), v=0.5 (y=256) is nose bridge.
 */
export function createUnityFaceTexture(
  profile: AthleteLookProfile,
  gender: AvatarGender
): THREE.CanvasTexture {
  const isF = gender === 'female'
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = profile.skinColor
  ctx.fillRect(0, 0, 512, 512)

  // Warm facial tone & subtle cheekbone flush aligned directly to U/V coordinates!
  // Note: Canvas y=0 corresponds to v=1 (crown), y=512 corresponds to v=0 (chin/neck)!
  // World landmarks: eyes at y=+0.016 -> v = (0.016+0.13)/0.265 = 0.551 -> canvasY = 230
  // cheeks at v=0.45 -> canvasY = 282; lips at y=-0.053 -> v=0.29 -> canvasY = 363; eyebrows canvasY = 204
  const grad = ctx.createRadialGradient(256, 250, 35, 256, 256, 230)
  grad.addColorStop(0, profile.skinColor)
  grad.addColorStop(0.75, profile.skinColor)
  grad.addColorStop(1, profile.skinShadow)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 512, 512)

  // Cheek warmth
  ctx.fillStyle = isF ? 'rgba(225, 102, 112, 0.22)' : 'rgba(205, 112, 95, 0.13)'
  ctx.beginPath()
  ctx.ellipse(212, 286, 24, 15, -0.15, 0, Math.PI * 2)
  ctx.ellipse(300, 286, 24, 15, 0.15, 0, Math.PI * 2)
  ctx.fill()

  // Nasal bridge warm highlight & nostril shadow
  ctx.fillStyle = 'rgba(255, 245, 235, 0.18)'
  ctx.fillRect(252, 224, 8, 56)
  ctx.fillStyle = 'rgba(60, 28, 18, 0.28)'
  ctx.beginPath()
  ctx.ellipse(247, 294, 4, 2.5, 0, 0, Math.PI * 2)
  ctx.ellipse(265, 294, 4, 2.5, 0, 0, Math.PI * 2)
  ctx.fill()

  // Soft orbital eye shadow & liner crease
  ctx.fillStyle = 'rgba(85, 50, 40, 0.14)'
  ctx.beginPath()
  ctx.ellipse(226, 228, 18, 10, 0, 0, Math.PI * 2)
  ctx.ellipse(286, 228, 18, 10, 0, 0, Math.PI * 2)
  ctx.fill()

  // Painted expressive eyebrows right over the sculpted brow ridge
  ctx.strokeStyle = profile.hairColor
  ctx.lineWidth = isF ? 4.2 : 6.2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(208, 206)
  ctx.quadraticCurveTo(226, 198, 242, 205)
  ctx.moveTo(270, 205)
  ctx.quadraticCurveTo(286, 198, 304, 206)
  ctx.stroke()

  // Sculpted natural lips aligned at canvasY ~ 358
  ctx.fillStyle = profile.lipColor
  ctx.beginPath()
  ctx.moveTo(234, 356)
  ctx.quadraticCurveTo(246, 346, 256, 351)
  ctx.quadraticCurveTo(266, 346, 278, 356)
  ctx.quadraticCurveTo(256, 370, 234, 356)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(60, 20, 20, 0.45)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(236, 356)
  ctx.lineTo(276, 356)
  ctx.stroke()

  // Optional clean stubble / beard shading on jawline for bearded male profiles
  if (!isF && profile.hasBeard) {
    ctx.fillStyle = 'rgba(24, 18, 15, 0.32)'
    ctx.beginPath()
    ctx.ellipse(256, 392, 68, 56, 0, 0, Math.PI * 2)
    ctx.fill()
    // Keep lip & upper-lip gap clean
    ctx.fillStyle = profile.lipColor
    ctx.beginPath()
    ctx.ellipse(256, 356, 22, 8, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}
