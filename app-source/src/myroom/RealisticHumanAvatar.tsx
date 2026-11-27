import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getAthleteProfile, HumanFaceHead } from '../scene/HumanFace'
import { TextLabel } from '../scene/TextLabel'
import { AvatarGender, HandSide } from '../types/game'

const UPPER_ARM_LEN = 0.285
const FOREARM_LEN = 0.255
const MAX_ARM_REACH = UPPER_ARM_LEN + FOREARM_LEN - 0.015

const _upAxis = new THREE.Vector3(0, 1, 0)
const _segDir = new THREE.Vector3()
const _segMid = new THREE.Vector3()
const _shoulder = new THREE.Vector3()
const _wrist = new THREE.Vector3()
const _elbow = new THREE.Vector3()
const _armVec = new THREE.Vector3()
const _poleDir = new THREE.Vector3()
const _bendNormal = new THREE.Vector3()

/**
 * Generates an anatomically contoured LatheGeometry segment (deltoid/bicep, forearm, quad/calf silhouette).
 */
function buildSculptedLimbGeometry(profileRadii: number[], height: number): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = []
  const count = profileRadii.length - 1
  for (let i = 0; i <= count; i++) {
    const t = i / count
    pts.push(new THREE.Vector2(profileRadii[i], (t - 0.5) * height))
  }
  const geo = new THREE.LatheGeometry(pts, 20)
  geo.computeVertexNormals()
  return geo
}

/**
 * Generates an oval anatomical torso loft from pelvis girdle through waist, chest, clavicles & traps.
 */
function buildAnatomicalTorsoGeometry(gender: AvatarGender): THREE.BufferGeometry {
  const isFemale = gender === 'female'
  const rings = isFemale
    ? [
        { y: -0.27, rx: 0.172, rz: 0.118, cz: 0.008 }, // Upper hip / glute transition
        { y: -0.18, rx: 0.15, rz: 0.104, cz: 0.006 },
        { y: -0.08, rx: 0.116, rz: 0.088, cz: 0.004 }, // Anatomical waist
        { y: 0.03, rx: 0.132, rz: 0.098, cz: -0.003 },
        { y: 0.12, rx: 0.156, rz: 0.12, cz: -0.018 },  // Chest / bust volume
        { y: 0.21, rx: 0.16, rz: 0.102, cz: -0.006 },  // Clavicle line
        { y: 0.27, rx: 0.104, rz: 0.078, cz: 0.004 },  // Trapezius slope into neck
        { y: 0.31, rx: 0.056, rz: 0.052, cz: 0.008 },  // Neck base
      ]
    : [
        { y: -0.27, rx: 0.158, rz: 0.112, cz: 0.004 },
        { y: -0.16, rx: 0.146, rz: 0.106, cz: 0.003 },
        { y: -0.04, rx: 0.152, rz: 0.112, cz: 0.0 },
        { y: 0.1, rx: 0.18, rz: 0.128, cz: -0.012 },   // Pectoral depth
        { y: 0.21, rx: 0.194, rz: 0.116, cz: -0.006 }, // Broad clavicles
        { y: 0.27, rx: 0.12, rz: 0.086, cz: 0.004 },   // Trapezius / collar
        { y: 0.31, rx: 0.066, rz: 0.062, cz: 0.008 },  // Neck base
      ]

  const radialSegs = 26
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]
    const v = r / (rings.length - 1)
    for (let s = 0; s <= radialSegs; s++) {
      const u = s / radialSegs
      const theta = u * Math.PI * 2
      const x = Math.sin(theta) * ring.rx
      const frontWeight = Math.cos(theta) < 0 ? 1.09 : 0.91
      const z = Math.cos(theta) * ring.rz * frontWeight + ring.cz
      positions.push(x, ring.y, z)
      uvs.push(u, v)
    }
  }

  const rowLen = radialSegs + 1
  for (let r = 0; r < rings.length - 1; r++) {
    for (let s = 0; s < radialSegs; s++) {
      const a = r * rowLen + s
      const b = a + 1
      const c = (r + 1) * rowLen + s
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function createWovenFabricTexture(baseHex: string, accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = baseHex
  ctx.fillRect(0, 0, 256, 256)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.045)'
  for (let y = 0; y < 256; y += 4) {
    ctx.fillRect(0, y, 256, 1)
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.055)'
  for (let x = 0; x < 256; x += 6) {
    ctx.fillRect(x, 0, 1, 256)
  }

  // Collar hem seam + vertical front zipper/pleat line for realistic clothing structure
  ctx.fillStyle = accentHex
  ctx.fillRect(0, 214, 256, 14)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)'
  ctx.fillRect(126, 20, 4, 210)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function SculptedSneaker({
  accentColor,
  footAngle,
}: {
  accentColor: string
  footAngle?: number
}) {
  return (
    <group position={[0, -0.39, 0]} rotation={[footAngle ?? 0, 0, 0]}>
      {/* Ankle collar */}
      <mesh position={[0, 0.01, 0]}>
        <sphereGeometry args={[0.039, 12, 10]} />
        <meshStandardMaterial color="#334155" roughness={0.75} />
      </mesh>
      {/* Sculpted rubber outsole */}
      <mesh position={[0, -0.022, -0.036]} scale={[1.0, 0.65, 1.38]}>
        <capsuleGeometry args={[0.045, 0.08, 6, 12]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.42} />
      </mesh>
      {/* Knit upper sneaker body */}
      <mesh position={[0, 0.002, -0.03]} scale={[0.92, 0.76, 1.26]}>
        <capsuleGeometry args={[0.041, 0.072, 6, 12]} />
        <meshStandardMaterial color={accentColor} roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.022, -0.048]} rotation={[0.45, 0, 0]}>
        <boxGeometry args={[0.04, 0.016, 0.055]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
      </mesh>
    </group>
  )
}

function ArticulatedFullHand({
  side,
  skinColor,
}: {
  side: HandSide
  skinColor: string
}) {
  const mirror = side === 'left' ? 1 : -1
  const fingers = [
    { x: 0.029, z: -0.008, lenA: 0.026, lenB: 0.02, r: 0.0078, thumb: true },
    { x: 0.021, z: -0.036, lenA: 0.034, lenB: 0.026, r: 0.0068 },
    { x: 0.006, z: -0.039, lenA: 0.038, lenB: 0.028, r: 0.007 },
    { x: -0.008, z: -0.037, lenA: 0.035, lenB: 0.026, r: 0.0065 },
    { x: -0.022, z: -0.031, lenA: 0.027, lenB: 0.021, r: 0.0058 },
  ]

  return (
    <group>
      {/* Smooth wrist joint sphere */}
      <mesh position={[0, 0, 0.012]} scale={[1.1, 0.65, 1.0]}>
        <sphereGeometry args={[0.024, 12, 10]} />
        <meshStandardMaterial color={skinColor} roughness={0.55} />
      </mesh>
      {/* Tapered anatomical palm */}
      <mesh position={[0, 0, -0.016]} scale={[1.05, 0.4, 1.15]}>
        <sphereGeometry args={[0.034, 14, 12]} />
        <meshStandardMaterial color={skinColor} roughness={0.55} />
      </mesh>
      {/* Two-phalanx naturally slightly curved fingers + opposed thumb */}
      {fingers.map((f, idx) => (
        <group
          key={idx}
          position={[f.x * mirror, f.thumb ? -0.005 : 0, f.z]}
          rotation={[f.thumb ? 0.35 : 0.24, 0, f.thumb ? mirror * 0.48 : 0]}
        >
          <mesh position={[0, 0, -f.lenA * 0.5]} rotation={[Math.PI * 0.5, 0, 0]}>
            <capsuleGeometry args={[f.r, f.lenA, 5, 8]} />
            <meshStandardMaterial color={skinColor} roughness={0.55} />
          </mesh>
          <group position={[0, 0, -f.lenA]} rotation={[0.35, 0, 0]}>
            <mesh position={[0, 0, -f.lenB * 0.5]} rotation={[Math.PI * 0.5, 0, 0]}>
              <capsuleGeometry args={[f.r * 0.84, f.lenB, 5, 8]} />
              <meshStandardMaterial color={skinColor} roughness={0.54} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  )
}

function alignSculptedSegment(
  mesh: THREE.Mesh | null,
  from: THREE.Vector3,
  to: THREE.Vector3,
  baseLength: number
): void {
  if (!mesh) return
  _segDir.subVectors(to, from)
  const len = _segDir.length()
  if (len < 0.005) {
    mesh.visible = false
    return
  }
  mesh.visible = true
  _segMid.addVectors(from, to).multiplyScalar(0.5)
  _segDir.divideScalar(len)
  mesh.position.copy(_segMid)
  mesh.quaternion.setFromUnitVectors(_upAxis, _segDir)
  mesh.scale.set(1, len / baseLength, 1)
}

export interface RealisticHumanAvatarProps {
  seedKey: string
  displayName: string
  gender: AvatarGender
  outfitColor?: string
  accentColor?: string
  hideHead?: boolean
  speakingLevel?: number
  getBodyAnchor: () => {
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
    hairPullWorld?: [number, number, number] | null
    onWorldTargets?: (headPos: [number, number, number], hairPos: [number, number, number]) => void
  }
  getLeftWrist: () => [number, number, number]
  getRightWrist: () => [number, number, number]
}

/**
 * Upgraded realistic 3D full-body human avatar: seamless spherical shoulder/elbow/hip/knee/ankle joints,
 * exact 2-bone law-of-cosines elbow IK, contoured pelvic hip bowl, anatomical Male/Female torsos,
 * sculpted muscles & woven cloth/denim textures, sneaker joints, and 5-finger articulated hands.
 */
export function RealisticHumanAvatar({
  seedKey,
  displayName,
  gender,
  outfitColor,
  accentColor,
  hideHead = false,
  speakingLevel = 0,
  getBodyAnchor,
  getLeftWrist,
  getRightWrist,
}: RealisticHumanAvatarProps) {
  const isFemale = gender === 'female'
  const profile = useMemo(() => getAthleteProfile(seedKey, gender), [seedKey, gender])

  const topColor = outfitColor ?? (isFemale ? '#0f766e' : '#1d4ed8')
  const trimColor = accentColor ?? (isFemale ? '#f472b6' : '#38bdf8')
  const pantsColor = isFemale ? '#1e293b' : '#0f172a'

  const torsoGeo = useMemo(() => buildAnatomicalTorsoGeometry(gender), [gender])
  const upperArmGeo = useMemo(
    () =>
      buildSculptedLimbGeometry(
        isFemale ? [0.032, 0.038, 0.043, 0.047, 0.038] : [0.037, 0.046, 0.054, 0.06, 0.048],
        UPPER_ARM_LEN
      ),
    [isFemale]
  )
  const forearmGeo = useMemo(
    () =>
      buildSculptedLimbGeometry(
        isFemale ? [0.022, 0.028, 0.034, 0.032] : [0.026, 0.033, 0.042, 0.037],
        FOREARM_LEN
      ),
    [isFemale]
  )
  const thighGeo = useMemo(
    () =>
      buildSculptedLimbGeometry(
        isFemale ? [0.05, 0.062, 0.075, 0.082, 0.072] : [0.054, 0.064, 0.077, 0.082, 0.074],
        0.41
      ),
    [isFemale]
  )
  const calfGeo = useMemo(
    () =>
      buildSculptedLimbGeometry(
        isFemale ? [0.033, 0.04, 0.051, 0.046, 0.046] : [0.036, 0.045, 0.058, 0.05, 0.05],
        0.39
      ),
    [isFemale]
  )

  const shirtTex = useMemo(() => createWovenFabricTexture(topColor, trimColor), [topColor, trimColor])
  const pantsTex = useMemo(() => createWovenFabricTexture(pantsColor, '#334155'), [pantsColor])

  useEffect(() => {
    return () => {
      torsoGeo.dispose()
      upperArmGeo.dispose()
      forearmGeo.dispose()
      thighGeo.dispose()
      calfGeo.dispose()
      shirtTex.dispose()
      pantsTex.dispose()
    }
  }, [torsoGeo, upperArmGeo, forearmGeo, thighGeo, calfGeo, shirtTex, pantsTex])

  const rootRef = useRef<THREE.Group>(null)
  const torsoGroupRef = useRef<THREE.Group>(null)
  const headRigRef = useRef<THREE.Group>(null)
  const chestBreathingRef = useRef<THREE.Mesh>(null)
  const labelGroupRef = useRef<THREE.Group>(null)

  const leftHipRef = useRef<THREE.Group>(null)
  const leftKneeRef = useRef<THREE.Group>(null)
  const rightHipRef = useRef<THREE.Group>(null)
  const rightKneeRef = useRef<THREE.Group>(null)

  const leftUpperRef = useRef<THREE.Mesh>(null)
  const leftForeRef = useRef<THREE.Mesh>(null)
  const leftElbowJointRef = useRef<THREE.Mesh>(null)
  const rightUpperRef = useRef<THREE.Mesh>(null)
  const rightForeRef = useRef<THREE.Mesh>(null)
  const rightElbowJointRef = useRef<THREE.Mesh>(null)
  const leftHandGroupRef = useRef<THREE.Group>(null)
  const rightHandGroupRef = useRef<THREE.Group>(null)

  const hairOffsetRef = useRef<[number, number, number]>([0, 0, 0])
  const _headWorldVec = useMemo(() => new THREE.Vector3(), [])
  const _hairWorldVec = useMemo(() => new THREE.Vector3(), [])
  const _headInvQuat = useMemo(() => new THREE.Quaternion(), [])

  const shoulderHalfW = isFemale ? 0.172 : 0.206
  const hipHalfW = isFemale ? 0.105 : 0.098

  useFrame((state) => {
    const t = state.clock.elapsedTime
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
      hairPullWorld = null,
      onWorldTargets,
    } = getBodyAnchor()

    const activeWalk = walkSpeed * (1 - sitBlend * 0.85)
    const stride = Math.sin(walkPhase) * 0.56 * activeWalk
    const pelvisDrop = sitBlend * 0.39 + Math.abs(Math.sin(walkPhase)) * 0.025 * activeWalk

    if (rootRef.current) {
      rootRef.current.position.set(pos[0], pos[1] - pelvisDrop, pos[2])
      rootRef.current.rotation.set(0, yaw, 0)
    }

    if (torsoGroupRef.current) {
      torsoGroupRef.current.rotation.set(
        -0.04 * activeWalk + sitBlend * 0.06 + torsoPitch,
        Math.sin(walkPhase) * 0.06 * activeWalk,
        headRoll * 0.22 + torsoRoll
      )
    }

    if (headRigRef.current) {
      headRigRef.current.rotation.set(headPitch, headYaw, headRoll)
      headRigRef.current.getWorldPosition(_headWorldVec)
      _hairWorldVec
        .set(0, isFemale ? 0.04 : 0.08, isFemale ? 0.14 : 0.04)
        .applyMatrix4(headRigRef.current.matrixWorld)
      onWorldTargets?.(
        [_headWorldVec.x, _headWorldVec.y, _headWorldVec.z],
        [_hairWorldVec.x, _hairWorldVec.y, _hairWorldVec.z]
      )

      if (hairPullWorld) {
        headRigRef.current.getWorldQuaternion(_headInvQuat).invert()
        _wrist
          .set(
            hairPullWorld[0] - _hairWorldVec.x,
            hairPullWorld[1] - _hairWorldVec.y,
            hairPullWorld[2] - _hairWorldVec.z
          )
          .applyQuaternion(_headInvQuat)
          .clampLength(0, 0.13)
        hairOffsetRef.current = [_wrist.x, _wrist.y, _wrist.z]
      } else {
        hairOffsetRef.current = [
          hairOffsetRef.current[0] * 0.85,
          hairOffsetRef.current[1] * 0.85,
          hairOffsetRef.current[2] * 0.85,
        ]
      }
    }

    if (chestBreathingRef.current) {
      const breath = 1 + Math.sin(t * 1.9) * 0.015
      chestBreathingRef.current.scale.set(1, 1, breath)
    }

    if (labelGroupRef.current) {
      labelGroupRef.current.lookAt(state.camera.position)
    }

    const sitHipAngle = sitBlend * 1.44
    const sitKneeAngle = -sitBlend * 1.48
    if (leftHipRef.current && leftKneeRef.current) {
      leftHipRef.current.rotation.set(stride + sitHipAngle, 0, sitBlend * 0.05)
      leftKneeRef.current.rotation.set(-Math.max(0, -stride * 1.15) + sitKneeAngle, 0, 0)
    }
    if (rightHipRef.current && rightKneeRef.current) {
      rightHipRef.current.rotation.set(-stride + sitHipAngle, 0, -sitBlend * 0.05)
      rightKneeRef.current.rotation.set(-Math.max(0, stride * 1.15) + sitKneeAngle, 0, 0)
    }

    // Exact 2-bone analytical law-of-cosines Elbow IK (zero stretched limbs!)
    const solveArmIK = (
      sideSign: number,
      wristArr: [number, number, number],
      upperMesh: THREE.Mesh | null,
      foreMesh: THREE.Mesh | null,
      elbowJoint: THREE.Mesh | null,
      handGrp: THREE.Group | null
    ) => {
      const effYaw = yaw + Math.sin(walkPhase) * 0.06 * activeWalk
      const cosY = Math.cos(effYaw)
      const sinY = Math.sin(effYaw)
      const sx = sideSign * shoulderHalfW
      _shoulder.set(pos[0] + sx * cosY, pos[1] + 1.38 - pelvisDrop, pos[2] - sx * sinY)

      _wrist.set(wristArr[0], wristArr[1], wristArr[2])
      _armVec.subVectors(_wrist, _shoulder)
      let d = _armVec.length()
      if (d > MAX_ARM_REACH) {
        _armVec.multiplyScalar(MAX_ARM_REACH / d)
        _wrist.copy(_shoulder).add(_armVec)
        d = MAX_ARM_REACH
      } else if (d < 0.09) {
        d = 0.09
      }

      const cosAlpha = Math.max(
        -0.98,
        Math.min(
          0.98,
          (UPPER_ARM_LEN * UPPER_ARM_LEN + d * d - FOREARM_LEN * FOREARM_LEN) / (2 * UPPER_ARM_LEN * d)
        )
      )
      const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha))
      const alongDir = _segDir.copy(_armVec).normalize()

      // Pole vector angles elbows naturally backward (+Z local) and slightly down/outward
      _poleDir.set(sideSign * cosY * 0.45 + sinY * 0.8, -0.55, -sideSign * sinY * 0.45 + cosY * 0.8)
      _poleDir.addScaledVector(alongDir, -_poleDir.dot(alongDir))
      if (_poleDir.lengthSq() < 1e-4) _poleDir.set(0, -1, 0)
      _poleDir.normalize()

      _bendNormal.copy(alongDir).multiplyScalar(cosAlpha * UPPER_ARM_LEN).addScaledVector(_poleDir, sinAlpha * UPPER_ARM_LEN)
      _elbow.copy(_shoulder).add(_bendNormal)

      alignSculptedSegment(upperMesh, _elbow, _shoulder, UPPER_ARM_LEN)
      alignSculptedSegment(foreMesh, _wrist, _elbow, FOREARM_LEN)

      if (elbowJoint) {
        elbowJoint.position.copy(_elbow)
      }
      if (handGrp) {
        handGrp.position.copy(_wrist)
        handGrp.lookAt(
          _wrist.x + (_wrist.x - _elbow.x),
          _wrist.y + (_wrist.y - _elbow.y),
          _wrist.z + (_wrist.z - _elbow.z)
        )
      }
    }

    solveArmIK(-1, getLeftWrist(), leftUpperRef.current, leftForeRef.current, leftElbowJointRef.current, leftHandGroupRef.current)
    solveArmIK(1, getRightWrist(), rightUpperRef.current, rightForeRef.current, rightElbowJointRef.current, rightHandGroupRef.current)
  })

  return (
    <group>
      <group ref={rootRef}>
        {/* Upper Torso + Shoulders + Neck + Face */}
        <group ref={torsoGroupRef} position={[0, 1.14, 0]}>
          <mesh ref={chestBreathingRef} geometry={torsoGeo} castShadow>
            <meshStandardMaterial map={shirtTex} roughness={0.68} />
          </mesh>

          {[-shoulderHalfW + 0.015, shoulderHalfW - 0.015].map((sx, idx) => (
            <mesh key={idx} position={[sx, 0.21, 0]}>
              <sphereGeometry args={[isFemale ? 0.048 : 0.058, 14, 12]} />
              <meshStandardMaterial map={shirtTex} roughness={0.68} />
            </mesh>
          ))}

          {/* Casual Waistband / Belt Seam */}
          <mesh position={[0, -0.255, 0]} scale={[isFemale ? 1.0 : 0.96, 1, 0.72]}>
            <cylinderGeometry args={[0.16, 0.164, 0.042, 22]} />
            <meshStandardMaterial color="#27272a" roughness={0.45} metalness={0.2} />
          </mesh>

          {!hideHead && (
            <group ref={headRigRef} position={[0, 0.45, 0]}>
              <HumanFaceHead
                profile={profile}
                gender={gender}
                showHair
                allowSunglasses={false}
                hairOffsetRef={hairOffsetRef}
              />
            </group>
          )}
        </group>

        {/* Seamless Sculpted Pelvis / Hip Bowl bridging lower waist into both thigh sockets */}
        <mesh position={[0, 0.855, 0.005]} scale={[isFemale ? 1.12 : 1.04, 0.85, 0.78]}>
          <sphereGeometry args={[0.145, 20, 14]} />
          <meshStandardMaterial map={pantsTex} roughness={0.78} />
        </mesh>

        {/* Nameplate */}
        <group ref={labelGroupRef} position={[0, 1.9, 0]}>
          <TextLabel fontSize={0.088} color={speakingLevel > 0.1 ? '#34d399' : '#f8fafc'}>
            {displayName}
          </TextLabel>
        </group>

        {/* Left & Right Sculpted Legs with Rounded Knee Caps & Sneakers */}
        <group ref={leftHipRef} position={[-hipHalfW, 0.85, 0]}>
          <mesh position={[0, -0.01, 0]}>
            <sphereGeometry args={[0.072, 14, 12]} />
            <meshStandardMaterial map={pantsTex} roughness={0.78} />
          </mesh>
          <mesh geometry={thighGeo} position={[0, -0.205, 0]}>
            <meshStandardMaterial map={pantsTex} roughness={0.78} />
          </mesh>
          <group ref={leftKneeRef} position={[0, -0.41, 0]}>
            <mesh>
              <sphereGeometry args={[0.05, 14, 12]} />
              <meshStandardMaterial map={pantsTex} roughness={0.78} />
            </mesh>
            <mesh geometry={calfGeo} position={[0, -0.195, 0]}>
              <meshStandardMaterial map={pantsTex} roughness={0.78} />
            </mesh>
            <SculptedSneaker accentColor={trimColor} />
          </group>
        </group>

        <group ref={rightHipRef} position={[hipHalfW, 0.85, 0]}>
          <mesh position={[0, -0.01, 0]}>
            <sphereGeometry args={[0.072, 14, 12]} />
            <meshStandardMaterial map={pantsTex} roughness={0.78} />
          </mesh>
          <mesh geometry={thighGeo} position={[0, -0.205, 0]}>
            <meshStandardMaterial map={pantsTex} roughness={0.78} />
          </mesh>
          <group ref={rightKneeRef} position={[0, -0.41, 0]}>
            <mesh>
              <sphereGeometry args={[0.05, 14, 12]} />
              <meshStandardMaterial map={pantsTex} roughness={0.78} />
            </mesh>
            <mesh geometry={calfGeo} position={[0, -0.195, 0]}>
              <meshStandardMaterial map={pantsTex} roughness={0.78} />
            </mesh>
            <SculptedSneaker accentColor={trimColor} />
          </group>
        </group>
      </group>

      {/* World-space 2-Bone IK Arms, Spherical Elbow Joints & 2-Phalanx 5-Finger Hands */}
      <mesh ref={leftUpperRef} geometry={upperArmGeo}>
        <meshStandardMaterial map={shirtTex} roughness={0.68} />
      </mesh>
      <mesh ref={leftElbowJointRef}>
        <sphereGeometry args={[isFemale ? 0.033 : 0.039, 12, 10]} />
        <meshStandardMaterial color={profile.skinColor} roughness={0.56} />
      </mesh>
      <mesh ref={leftForeRef} geometry={forearmGeo}>
        <meshStandardMaterial color={profile.skinColor} roughness={0.56} />
      </mesh>

      <mesh ref={rightUpperRef} geometry={upperArmGeo}>
        <meshStandardMaterial map={shirtTex} roughness={0.68} />
      </mesh>
      <mesh ref={rightElbowJointRef}>
        <sphereGeometry args={[isFemale ? 0.033 : 0.039, 12, 10]} />
        <meshStandardMaterial color={profile.skinColor} roughness={0.56} />
      </mesh>
      <mesh ref={rightForeRef} geometry={forearmGeo}>
        <meshStandardMaterial color={profile.skinColor} roughness={0.56} />
      </mesh>

      <group ref={leftHandGroupRef}>
        <ArticulatedFullHand side="left" skinColor={profile.skinColor} />
      </group>
      <group ref={rightHandGroupRef}>
        <ArticulatedFullHand side="right" skinColor={profile.skinColor} />
      </group>
    </group>
  )
}
