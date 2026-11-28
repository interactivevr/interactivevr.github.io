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
    shoulderX: isFemale ? 0.148 : 0.2,
    hipX: isFemale ? 0.086 : 0.096,
    hipsY: isFemale ? 0.87 : 0.88,
    shoulderY: isFemale ? 1.32 : 1.36,
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

  addSurfaceGrid(
    rows: number,
    cols: number,
    matSlot: UnityMatSlot,
    evalFn: (u: number, v: number) => {
      pos: [number, number, number]
      weights: Array<[number, number]>
    }
  ): void {
    const startVert = this.positions.length / 3
    const rowLen = cols + 1
    for (let r = 0; r <= rows; r++) {
      const v = r / rows
      for (let c = 0; c <= cols; c++) {
        const u = c / cols
        const pt = evalFn(u, v)
        const [bi, bw] = this.normalizeWeights(pt.weights)
        this.positions.push(pt.pos[0], pt.pos[1], pt.pos[2])
        this.uvs.push(u, v)
        this.skinIndices.push(bi[0], bi[1], bi[2], bi[3])
        this.skinWeights.push(bw[0], bw[1], bw[2], bw[3])
      }
    }
    const triList = this.indicesByMat[matSlot]
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = startVert + r * rowLen + c
        const b = a + 1
        const cIdx = startVert + (r + 1) * rowLen + c
        const d = cIdx + 1
        triList.push(a, cIdx, b, b, cIdx, d)
      }
    }
  }

  buildGeometry(tintFemaleSkin = false): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2))
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinIndices, 4))
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinWeights, 4))

    const vertCount = this.positions.length / 3
    const colors = new Float32Array(this.positions.length)
    colors.fill(1)
    if (tintFemaleSkin && vertCount > 0) {
      const seen = new Uint8Array(vertCount)
      const skinIndices = this.indicesByMat[0]
      for (let i = 0; i < skinIndices.length; i++) {
        const vi = skinIndices[i]
        if (seen[vi]) continue
        seen[vi] = 1
        const x = this.positions[vi * 3]
        const y = this.positions[vi * 3 + 1]
        const z = this.positions[vi * 3 + 2]
        // Keep neck seam identical to sculpted head so transition is invisible
        if (y >= 1.37) continue

        let r = 1
        let g = 1
        let b = 1
        if (z < 0) {
          // Subtle warm subsurface sternum cleavage & underbust contour
          const sternal =
            Math.exp(-Math.pow(x / 0.028, 2)) * Math.exp(-Math.pow((y - 1.2) / 0.055, 2))
          const underBust =
            Math.exp(-Math.pow((y - 1.145) / 0.028, 2)) *
            (0.4 + 0.6 * Math.exp(-Math.pow((Math.abs(x) - 0.068) / 0.055, 2)))
          r -= sternal * 0.032 + underBust * 0.028
          g -= sternal * 0.072 + underBust * 0.062
          b -= sternal * 0.082 + underBust * 0.072

          // Soft collarbone & upper chest rose blush
          const collarFlush =
            Math.exp(-Math.pow((y - 1.325) / 0.025, 2)) * Math.exp(-Math.pow(x / 0.11, 2))
          r += collarFlush * 0.014
          g -= collarFlush * 0.022
          b -= collarFlush * 0.026

          // Delicate midriff / navel dimple warmth
          if (z < -0.055) {
            const navelGlow =
              Math.exp(-Math.pow(x / 0.02, 2)) * Math.exp(-Math.pow((y - 0.985) / 0.022, 2))
            r -= navelGlow * 0.022
            g -= navelGlow * 0.052
            b -= navelGlow * 0.062
          }

          // Subtle healthy rose blush at patella knees
          const kneeBlush = Math.exp(-Math.pow((y - 0.432) / 0.028, 2))
          r += kneeBlush * 0.012
          g -= kneeBlush * 0.026
          b -= kneeBlush * 0.03
        }
        colors[vi * 3] = Math.max(0.9, Math.min(1.03, r))
        colors[vi * 3 + 1] = Math.max(0.86, Math.min(1.02, g))
        colors[vi * 3 + 2] = Math.max(0.85, Math.min(1.02, b))
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

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
  uniformStyle: 'casual' | 'nerdy' | 'sport' | 'cricket' = 'casual'
): THREE.BufferGeometry {
  const isF = spec.gender === 'female'
  const isChicF = isF && uniformStyle === 'casual'
  const isNerdyF = isF && uniformStyle === 'nerdy'
  const hasSkirt = isChicF || isNerdyF
  const acc = new SkinnedMeshAccumulator()
  const B = UNITY_BONES

  const torsoContour = (spinePinch: number, bustStrength: number) => (theta: number) => {
    const cosT = Math.cos(theta)
    const sinT = Math.sin(theta)
    const backGroove = cosT > 0.7 ? -Math.pow((cosT - 0.7) / 0.3, 2) * spinePinch : 0
    if (isF && bustStrength > 0) {
      // Sculpt natural bilateral female breast mounds draped smoothly under fabric
      const frontAng = Math.atan2(sinT, -cosT) // 0 straight ahead (-Z)
      const leftLobe = Math.exp(-Math.pow((frontAng + 0.45) / 0.36, 2))
      const rightLobe = Math.exp(-Math.pow((frontAng - 0.45) / 0.36, 2))
      const cup = (leftLobe + rightLobe) * bustStrength
      const spreadX = (rightLobe - leftLobe) * bustStrength * 0.22
      return [spreadX, 0, backGroove - cup] as [number, number, number]
    }
    const frontSplit =
      cosT < -0.35
        ? Math.sin(Math.abs(sinT) * Math.PI) * bustStrength * Math.abs(cosT + 0.35)
        : 0
    return [0, 0, backGroove - frontSplit] as [number, number, number]
  }

  // 1. CONTINUOUS 36-24-36 PELVIS -> WAIST -> MEDIUM BUST -> SHOULDERS -> NECK LOFT
  const torsoRings: LoftRing[] = [
    // Pelvis seat base (dark under-skirt fitted liner for female skirt looks, trousers for sport/male)
    {
      center: [0, 0.77, 0.006],
      rx: isF ? 0.132 : 0.132,
      rz: isF ? 0.096 : 0.084,
      weights: [[B.Hips, 1]],
      matSlot: hasSkirt ? 4 : 2,
    },
    // 36" Contoured Hips & Full Feminine Curve
    {
      center: [0, 0.86, 0.008],
      rx: isF ? 0.161 : 0.16,
      rz: isF ? 0.118 : 0.114,
      frontScale: 0.96,
      backScale: isF ? 1.24 : 1.08,
      weights: [[B.Hips, 0.9], [B.Spine, 0.1]],
      matSlot: hasSkirt ? 4 : 2,
      shapeFn: torsoContour(0.01, 0),
    },
    // Lower hip / iliac curve
    {
      center: [0, 0.93, 0.005],
      rx: isF ? 0.14 : 0.152,
      rz: isF ? 0.102 : 0.108,
      weights: [[B.Hips, 0.6], [B.Spine, 0.4]],
      matSlot: isChicF ? 4 : 1,
    },
    // Tailored faux-leather waist belt cinching high-waisted skirt (chic) or vest waist (nerdy)
    {
      center: [0, 0.972, 0.004],
      rx: isChicF ? 0.132 : isF ? 0.123 : 0.148,
      rz: isChicF ? 0.098 : isF ? 0.09 : 0.104,
      frontScale: isChicF ? 1.02 : 1.0,
      backScale: isChicF ? 1.05 : 1.0,
      weights: [[B.Hips, 0.28], [B.Spine, 0.72]],
      matSlot: isChicF ? 4 : 1,
      shapeFn: torsoContour(0.008, 0),
    },
    // Slim stylish midriff peek just above waist belt (female chic casual only; nerdy wears tucked blouse/vest)
    ...(isChicF
      ? [
          {
            center: [0, 0.996, 0.002] as [number, number, number],
            rx: 0.117,
            rz: 0.086,
            weights: [[B.Spine, 0.75], [B.Hips, 0.25]] as Array<[number, number]>,
            matSlot: 0 as UnityMatSlot,
          },
        ]
      : []),
    // 24" Slender Hourglass Waist / Ribbed Cropped Knit Sweater Waistband or Vest Base
    {
      center: [0, 1.045, 0.001],
      rx: isF ? 0.112 : 0.146,
      rz: isF ? 0.083 : 0.104,
      frontScale: 1.04,
      backScale: 0.96,
      weights: [[B.Spine, 0.74], [B.Chest, 0.2], [B.Hips, 0.06]],
      matSlot: 1,
      shapeFn: torsoContour(0.01, 0),
    },
    // Under-bust ribcage
    {
      center: [0, 1.135, -0.001],
      rx: isF ? 0.128 : 0.166,
      rz: isF ? 0.094 : 0.118,
      frontScale: 1.08,
      backScale: 0.94,
      weights: [[B.Spine, 0.24], [B.Chest, 0.76]],
      matSlot: 1,
      shapeFn: torsoContour(0.01, isF ? 0.014 : 0.009),
    },
    // 36" Bust with Balanced Medium Bilateral Breasts draped smoothly under knit fabric
    {
      center: [0, 1.21, -0.004],
      rx: isF ? 0.146 : 0.184,
      rz: isF ? 0.114 : 0.128,
      frontScale: isF ? 1.14 : 1.12,
      backScale: 0.94,
      weights: [[B.Chest, 0.94], [B.Spine, 0.06]],
      matSlot: 1,
      shapeFn: torsoContour(0.011, isF ? 0.032 : 0.012),
    },
    // Upper chest slope above bust
    {
      center: [0, 1.28, -0.002],
      rx: isF ? 0.144 : 0.192,
      rz: isF ? 0.096 : 0.112,
      frontScale: 1.08,
      backScale: 0.95,
      weights: [[B.Chest, 0.98], [B.Spine, 0.02]],
      matSlot: 1,
      shapeFn: torsoContour(0.01, isF ? 0.011 : 0.007),
    },
    // Smooth sloping trapezius & clavicle collarbone shoulder yoke
    {
      center: [0, 1.325, 0],
      rx: isF ? 0.132 : 0.19,
      rz: isF ? 0.082 : 0.1,
      frontScale: 1.04,
      backScale: 0.97,
      weights: [[B.Chest, 1]],
      matSlot: 1,
      shapeFn: torsoContour(0.008, 0.002),
    },
    // Sloping trapezius -> collar transition (knitted mock-neck on chic; crisp shirt on nerdy/male casual)
    {
      center: [0, 1.356, 0.003],
      rx: isF ? 0.094 : 0.145,
      rz: isF ? 0.066 : 0.086,
      weights: [[B.Chest, 0.86], [B.Neck, 0.14]],
      matSlot: isChicF ? 1 : uniformStyle === 'casual' || uniformStyle === 'nerdy' ? 5 : 4,
    },
    // Clavicle collar cuff
    {
      center: [0, isChicF ? 1.388 : 1.38, 0.004],
      rx: isChicF ? 0.05 : isF ? 0.058 : 0.092,
      rz: isChicF ? 0.048 : isF ? 0.052 : 0.068,
      weights: [[B.Chest, 0.55], [B.Neck, 0.45]],
      matSlot: isChicF ? 1 : uniformStyle === 'casual' || uniformStyle === 'nerdy' ? 5 : 4,
    },
  ]

  if (!hideNeckForFirstPerson) {
    torsoRings.push(
      {
        center: [0, 1.404, 0.005],
        rx: isF ? 0.041 : 0.056,
        rz: isF ? 0.041 : 0.056,
        weights: [[B.Chest, 0.3], [B.Neck, 0.7]],
        matSlot: 0,
      },
      {
        center: [0, 1.45, 0.003],
        rx: isF ? 0.039 : 0.052,
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

  acc.addLoftedTube(torsoRings, 36, true, true)

  // 1B. 3D RADIAL ACCORDION-PLEATED A-LINE MINI SKIRT (Chic Burgundy or Preppy Nerdy Plaid)
  if (hasSkirt) {
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
      // Waistband tucked neatly inside leather waist belt (chic) or vest rim (nerdy)
      {
        center: [0, isChicF ? 0.958 : 0.94, 0.004],
        rx: isChicF ? 0.128 : 0.144,
        rz: isChicF ? 0.094 : 0.106,
        weights: [[B.Hips, 0.88], [B.Spine, 0.12]],
        matSlot: 2,
        shapeFn: pleatShape(0.002),
      },
      // Upper hip pleat flare clearing 36" curvy hips smoothly
      {
        center: [0, 0.885, 0.006],
        rx: 0.172,
        rz: 0.132,
        frontScale: 0.96,
        backScale: 1.18,
        weights: [[B.Hips, 1]],
        perVertexWeights: skirtWeightAt(0.14),
        matSlot: 2,
        shapeFn: pleatShape(0.008),
      },
      // Mid skirt pleated flare
      {
        center: [0, 0.79, 0.005],
        rx: 0.194,
        rz: 0.148,
        frontScale: 1.04,
        backScale: 1.12,
        weights: [[B.Hips, 1]],
        perVertexWeights: skirtWeightAt(0.32),
        matSlot: 2,
        shapeFn: pleatShape(0.013),
      },
      // Crisp mini-skirt outer hem above mid-thigh
      {
        center: [0, 0.695, 0.004],
        rx: 0.218,
        rz: 0.168,
        frontScale: 1.06,
        backScale: 1.08,
        weights: [[B.Hips, 1]],
        perVertexWeights: skirtWeightAt(0.48),
        matSlot: 2,
        shapeFn: pleatShape(0.015),
      },
      // Inner bottom thickness hem (closes underside cleanly for bottom-up 360° camera view!)
      {
        center: [0, 0.696, 0.004],
        rx: 0.196,
        rz: 0.15,
        frontScale: 1.04,
        backScale: 1.08,
        weights: [[B.Hips, 1]],
        perVertexWeights: skirtWeightAt(0.48),
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

  // 2. CONTINUOUS STITCHED LEFT & RIGHT ARMS (Chic Fitted 3/4 Knit Sleeves, Preppy Blouse, or Athletic Sleeves)
  const buildSkinnedArm = (sideSign: -1 | 1) => {
    const shBone = sideSign < 0 ? B.LeftShoulder : B.RightShoulder
    const uaBone = sideSign < 0 ? B.LeftUpperArm : B.RightUpperArm
    const laBone = sideSign < 0 ? B.LeftLowerArm : B.RightLowerArm
    const hdBone = sideSign < 0 ? B.LeftHand : B.RightHand

    const sx = sideSign * spec.shoulderX
    const sy = spec.shoulderY
    const elbowY = sy - spec.upperArmLen
    const wristY = elbowY - spec.forearmLen

    const armScale = isF ? 0.84 : 0.98
    const sleeveSlot: UnityMatSlot =
      isChicF ? 1 : uniformStyle === 'casual' || uniformStyle === 'nerdy' ? 5 : 1

    const armRings: LoftRing[] = isChicF
      ? [
          // Fitted tailored knit sleeve seamlessly sloping down from mock-neck shoulder yoke
          {
            center: [sx - sideSign * 0.048, sy - 0.008, 0],
            rx: 0.036 * armScale,
            rz: 0.036 * armScale,
            weights: [[B.Chest, 0.78], [shBone, 0.22]],
            matSlot: sleeveSlot,
          },
          {
            center: [sx - sideSign * 0.012, sy - 0.015, 0],
            rx: 0.041 * armScale,
            rz: 0.04 * armScale,
            weights: [[shBone, 0.38], [uaBone, 0.62]],
            matSlot: sleeveSlot,
          },
          {
            center: [sx, sy - 0.045, 0],
            rx: 0.04 * armScale,
            rz: 0.04 * armScale,
            weights: [[uaBone, 0.92], [shBone, 0.08]],
            matSlot: sleeveSlot,
          },
          {
            center: [sx, sy - 0.1, 0],
            rx: 0.039 * armScale,
            rz: 0.039 * armScale,
            weights: [[uaBone, 1]],
            matSlot: sleeveSlot,
          },
          // Ribbed knit three-quarter sleeve cuff
          {
            center: [sx, sy - 0.165, -0.001],
            rx: 0.043 * armScale,
            rz: 0.042 * armScale,
            weights: [[uaBone, 0.88], [laBone, 0.12]],
            matSlot: sleeveSlot,
          },
          {
            center: [sx, sy - 0.163, -0.001],
            rx: 0.032 * armScale,
            rz: 0.032 * armScale,
            weights: [[uaBone, 0.85], [laBone, 0.15]],
            matSlot: sleeveSlot,
          },
          // Slender bare lower upper-arm emerging cleanly below knit sleeve cuff
          {
            center: [sx, sy - 0.168, 0],
            rx: 0.032 * armScale,
            rz: 0.032 * armScale,
            weights: [[uaBone, 0.84], [laBone, 0.16]],
            matSlot: 0,
          },
          {
            center: [sx, sy - 0.21, 0],
            rx: 0.031 * armScale,
            rz: 0.031 * armScale,
            weights: [[uaBone, 0.72], [laBone, 0.28]],
            matSlot: 0,
          },
        ]
      : [
          // Shoulder socket sloping smoothly from torso collarbone yoke into sleeve
          {
            center: [sx - sideSign * 0.046, sy - 0.009, 0],
            rx: 0.04 * armScale,
            rz: 0.04 * armScale,
            weights: [[B.Chest, 0.78], [shBone, 0.22]],
            matSlot: sleeveSlot,
          },
          // Tailored short sleeve shoulder cap sloping downward
          {
            center: [sx - sideSign * 0.01, sy - 0.016, 0],
            rx: 0.046 * armScale,
            rz: 0.046 * armScale,
            weights: [[shBone, 0.35], [uaBone, 0.65]],
            matSlot: sleeveSlot,
          },
          // Short-sleeve soft outward drape
          {
            center: [sx, sy - 0.068, 0],
            rx: 0.052 * armScale,
            rz: 0.05 * armScale,
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
          // Bare slender upper arm emerging cleanly out of short sleeve
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
        ]

    armRings.push(
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
        center: [sx, wristY - 0.015, 0],
        rx: 0.02 * armScale,
        rz: 0.017 * armScale,
        weights: [[hdBone, 1]],
        matSlot: 0,
      }
    )

    acc.addLoftedTube(armRings, 18, true, true)
  }

  buildSkinnedArm(-1)
  buildSkinnedArm(1)

  // 3. CONTINUOUS STITCHED LEGS, BARE THIGHS, KNEE-HIGH SOCKS & BOOTS / LOAFERS
  const buildSkinnedLeg = (sideSign: -1 | 1) => {
    const ulBone = sideSign < 0 ? B.LeftUpperLeg : B.RightUpperLeg
    const llBone = sideSign < 0 ? B.LeftLowerLeg : B.RightLowerLeg
    const ftBone = sideSign < 0 ? B.LeftFoot : B.RightFoot

    const hx = sideSign * spec.hipX
    const hipY = spec.hipsY - 0.03 // 0.84 female / 0.85 male
    const kneeY = hipY - spec.thighLen // 0.425 female / 0.44 male
    const ankleY = kneeY - spec.shinLen // 0.03 female / 0.05 male
    const legScale = isF ? 0.87 : 1.0
    const thighSlot: UnityMatSlot = hasSkirt ? 0 : 2
    const upperShinSlot: UnityMatSlot = hasSkirt ? 6 : 2
    const lowerCalfSlot: UnityMatSlot = isChicF ? 3 : hasSkirt ? 6 : 2
    const legRings: LoftRing[] = [
      // Hip trochanter socket blending into contoured pelvis
      {
        center: [hx * 0.95, hipY + 0.025, 0.004],
        rx: 0.078 * legScale,
        rz: 0.08 * legScale,
        weights: [[B.Hips, 0.48], [ulBone, 0.52]],
        matSlot: hasSkirt ? 4 : 2,
      },
      // Full outer thigh sweep
      {
        center: [hx + sideSign * 0.007, hipY - 0.06, -0.002],
        rx: 0.077 * legScale,
        rz: 0.079 * legScale,
        weights: [[B.Hips, 0.14], [ulBone, 0.86]],
        matSlot: thighSlot,
      },
      // Athletic mid-quadricep thigh curve tapering gently inward toward knee
      {
        center: [hx + sideSign * 0.001, hipY - 0.21, -0.005],
        rx: 0.063 * legScale,
        rz: 0.065 * legScale,
        frontScale: 1.05,
        weights: [[ulBone, 1]],
        matSlot: thighSlot,
      },
      // Lower thigh above knee
      {
        center: [hx - sideSign * 0.005, kneeY + 0.055, -0.002],
        rx: 0.051 * legScale,
        rz: 0.053 * legScale,
        weights: [[ulBone, 0.85], [llBone, 0.15]],
        matSlot: thighSlot,
      },
      // Anatomical patella knee curve (bare above sock cuff for skirt looks)
      {
        center: [hx - sideSign * 0.007, kneeY + 0.012, -0.004],
        rx: 0.047 * legScale,
        rz: 0.05 * legScale,
        frontScale: 1.09,
        backScale: 0.92,
        weights: [[ulBone, 0.55], [llBone, 0.45]],
        matSlot: hasSkirt ? 0 : upperShinSlot,
      },
      // Below patella / sock top cuff rim
      {
        center: [hx - sideSign * 0.006, kneeY + 0.005, -0.003],
        rx: 0.0485 * legScale,
        rz: 0.051 * legScale,
        weights: [[ulBone, 0.42], [llBone, 0.58]],
        matSlot: upperShinSlot,
      },
      // Proximal calf
      {
        center: [hx - sideSign * 0.003, kneeY - 0.05, 0.002],
        rx: 0.046 * legScale,
        rz: 0.049 * legScale,
        weights: [[ulBone, 0.14], [llBone, 0.86]],
        matSlot: upperShinSlot,
      },
      // Mid-calf: Chic leather boot shaft cuff (Chic) or sock/trouser calf
      {
        center: [hx + sideSign * 0.002, kneeY - 0.145, 0.008],
        rx: (isChicF ? 0.053 : 0.049) * legScale,
        rz: (isChicF ? 0.057 : 0.054) * legScale,
        backScale: 1.22,
        weights: [[llBone, 1]],
        matSlot: lowerCalfSlot,
      },
      // Slender sculpted Achilles ankle
      {
        center: [hx - sideSign * 0.004, ankleY + 0.075, 0.003],
        rx: (isChicF ? 0.037 : 0.034) * legScale,
        rz: (isChicF ? 0.039 : 0.036) * legScale,
        weights: [[llBone, 1]],
        matSlot: lowerCalfSlot,
      },
      // Ankle above heel
      {
        center: [hx, ankleY + 0.025, 0.002],
        rx: (isChicF ? 0.038 : 0.035) * legScale,
        rz: (isChicF ? 0.041 : 0.038) * legScale,
        weights: [[llBone, 0.72], [ftBone, 0.28]],
        matSlot: isChicF ? 3 : hasSkirt ? 6 : 4,
      },
      // Heel / boot or loafer counter
      {
        center: [hx, ankleY + 0.012, -0.012],
        rx: isF ? 0.037 : 0.044,
        rz: isF ? 0.052 : 0.056,
        weights: [[ftBone, 0.86], [llBone, 0.14]],
        matSlot: 3,
      },
      // Forefoot / sleek boot vamp / loafer vamp
      {
        center: [hx, 0.024, -0.044],
        rx: isF ? 0.039 : 0.047,
        rz: isF ? 0.094 : 0.105,
        frontScale: 1.1,
        backScale: 0.9,
        weights: [[ftBone, 1]],
        matSlot: 3,
      },
      // Flat foot plantar outsole
      {
        center: [hx, 0.007, -0.046],
        rx: isF ? 0.039 : 0.049,
        rz: isF ? 0.098 : 0.11,
        frontScale: 1.02,
        backScale: 0.94,
        weights: [[ftBone, 1]],
        matSlot: 4,
      },
    ]

    acc.addLoftedTube(legRings, 20, false, true)
  }

  buildSkinnedLeg(-1)
  buildSkinnedLeg(1)

  return acc.buildGeometry(isF)
}

/**
 * Generates a semi-realistic sculpted 3D Head mesh (refined orbital sockets, sculpted nasal bridge
 * + delicate tip/nostrils, soft cheekbones, sculpted Cupid's bow & fuller lower lip, smooth jawline) facing -Z!
 */
export function buildUnitySculptedHeadGeometry(gender: AvatarGender): THREE.BufferGeometry {
  const isF = gender === 'female'
  const uSegs = 56
  const vSegs = 40
  const geo = new THREE.SphereGeometry(0.114, uSegs, vSegs)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute

  const gaussian = (dx: number, dy: number, sx: number, sy: number) =>
    Math.exp(-((dx * dx) / (sx * sx) + (dy * dy) / (sy * sy)))

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i)
    let y = pos.getY(i)
    let z = pos.getZ(i)

    // Cute youthful 20yo Western heart-oval cranium
    x *= isF ? 0.9 : 0.92
    y *= isF ? 0.985 : 1.09
    z *= isF ? 0.95 : 0.98

    // Delicate dainty chin taper
    if (y < 0) {
      const low = Math.min(1, Math.abs(y) / 0.118)
      const jawNarrow = isF ? 1 - low * 0.36 : 1 - low * 0.22
      x *= jawNarrow
      if (z < 0) {
        z -= Math.pow(low, 2.0) * (isF ? 0.004 : 0.012)
      } else {
        z *= 1 - low * (isF ? 0.2 : 0.18)
      }
    }

    // Front face anatomical sculpting (-Z)
    if (z < -0.02) {
      const fWeight = Math.min(1, (-z - 0.02) / 0.075)

      // 1. Wide bright Western orbital plane
      const leftEyeDist = gaussian(x + 0.035, y - 0.012, 0.025, 0.014)
      const rightEyeDist = gaussian(x - 0.035, y - 0.012, 0.025, 0.014)
      const socketDepth = Math.max(leftEyeDist, rightEyeDist)
      z += socketDepth * (isF ? 0.0085 : 0.018) * fWeight

      // 2. Soft Youthful Brow Arch
      const leftBrow = gaussian(x + 0.034, y - 0.036, 0.027, 0.01)
      const rightBrow = gaussian(x - 0.034, y - 0.036, 0.027, 0.01)
      const glabella = gaussian(x, y - 0.034, 0.015, 0.011)
      z -= (Math.max(leftBrow, rightBrow) * 0.006 + glabella * 0.0035) * (isF ? 0.45 : 1.0) * fWeight

      // 3. Cute Petite Slightly-Upturned Western Button Nose
      const bridge = gaussian(x, y - 0.001, isF ? 0.009 : 0.013, 0.024)
      const tip = gaussian(x, y + 0.018, isF ? 0.0095 : 0.014, isF ? 0.009 : 0.013)
      const alarL = gaussian(x + 0.011, y + 0.02, 0.007, 0.006)
      const alarR = gaussian(x - 0.011, y + 0.02, 0.007, 0.006)
      z -=
        (bridge * (isF ? 0.009 : 0.016) +
          tip * (isF ? 0.0135 : 0.026) +
          (alarL + alarR) * (isF ? 0.0035 : 0.01)) *
        fWeight
      y += tip * (isF ? 0.0012 : -0.004) * fWeight

      // 4. Cute Youthful Cheek Apples
      const cheekL = gaussian(x + 0.048, y + 0.015, 0.027, 0.021)
      const cheekR = gaussian(x - 0.048, y + 0.015, 0.027, 0.021)
      const cheekPush = Math.max(cheekL, cheekR) * (isF ? 0.0085 : 0.009) * fWeight
      z -= cheekPush
      x += Math.sign(x) * Math.max(cheekL, cheekR) * 0.003 * fWeight

      // 5. Gentle Sculpted Rose Lips & Smooth Rounded Chin
      const upperLip = gaussian(x, y + 0.045, isF ? 0.02 : 0.024, 0.006)
      const lowerLip = gaussian(x, y + 0.054, isF ? 0.018 : 0.021, 0.007)
      const mouthGroove = gaussian(x, y + 0.049, isF ? 0.02 : 0.025, 0.0025)
      const chinBoss = gaussian(x, y + 0.082, 0.02, 0.014)
      z -=
        (upperLip * (isF ? 0.0065 : 0.01) +
          lowerLip * (isF ? 0.007 : 0.0095) -
          mouthGroove * (isF ? 0.003 : 0.005) +
          chinBoss * (isF ? 0.004 : 0.008)) *
        fWeight
    }

    // Subtle ear pinna bulge on temporal sides (±X)
    const earMask =
      gaussian(Math.abs(x) - 0.096, y + 0.006, 0.02, 0.022) * gaussian(z - 0.01, 0, 0.022, 1)
    if (Math.abs(x) > 0.082 && Math.abs(y + 0.006) < 0.034) {
      x += Math.sign(x) * earMask * 0.012
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
 * Generates sculpted smooth center-parted layered long hair ribbons & flowing back veil
 * framing forehead, cheeks and shoulders cleanly without protruding cap/cone seams.
 */
export function buildSculptedLongHairGeometry(): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  const addRibbon = (
    uSegs: number,
    vSegs: number,
    evalPt: (u: number, v: number) => [number, number, number],
    evalUV: (u: number, v: number) => [number, number] = (u, v) => [u, 1 - v]
  ) => {
    const base = positions.length / 3
    const rowLen = uSegs + 1
    for (let r = 0; r <= vSegs; r++) {
      const v = r / vSegs
      for (let c = 0; c <= uSegs; c++) {
        const u = c / uSegs
        const [x, y, z] = evalPt(u, v)
        const [uvU, uvV] = evalUV(u, v)
        positions.push(x, y, z)
        uvs.push(uvU, uvV)
      }
    }
    for (let r = 0; r < vSegs; r++) {
      for (let c = 0; c < uSegs; c++) {
        const a = base + r * rowLen + c
        const b = a + 1
        const cIdx = base + (r + 1) * rowLen + c
        const d = cIdx + 1
        indices.push(a, cIdx, b, b, cIdx, d)
      }
    }
  }

  // 1. Cranial parted dome hugging skull cleanly down to equator seam
  // Leave clean center inverted-V forehead parting open over front (-Z)!
  addRibbon(
    28,
    16,
    (u, v) => {
      const theta = u * Math.PI * 2 // 0 = +Z back, PI = -Z front
      const frontProximity = Math.max(0, -Math.cos(theta)) // 1 at forehead center, 0 at ears/back
      const maxPhi = Math.PI * (0.5 - Math.pow(frontProximity, 1.35) * 0.22)
      const phi = 0.04 + v * (maxPhi - 0.04) // polar angle from crown top to y=0.006 back equator
      const sinP = Math.sin(phi)
      const cosP = Math.cos(phi)
      const partDip = Math.exp(-Math.pow(Math.sin(theta) / 0.18, 2)) * (1 - v) * 0.008
      const r = 0.119 - partDip
      return [Math.sin(theta) * sinP * r * 0.95, cosP * r * 1.03 + 0.006, Math.cos(theta) * sinP * r * 0.99]
    },
    (u, v) => [u, 1 - v * 0.45]
  )

  // 2. Seamless Continuous Back Hair Curtain extending flush from crown equator (+0.006) onto upper back
  addRibbon(
    22,
    16,
    (u, v) => {
      const theta = (u - 0.5) * Math.PI * 1.12
      const dropLen = 0.235 + 0.035 * Math.cos(theta)
      const y = 0.006 - v * dropLen
      const radiusW = 0.113 + Math.sin(v * Math.PI) * 0.012 - Math.pow(v, 2) * 0.006
      const depthZ = 0.1178 + Math.sin(v * Math.PI * 0.85) * 0.015
      const backFlare = Math.sin(v * Math.PI) * 0.01
      return [Math.sin(theta) * radiusW, y, Math.cos(theta) * depthZ + backFlare]
    },
    (u, v) => [u, 0.55 * (1 - v)]
  )

  // 3. Left & Right Center-Parted Front Curtain Layers draping smoothly past temples onto collarbone
  for (const side of [-1, 1] as const) {
    for (let layer = 0; layer < 2; layer++) {
      const layerSpreadZ = layer * 0.016
      const layerOutX = layer * 0.008
      const endDropY = -0.23 - layer * 0.02
      addRibbon(6, 16, (u, v) => {
        const s = v
        const mid = Math.sin(s * Math.PI)
        const centerX =
          side *
          (0.006 +
            Math.pow(s, 0.72) * (0.1 + layerOutX) -
            Math.pow(Math.max(0, s - 0.6) / 0.4, 1.5) * 0.014)
        const centerY = 0.123 - Math.pow(s, 1.12) * (0.123 - endDropY)
        const centerZ =
          -0.025 -
          mid * (0.056 - layerSpreadZ) +
          Math.pow(Math.max(0, s - 0.45) / 0.55, 1.4) * 0.024 +
          layerSpreadZ * 0.4

        const width =
          0.032 *
          (0.45 + 0.65 * Math.sin(Math.min(1, s * 1.1) * Math.PI * 0.7)) *
          (1 - Math.pow(s, 2.4) * 0.65)
        const across = (u - 0.5) * 2
        const nx = across * width * 0.35
        const nz = across * width * 0.88
        const curlCurve = Math.sin(u * Math.PI) * 0.006
        return [centerX + nx + side * curlCurve, centerY, centerZ + nz - curlCurve * 0.4]
      })
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
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
  uniformStyle: 'casual' | 'nerdy' | 'sport' | 'cricket'
}): {
  skinAlbedo: THREE.CanvasTexture
  skinBump: THREE.CanvasTexture
  clothAlbedo: THREE.CanvasTexture
  clothBump: THREE.CanvasTexture
  pantsAlbedo: THREE.CanvasTexture
} {
  // 0. Organic Living Dermal Albedo & Fine Pore Bump Texture (matching sculpted face warmth)
  const sCanvas = document.createElement('canvas')
  sCanvas.width = 256
  sCanvas.height = 256
  const sCtx = sCanvas.getContext('2d')!
  sCtx.fillStyle = opts.skinColor
  sCtx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 420; i++) {
    const sx = (i * 73) % 256
    const sy = (i * 139) % 256
    const rad = 10 + (i % 14)
    sCtx.fillStyle = i % 2 === 0 ? 'rgba(255, 224, 206, 0.055)' : 'rgba(232, 146, 126, 0.04)'
    sCtx.beginPath()
    sCtx.arc(sx, sy, rad, 0, Math.PI * 2)
    sCtx.fill()
  }
  const skinAlbedo = new THREE.CanvasTexture(sCanvas)
  skinAlbedo.colorSpace = THREE.SRGBColorSpace
  skinAlbedo.wrapS = THREE.RepeatWrapping
  skinAlbedo.wrapT = THREE.RepeatWrapping
  skinAlbedo.needsUpdate = true

  const sbCanvas = document.createElement('canvas')
  sbCanvas.width = 128
  sbCanvas.height = 128
  const sbCtx = sbCanvas.getContext('2d')!
  sbCtx.fillStyle = '#808080'
  sbCtx.fillRect(0, 0, 128, 128)
  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 128; x += 2) {
      const v = 124 + ((x * 17 + y * 31) % 9)
      sbCtx.fillStyle = `rgb(${v},${v},${v})`
      sbCtx.fillRect(x, y, 1, 1)
    }
  }
  const skinBump = new THREE.CanvasTexture(sbCanvas)
  skinBump.wrapS = THREE.RepeatWrapping
  skinBump.wrapT = THREE.RepeatWrapping
  skinBump.needsUpdate = true

  // 1. Upper Garment Texture (u=0.5 -> x=256 is front -Z)
  const cCanvas = document.createElement('canvas')
  cCanvas.width = 512
  cCanvas.height = 512
  const ctx = cCanvas.getContext('2d')!
  ctx.fillStyle = opts.topColor
  ctx.fillRect(0, 0, 512, 512)

  if (opts.uniformStyle === 'casual' && opts.gender === 'female') {
    // Soft ivory fine-ribbed cropped mock-neck knit texture
    for (let x = 0; x < 512; x += 4) {
      ctx.fillStyle = x % 8 === 0 ? 'rgba(170, 152, 136, 0.16)' : 'rgba(255, 255, 255, 0.14)'
      ctx.fillRect(x, 0, 1.6, 512)
    }
    for (let y = 0; y < 512; y += 5) {
      ctx.fillStyle = 'rgba(120, 102, 86, 0.04)'
      ctx.fillRect(0, y, 512, 1)
    }
    // Delicate ribbed knit bottom hem band aligned to torso waistband ring (r=5 -> v~0.357 -> canvasY~329)
    for (let x = 0; x < 512; x += 6) {
      ctx.fillStyle = x % 12 === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(130, 112, 98, 0.2)'
      ctx.fillRect(x, 296, 2.5, 44)
    }
  } else if (opts.uniformStyle === 'nerdy' || opts.uniformStyle === 'casual') {
    for (let x = 0; x < 512; x += 4) {
      ctx.fillStyle = x % 8 === 0 ? 'rgba(255, 255, 255, 0.028)' : 'rgba(0, 0, 0, 0.06)'
      ctx.fillRect(x, 0, 1.5, 512)
    }
    for (let y = 0; y < 512; y += 3) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.04)'
      ctx.fillRect(0, y, 512, 1)
    }

    if (opts.uniformStyle === 'nerdy') {
      // Classic preppy diamond argyle pattern on vest front & back
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.22)'
      ctx.lineWidth = 2
      for (let gx = -512; gx < 1024; gx += 48) {
        ctx.beginPath()
        ctx.moveTo(gx, 90)
        ctx.lineTo(gx + 340, 430)
        ctx.moveTo(gx + 340, 90)
        ctx.lineTo(gx, 430)
        ctx.stroke()
      }
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
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

  // 3. Pleated Skirt (Burgundy Chic or Tartan Nerdy Plaid) / Trousers Texture
  const pCanvas = document.createElement('canvas')
  pCanvas.width = 256
  pCanvas.height = 256
  const pCtx = pCanvas.getContext('2d')!
  pCtx.fillStyle = opts.pantsColor
  pCtx.fillRect(0, 0, 256, 256)

  if ((opts.uniformStyle === 'casual' || opts.uniformStyle === 'nerdy') && opts.gender === 'female') {
    if (opts.uniformStyle === 'nerdy') {
      // Classic preppy tartan check plaid pattern
      pCtx.fillStyle = 'rgba(185, 28, 28, 0.28)'
      for (let x = 0; x < 256; x += 32) pCtx.fillRect(x, 0, 6, 256)
      for (let y = 0; y < 256; y += 32) pCtx.fillRect(0, y, 256, 6)
      pCtx.fillStyle = 'rgba(248, 250, 252, 0.22)'
      for (let x = 16; x < 256; x += 32) pCtx.fillRect(x, 0, 2, 256)
      for (let y = 16; y < 256; y += 32) pCtx.fillRect(0, y, 256, 2)
    }

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

  return { skinAlbedo, skinBump, clothAlbedo, clothBump, pantsAlbedo }
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

  // Clean wide luminosity preserving face & chin warmth without dark jaw rings
  const grad = ctx.createRadialGradient(256, 250, 75, 256, 256, 310)
  grad.addColorStop(0, profile.skinColor)
  grad.addColorStop(0.86, profile.skinColor)
  grad.addColorStop(1, profile.skinShadow)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 512, 512)

  // Youthful rosy peach blush across cheek apples
  ctx.fillStyle = isF ? 'rgba(245, 130, 136, 0.22)' : 'rgba(205, 112, 95, 0.12)'
  ctx.beginPath()
  ctx.ellipse(210, 276, 25, 15, -0.14, 0, Math.PI * 2)
  ctx.ellipse(302, 276, 25, 15, 0.14, 0, Math.PI * 2)
  ctx.fill()

  // Button-nose highlight & delicate subtle nostrils aligned to canvasY ~ 298
  ctx.fillStyle = 'rgba(255, 246, 240, 0.24)'
  ctx.fillRect(253, 232, 6, 50)
  ctx.fillStyle = isF ? 'rgba(165, 96, 84, 0.16)' : 'rgba(60, 28, 18, 0.24)'
  ctx.beginPath()
  ctx.ellipse(248, 298, 3.2, 1.8, 0.12, 0, Math.PI * 2)
  ctx.ellipse(264, 298, 3.2, 1.8, -0.12, 0, Math.PI * 2)
  ctx.fill()

  // Warm peach-rose eyelid fold (zero grayish/black smudge above sclera)
  ctx.fillStyle = isF ? 'rgba(195, 126, 114, 0.14)' : 'rgba(75, 45, 38, 0.12)'
  ctx.beginPath()
  ctx.ellipse(227, 232, 16, 7.5, 0.06, 0, Math.PI * 2)
  ctx.ellipse(285, 232, 16, 7.5, -0.06, 0, Math.PI * 2)
  ctx.fill()

  // Warm soft arched eyebrows with upbeat graceful curve (canvasY ~ 192)
  ctx.strokeStyle = profile.hairColor
  ctx.lineWidth = isF ? 3.2 : 6.0
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(205, 198)
  ctx.quadraticCurveTo(228, 187, 245, 196)
  ctx.moveTo(267, 196)
  ctx.quadraticCurveTo(284, 187, 307, 198)
  ctx.stroke()

  // Full sculpted natural Cupid's bow & gentle smile curve (corners softly lifted!)
  ctx.fillStyle = profile.lipColor
  ctx.beginPath()
  ctx.moveTo(234, 355)
  ctx.quadraticCurveTo(247, 347, 256, 351)
  ctx.quadraticCurveTo(265, 347, 278, 355)
  ctx.quadraticCurveTo(256, 372, 234, 355)
  ctx.closePath()
  ctx.fill()
  if (isF) {
    ctx.fillStyle = 'rgba(255, 230, 226, 0.36)'
    ctx.beginPath()
    ctx.ellipse(256, 363, 8.5, 2.4, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(92, 42, 44, 0.36)'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(236, 355)
  ctx.quadraticCurveTo(256, 361, 276, 355)
  ctx.stroke()

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
