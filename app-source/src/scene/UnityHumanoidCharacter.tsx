import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { AvatarGender, HandSide } from '../types/game'
import { AthleteLookProfile, getAthleteProfile, HumanFaceHead } from './HumanFace'
import { TextLabel } from './TextLabel'
import {
  buildUnityBodyGeometry,
  createUnityBodyTextures,
  createUnitySkeleton,
  getUnityRigSpec,
  UNITY_BONES,
} from './unityHumanoidBuilder'

export interface UnityCharacterBodyAnchor {
  pos: [number, number, number]
  yaw: number
  sitBlend?: number
  walkSpeed: number
  walkPhase: number
  headPitch?: number
  headYaw?: number
  headRoll?: number
  torsoPitch?: number
  torsoRoll?: number
  torsoTwist?: number
  stanceSpread?: number
  frontStride?: number
  squat?: number
  hairPullWorld?: [number, number, number] | null
  onWorldTargets?: (headPos: [number, number, number], hairPos: [number, number, number]) => void
}

export interface UnityHumanoidCharacterProps {
  seedKey: string
  displayName?: string
  gender?: AvatarGender
  outfitColor?: string
  accentColor?: string
  pantsColor?: string
  shoeColor?: string
  uniformStyle?: 'casual' | 'sport' | 'cricket'
  lookProfile?: AthleteLookProfile
  hideHead?: boolean
  firstPersonMode?: boolean
  showHair?: boolean
  allowSunglasses?: boolean
  speakingLevel?: number
  getBodyAnchor: () => UnityCharacterBodyAnchor
  getLeftWrist: () => [number, number, number]
  getRightWrist: () => [number, number, number]
  getLeftHandQuat?: () => [number, number, number, number]
  getRightHandQuat?: () => [number, number, number, number]
  getLeftCurls?: () => [number, number, number, number, number]
  getRightCurls?: () => [number, number, number, number, number]
  /** Optional custom wrist attachments rendered directly inside LeftHand / RightHand bone space */
  leftHandAttachment?: React.ReactNode
  rightHandAttachment?: React.ReactNode
}

const FINGERS_SPEC = [
  { base: [0.022, -0.007, 0.005], prox: 0.023, dist: 0.018, r: 0.0064, thumb: true },
  { base: [0.016, -0.038, 0.002], prox: 0.029, dist: 0.022, r: 0.0055 },
  { base: [0.005, -0.041, 0.003], prox: 0.032, dist: 0.024, r: 0.0056 },
  { base: [-0.006, -0.039, 0.002], prox: 0.03, dist: 0.022, r: 0.0053 },
  { base: [-0.016, -0.034, 0.002], prox: 0.024, dist: 0.018, r: 0.0048 },
] as const

/**
 * Articulated Unity-style 5-finger 2-phalanx sculpted hand oriented along -Y child bone space.
 */
export function UnityArticulatedHand({
  side,
  skinColor,
  getCurls,
}: {
  side: HandSide
  skinColor: string
  getCurls?: () => [number, number, number, number, number]
}) {
  const mirror = side === 'left' ? 1 : -1
  const proxRefs = useRef<Array<THREE.Group | null>>([])
  const distRefs = useRef<Array<THREE.Group | null>>([])

  useFrame(() => {
    const curls = getCurls?.() ?? [0.22, 0.25, 0.28, 0.3, 0.34]
    for (let i = 0; i < 5; i++) {
      const c = curls[i] ?? 0.25
      const p = proxRefs.current[i]
      const d = distRefs.current[i]
      if (i === 0) {
        if (p) {
          p.rotation.z = mirror * (0.42 + c * 0.45)
          p.rotation.x = -(0.28 + c * 0.55)
        }
        if (d) d.rotation.x = -(0.22 + c * 0.72)
      } else {
        if (p) p.rotation.x = -(0.18 + c * 1.15)
        if (d) d.rotation.x = -(0.2 + c * 1.25)
      }
    }
  })

  return (
    <group>
      {/* Anatomical Metacarpal Palm */}
      <mesh position={[0, -0.024, 0.002]} scale={[1.02, 1.32, 0.4]}>
        <sphereGeometry args={[0.024, 14, 12]} />
        <meshStandardMaterial color={skinColor} roughness={0.44} />
      </mesh>
      {/* Thenar thumb cushion on inner palm */}
      <mesh position={[mirror * 0.015, -0.016, 0.005]} scale={[0.72, 0.95, 0.6]}>
        <sphereGeometry args={[0.014, 10, 8]} />
        <meshStandardMaterial color={skinColor} roughness={0.46} />
      </mesh>

      {FINGERS_SPEC.map((f, idx) => (
        <group
          key={idx}
          ref={(el) => {
            proxRefs.current[idx] = el
          }}
          position={[f.base[0] * mirror, f.base[1], f.base[2]]}
        >
          <mesh position={[0, -f.prox * 0.5, 0]}>
            <capsuleGeometry args={[f.r, f.prox, 6, 10]} />
            <meshStandardMaterial color={skinColor} roughness={0.44} />
          </mesh>
          <group
            ref={(el) => {
              distRefs.current[idx] = el
            }}
            position={[0, -f.prox, 0]}
          >
            <mesh position={[0, -f.dist * 0.5, 0]}>
              <capsuleGeometry args={[f.r * 0.84, f.dist, 6, 10]} />
              <meshStandardMaterial color={skinColor} roughness={0.44} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  )
}

const _parentWorldQ = new THREE.Quaternion()
const _parentWorldQInv = new THREE.Quaternion()
const _shoulderW = new THREE.Vector3()
const _elbowW = new THREE.Vector3()
const _wristW = new THREE.Vector3()
const _armVec = new THREE.Vector3()
const _alongDir = new THREE.Vector3()
const _poleDir = new THREE.Vector3()
const _bendOffset = new THREE.Vector3()
const _yAxis = new THREE.Vector3()
const _zAxis = new THREE.Vector3()
const _xAxis = new THREE.Vector3()
const _basisMat = new THREE.Matrix4()
const _worldQ = new THREE.Quaternion()
const _handTargetQ = new THREE.Quaternion()
const _headWorldV = new THREE.Vector3()
const _hairWorldV = new THREE.Vector3()
const _headInvQ = new THREE.Quaternion()
const _hairLocalV = new THREE.Vector3()
const _handFlipCorrect = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * 0.5)

/**
 * Solves local bone quaternion so bone local -Y axis points along `dirW`
 * with bending hinge / palm axis aligned steadily toward `refZ`.
 */
function alignBoneMinusYToWorldDir(
  bone: THREE.Bone,
  parentBone: THREE.Bone,
  dirW: THREE.Vector3,
  refZ: THREE.Vector3
): void {
  parentBone.getWorldQuaternion(_parentWorldQ)
  _parentWorldQInv.copy(_parentWorldQ).invert()

  _yAxis.copy(dirW).normalize().negate()
  _zAxis.copy(refZ)
  _zAxis.addScaledVector(_yAxis, -_zAxis.dot(_yAxis))
  if (_zAxis.lengthSq() < 1e-4) _zAxis.set(0, 0, 1).addScaledVector(_yAxis, -_yAxis.z)
  _zAxis.normalize()
  _xAxis.crossVectors(_yAxis, _zAxis).normalize()

  _basisMat.makeBasis(_xAxis, _yAxis, _zAxis)
  _worldQ.setFromRotationMatrix(_basisMat)
  bone.quaternion.copy(_parentWorldQInv).multiply(_worldQ)
}

/**
 * Unity/VRoid-Grade Rigged Humanoid VR Character (`THREE.SkinnedMesh` + 19-bone `THREE.Skeleton` + VRIK):
 * continuous stitched anatomy & layered school uniform / athletic gear, crisp 3D pleated skirt,
 * knee-high socks, penny loafers, turned shirt collar & orange-red ribbon bow, and analytical 2-bone Arm IK.
 */
export function UnityHumanoidCharacter({
  seedKey,
  displayName,
  gender = 'male',
  outfitColor,
  accentColor,
  pantsColor,
  shoeColor,
  uniformStyle = 'casual',
  lookProfile,
  hideHead = false,
  firstPersonMode = false,
  showHair = true,
  allowSunglasses = false,
  speakingLevel = 0,
  getBodyAnchor,
  getLeftWrist,
  getRightWrist,
  getLeftHandQuat,
  getRightHandQuat,
  getLeftCurls,
  getRightCurls,
  leftHandAttachment,
  rightHandAttachment,
}: UnityHumanoidCharacterProps) {
  const isFemale = gender === 'female'
  const isCasual = uniformStyle === 'casual'
  const profile = useMemo(
    () => lookProfile ?? getAthleteProfile(seedKey, gender),
    [lookProfile, seedKey, gender]
  )

  const resolvedTop = outfitColor ?? (isCasual ? '#1e2438' : isFemale ? '#be185d' : '#1d4ed8')
  const resolvedAccent = accentColor ?? (isCasual ? '#d94816' : isFemale ? '#fbcfe8' : '#38bdf8')
  const resolvedPants = pantsColor ?? (isCasual ? '#1b2133' : isFemale ? '#1e293b' : '#0f172a')
  const resolvedShoes = shoeColor ?? (isCasual ? '#3f2518' : '#f8fafc')

  const rigSpec = useMemo(() => getUnityRigSpec(gender), [gender])
  const { rootBone, bones, skeleton } = useMemo(() => createUnitySkeleton(rigSpec), [rigSpec])
  const bodyGeo = useMemo(
    () => buildUnityBodyGeometry(rigSpec, firstPersonMode, uniformStyle),
    [rigSpec, firstPersonMode, uniformStyle]
  )

  const textures = useMemo(
    () =>
      createUnityBodyTextures({
        topColor: resolvedTop,
        pantsColor: resolvedPants,
        shoeColor: resolvedShoes,
        accentColor: resolvedAccent,
        skinColor: profile.skinColor,
        gender,
        uniformStyle,
      }),
    [resolvedTop, resolvedPants, resolvedShoes, resolvedAccent, profile.skinColor, gender, uniformStyle]
  )

  const materials = useMemo(
    () => [
      // 0: Smooth Fair Skin
      new THREE.MeshStandardMaterial({
        color: profile.skinColor,
        roughness: isFemale ? 0.42 : 0.48,
        metalness: 0.01,
        emissive: isFemale ? profile.skinColor : '#000000',
        emissiveIntensity: isFemale ? 0.06 : 0,
      }),
      // 1: Knit Sweater Vest / Upper Garment
      new THREE.MeshStandardMaterial({
        map: textures.clothAlbedo,
        bumpMap: textures.clothBump,
        bumpScale: 0.003,
        roughness: isCasual ? 0.76 : 0.68,
        metalness: 0.03,
      }),
      // 2: Accordion Pleated Skirt / Tailored Trousers
      new THREE.MeshStandardMaterial({
        map: textures.pantsAlbedo,
        bumpMap: textures.clothBump,
        bumpScale: 0.0025,
        roughness: 0.74,
        metalness: 0.03,
        side: isCasual && isFemale ? THREE.DoubleSide : THREE.FrontSide,
      }),
      // 3: Dark Brown Leather Loafers / Sneakers
      new THREE.MeshStandardMaterial({
        color: resolvedShoes,
        roughness: isCasual ? 0.34 : 0.42,
        metalness: isCasual ? 0.14 : 0.08,
      }),
      // 4: Outsole / Belt / Trim Accent
      new THREE.MeshStandardMaterial({
        color: isCasual ? '#1f1612' : resolvedAccent,
        roughness: 0.55,
        metalness: 0.1,
      }),
      // 5: Crisp White Short-Sleeve Shirt (casual) or Uniform Top Match (sport/cricket)
      isCasual
        ? new THREE.MeshStandardMaterial({
            color: '#f8fafc',
            bumpMap: textures.clothBump,
            bumpScale: 0.0018,
            roughness: 0.62,
            metalness: 0.02,
          })
        : new THREE.MeshStandardMaterial({
            map: textures.clothAlbedo,
            bumpMap: textures.clothBump,
            bumpScale: 0.003,
            roughness: 0.68,
            metalness: 0.04,
          }),
      // 6: Dark Charcoal Knee-High Socks (casual female) or Uniform Lower Match
      isCasual && isFemale
        ? new THREE.MeshStandardMaterial({
            color: '#37353d',
            bumpMap: textures.clothBump,
            bumpScale: 0.0025,
            roughness: 0.78,
            metalness: 0.02,
          })
        : new THREE.MeshStandardMaterial({
            map: textures.pantsAlbedo,
            bumpMap: textures.clothBump,
            bumpScale: 0.003,
            roughness: 0.78,
            metalness: 0.03,
          }),
    ],
    [profile.skinColor, textures, resolvedShoes, resolvedAccent, isFemale, isCasual]
  )

  const skinnedMesh = useMemo(() => {
    const mesh = new THREE.SkinnedMesh(bodyGeo, materials)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.add(rootBone)
    mesh.bind(skeleton)
    return mesh
  }, [bodyGeo, materials, rootBone, skeleton])

  useEffect(() => {
    return () => {
      bodyGeo.dispose()
      textures.clothAlbedo.dispose()
      textures.clothBump.dispose()
      textures.pantsAlbedo.dispose()
      materials.forEach((m) => m.dispose())
    }
  }, [bodyGeo, textures, materials])

  const charRootRef = useRef<THREE.Group>(null)
  const chestMountRef = useRef<THREE.Group>(null)
  const headMountRef = useRef<THREE.Group>(null)
  const leftHandMountRef = useRef<THREE.Group>(null)
  const rightHandMountRef = useRef<THREE.Group>(null)
  const labelGroupRef = useRef<THREE.Group>(null)
  const hairOffsetRef = useRef<[number, number, number]>([0, 0, 0])

  // Sync Chest, Head & Hand bone attachments cleanly inside Skeleton
  useEffect(() => {
    const chestBone = bones[UNITY_BONES.Chest]
    const headBone = bones[UNITY_BONES.Head]
    const lhBone = bones[UNITY_BONES.LeftHand]
    const rhBone = bones[UNITY_BONES.RightHand]
    const cm = chestMountRef.current
    const hm = headMountRef.current
    const lhm = leftHandMountRef.current
    const rhm = rightHandMountRef.current

    if (cm) chestBone.add(cm)
    if (hm) headBone.add(hm)
    if (lhm) lhBone.add(lhm)
    if (rhm) rhBone.add(rhm)

    return () => {
      if (cm) chestBone.remove(cm)
      if (hm) headBone.remove(hm)
      if (lhm) lhBone.remove(lhm)
      if (rhm) rhBone.remove(rhm)
    }
  }, [bones])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const anchor = getBodyAnchor()
    const {
      pos,
      yaw,
      sitBlend = 0,
      walkSpeed,
      walkPhase,
      headPitch = 0,
      headYaw = 0,
      headRoll = 0,
      torsoPitch = 0,
      torsoRoll = 0,
      torsoTwist = 0,
      stanceSpread = 0,
      frontStride = 0,
      squat = 0,
      hairPullWorld = null,
      onWorldTargets,
    } = anchor

    const activeWalk = walkSpeed * (1 - sitBlend * 0.85)
    const stride = Math.sin(walkPhase) * 0.56 * activeWalk
    const pelvisDrop =
      sitBlend * 0.38 + squat * 0.28 + Math.abs(Math.sin(walkPhase)) * 0.022 * activeWalk

    if (charRootRef.current) {
      charRootRef.current.position.set(pos[0], pos[1], pos[2])
      charRootRef.current.rotation.set(0, yaw, 0)
      charRootRef.current.updateMatrixWorld()
    }

    const B = UNITY_BONES
    // 1. Hips / Spine / Chest / Neck / Head skeletal pose
    bones[B.Hips].position.set(0, rigSpec.hipsY - pelvisDrop, 0)
    bones[B.Hips].rotation.set(0, 0, Math.sin(walkPhase) * 0.03 * activeWalk)

    const spineFlex = sitBlend * 0.08 + squat * 0.16 + torsoPitch * 0.45 - 0.04 * activeWalk
    bones[B.Spine].rotation.set(spineFlex, torsoTwist * 0.45 + Math.sin(walkPhase) * 0.05 * activeWalk, torsoRoll * 0.45)

    const breathScale = 1 + Math.sin(t * 1.85) * 0.012
    bones[B.Chest].scale.set(1, 1, breathScale)
    bones[B.Chest].rotation.set(torsoPitch * 0.55, torsoTwist * 0.55, torsoRoll * 0.55 + headRoll * 0.18)

    bones[B.Neck].rotation.set(headPitch * 0.35, headYaw * 0.35, headRoll * 0.35)
    bones[B.Head].rotation.set(headPitch * 0.65, headYaw * 0.65, headRoll * 0.65)

    // 2. Seated / Stance / Running Leg Bones
    const sitHip = sitBlend * 1.44 + squat * 0.68
    const sitKnee = -(sitBlend * 1.48 + squat * 1.05)

    bones[B.LeftUpperLeg].rotation.set(stride + sitHip, 0, -(stanceSpread + Math.max(0, -frontStride) - sitBlend * 0.05))
    bones[B.LeftLowerLeg].rotation.set(-Math.max(0, -stride * 1.1) + sitKnee, 0, stanceSpread * 0.35)
    bones[B.LeftFoot].rotation.set(-(stride + sitHip + (-Math.max(0, -stride * 1.1) + sitKnee)) * 0.45, 0, 0)

    bones[B.RightUpperLeg].rotation.set(-stride + sitHip, 0, stanceSpread + Math.max(0, frontStride) + sitBlend * 0.05)
    bones[B.RightLowerLeg].rotation.set(-Math.max(0, stride * 1.1) + sitKnee, 0, -stanceSpread * 0.35)
    bones[B.RightFoot].rotation.set(-(-stride + sitHip + (-Math.max(0, stride * 1.1) + sitKnee)) * 0.45, 0, 0)

    bones[B.Hips].updateMatrixWorld(true)

    // 3. Exact 2-Bone Analytical Unity VRIK Arm Solver
    const cosY = Math.cos(yaw)
    const sinY = Math.sin(yaw)

    const solveSkinnedArmIK = (
      sideSign: -1 | 1,
      shoulderBoneIdx: number,
      upperBoneIdx: number,
      lowerBoneIdx: number,
      handBoneIdx: number,
      targetWristArr: [number, number, number],
      targetHandQuatArr?: [number, number, number, number]
    ) => {
      const shParent = bones[shoulderBoneIdx]
      const uaBone = bones[upperBoneIdx]
      const laBone = bones[lowerBoneIdx]
      const hdBone = bones[handBoneIdx]

      uaBone.getWorldPosition(_shoulderW)
      _wristW.set(targetWristArr[0], targetWristArr[1], targetWristArr[2])
      _armVec.subVectors(_wristW, _shoulderW)

      const maxReach = rigSpec.upperArmLen + rigSpec.forearmLen - 0.01
      let d = _armVec.length()
      if (d > maxReach) {
        _armVec.multiplyScalar(maxReach / d)
        _wristW.copy(_shoulderW).add(_armVec)
        d = maxReach
      } else if (d < 0.09) {
        d = 0.09
      }

      const L1 = rigSpec.upperArmLen
      const L2 = rigSpec.forearmLen
      const cosAlpha = Math.max(-0.98, Math.min(0.98, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)))
      const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha))

      _alongDir.copy(_armVec).normalize()
      _poleDir.set(sideSign * cosY * 0.45 + sinY * 0.85, -0.5, -sideSign * sinY * 0.45 + cosY * 0.85)
      _poleDir.addScaledVector(_alongDir, -_poleDir.dot(_alongDir))
      if (_poleDir.lengthSq() < 1e-4) _poleDir.set(0, -1, 0)
      _poleDir.normalize()

      _bendOffset.copy(_alongDir).multiplyScalar(cosAlpha * L1).addScaledVector(_poleDir, sinAlpha * L1)
      _elbowW.copy(_shoulderW).add(_bendOffset)

      const upperDir = _armVec.subVectors(_elbowW, _shoulderW).normalize()
      alignBoneMinusYToWorldDir(uaBone, shParent, upperDir, _poleDir)
      uaBone.updateMatrixWorld(true)

      const lowerDir = _alongDir.subVectors(_wristW, _elbowW).normalize()
      alignBoneMinusYToWorldDir(laBone, uaBone, lowerDir, _poleDir)
      laBone.updateMatrixWorld(true)

      if (targetHandQuatArr) {
        laBone.getWorldQuaternion(_parentWorldQ).invert()
        _handTargetQ
          .set(targetHandQuatArr[0], targetHandQuatArr[1], targetHandQuatArr[2], targetHandQuatArr[3])
          .multiply(_handFlipCorrect)
        hdBone.quaternion.copy(_parentWorldQ).multiply(_handTargetQ)
      } else {
        hdBone.rotation.set(0, sideSign * -0.85, 0)
      }
      hdBone.updateMatrixWorld(true)
    }

    solveSkinnedArmIK(
      -1,
      B.LeftShoulder,
      B.LeftUpperArm,
      B.LeftLowerArm,
      B.LeftHand,
      getLeftWrist(),
      getLeftHandQuat?.()
    )
    solveSkinnedArmIK(
      1,
      B.RightShoulder,
      B.RightUpperArm,
      B.RightLowerArm,
      B.RightHand,
      getRightWrist(),
      getRightHandQuat?.()
    )

    // 4. World targets & tactile hair pull spring for MyRoom interaction
    if (!hideHead) {
      bones[B.Head].getWorldPosition(_headWorldV)
      _hairWorldV
        .set(0, isFemale ? 0.04 : 0.08, isFemale ? 0.1 : 0.04)
        .applyMatrix4(bones[B.Head].matrixWorld)
      onWorldTargets?.(
        [_headWorldV.x, _headWorldV.y, _headWorldV.z],
        [_hairWorldV.x, _hairWorldV.y, _hairWorldV.z]
      )

      if (hairPullWorld) {
        bones[B.Head].getWorldQuaternion(_headInvQ).invert()
        _hairLocalV
          .set(
            hairPullWorld[0] - _headWorldV.x,
            hairPullWorld[1] - _headWorldV.y,
            hairPullWorld[2] - _headWorldV.z
          )
          .applyQuaternion(_headInvQ)
          .clampLength(0, 0.13)
        hairOffsetRef.current = [_hairLocalV.x, _hairLocalV.y, _hairLocalV.z]
      } else {
        hairOffsetRef.current = [
          hairOffsetRef.current[0] * 0.85,
          hairOffsetRef.current[1] * 0.85,
          hairOffsetRef.current[2] * 0.85,
        ]
      }
    }

    if (labelGroupRef.current) {
      labelGroupRef.current.position.set(0, rigSpec.headY + 0.34 - pelvisDrop, 0)
      labelGroupRef.current.lookAt(state.camera.position)
    }
  })

  // Chest local Y offset for turned shirt collar & orange-red ribbon bow
  const chestLocalCollarY = rigSpec.shoulderY - (rigSpec.hipsY + 0.31) + 0.036

  return (
    <group ref={charRootRef}>
      <primitive object={skinnedMesh} />

      {/* Bone-attached Casual Uniform Details: Crisp White Turned Shirt Collar + Orange-Red Ribbon Bow / Tie */}
      <group ref={chestMountRef} visible={isCasual && !firstPersonMode}>
        {isCasual && !firstPersonMode && (
          <group position={[0, chestLocalCollarY, 0]}>
            {/* White shirt collar band wrapping neck base */}
            <mesh position={[0, 0.008, 0.005]} rotation={[0.14, 0, 0]}>
              <cylinderGeometry
                args={[isFemale ? 0.05 : 0.064, isFemale ? 0.068 : 0.084, 0.028, 18, 1, true]}
              />
              <meshStandardMaterial color="#f8fafc" roughness={0.55} side={THREE.DoubleSide} />
            </mesh>
            {/* Left & Right Folded Crisp White Shirt Collar Lapels */}
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                position={[side * (isFemale ? 0.034 : 0.044), -0.014, isFemale ? -0.06 : -0.072]}
                rotation={[0.48, side * -0.45, side * -0.48]}
              >
                <boxGeometry args={[isFemale ? 0.038 : 0.046, 0.04, 0.007]} />
                <meshStandardMaterial color="#ffffff" roughness={0.5} />
              </mesh>
            ))}

            {/* Bright Orange-Red Ribbon Bow (Female) or Necktie (Male) at Collar V */}
            {isFemale ? (
              <group position={[0, -0.044, -0.092]} rotation={[-0.28, 0, 0]}>
                {/* Center Ribbon Knot */}
                <mesh position={[0, 0.002, -0.004]} scale={[1.1, 1.0, 0.72]}>
                  <boxGeometry args={[0.02, 0.02, 0.016]} />
                  <meshStandardMaterial color="#dc4a19" roughness={0.44} />
                </mesh>
                {/* Left & Right Pleated Bow Loops */}
                {[-1, 1].map((side) => (
                  <mesh
                    key={side}
                    position={[side * 0.028, 0.004, 0.001]}
                    rotation={[0.06, side * 0.14, side * 0.18]}
                    scale={[1.0, 0.72, 0.42]}
                  >
                    <cylinderGeometry args={[0.026, 0.014, 0.046, 10]} />
                    <meshStandardMaterial color="#ea580c" roughness={0.42} />
                  </mesh>
                ))}
                {/* Twin Hanging Ribbon Tails */}
                {[-1, 1].map((side) => (
                  <mesh
                    key={side}
                    position={[side * 0.02, -0.038, -0.004]}
                    rotation={[-0.08, 0, side * 0.28]}
                  >
                    <boxGeometry args={[0.021, 0.056, 0.005]} />
                    <meshStandardMaterial color="#c2410c" roughness={0.46} />
                  </mesh>
                ))}
              </group>
            ) : (
              <group position={[0, -0.045, -0.098]} rotation={[-0.14, 0, 0]}>
                <mesh position={[0, 0.015, -0.004]}>
                  <boxGeometry args={[0.022, 0.022, 0.016]} />
                  <meshStandardMaterial color="#dc4a19" roughness={0.45} />
                </mesh>
                <mesh position={[0, -0.075, -0.006]} rotation={[0.05, 0, 0]}>
                  <boxGeometry args={[0.028, 0.155, 0.008]} />
                  <meshStandardMaterial color="#dc4a19" roughness={0.46} />
                </mesh>
              </group>
            )}
          </group>
        )}
      </group>

      {/* Bone-attached Continuous Sculpted Unity/VRoid Face Head */}
      <group ref={headMountRef} visible={!hideHead}>
        {!hideHead && (
          <HumanFaceHead
            profile={profile}
            gender={gender}
            showHair={showHair}
            allowSunglasses={allowSunglasses}
            hideNeck
            hairOffsetRef={hairOffsetRef}
          />
        )}
      </group>

      {/* Bone-attached Articulated Left & Right 5-Finger Sculpted Hands */}
      <group ref={leftHandMountRef}>
        {leftHandAttachment ?? (
          <UnityArticulatedHand side="left" skinColor={profile.skinColor} getCurls={getLeftCurls} />
        )}
      </group>
      <group ref={rightHandMountRef}>
        {rightHandAttachment ?? (
          <UnityArticulatedHand side="right" skinColor={profile.skinColor} getCurls={getRightCurls} />
        )}
      </group>

      {/* Floating Nametag */}
      {!firstPersonMode && displayName && (
        <group ref={labelGroupRef} position={[0, 1.84, 0]}>
          <TextLabel fontSize={0.088} color={speakingLevel > 0.1 ? '#34d399' : '#f8fafc'}>
            {displayName}
          </TextLabel>
        </group>
      )}
    </group>
  )
}
