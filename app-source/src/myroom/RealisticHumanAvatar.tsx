import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getAthleteProfile, HumanFaceHead } from '../scene/HumanFace'
import { TextLabel } from '../scene/TextLabel'
import { AvatarGender, HandSide } from '../types/game'

const _upAxis = new THREE.Vector3(0, 1, 0)
const _segDir = new THREE.Vector3()
const _segMid = new THREE.Vector3()
const _shoulder = new THREE.Vector3()
const _wrist = new THREE.Vector3()
const _elbow = new THREE.Vector3()

/**
 * Generates an anatomically contoured LatheGeometry segment (muscle/garment silhouette)
 * instead of simple cylinders.
 */
function buildSculptedLimbGeometry(profileRadii: number[], height: number): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = []
  const count = profileRadii.length - 1
  for (let i = 0; i <= count; i++) {
    const t = i / count
    pts.push(new THREE.Vector2(profileRadii[i], (t - 0.5) * height))
  }
  const geo = new THREE.LatheGeometry(pts, 18)
  geo.computeVertexNormals()
  return geo
}

/**
 * Generates a realistic multi-ring oval anatomical torso with male/female chest, rib, waist & hip curves.
 */
function buildAnatomicalTorsoGeometry(gender: AvatarGender): THREE.BufferGeometry {
  const isFemale = gender === 'female'
  // Vertical rings from hip/hem (y=-0.27) up to collarbone/shoulders (y=+0.27)
  const rings = isFemale
    ? [
        { y: -0.27, rx: 0.165, rz: 0.115, cz: 0.005 }, // Hips
        { y: -0.19, rx: 0.148, rz: 0.102, cz: 0.006 }, // Pelvis taper
        { y: -0.09, rx: 0.118, rz: 0.088, cz: 0.004 }, // Defined waist
        { y: 0.02, rx: 0.132, rz: 0.098, cz: -0.002 }, // Ribcage
        { y: 0.11, rx: 0.155, rz: 0.118, cz: -0.016 }, // Contoured chest
        { y: 0.21, rx: 0.162, rz: 0.102, cz: -0.005 }, // Upper chest / shoulders
        { y: 0.27, rx: 0.088, rz: 0.074, cz: 0.004 },  // Neck collar
      ]
    : [
        { y: -0.27, rx: 0.156, rz: 0.112, cz: 0.002 }, // Waist/hips
        { y: -0.16, rx: 0.146, rz: 0.106, cz: 0.002 }, // Lower abdomen
        { y: -0.04, rx: 0.152, rz: 0.112, cz: 0.0 },   // Obliques/mid
        { y: 0.09, rx: 0.178, rz: 0.126, cz: -0.01 },  // Broad chest/pectorals
        { y: 0.2, rx: 0.192, rz: 0.115, cz: -0.006 },  // Athletic shoulders
        { y: 0.27, rx: 0.098, rz: 0.082, cz: 0.005 },  // Collar
      ]

  const radialSegs = 24
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
      // Slightly sculpt anterior/posterior chest asymmetry
      const frontWeight = Math.cos(theta) < 0 ? 1.08 : 0.92
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

  // Fine woven knit grain & subtle cloth shade lines
  ctx.fillStyle = 'rgba(255, 255, 255, 0.045)'
  for (let y = 0; y < 256; y += 4) {
    ctx.fillRect(0, y, 256, 1)
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.055)'
  for (let x = 0; x < 256; x += 6) {
    ctx.fillRect(x, 0, 1, 256)
  }

  // Subtle shoulder/chest trim stripe
  ctx.fillStyle = accentHex
  ctx.fillRect(0, 206, 256, 18)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function createSculptedShoeMesh(accentColor: string) {
  return (
    <group position={[0, -0.4, -0.035]}>
      {/* Contoured sneaker midsole */}
      <mesh position={[0, -0.018, 0]} scale={[1.0, 0.72, 1.35]}>
        <capsuleGeometry args={[0.046, 0.075, 6, 12]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>
      {/* Upper sneaker knit body */}
      <mesh position={[0, 0.01, 0.008]} scale={[0.92, 0.78, 1.24]}>
        <capsuleGeometry args={[0.042, 0.068, 6, 12]} />
        <meshStandardMaterial color={accentColor} roughness={0.62} />
      </mesh>
      {/* Heel tab & laces trim */}
      <mesh position={[0, 0.03, -0.025]} rotation={[0.4, 0, 0]}>
        <boxGeometry args={[0.042, 0.018, 0.06]} />
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
  const fingerOffsets = [
    { x: 0.03, z: -0.01, len: 0.042, r: 0.008, thumb: true },
    { x: 0.022, z: -0.038, len: 0.056, r: 0.007 },
    { x: 0.007, z: -0.041, len: 0.062, r: 0.0072 },
    { x: -0.008, z: -0.039, len: 0.057, r: 0.0068 },
    { x: -0.022, z: -0.034, len: 0.046, r: 0.006 },
  ]

  return (
    <group>
      {/* Anatomically rounded palm */}
      <mesh scale={[1.0, 0.42, 1.15]}>
        <sphereGeometry args={[0.036, 14, 10]} />
        <meshStandardMaterial color={skinColor} roughness={0.55} />
      </mesh>
      {fingerOffsets.map((f, idx) => (
        <mesh
          key={idx}
          position={[f.x * mirror, f.thumb ? -0.004 : 0, f.z - f.len * 0.45]}
          rotation={[Math.PI * 0.5 + 0.18, 0, f.thumb ? mirror * 0.45 : 0]}
        >
          <capsuleGeometry args={[f.r, f.len, 5, 8]} />
          <meshStandardMaterial color={skinColor} roughness={0.55} />
        </mesh>
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
    walkSpeed: number
    walkPhase: number
  }
  getLeftWrist: () => [number, number, number]
  getRightWrist: () => [number, number, number]
}

/**
 * Upgraded realistic 3D full-body human avatar (configurable Male or Female anatomy,
 * woven fabric textures, contoured muscular Lathe limbs, sneaker shoes, and 5-finger hands).
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
        isFemale ? [0.033, 0.037, 0.042, 0.046, 0.034] : [0.038, 0.044, 0.052, 0.058, 0.044],
        0.28
      ),
    [isFemale]
  )
  const forearmGeo = useMemo(
    () =>
      buildSculptedLimbGeometry(
        isFemale ? [0.022, 0.027, 0.033, 0.032] : [0.026, 0.032, 0.041, 0.038],
        0.26
      ),
    [isFemale]
  )
  const thighGeo = useMemo(
    () =>
      buildSculptedLimbGeometry(
        isFemale ? [0.048, 0.06, 0.072, 0.078, 0.064] : [0.052, 0.062, 0.074, 0.078, 0.068],
        0.4
      ),
    [isFemale]
  )
  const calfGeo = useMemo(
    () =>
      buildSculptedLimbGeometry(
        isFemale ? [0.032, 0.039, 0.05, 0.045, 0.046] : [0.035, 0.044, 0.056, 0.048, 0.05],
        0.38
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
  const chestBreathingRef = useRef<THREE.Mesh>(null)
  const labelGroupRef = useRef<THREE.Group>(null)

  const leftHipRef = useRef<THREE.Group>(null)
  const leftKneeRef = useRef<THREE.Group>(null)
  const rightHipRef = useRef<THREE.Group>(null)
  const rightKneeRef = useRef<THREE.Group>(null)

  const leftUpperRef = useRef<THREE.Mesh>(null)
  const leftForeRef = useRef<THREE.Mesh>(null)
  const rightUpperRef = useRef<THREE.Mesh>(null)
  const rightForeRef = useRef<THREE.Mesh>(null)
  const leftHandGroupRef = useRef<THREE.Group>(null)
  const rightHandGroupRef = useRef<THREE.Group>(null)

  const shoulderHalfW = isFemale ? 0.168 : 0.21
  const hipHalfW = isFemale ? 0.102 : 0.096

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const { pos, yaw, walkSpeed, walkPhase } = getBodyAnchor()
    const stride = Math.sin(walkPhase) * 0.58 * walkSpeed
    const pelvisBob = Math.abs(Math.sin(walkPhase)) * 0.025 * walkSpeed

    if (rootRef.current) {
      rootRef.current.position.set(pos[0], pos[1] - pelvisBob, pos[2])
      rootRef.current.rotation.set(0, yaw, 0)
    }

    if (torsoGroupRef.current) {
      torsoGroupRef.current.rotation.set(
        -0.04 * walkSpeed,
        Math.sin(walkPhase) * 0.06 * walkSpeed,
        0
      )
    }

    if (chestBreathingRef.current) {
      const breath = 1 + Math.sin(t * 1.9) * 0.015
      chestBreathingRef.current.scale.set(1, 1, breath)
    }

    if (labelGroupRef.current) {
      labelGroupRef.current.lookAt(state.camera.position)
    }

    if (leftHipRef.current && leftKneeRef.current) {
      leftHipRef.current.rotation.set(stride, 0, 0)
      leftKneeRef.current.rotation.set(-Math.max(0, -stride * 1.15), 0, 0)
    }
    if (rightHipRef.current && rightKneeRef.current) {
      rightHipRef.current.rotation.set(-stride, 0, 0)
      rightKneeRef.current.rotation.set(-Math.max(0, stride * 1.15), 0, 0)
    }

    const computeArm = (
      sideSign: number,
      wristArr: [number, number, number],
      upperMesh: THREE.Mesh | null,
      foreMesh: THREE.Mesh | null,
      handGrp: THREE.Group | null
    ) => {
      const cosY = Math.cos(yaw)
      const sinY = Math.sin(yaw)
      const sx = sideSign * shoulderHalfW
      _shoulder.set(pos[0] + sx * cosY, pos[1] + 1.36 - pelvisBob, pos[2] - sx * sinY)
      _wrist.set(wristArr[0], wristArr[1], wristArr[2])

      _elbow.lerpVectors(_shoulder, _wrist, 0.48)
      _elbow.y -= 0.11
      _elbow.x += sideSign * cosY * 0.055
      _elbow.z -= sideSign * sinY * 0.055

      alignSculptedSegment(upperMesh, _elbow, _shoulder, 0.28)
      alignSculptedSegment(foreMesh, _wrist, _elbow, 0.26)

      if (handGrp) {
        handGrp.position.copy(_wrist)
        handGrp.lookAt(_wrist.x + (_wrist.x - _elbow.x), _wrist.y + (_wrist.y - _elbow.y), _wrist.z + (_wrist.z - _elbow.z))
      }
    }

    computeArm(-1, getLeftWrist(), leftUpperRef.current, leftForeRef.current, leftHandGroupRef.current)
    computeArm(1, getRightWrist(), rightUpperRef.current, rightForeRef.current, rightHandGroupRef.current)
  })

  return (
    <group>
      <group ref={rootRef}>
        <group ref={torsoGroupRef} position={[0, 1.12, 0]}>
          {/* Contoured Anatomical Woven Torso */}
          <mesh ref={chestBreathingRef} geometry={torsoGeo} castShadow>
            <meshStandardMaterial map={shirtTex} roughness={0.68} />
          </mesh>

          {/* Rounded Shoulder Caps */}
          {[-shoulderHalfW + 0.015, shoulderHalfW - 0.015].map((sx, idx) => (
            <mesh key={idx} position={[sx, 0.2, 0]}>
              <sphereGeometry args={[isFemale ? 0.048 : 0.058, 14, 12]} />
              <meshStandardMaterial map={shirtTex} roughness={0.68} />
            </mesh>
          ))}

          {/* Casual Belt & Pelvis Seam */}
          <mesh position={[0, -0.255, 0]} scale={[isFemale ? 1.0 : 0.96, 1, 0.72]}>
            <cylinderGeometry args={[0.16, 0.162, 0.04, 20]} />
            <meshStandardMaterial color="#27272a" roughness={0.45} metalness={0.2} />
          </mesh>

          {/* Realistic Face & Styled Hair (for Computer Opponent; remote peers can pass hideHead if separate headRef is used) */}
          {!hideHead && (
            <group position={[0, 0.44, 0]}>
              <HumanFaceHead profile={profile} gender={gender} showHair allowSunglasses={false} />
            </group>
          )}
        </group>

        {/* Nameplate */}
        <group ref={labelGroupRef} position={[0, 1.88, 0]}>
          <TextLabel fontSize={0.09} color={speakingLevel > 0.1 ? '#34d399' : '#f8fafc'}>
            {displayName}
          </TextLabel>
        </group>

        {/* Left Sculpted Leg & Sneaker */}
        <group ref={leftHipRef} position={[-hipHalfW, 0.86, 0]}>
          <mesh geometry={thighGeo} position={[0, -0.2, 0]}>
            <meshStandardMaterial map={pantsTex} roughness={0.78} />
          </mesh>
          <group ref={leftKneeRef} position={[0, -0.4, 0]}>
            <mesh geometry={calfGeo} position={[0, -0.2, 0]}>
              <meshStandardMaterial map={pantsTex} roughness={0.78} />
            </mesh>
            {createSculptedShoeMesh(trimColor)}
          </group>
        </group>

        {/* Right Sculpted Leg & Sneaker */}
        <group ref={rightHipRef} position={[hipHalfW, 0.86, 0]}>
          <mesh geometry={thighGeo} position={[0, -0.2, 0]}>
            <meshStandardMaterial map={pantsTex} roughness={0.78} />
          </mesh>
          <group ref={rightKneeRef} position={[0, -0.4, 0]}>
            <mesh geometry={calfGeo} position={[0, -0.2, 0]}>
              <meshStandardMaterial map={pantsTex} roughness={0.78} />
            </mesh>
            {createSculptedShoeMesh(trimColor)}
          </group>
        </group>
      </group>

      {/* World-space IK Arms & 5-Finger Hands */}
      <mesh ref={leftUpperRef} geometry={upperArmGeo}>
        <meshStandardMaterial map={shirtTex} roughness={0.68} />
      </mesh>
      <mesh ref={leftForeRef} geometry={forearmGeo}>
        <meshStandardMaterial color={profile.skinColor} roughness={0.56} />
      </mesh>
      <mesh ref={rightUpperRef} geometry={upperArmGeo}>
        <meshStandardMaterial map={shirtTex} roughness={0.68} />
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
