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
// 0 = Skin, 1 = Sweater Vest / Upper Top, 2 = Pleated Skirt / Trousers, 3 = Loafers / Sneakers,
// 4 = Trim / Sole / Keeper Strap, 5 = Crisp White Shirt Sleeves & Neck Shirt, 6 = Knee-High Socks
export type UnityMatSlot = 0 | 1 | 2 | 3 | 4 | 5 | 6

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
    shoulderX: isFemale ? 0.156 : 0.2,
    hipX: isFemale ? 0.078 : 0.096,
    hipsY: isFemale ? 0.87 : 0.88,
    shoulderY: isFemale ? 1.335 : 1.36,
    upperArmLen: isFemale ? 0.255 : 0.28,
    forearmLen: isFemale ? 0.235 : 0.25,
    thighLen: isFemale ? 0.415 : 0.41,
    shinLen: isFemale ? 0.395 : 0.39,
    footHeight: isFemale ? 0.06 : 0.08,
    headY: isFemale ? 1.5 : 1.54,
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

  // Spine chain (0 -> 1 -> 2 -> 3 -> 4) mathematically matching spec.shoulderY & spec.headY
  const spineOffY = 0.135
  const chestOffY = 0.175
  const chestWorldY = spec.hipsY + spineOffY + chestOffY
  const shoulderOffY = spec.shoulderY - chestWorldY
  const neckWorldY = spec.shoulderY + 0.045
  const neckOffY = neckWorldY - chestWorldY
  const headOffY = spec.headY - neckWorldY

  bones[UNITY_BONES.Hips].position.set(0, spec.hipsY, 0)
  bones[UNITY_BONES.Spine].position.set(0, spineOffY, 0)
  bones[UNITY_BONES.Chest].position.set(0, chestOffY, 0)
  bones[UNITY_BONES.Neck].position.set(0, neckOffY, 0.004)
  bones[UNITY_BONES.Head].position.set(0, headOffY, -0.004)

  bones[UNITY_BONES.Hips].add(bones[UNITY_BONES.Spine])
  bones[UNITY_BONES.Spine].add(bones[UNITY_BONES.Chest])
  bones[UNITY_BONES.Chest].add(bones[UNITY_BONES.Neck])
  bones[UNITY_BONES.Neck].add(bones[UNITY_BONES.Head])

  // Arms attached cleanly to Chest along downward -Y bind axis (natural rest pose & robust IK)
  const clavX = spec.shoulderX * 0.48
  const upperOffset = spec.shoulderX - clavX
  bones[UNITY_BONES.LeftShoulder].position.set(-clavX, shoulderOffY, 0)
  bones[UNITY_BONES.LeftUpperArm].position.set(-upperOffset, 0, 0)
  bones[UNITY_BONES.LeftLowerArm].position.set(0, -spec.upperArmLen, 0)
  bones[UNITY_BONES.LeftHand].position.set(0, -spec.forearmLen, 0)
  bones[UNITY_BONES.Chest].add(bones[UNITY_BONES.LeftShoulder])
  bones[UNITY_BONES.LeftShoulder].add(bones[UNITY_BONES.LeftUpperArm])
  bones[UNITY_BONES.LeftUpperArm].add(bones[UNITY_BONES.LeftLowerArm])
  bones[UNITY_BONES.LeftLowerArm].add(bones[UNITY_BONES.LeftHand])

  bones[UNITY_BONES.RightShoulder].position.set(clavX, shoulderOffY, 0)
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
  /** Optional dynamic weights evaluated per angle theta around the ring */
  perVertexWeights?: (theta: number) => Array<[number, number]>
  /** Optional anatomical / pleated cross-section modulator per angle theta (0..2pi, -Z is pi) */
  shapeFn?: (theta: number, x: number, z: number) => [number, number, number]
}

const ALL_SLOTS: readonly UnityMatSlot[] = [0, 1, 2, 3, 4, 5, 6]

class SkinnedMeshAccumulator {
  positions: number[] = []
  uvs: number[] = []
  skinIndices: number[] = []
  skinWeights: number[] = []
  indicesByMat: Record<UnityMatSlot, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }

  private normalizeWeights(pairs: Array<[number, number]>): [number[], number[]] {
    const bi = [0, 0, 0, 0]
    const bw = [0, 0, 0, 0]
    let wSum = 0
    for (let k = 0; k < Math.min(4, pairs.length); k++) {
      bi[k] = pairs[k][0]
      bw[k] = pairs[k][1]
      wSum += bw[k]
    }
    if (wSum > 0) {
      for (let k = 0; k < 4; k++) bw[k] /= wSum
    } else {
      bw[0] = 1
    }
    return [bi, bw]
  }

  addLoftedTube(rings: LoftRing[], radialSegs = 24, capStart = false, capEnd = false): void {
    const startVert = this.positions.length / 3
    const rowLen = radialSegs + 1

    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r]
      const v = r / Math.max(1, rings.length - 1)
      const [defaultBi, defaultBw] = this.normalizeWeights(ring.weights)

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

        const [bi, bw] = ring.perVertexWeights
          ? this.normalizeWeights(ring.perVertexWeights(theta))
          : [defaultBi, defaultBw]

        this.positions.push(ring.center[0] + lx, ring.center[1] + ly, ring.center[2] + lz)
        this.uvs.push(u, v)
        this.skinIndices.push(bi[0], bi[1], bi[2], bi[3])
        this.skinWeights.push(bw[0], bw[1], bw[2], bw[3])
      }
    }

    // Geometric outward-winding check using the first strip quad so upward torso tubes and
    // downward leg/skirt tubes are guaranteed to have strictly outward normals.
    let flipWinding = false
    if (rings.length >= 2) {
      const a = startVert * 3
      const b = (startVert + 1) * 3
      const c = (startVert + rowLen) * 3
      const r0c = rings[0].center
      const ax = this.positions[a] - r0c[0]
      const ay = this.positions[a + 1] - r0c[1]
      const az = this.positions[a + 2] - r0c[2]
      const ebx = this.positions[b] - this.positions[a]
      const eby = this.positions[b + 1] - this.positions[a + 1]
      const ebz = this.positions[b + 2] - this.positions[a + 2]
      const ecx = this.positions[c] - this.positions[a]
      const ecy = this.positions[c + 1] - this.positions[a + 1]
      const ecz = this.positions[c + 2] - this.positions[a + 2]
      // Normal of (a, c, b) = (c - a) x (b - a)
      const nx = ecy * ebz - ecz * eby
      const ny = ecz * ebx - ecx * ebz
      const nz = ecx * eby - ecy * ebx
      if (nx * ax + ny * ay + nz * az < 0) {
        flipWinding = true
      }
    }

    for (let r = 0; r < rings.length - 1; r++) {
      const slot = rings[r].matSlot
      const triList = this.indicesByMat[slot]
      for (let s = 0; s < radialSegs; s++) {
        const a = startVert + r * rowLen + s
        const b = a + 1
        const c = startVert + (r + 1) * rowLen + s
        const d = c + 1
        if (flipWinding) {
          triList.push(a, b, c, b, d, c)
        } else {
          triList.push(a, c, b, b, c, d)
        }
      }
    }

    if (capStart && rings.length > 0) {
      const r0 = rings[0]
      const cIdx = this.positions.length / 3
      this.positions.push(r0.center[0], r0.center[1], r0.center[2])
      this.uvs.push(0.5, 0)
      const [bi, bw] = this.normalizeWeights(r0.weights)
      this.skinIndices.push(bi[0], bi[1], bi[2], bi[3])
      this.skinWeights.push(bw[0], bw[1], bw[2], bw[3])
      const triList = this.indicesByMat[r0.matSlot]
      for (let s = 0; s < radialSegs; s++) {
        if (flipWinding) {
          triList.push(cIdx, startVert + s + 1, startVert + s)
        } else {
          triList.push(cIdx, startVert + s, startVert + s + 1)
        }
      }
    }

    if (capEnd && rings.length > 0) {
      const rLast = rings[rings.length - 1]
      const topStart = startVert + (rings.length - 1) * rowLen
      const cIdx = this.positions.length / 3
      this.positions.push(rLast.center[0], rLast.center[1], rLast.center[2])
      this.uvs.push(0.5, 1)
      const [bi, bw] = this.normalizeWeights(rLast.weights)
      this.skinIndices.push(bi[0], bi[1], bi[2], bi[3])
      this.skinWeights.push(bw[0], bw[1], bw[2], bw[3])
      const triList = this.indicesByMat[rLast.matSlot]
      for (let s = 0; s < radialSegs; s++) {
        if (flipWinding) {
          triList.push(cIdx, topStart + s, topStart + s + 1)
        } else {
          triList.push(cIdx, topStart + s + 1, topStart + s)
        }
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
    for (const slot of ALL_SLOTS) {
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
 * Generates a continuous multi-material Unity/VRoid Humanoid SkinnedMesh BufferGeometry:
 * - Stylized slender anatomy matching reference (sweater vest, white shirt sleeves, radial
 *   18-pleat mini-skirt, bare thighs, knee-high socks, and dark brown penny loafers in casual mode;
 *   sleek athletic trousers/shorts in sport/cricket).
 */
export function buildUnityBodyGeometry(
  spec: UnityHumanoidRigSpec,
  hideNeckForFirstPerson = false,
  uniformStyle: 'casual' | 'sport' | 'cricket' = 'casual'
): THREE.BufferGeometry {
  const isF = spec.gender === 'female'
  const isAnimeUniform = isF && uniformStyle === 'casual'
  const acc = new SkinnedMeshAccumulator()
  const B = UNITY_BONES

  const torsoContour = (spinePinch: number, bustDepth: number) => (theta: number) => {
    const cosT = Math.cos(theta)
    const sinT = Math.sin(theta)
    const backGroove = cosT > 0.7 ? -Math.pow((cosT - 0.7) / 0.3, 2) * spinePinch : 0
    const frontSplit =
      cosT < -0.35
        ? Math.sin(Math.abs(sinT) * Math.PI) * bustDepth * Math.abs(cosT + 0.35)
        : 0
    return [0, 0, backGroove - frontSplit] as [number, number, number]
  }

  // 1. CONTINUOUS PELVIS -> SWEATER VEST -> SHIRT NECKLINE -> NECK LOFT
  const torsoRings: LoftRing[] = [
    // Pelvis undershort / trouser seat base
    {
      center: [0, 0.77, 0.006],
      rx: isF ? 0.122 : 0.132,
      rz: 0.084,
      weights: [[B.Hips, 1]],
      matSlot: 2,
    },
    // Hips volume (hidden neatly under pleated skirt for casual female)
    {
      center: [0, 0.86, 0.008],
      rx: isF ? 0.136 : 0.16,
      rz: isF ? 0.102 : 0.114,
      frontScale: 0.94,
      backScale: isF ? 1.12 : 1.08,
      weights: [[B.Hips, 0.9], [B.Spine, 0.1]],
      matSlot: 2,
      shapeFn: torsoContour(0.008, 0),
    },
    // Knit sweater ribbed hem overlapping top of skirt waistband
    {
      center: [0, 0.93, 0.004],
      rx: isF ? 0.134 : 0.152,
      rz: isF ? 0.098 : 0.108,
      weights: [[B.Hips, 0.6], [B.Spine, 0.4]],
      matSlot: 1,
    },
    // Lower vest rib-band transition
    {
      center: [0, 0.965, 0.003],
      rx: isF ? 0.126 : 0.148,
      rz: isF ? 0.092 : 0.104,
      weights: [[B.Hips, 0.25], [B.Spine, 0.75]],
      matSlot: 1,
      shapeFn: torsoContour(0.006, 0),
    },
    // Petite slender anime waist
    {
      center: [0, 1.045, 0.001],
      rx: isF ? 0.108 : 0.146,
      rz: isF ? 0.079 : 0.104,
      frontScale: 1.03,
      backScale: 0.96,
      weights: [[B.Spine, 0.74], [B.Chest, 0.2], [B.Hips, 0.06]],
      matSlot: 1,
      shapeFn: torsoContour(0.009, 0.003),
    },
    // Under-bust / Ribcage
    {
      center: [0, 1.135, -0.001],
      rx: isF ? 0.126 : 0.166,
      rz: isF ? 0.092 : 0.118,
      frontScale: 1.09,
      backScale: 0.94,
      weights: [[B.Spine, 0.24], [B.Chest, 0.76]],
      matSlot: 1,
      shapeFn: torsoContour(0.01, isF ? 0.014 : 0.009),
    },
    // Bust / Upper chest peak (smooth stylized sweater drape)
    {
      center: [0, 1.225, -0.005],
      rx: isF ? 0.144 : 0.184,
      rz: isF ? 0.112 : 0.128,
      frontScale: isF ? 1.24 : 1.12,
      backScale: 0.92,
      weights: [[B.Chest, 0.94], [B.Spine, 0.06]],
      matSlot: 1,
      shapeFn: torsoContour(0.011, isF ? 0.018 : 0.012),
    },
    // Upper chest / Clavicle vest yoke
    {
      center: [0, 1.32, -0.002],
      rx: isF ? 0.15 : 0.198,
      rz: isF ? 0.092 : 0.104,
      frontScale: 1.06,
      backScale: 0.96,
      weights: [[B.Chest, 1]],
      matSlot: 1,
      shapeFn: torsoContour(0.008, 0.004),
    },
    // White collared shirt top neckline under sweater vest
    {
      center: [0, 1.372, 0.004],
      rx: isF ? 0.088 : 0.116,
      rz: isF ? 0.066 : 0.076,
      weights: [[B.Chest, 0.78], [B.Neck, 0.22]],
      matSlot: uniformStyle === 'casual' ? 5 : 4,
    },
  ]

  if (!hideNeckForFirstPerson) {
    torsoRings.push(
      {
        center: [0, 1.398, 0.005],
        rx: isF ? 0.041 : 0.056,
        rz: isF ? 0.041 : 0.056,
        weights: [[B.Chest, 0.3], [B.Neck, 0.7]],
        matSlot: 0,
      },
      {
        center: [0, 1.45, 0.003],
        rx: isF ? 0.038 : 0.052,
        rz: isF ? 0.039 : 0.052,
        weights: [[B.Neck, 0.75], [B.Head, 0.25]],
        matSlot: 0,
      },
      {
        center: [0, spec.headY + 0.005, 0],
        rx: isF ? 0.04 : 0.053,
        rz: 0.044,
        weights: [[B.Head, 0.85], [B.Neck, 0.15]],
        matSlot: 0,
      }
    )
  }

  acc.addLoftedTube(torsoRings, 28, true, true)

  // 1B. 3D RADIAL ACCORDION-PLEATED MINI SKIRT FOR CASUAL FEMALE (18 Knife Pleats!)
  if (isAnimeUniform) {
    const pleatCount = 18
    const radialSegs = pleatCount * 4 // 72 segments for crisp outer ridges & inner valleys
    const skirtWeightAt = (legFactor: number) => (theta: number): Array<[number, number]> => {
      const s = Math.sin(theta)
      if (s < -0.08) {
        const w = Math.min(0.45, legFactor * Math.min(1, -s * 1.4))
        return [[B.Hips, 1 - w], [B.LeftUpperLeg, w]]
      }
      if (s > 0.08) {
        const w = Math.min(0.45, legFactor * Math.min(1, s * 1.4))
        return [[B.Hips, 1 - w], [B.RightUpperLeg, w]]
      }
      return [[B.Hips, 1]]
    }
    const pleatShape = (amp: number) => (theta: number) => {
      // Sharp alternating accordion triangular pleat wave
      const phase = ((theta * pleatCount) / (Math.PI * 2)) % 1
      const norm = phase < 0 ? phase + 1 : phase
      const tri = norm < 0.5 ? norm * 4 - 1 : 3 - norm * 4 // -1..+1 zigzag
      const dr = tri * amp
      return [Math.sin(theta) * dr, 0, Math.cos(theta) * dr] as [number, number, number]
    }

    const skirtRings: LoftRing[] = [
      // Waistband tucked neatly under sweater rib-band
      {
        center: [0, 0.94, 0.004],
        rx: 0.132,
        rz: 0.096,
        weights: [[B.Hips, 0.88], [B.Spine, 0.12]],
        matSlot: 2,
        shapeFn: pleatShape(0.002),
      },
      // Upper hip pleat flare
      {
        center: [0, 0.885, 0.006],
        rx: 0.148,
        rz: 0.112,
        frontScale: 0.96,
        backScale: 1.1,
        weights: [[B.Hips, 1]],
        perVertexWeights: skirtWeightAt(0.14),
        matSlot: 2,
        shapeFn: pleatShape(0.007),
      },
      // Mid skirt pleated flare
      {
        center: [0, 0.79, 0.005],
        rx: 0.178,
        rz: 0.138,
        frontScale: 0.96,
        backScale: 1.08,
        weights: [[B.Hips, 1]],
        perVertexWeights: skirtWeightAt(0.28),
        matSlot: 2,
        shapeFn: pleatShape(0.012),
      },
      // Crisp mini-skirt outer hem above mid-thigh
      {
        center: [0, 0.695, 0.004],
        rx: 0.204,
        rz: 0.158,
        frontScale: 0.96,
        backScale: 1.06,
        weights: [[B.Hips, 1]],
        perVertexWeights: skirtWeightAt(0.42),
        matSlot: 2,
        shapeFn: pleatShape(0.015),
      },
      // Inner bottom thickness hem (closes underside cleanly for bottom-up 360° camera view!)
      {
        center: [0, 0.696, 0.004],
        rx: 0.186,
        rz: 0.142,
        frontScale: 0.96,
        backScale: 1.06,
        weights: [[B.Hips, 1]],
        perVertexWeights: skirtWeightAt(0.42),
        matSlot: 2,
        shapeFn: pleatShape(0.011),
      },
      // Inner dark skirt lining tucked back up into pelvis
      {
        center: [0, 0.81, 0.005],
        rx: 0.142,
        rz: 0.108,
        weights: [[B.Hips, 1]],
        perVertexWeights: skirtWeightAt(0.2),
        matSlot: 2,
      },
    ]

    acc.addLoftedTube(skirtRings, radialSegs, false, false)
  }

  // 2. CONTINUOUS STITCHED LEFT & RIGHT ARMS (White Puffed Short Sleeve -> Slender Bare Forearm -> Wrist)
  const buildSkinnedArm = (sideSign: -1 | 1) => {
    const shBone = sideSign < 0 ? B.LeftShoulder : B.RightShoulder
    const uaBone = sideSign < 0 ? B.LeftUpperArm : B.RightUpperArm
    const laBone = sideSign < 0 ? B.LeftLowerArm : B.RightLowerArm
    const hdBone = sideSign < 0 ? B.LeftHand : B.RightHand

    const sx = sideSign * spec.shoulderX
    const sy = spec.shoulderY
    const elbowY = sy - spec.upperArmLen
    const wristY = elbowY - spec.forearmLen

    const armScale = isF ? 0.78 : 0.98
    const sleeveSlot: UnityMatSlot = uniformStyle === 'casual' ? 5 : 1

    const armRings: LoftRing[] = [
      // Shoulder socket tucked cleanly into vest armhole
      {
        center: [sx - sideSign * 0.042, sy - 0.008, 0],
        rx: 0.046 * armScale,
        rz: 0.046 * armScale,
        weights: [[B.Chest, 0.78], [shBone, 0.22]],
        matSlot: sleeveSlot,
      },
      // Puffed crisp white shirt sleeve shoulder cap
      {
        center: [sx, sy + 0.004, 0],
        rx: 0.056 * armScale,
        rz: 0.055 * armScale,
        weights: [[shBone, 0.35], [uaBone, 0.65]],
        matSlot: sleeveSlot,
      },
      // Short-sleeve slight outward bell puff
      {
        center: [sx, sy - 0.068, 0],
        rx: 0.058 * armScale,
        rz: 0.056 * armScale,
        weights: [[uaBone, 1]],
        matSlot: sleeveSlot,
      },
      // Short-sleeve cuff outer edge
      {
        center: [sx, sy - 0.118, -0.001],
        rx: 0.054 * armScale,
        rz: 0.053 * armScale,
        weights: [[uaBone, 1]],
        matSlot: sleeveSlot,
      },
      // Sleeve cuff inward tuck into arm (real 3D hollow sleeve opening!)
      {
        center: [sx, sy - 0.116, -0.001],
        rx: 0.036 * armScale,
        rz: 0.036 * armScale,
        weights: [[uaBone, 1]],
        matSlot: sleeveSlot,
      },
      // Bare slender upper arm emerging cleanly out of white shirt sleeve
      {
        center: [sx, sy - 0.12, 0],
        rx: 0.034 * armScale,
        rz: 0.034 * armScale,
        weights: [[uaBone, 0.95], [laBone, 0.05]],
        matSlot: 0,
      },
      // Distal upper arm above elbow
      {
        center: [sx, sy - 0.2, 0],
        rx: 0.032 * armScale,
        rz: 0.032 * armScale,
        weights: [[uaBone, 0.78], [laBone, 0.22]],
        matSlot: 0,
      },
      // Smooth 50/50 Elbow crease
      {
        center: [sx, elbowY, 0.003],
        rx: 0.031 * armScale,
        rz: 0.032 * armScale,
        weights: [[uaBone, 0.5], [laBone, 0.5]],
        matSlot: 0,
      },
      // Forearm gentle contour
      {
        center: [sx, elbowY - 0.055, -0.001],
        rx: 0.033 * armScale,
        rz: 0.032 * armScale,
        weights: [[laBone, 0.85], [uaBone, 0.15]],
        matSlot: 0,
      },
      // Slim distal forearm
      {
        center: [sx, elbowY - 0.14, 0],
        rx: 0.027 * armScale,
        rz: 0.026 * armScale,
        weights: [[laBone, 1]],
        matSlot: 0,
      },
      // Slender wrist
      {
        center: [sx, wristY + 0.022, 0],
        rx: 0.022 * armScale,
        rz: 0.019 * armScale,
        weights: [[laBone, 0.7], [hdBone, 0.3]],
        matSlot: 0,
      },
      {
        center: [sx, wristY, 0],
        rx: 0.021 * armScale,
        rz: 0.018 * armScale,
        weights: [[hdBone, 0.92], [laBone, 0.08]],
        matSlot: 0,
      },
    ]

    acc.addLoftedTube(armRings, 18, true, true)
  }

  buildSkinnedArm(-1)
  buildSkinnedArm(1)

  // 3. CONTINUOUS STITCHED LEGS, BARE THIGHS, KNEE-HIGH SOCKS & PENNY LOAFERS
  const buildSkinnedLeg = (sideSign: -1 | 1) => {
    const ulBone = sideSign < 0 ? B.LeftUpperLeg : B.RightUpperLeg
    const llBone = sideSign < 0 ? B.LeftLowerLeg : B.RightLowerLeg
    const ftBone = sideSign < 0 ? B.LeftFoot : B.RightFoot

    const hx = sideSign * spec.hipX
    const hipY = spec.hipsY - 0.03 // 0.84 female / 0.85 male
    const kneeY = hipY - spec.thighLen // 0.425 female / 0.44 male
    const ankleY = kneeY - spec.shinLen // 0.03 female / 0.05 male
    const legScale = isF ? 0.84 : 1.0

    const thighSlot: UnityMatSlot = isAnimeUniform ? 0 : 2
    const shinSlot: UnityMatSlot = isAnimeUniform ? 6 : 2

    const legRings: LoftRing[] = [
      // Upper hip undershort bridging smoothly inside pelvis / skirt
      {
        center: [hx * 0.9, hipY + 0.025, 0.004],
        rx: 0.074 * legScale,
        rz: 0.076 * legScale,
        weights: [[B.Hips, 0.48], [ulBone, 0.52]],
        matSlot: 2,
      },
      // Upper thigh
      {
        center: [hx, hipY - 0.055, -0.002],
        rx: 0.07 * legScale,
        rz: 0.072 * legScale,
        weights: [[B.Hips, 0.14], [ulBone, 0.86]],
        matSlot: thighSlot,
      },
      // Mid bare thigh slender taper
      {
        center: [hx, hipY - 0.21, -0.004],
        rx: 0.059 * legScale,
        rz: 0.061 * legScale,
        weights: [[ulBone, 1]],
        matSlot: thighSlot,
      },
      // Lower thigh above knee
      {
        center: [hx, kneeY + 0.055, -0.002],
        rx: 0.05 * legScale,
        rz: 0.052 * legScale,
        weights: [[ulBone, 0.85], [llBone, 0.15]],
        matSlot: thighSlot,
      },
      // Knee joint blend ring (just above knee-high sock cuff!)
      {
        center: [hx, kneeY + 0.012, -0.004],
        rx: 0.047 * legScale,
        rz: 0.05 * legScale,
        frontScale: 1.07,
        backScale: 0.93,
        weights: [[ulBone, 0.55], [llBone, 0.45]],
        matSlot: shinSlot,
      },
      // Sharp knee-high sock cuffed edge just below kneecap (+1.5mm subtle cuff lip)
      {
        center: [hx, kneeY + 0.009, -0.003],
        rx: 0.0485 * legScale,
        rz: 0.051 * legScale,
        weights: [[ulBone, 0.42], [llBone, 0.58]],
        matSlot: shinSlot,
      },
      // Below knee in sock
      {
        center: [hx, kneeY - 0.05, 0.002],
        rx: 0.046 * legScale,
        rz: 0.049 * legScale,
        weights: [[ulBone, 0.14], [llBone, 0.86]],
        matSlot: shinSlot,
      },
      // Slender sculpted calf
      {
        center: [hx, kneeY - 0.145, 0.007],
        rx: 0.047 * legScale,
        rz: 0.052 * legScale,
        backScale: 1.14,
        weights: [[llBone, 1]],
        matSlot: shinSlot,
      },
      // Slim anime ankle
      {
        center: [hx, ankleY + 0.075, 0.003],
        rx: 0.036 * legScale,
        rz: 0.038 * legScale,
        weights: [[llBone, 1]],
        matSlot: shinSlot,
      },
      // Sock entering loafer / sneaker cuff
      {
        center: [hx, ankleY + 0.025, 0.002],
        rx: 0.036 * legScale,
        rz: 0.039 * legScale,
        weights: [[llBone, 0.72], [ftBone, 0.28]],
        matSlot: isAnimeUniform ? 6 : 4,
      },
      // Dark brown penny loafer collar / shoe quarter
      {
        center: [hx, ankleY + 0.015, -0.008],
        rx: isF ? 0.038 : 0.044,
        rz: isF ? 0.054 : 0.056,
        weights: [[ftBone, 0.86], [llBone, 0.14]],
        matSlot: 3,
      },
      // Sleek loafer instep & almond toe extending forward along -Z
      {
        center: [hx, 0.024, -0.044],
        rx: isF ? 0.041 : 0.047,
        rz: isF ? 0.094 : 0.105,
        frontScale: 1.1,
        backScale: 0.9,
        weights: [[ftBone, 1]],
        matSlot: 3,
      },
      // Thin dark outsole resting flush on floor (y = 0.002)
      {
        center: [hx, 0.009, -0.046],
        rx: isF ? 0.042 : 0.049,
        rz: isF ? 0.098 : 0.11,
        frontScale: 1.08,
        backScale: 0.92,
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
 * Generates a stylized anime/VRoid sculpted 3D Head mesh for female/casual
 * (smooth oval cranium, delicate V-chin, clean bright eye plane, cute tiny pointed nose)
 * or chiseled humanoid sculpture for male athletes — facing -Z!
 */
export function buildUnitySculptedHeadGeometry(gender: AvatarGender): THREE.BufferGeometry {
  const isF = gender === 'female'
  const uSegs = 56
  const vSegs = 40
  const geo = new THREE.SphereGeometry(0.116, uSegs, vSegs)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute

  const gaussian = (dx: number, dy: number, sx: number, sy: number) =>
    Math.exp(-((dx * dx) / (sx * sx) + (dy * dy) / (sy * sy)))

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i)
    let y = pos.getY(i)
    let z = pos.getZ(i)

    // Anime/VRoid female cranium vs structured male cranium
    x *= isF ? 0.91 : 0.92
    y *= isF ? 1.04 : 1.09
    z *= isF ? 0.94 : 0.98

    // Delicate anime chin taper on female, angular jaw on male
    if (y < 0) {
      const low = Math.min(1, Math.abs(y) / 0.125)
      const jawNarrow = isF ? 1 - low * 0.4 : 1 - low * 0.22
      x *= jawNarrow
      if (z < 0) {
        z -= Math.pow(low, 2.0) * (isF ? 0.005 : 0.012)
      } else {
        z *= 1 - low * (isF ? 0.24 : 0.18)
      }
    }

    // Front face landmarks (-Z)
    if (z < -0.02) {
      const fWeight = Math.min(1, (-z - 0.02) / 0.075)

      // Gentle shallow eye seat (keeps large curved anime sclera smooth without dark pits)
      const leftEyeDist = gaussian(x + 0.036, y - 0.008, 0.028, 0.02)
      const rightEyeDist = gaussian(x - 0.036, y - 0.008, 0.028, 0.02)
      const socketDepth = Math.max(leftEyeDist, rightEyeDist)
      z += socketDepth * (isF ? 0.005 : 0.017) * fWeight

      // Subtle brow (minimal on female anime face so forehead bangs look seamless)
      const leftBrow = gaussian(x + 0.034, y - 0.038, 0.028, 0.011)
      const rightBrow = gaussian(x - 0.034, y - 0.038, 0.028, 0.011)
      const glabella = gaussian(x, y - 0.035, 0.016, 0.012)
      z -= (Math.max(leftBrow, rightBrow) * 0.007 + glabella * 0.004) * (isF ? 0.22 : 1.0) * fWeight

      // Delicate petite anime nose vs sculpted athlete nasal bridge
      const bridge = gaussian(x, y - 0.002, isF ? 0.008 : 0.013, isF ? 0.018 : 0.03)
      const tip = gaussian(x, y + 0.022, isF ? 0.0085 : 0.014, isF ? 0.008 : 0.013)
      const alarL = gaussian(x + 0.014, y + 0.025, 0.009, 0.008)
      const alarR = gaussian(x - 0.014, y + 0.025, 0.009, 0.008)
      z -=
        (bridge * (isF ? 0.005 : 0.016) +
          tip * (isF ? 0.014 : 0.026) +
          (isF ? 0 : (alarL + alarR) * 0.01)) *
        fWeight
      y -= tip * (isF ? 0.002 : 0.004) * fWeight

      // Soft round anime cheek warmth
      const cheekL = gaussian(x + 0.052, y + 0.018, 0.028, 0.022)
      const cheekR = gaussian(x - 0.052, y + 0.018, 0.028, 0.022)
      const cheekPush = Math.max(cheekL, cheekR) * (isF ? 0.0075 : 0.009) * fWeight
      z -= cheekPush
      x += Math.sign(x) * Math.max(cheekL, cheekR) * 0.003 * fWeight

      // Delicate smile / sculpted mouth plane
      const upperLip = gaussian(x, y + 0.05, 0.02, 0.0065)
      const lowerLip = gaussian(x, y + 0.058, 0.018, 0.007)
      const mouthGroove = gaussian(x, y + 0.054, 0.02, 0.0028)
      const chinBoss = gaussian(x, y + 0.088, 0.022, 0.015)
      z -=
        (upperLip * (isF ? 0.004 : 0.01) +
          lowerLip * (isF ? 0.004 : 0.0095) -
          mouthGroove * (isF ? 0.002 : 0.005) +
          chinBoss * (isF ? 0.0035 : 0.008)) *
        fWeight
    }

    // Subtle ear pinna bulge on temporal sides (±X)
    const earMask =
      gaussian(Math.abs(x) - 0.098, y + 0.006, 0.02, 0.024) * gaussian(z - 0.01, 0, 0.024, 1)
    if (Math.abs(x) > 0.084 && Math.abs(y + 0.006) < 0.038) {
      x += Math.sign(x) * earMask * 0.015
    }

    // Cylindrical planar UV aligned centered on -Z (u=0.5 front)
    const thetaFront = Math.atan2(x, -z)
    const u = 0.5 + thetaFront / (Math.PI * 2)
    const v = Math.max(0.02, Math.min(0.98, (y + 0.13) / 0.265))
    uv.setXY(i, u, v)
    pos.setXYZ(i, x, y, z)
  }

  geo.computeVertexNormals()
  return geo
}

/**
 * Creates PBR Albedo + Tangent-Space Bump Map textures for Knit Sweater Vest / Uniform Top & Skirt / Trousers.
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
  // 1. Upper Garment Texture (u=0.5 -> x=256 is front -Z)
  const cCanvas = document.createElement('canvas')
  cCanvas.width = 512
  cCanvas.height = 512
  const ctx = cCanvas.getContext('2d')!
  ctx.fillStyle = opts.topColor
  ctx.fillRect(0, 0, 512, 512)

  // Knit sweater micro-texture for casual, jersey weave for sport
  if (opts.uniformStyle === 'casual') {
    for (let x = 0; x < 512; x += 4) {
      ctx.fillStyle = x % 8 === 0 ? 'rgba(255, 255, 255, 0.028)' : 'rgba(0, 0, 0, 0.06)'
      ctx.fillRect(x, 0, 1.5, 512)
    }
    for (let y = 0; y < 512; y += 3) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.04)'
      ctx.fillRect(0, y, 512, 1)
    }

    // Crisp White Collared Shirt V-neck peeking cleanly out of sweater vest front (u=0.5 -> x=256)
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(222, 85)
    ctx.lineTo(290, 85)
    ctx.lineTo(256, 202)
    ctx.closePath()
    ctx.fill()

    // Subtle sweater V-neck knitted trim border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(220, 85)
    ctx.lineTo(256, 205)
    ctx.lineTo(292, 85)
    ctx.stroke()

    // Knit ribbed bottom sweater waistband (y = 355..430)
    for (let x = 0; x < 512; x += 6) {
      ctx.fillStyle = x % 12 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.22)'
      ctx.fillRect(x, 358, 2.5, 62)
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
    ctx.fillRect(0, 355, 512, 3)
  } else {
    for (let y = 0; y < 512; y += 3) {
      ctx.fillStyle = y % 6 === 0 ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.045)'
      ctx.fillRect(0, y, 512, 1)
    }
    for (let x = 0; x < 512; x += 6) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.035)'
      ctx.fillRect(x, 0, 1, 512)
    }
    ctx.fillStyle = 'rgba(15, 23, 42, 0.25)'
    ctx.fillRect(253, 45, 6, 420)
    ctx.fillStyle = opts.accentColor
    ctx.fillRect(255, 55, 2, 400)
    ctx.fillRect(0, 340, 512, 22)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(288, 300, 34, 18)
  }

  const clothAlbedo = new THREE.CanvasTexture(cCanvas)
  clothAlbedo.colorSpace = THREE.SRGBColorSpace
  clothAlbedo.wrapS = THREE.RepeatWrapping
  clothAlbedo.needsUpdate = true

  // 2. Fabric Bump Height Map
  const bCanvas = document.createElement('canvas')
  bCanvas.width = 256
  bCanvas.height = 256
  const bCtx = bCanvas.getContext('2d')!
  bCtx.fillStyle = '#808080'
  bCtx.fillRect(0, 0, 256, 256)
  for (let x = 0; x < 256; x += 2) {
    bCtx.fillStyle = x % 4 === 0 ? '#969696' : '#6e6e6e'
    bCtx.fillRect(x, 0, 1, 256)
  }
  const clothBump = new THREE.CanvasTexture(bCanvas)
  clothBump.wrapS = THREE.RepeatWrapping
  clothBump.wrapT = THREE.RepeatWrapping
  clothBump.needsUpdate = true

  // 3. Pleated Skirt / Trousers Texture
  const pCanvas = document.createElement('canvas')
  pCanvas.width = 256
  pCanvas.height = 256
  const pCtx = pCanvas.getContext('2d')!
  pCtx.fillStyle = opts.pantsColor
  pCtx.fillRect(0, 0, 256, 256)

  if (opts.uniformStyle === 'casual' && opts.gender === 'female') {
    // Crisp dark vertical accordion-pleat ambient crease shadows (18 pleats around UV width)
    const step = 256 / 18
    for (let i = 0; i < 18; i++) {
      const px = i * step
      const g = pCtx.createLinearGradient(px, 0, px + step, 0)
      g.addColorStop(0, 'rgba(0,0,0,0.34)')
      g.addColorStop(0.35, 'rgba(255,255,255,0.05)')
      g.addColorStop(0.75, 'rgba(0,0,0,0.12)')
      g.addColorStop(1, 'rgba(0,0,0,0.34)')
      pCtx.fillStyle = g
      pCtx.fillRect(px, 0, step + 1, 256)
    }
  } else {
    for (let y = 0; y < 256; y += 3) {
      pCtx.fillStyle = y % 6 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.045)'
      pCtx.fillRect(0, y, 256, 1)
    }
  }

  const pantsAlbedo = new THREE.CanvasTexture(pCanvas)
  pantsAlbedo.colorSpace = THREE.SRGBColorSpace
  pantsAlbedo.wrapS = THREE.RepeatWrapping
  pantsAlbedo.needsUpdate = true

  return { clothAlbedo, clothBump, pantsAlbedo }
}

/**
 * Generates an aligned 512x512 Facial Skin & Detail UV Texture matching buildUnitySculptedHeadGeometry.
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

  // Ultra-clean gentle skin warmth falloff toward jaw/nape
  const grad = ctx.createRadialGradient(256, 240, 65, 256, 250, 240)
  grad.addColorStop(0, profile.skinColor)
  grad.addColorStop(0.82, profile.skinColor)
  grad.addColorStop(1, profile.skinShadow)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 512, 512)

  // Soft anime rosy cheek blush below eyes
  ctx.fillStyle = isF ? 'rgba(244, 130, 134, 0.25)' : 'rgba(205, 112, 95, 0.12)'
  ctx.beginPath()
  ctx.ellipse(210, 286, 24, 13, -0.1, 0, Math.PI * 2)
  ctx.ellipse(302, 286, 24, 13, 0.1, 0, Math.PI * 2)
  ctx.fill()

  if (isF) {
    // Clean delicate anime nose tip tint (no heavy dark nostril circles!)
    ctx.fillStyle = 'rgba(255, 248, 242, 0.28)'
    ctx.fillRect(253, 248, 6, 36)
    ctx.fillStyle = 'rgba(188, 120, 102, 0.22)'
    ctx.beginPath()
    ctx.ellipse(256, 290, 4.5, 2.2, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillStyle = 'rgba(255, 245, 235, 0.18)'
    ctx.fillRect(252, 224, 8, 56)
    ctx.fillStyle = 'rgba(60, 28, 18, 0.24)'
    ctx.beginPath()
    ctx.ellipse(247, 294, 4, 2.2, 0, 0, Math.PI * 2)
    ctx.ellipse(265, 294, 4, 2.2, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Painted expressive anime eyebrows
  ctx.strokeStyle = profile.hairColor
  ctx.lineWidth = isF ? 3.2 : 6.0
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(206, 200)
  ctx.quadraticCurveTo(226, 193, 242, 200)
  ctx.moveTo(270, 200)
  ctx.quadraticCurveTo(286, 193, 306, 200)
  ctx.stroke()

  // Delicate cheerful anime smile / natural lips
  if (isF) {
    ctx.strokeStyle = 'rgba(155, 86, 78, 0.72)'
    ctx.lineWidth = 2.6
    ctx.beginPath()
    ctx.moveTo(240, 355)
    ctx.quadraticCurveTo(256, 363, 272, 355)
    ctx.stroke()
    ctx.fillStyle = 'rgba(232, 138, 134, 0.28)'
    ctx.beginPath()
    ctx.ellipse(256, 362, 12, 4, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillStyle = profile.lipColor
    ctx.beginPath()
    ctx.moveTo(234, 356)
    ctx.quadraticCurveTo(246, 346, 256, 351)
    ctx.quadraticCurveTo(266, 346, 278, 356)
    ctx.quadraticCurveTo(256, 370, 234, 356)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(60, 20, 20, 0.4)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(236, 356)
    ctx.lineTo(276, 356)
    ctx.stroke()
  }

  if (!isF && profile.hasBeard) {
    ctx.fillStyle = 'rgba(24, 18, 15, 0.28)'
    ctx.beginPath()
    ctx.ellipse(256, 392, 68, 56, 0, 0, Math.PI * 2)
    ctx.fill()
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
