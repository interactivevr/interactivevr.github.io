import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { AthleteLookProfile, getAthleteProfile, HumanFaceHead } from '../scene/HumanFace'
import { TextLabel } from '../scene/TextLabel'
import { CricketRole } from './types'

const _shoulder = new THREE.Vector3()
const _wrist = new THREE.Vector3()
const _elbow = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _mid = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _quat = new THREE.Quaternion()

export interface KitAnimState {
  runPhase: number
  runSpeed: number // 0..1
  squat: number // 0..1 (wicketkeeper / batting crouch)
  torsoLean: number // radians forward lean
  diveTilt: number // radians athletic lunge
  headYawOffset?: number // head look offset relative to torso (e.g. sideways batting stance)
  torsoTwist?: number // upper-body Y rotation during batting swing
  stanceSpread?: number // wide batting stance leg spread (radians)
  frontStride?: number // extra lead-leg stride during batting shot (radians, signed -left/+right)
}

export function CricketBatMesh({ highlight = false }: { highlight?: boolean }) {
  return (
    <group>
      {/* Rubberized Handle */}
      <mesh position={[0, -0.11, 0]}>
        <cylinderGeometry args={[0.017, 0.019, 0.26, 12]} />
        <meshStandardMaterial color="#0f172a" roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.04, 12]} />
        <meshStandardMaterial color="#38bdf8" roughness={0.5} />
      </mesh>
      {/* Sculpted Willow Blade */}
      <mesh position={[0, -0.52, 0]}>
        <boxGeometry args={[0.108, 0.58, 0.036]} />
        <meshStandardMaterial
          color="#f5deb3"
          roughness={0.52}
          emissive={highlight ? '#fbbf24' : '#000000'}
          emissiveIntensity={highlight ? 0.22 : 0}
        />
      </mesh>
      {/* Spine ridge */}
      <mesh position={[0, -0.51, 0.02]}>
        <boxGeometry args={[0.044, 0.54, 0.018]} />
        <meshStandardMaterial color="#e6c896" roughness={0.5} />
      </mesh>
      {/* Sticker & Toe Guard */}
      <mesh position={[0, -0.44, -0.019]}>
        <planeGeometry args={[0.086, 0.22]} />
        <meshBasicMaterial color="#1d4ed8" />
      </mesh>
      <mesh position={[0, -0.815, 0]}>
        <boxGeometry args={[0.108, 0.018, 0.038]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </mesh>
    </group>
  )
}

export function CricketGloveMesh({
  variant,
  color = '#f8fafc',
  accent = '#1d4ed8',
  catching = false,
  skinColor = '#d9a17b',
}: {
  variant: 'batting' | 'keeper' | 'bowler'
  color?: string
  accent?: string
  catching?: boolean
  skinColor?: string
}) {
  if (variant === 'bowler') {
    return (
      <group>
        {/* Sculpted hand palm + thumb */}
        <mesh scale={[1.05, 0.72, 1.25]}>
          <sphereGeometry args={[0.042, 12, 10]} />
          <meshStandardMaterial color={skinColor} roughness={0.62} />
        </mesh>
        {/* Sweatband wrist */}
        <mesh position={[0, 0, 0.056]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.034, 0.036, 0.048, 12]} />
          <meshStandardMaterial
            color={catching ? '#34d399' : accent}
            emissive={catching ? '#10b981' : '#000000'}
            emissiveIntensity={catching ? 0.5 : 0}
          />
        </mesh>
      </group>
    )
  }

  if (variant === 'keeper') {
    return (
      <group>
        <mesh>
          <boxGeometry args={[0.14, 0.045, 0.16]} />
          <meshStandardMaterial
            color={catching ? '#34d399' : '#0ea5e9'}
            emissive={catching ? '#10b981' : '#0284c7'}
            emissiveIntensity={catching ? 0.45 : 0.12}
            roughness={0.42}
          />
        </mesh>
        <mesh position={[0.068, 0.01, -0.02]} rotation={[0, 0, -0.35]}>
          <boxGeometry args={[0.045, 0.032, 0.095]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.48} />
        </mesh>
        <mesh position={[0, 0, 0.095]}>
          <boxGeometry args={[0.1, 0.042, 0.072]} />
          <meshStandardMaterial color="#0f172a" roughness={0.58} />
        </mesh>
      </group>
    )
  }

  // Pro Padded Batting Glove
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.09, 0.044, 0.112]} />
        <meshStandardMaterial color={color} roughness={0.42} />
      </mesh>
      {[-0.028, -0.01, 0.009, 0.028].map((x, idx) => (
        <mesh key={idx} position={[x, 0.022, -0.026]}>
          <boxGeometry args={[0.016, 0.018, 0.06]} />
          <meshStandardMaterial color={idx % 2 === 0 ? accent : '#f8fafc'} roughness={0.38} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.074]}>
        <boxGeometry args={[0.078, 0.04, 0.052]} />
        <meshStandardMaterial color={accent} roughness={0.5} />
      </mesh>
    </group>
  )
}

export function CricketHelmetMesh({
  jerseyColor,
  firstPersonFraming = false,
}: {
  jerseyColor: string
  firstPersonFraming?: boolean
}) {
  if (firstPersonFraming) {
    return (
      <group>
        <mesh position={[0, 0.115, -0.145]} rotation={[0.18, 0, 0]}>
          <boxGeometry args={[0.24, 0.014, 0.085]} />
          <meshStandardMaterial color="#0f172a" roughness={0.4} />
        </mesh>
        <mesh position={[-0.105, -0.095, -0.11]} rotation={[0, 0.35, 0]}>
          <boxGeometry args={[0.014, 0.08, 0.11]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0.105, -0.095, -0.11]} rotation={[0, -0.35, 0]}>
          <boxGeometry args={[0.014, 0.08, 0.11]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    )
  }

  return (
    <group>
      {/* Aerodynamic Open-Front Helmet Shell (sits cleanly over real HumanFaceHead!) */}
      <mesh position={[0, 0.042, 0.01]} scale={[1.02, 0.96, 1.06]}>
        <sphereGeometry args={[0.142, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
        <meshStandardMaterial color={jerseyColor} roughness={0.28} metalness={0.22} />
      </mesh>
      {/* Back Neck Guard & Ear Flaps */}
      <mesh position={[0, -0.015, 0.085]} scale={[1.02, 1.0, 0.65]}>
        <cylinderGeometry args={[0.132, 0.128, 0.11, 14, 1, true, Math.PI * 0.3, Math.PI * 1.4]} />
        <meshStandardMaterial color={jerseyColor} side={THREE.DoubleSide} roughness={0.35} />
      </mesh>
      {/* Peak Visor */}
      <mesh position={[0, 0.056, -0.145]} rotation={[0.22, 0, 0]}>
        <boxGeometry args={[0.21, 0.016, 0.082]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} />
      </mesh>
      {/* Open Titanium Grill Bars (face stays clearly visible inside!) */}
      {[-0.042, -0.012, 0.018].map((yOff, i) => (
        <mesh key={i} position={[0, -0.032 + yOff, -0.152]}>
          <boxGeometry args={[0.165, 0.006, 0.006]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.78} roughness={0.22} />
        </mesh>
      ))}
      {[-0.072, 0.072].map((gx, i) => (
        <mesh key={i} position={[gx, -0.03, -0.148]}>
          <boxGeometry args={[0.007, 0.08, 0.01]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.75} roughness={0.25} />
        </mesh>
      ))}
    </group>
  )
}

function updateLimbSegment(
  mesh: THREE.Mesh | null,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number
): void {
  if (!mesh) return
  _dir.subVectors(b, a)
  const len = _dir.length()
  if (len < 0.01) {
    mesh.visible = false
    return
  }
  mesh.visible = true
  _mid.addVectors(a, b).multiplyScalar(0.5)
  _dir.divideScalar(len)
  _quat.setFromUnitVectors(_up, _dir)
  mesh.position.copy(_mid)
  mesh.quaternion.copy(_quat)
  mesh.scale.set(radius, len, radius)
}

/**
 * Full sculpted athletic Cricket Player Body with:
 * - Realistic HumanFaceHead (3D eyes/blink, nose, lips, ears, hair, optional beard/sunglasses)
 * - Tailored Jersey Torso (Name + Squad Number on BOTH Front & Back)
 * - Short-sleeve team sleeves + real skin-toned muscular forearms
 * - Articulated animated Legs (Hip -> Thigh -> Knee -> Shin -> Cleats) + Knee-Roll Leg Pads
 */
export function CricketKitBody({
  role,
  playerName,
  jerseyNumber = '07',
  jerseyColor = '#1d4ed8',
  accentColor = '#fbbf24',
  lookProfile,
  getBodyAnchor,
  getLeftWrist,
  getRightWrist,
  getAnimState,
  hideHead = false,
}: {
  role: CricketRole
  playerName: string
  jerseyNumber?: string
  jerseyColor?: string
  accentColor?: string
  lookProfile?: AthleteLookProfile
  getBodyAnchor: () => { pos: [number, number, number]; yaw: number }
  getLeftWrist: () => [number, number, number]
  getRightWrist: () => [number, number, number]
  getAnimState?: () => KitAnimState
  hideHead?: boolean
}) {
  const bodyGroupRef = useRef<THREE.Group>(null)
  const upperBodyRef = useRef<THREE.Group>(null)
  const headRef = useRef<THREE.Group>(null)
  const leftHipRef = useRef<THREE.Group>(null)
  const leftKneeRef = useRef<THREE.Group>(null)
  const rightHipRef = useRef<THREE.Group>(null)
  const rightKneeRef = useRef<THREE.Group>(null)

  const leftUpperRef = useRef<THREE.Mesh>(null)
  const leftForeRef = useRef<THREE.Mesh>(null)
  const rightUpperRef = useRef<THREE.Mesh>(null)
  const rightForeRef = useRef<THREE.Mesh>(null)

  const profile = useMemo(
    () => lookProfile ?? getAthleteProfile(playerName || role),
    [lookProfile, playerName, role]
  )

  const hasPads = role === 'batter' || role === 'wicketkeeper'
  const cleanName = (playerName || 'PLAYER').toUpperCase().slice(0, 12)

  useFrame(() => {
    const { pos, yaw } = getBodyAnchor()
    const anim = getAnimState?.() ?? {
      runPhase: 0,
      runSpeed: 0,
      squat: role === 'wicketkeeper' ? 0.65 : role === 'batter' ? 0.16 : 0,
      torsoLean: role === 'wicketkeeper' ? 0.25 : 0.05,
      diveTilt: 0,
    }

    // Running stride angles + squat drop
    const stride = Math.sin(anim.runPhase) * 0.68 * anim.runSpeed
    const squatHip = anim.squat * 0.52
    const squatKnee = anim.squat * 0.95
    const pelvisDrop = anim.squat * 0.18 + Math.abs(Math.sin(anim.runPhase)) * 0.03 * anim.runSpeed
    const spread = anim.stanceSpread ?? 0
    const frontStride = anim.frontStride ?? 0
    const twist = anim.torsoTwist ?? 0

    if (bodyGroupRef.current) {
      bodyGroupRef.current.position.set(pos[0], pos[1] - pelvisDrop * 0.35, pos[2])
      bodyGroupRef.current.rotation.set(0, yaw, 0)
    }

    if (upperBodyRef.current) {
      upperBodyRef.current.rotation.set(-(anim.torsoLean + anim.diveTilt * 0.7), twist, 0)
    }

    if (headRef.current) {
      headRef.current.rotation.y = (anim.headYawOffset ?? 0) - twist * 0.75
    }

    // Left & Right Leg articulation (supports both running and wide sideways batting stance)
    if (leftHipRef.current && leftKneeRef.current) {
      leftHipRef.current.rotation.set(stride + squatHip, 0, -(spread + Math.max(0, -frontStride)))
      leftKneeRef.current.rotation.set(-Math.max(0, -stride * 1.1) - squatKnee, 0, spread * 0.45)
    }
    if (rightHipRef.current && rightKneeRef.current) {
      rightHipRef.current.rotation.set(-stride + squatHip, 0, spread + Math.max(0, frontStride))
      rightKneeRef.current.rotation.set(-Math.max(0, stride * 1.1) - squatKnee, 0, -spread * 0.45)
    }

    // Arm kinematics connecting athletic shoulders to live wrists
    const computeArm = (
      sideSign: number,
      wristArr: [number, number, number],
      upperMesh: THREE.Mesh | null,
      foreMesh: THREE.Mesh | null
    ) => {
      const effYaw = yaw + twist
      const cosY = Math.cos(effYaw)
      const sinY = Math.sin(effYaw)
      const localSX = sideSign * 0.225
      const localSY = 1.36 - pelvisDrop * 0.45
      _shoulder.set(pos[0] + localSX * cosY, pos[1] + localSY, pos[2] - localSX * sinY)
      _wrist.set(wristArr[0], wristArr[1], wristArr[2])

      _elbow.lerpVectors(_shoulder, _wrist, 0.48)
      _elbow.y -= 0.1
      _elbow.x += sideSign * cosY * 0.06
      _elbow.z -= sideSign * sinY * 0.06

      updateLimbSegment(upperMesh, _shoulder, _elbow, 0.052) // Jersey short sleeve
      updateLimbSegment(foreMesh, _elbow, _wrist, 0.038) // Skin-toned forearm
    }

    computeArm(-1, getLeftWrist(), leftUpperRef.current, leftForeRef.current)
    computeArm(1, getRightWrist(), rightUpperRef.current, rightForeRef.current)
  })

  return (
    <group>
      <group ref={bodyGroupRef}>
        {/* Upper Body (leans naturally when batting/keeping/diving) */}
        <group ref={upperBodyRef} position={[0, 0.88, 0]}>
          {/* Athletic Tapered V-Shaped Jersey Torso */}
          <mesh position={[0, 0.27, 0]} scale={[1.26, 1, 0.78]}>
            <cylinderGeometry args={[0.165, 0.135, 0.52, 16]} />
            <meshStandardMaterial color={jerseyColor} roughness={0.62} />
          </mesh>
          {/* Team Accent Chest & Shoulder Stripes */}
          <mesh position={[0, 0.36, 0]} scale={[1.28, 1, 0.8]}>
            <cylinderGeometry args={[0.168, 0.16, 0.09, 16]} />
            <meshStandardMaterial color={accentColor} roughness={0.55} />
          </mesh>
          {/* Shoulder Deltoid Caps */}
          {[-0.205, 0.205].map((sx, i) => (
            <mesh key={i} position={[sx, 0.47, 0]} scale={[1, 0.9, 0.95]}>
              <sphereGeometry args={[0.068, 12, 10]} />
              <meshStandardMaterial color={jerseyColor} roughness={0.6} />
            </mesh>
          ))}
          {/* V-Neck Jersey Collar */}
          <mesh position={[0, 0.53, 0]}>
            <cylinderGeometry args={[0.088, 0.098, 0.045, 14]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.55} />
          </mesh>

          {/* FRONT JERSEY NAME & NUMBER (-Z front chest) */}
          <TextLabel
            position={[0, 0.38, -0.138]}
            rotation={[0, Math.PI, 0]}
            fontSize={0.056}
            color="#f8fafc"
            outlineColor="#020617"
            outlineWidth={0.006}
          >
            {cleanName}
          </TextLabel>
          <TextLabel
            position={[0, 0.23, -0.128]}
            rotation={[0, Math.PI, 0]}
            fontSize={0.105}
            color={accentColor}
            outlineColor="#020617"
            outlineWidth={0.008}
          >
            {jerseyNumber}
          </TextLabel>

          {/* BACK JERSEY NAME & NUMBER (+Z upper back) */}
          <TextLabel
            position={[0, 0.39, 0.138]}
            rotation={[0, 0, 0]}
            fontSize={0.064}
            color="#f8fafc"
            outlineColor="#020617"
            outlineWidth={0.006}
          >
            {cleanName}
          </TextLabel>
          <TextLabel
            position={[0, 0.21, 0.128]}
            rotation={[0, 0, 0]}
            fontSize={0.135}
            color={accentColor}
            outlineColor="#020617"
            outlineWidth={0.008}
          >
            {jerseyNumber}
          </TextLabel>

          {/* Realistic Human Face Head + Helmet or Cap */}
          {!hideHead && (
            <group ref={headRef} position={[0, 0.72, 0]}>
              <HumanFaceHead
                profile={profile}
                showHair={role === 'bowler'}
                allowSunglasses={role === 'bowler'}
              />
              {role === 'bowler' ? (
                <group position={[0, 0.058, 0]}>
                  <mesh scale={[1.01, 0.9, 1.04]}>
                    <sphereGeometry args={[0.132, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                    <meshStandardMaterial color={jerseyColor} roughness={0.5} />
                  </mesh>
                  <mesh position={[0, -0.005, -0.138]} rotation={[0.15, 0, 0]}>
                    <boxGeometry args={[0.17, 0.014, 0.09]} />
                    <meshStandardMaterial color={jerseyColor} roughness={0.5} />
                  </mesh>
                </group>
              ) : (
                <CricketHelmetMesh jerseyColor={jerseyColor} />
              )}
            </group>
          )}
        </group>

        {/* Pelvis / Waist Belt */}
        <mesh position={[0, 0.87, 0]} scale={[1.22, 1, 0.78]}>
          <cylinderGeometry args={[0.135, 0.14, 0.12, 14]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.68} />
        </mesh>

        {/* Left & Right Articulated Legs (Hip -> Knee -> Ankle -> Cleats + Sculpted Pads) */}
        {[
          { sideX: -0.1, hipRef: leftHipRef, kneeRef: leftKneeRef },
          { sideX: 0.1, hipRef: rightHipRef, kneeRef: rightKneeRef },
        ].map(({ sideX, hipRef, kneeRef }, idx) => (
          <group key={idx} ref={hipRef} position={[sideX, 0.84, 0]}>
            {/* Thigh */}
            <mesh position={[0, -0.2, 0]}>
              <cylinderGeometry args={[0.072, 0.058, 0.4, 12]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.68} />
            </mesh>
            {/* Knee Joint & Lower Leg */}
            <group ref={kneeRef} position={[0, -0.4, 0]}>
              <mesh>
                <sphereGeometry args={[0.056, 10, 8]} />
                <meshStandardMaterial color="#f1f5f9" roughness={0.68} />
              </mesh>
              <mesh position={[0, -0.19, 0]}>
                <cylinderGeometry args={[0.056, 0.044, 0.38, 12]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.68} />
              </mesh>

              {/* Sculpted Pro Cricket Leg Pad (3 vertical bolsters + knee roll + straps) */}
              {hasPads && (
                <group position={[0, -0.16, -0.048]}>
                  {[-0.036, 0, 0.036].map((bx, bi) => (
                    <mesh key={bi} position={[bx, 0, 0]}>
                      <cylinderGeometry args={[0.022, 0.02, 0.44, 8]} />
                      <meshStandardMaterial color="#ffffff" roughness={0.38} />
                    </mesh>
                  ))}
                  {/* Top knee roll guard */}
                  <mesh position={[0, 0.22, -0.005]}>
                    <boxGeometry args={[0.125, 0.085, 0.055]} />
                    <meshStandardMaterial color={jerseyColor} roughness={0.45} />
                  </mesh>
                  {/* Buckle straps around calf */}
                  {[-0.12, 0.08].map((sy, si) => (
                    <mesh key={si} position={[0, sy, 0.042]}>
                      <cylinderGeometry args={[0.058, 0.058, 0.022, 12]} />
                      <meshStandardMaterial color="#e2e8f0" roughness={0.55} />
                    </mesh>
                  ))}
                </group>
              )}

              {/* Athletic Cricket Shoe */}
              <group position={[0, -0.4, -0.04]}>
                <mesh>
                  <boxGeometry args={[0.092, 0.075, 0.22]} />
                  <meshStandardMaterial color={role === 'bowler' ? '#38bdf8' : '#ffffff'} roughness={0.45} />
                </mesh>
                <mesh position={[0, -0.035, 0]}>
                  <boxGeometry args={[0.095, 0.016, 0.225]} />
                  <meshStandardMaterial color="#0f172a" roughness={0.8} />
                </mesh>
              </group>
            </group>
          </group>
        ))}
      </group>

      {/* Team Jersey Short Sleeves (Upper Arm) + Skin-Toned Forearms */}
      <mesh ref={leftUpperRef}>
        <cylinderGeometry args={[1, 0.88, 1, 12]} />
        <meshStandardMaterial color={jerseyColor} roughness={0.6} />
      </mesh>
      <mesh ref={leftForeRef}>
        <cylinderGeometry args={[1, 0.8, 1, 12]} />
        <meshStandardMaterial color={profile.skinColor} roughness={0.62} />
      </mesh>
      <mesh ref={rightUpperRef}>
        <cylinderGeometry args={[1, 0.88, 1, 12]} />
        <meshStandardMaterial color={jerseyColor} roughness={0.6} />
      </mesh>
      <mesh ref={rightForeRef}>
        <cylinderGeometry args={[1, 0.8, 1, 12]} />
        <meshStandardMaterial color={profile.skinColor} roughness={0.62} />
      </mesh>
    </group>
  )
}
