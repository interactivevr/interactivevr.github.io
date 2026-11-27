import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { AthleteLookProfile, getAthleteProfile, HumanFaceHead } from '../scene/HumanFace'
import { TextLabel } from '../scene/TextLabel'
import { UnityHumanoidCharacter } from '../scene/UnityHumanoidCharacter'
import { CricketRole } from './types'

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

function createMrfStickerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  // Clean willow base tint under sticker
  ctx.fillStyle = '#f5dfb8'
  ctx.fillRect(0, 0, 256, 512)

  // Subtle wood grain vertical streaks
  ctx.strokeStyle = 'rgba(180, 130, 75, 0.22)'
  ctx.lineWidth = 2
  for (let x = 12; x < 256; x += 18) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + (x % 3 === 0 ? 4 : -3), 512)
    ctx.stroke()
  }

  // Red & Black Genius Shield Stripe
  ctx.fillStyle = '#111827'
  ctx.fillRect(20, 72, 216, 265)
  ctx.fillStyle = '#dc2626'
  ctx.fillRect(28, 82, 200, 170)

  // Gold diagonal swoosh
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.moveTo(20, 252)
  ctx.lineTo(236, 228)
  ctx.lineTo(236, 248)
  ctx.lineTo(20, 272)
  ctx.closePath()
  ctx.fill()

  // Crisp White/Black MRF Logo
  ctx.fillStyle = '#ffffff'
  ctx.font = '900 76px Impact, Arial Black, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.strokeStyle = '#09090b'
  ctx.lineWidth = 8
  ctx.strokeText('MRF', 128, 160)
  ctx.fillText('MRF', 128, 160)

  // GENIUS Subtitle
  ctx.fillStyle = '#f8fafc'
  ctx.font = '800 32px Arial, sans-serif'
  ctx.fillText('GENIUS', 128, 292)
  ctx.fillStyle = '#fbbf24'
  ctx.font = '700 18px Arial, sans-serif'
  ctx.fillText('GRAND EDITION', 128, 322)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

export function CricketBatMesh({ highlight = false }: { highlight?: boolean }) {
  const mrfTex = useMemo(() => createMrfStickerTexture(), [])
  useEffect(() => () => mrfTex.dispose(), [mrfTex])

  return (
    <group>
      {/* Classic MRF Red Ribbed Rubber Grip Handle */}
      <mesh position={[0, -0.11, 0]}>
        <cylinderGeometry args={[0.017, 0.019, 0.26, 12]} />
        <meshStandardMaterial color="#dc2626" roughness={0.82} />
      </mesh>
      {[-0.04, -0.09, -0.14, -0.19].map((gy, idx) => (
        <mesh key={idx} position={[0, gy, 0]}>
          <cylinderGeometry args={[0.0195, 0.0195, 0.018, 12]} />
          <meshStandardMaterial color="#111827" roughness={0.85} />
        </mesh>
      ))}
      {/* Cane Splice Shoulders */}
      <mesh position={[0, -0.255, 0]} scale={[1.8, 1, 0.8]}>
        <cylinderGeometry args={[0.022, 0.036, 0.07, 10]} />
        <meshStandardMaterial color="#e8c897" roughness={0.55} />
      </mesh>

      {/* English Willow Blade */}
      <mesh position={[0, -0.535, 0]}>
        <boxGeometry args={[0.108, 0.56, 0.036]} />
        <meshStandardMaterial
          color="#f7e4bc"
          roughness={0.48}
          emissive={highlight ? '#fbbf24' : '#000000'}
          emissiveIntensity={highlight ? 0.14 : 0}
        />
      </mesh>

      {/* Angled Back Spine Ridge */}
      <mesh position={[0, -0.525, 0.021]}>
        <boxGeometry args={[0.048, 0.53, 0.022]} />
        <meshStandardMaterial color="#edd3a1" roughness={0.48} />
      </mesh>

      {/* Front Face MRF Brand Sticker (-Z hitting face) */}
      <mesh position={[0, -0.51, -0.019]}>
        <planeGeometry args={[0.104, 0.44]} />
        <meshBasicMaterial map={mrfTex} />
      </mesh>

      {/* Back Spine MRF Sticker (+Z back) */}
      <mesh position={[0, -0.51, 0.033]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.092, 0.42]} />
        <meshBasicMaterial map={mrfTex} />
      </mesh>

      {/* Curved Protective Toe Guard */}
      <mesh position={[0, -0.82, 0]}>
        <boxGeometry args={[0.11, 0.022, 0.04]} />
        <meshStandardMaterial color="#111827" roughness={0.85} />
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

/**
 * Full sculpted Unity-3D-like Rigged Humanoid Cricket Player Body with:
 * - Continuous SkinnedMesh Athlete Silhouette + VRIK Arms (wearing team jersey + cricket whites)
 * - Sculpted HumanFaceHead + Cricket Helmet or Cap
 * - Front & Back Jersey Name + Squad Number + Batting/Keeper Leg Pads
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
  const overlayGroupRef = useRef<THREE.Group>(null)
  const upperBadgeRef = useRef<THREE.Group>(null)
  const headCapRef = useRef<THREE.Group>(null)
  const leftPadHipRef = useRef<THREE.Group>(null)
  const rightPadHipRef = useRef<THREE.Group>(null)
  const leftPadKneeRef = useRef<THREE.Group>(null)
  const rightPadKneeRef = useRef<THREE.Group>(null)

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

    const stride = Math.sin(anim.runPhase) * 0.56 * anim.runSpeed
    const pelvisDrop = anim.squat * 0.28 + Math.abs(Math.sin(anim.runPhase)) * 0.022 * anim.runSpeed
    const spread = anim.stanceSpread ?? 0
    const frontStride = anim.frontStride ?? 0
    const twist = anim.torsoTwist ?? 0
    const sitHip = anim.squat * 0.68
    const sitKnee = -anim.squat * 1.05

    if (overlayGroupRef.current) {
      overlayGroupRef.current.position.set(pos[0], pos[1], pos[2])
      overlayGroupRef.current.rotation.set(0, yaw, 0)
    }

    if (upperBadgeRef.current) {
      upperBadgeRef.current.position.set(0, 0.88 - pelvisDrop, 0)
      upperBadgeRef.current.rotation.set(anim.torsoLean + anim.diveTilt * 0.7, twist, 0)
    }

    if (headCapRef.current) {
      headCapRef.current.rotation.y = anim.headYawOffset ?? 0
    }

    if (leftPadHipRef.current && leftPadKneeRef.current) {
      leftPadHipRef.current.position.set(-0.098, 0.85 - pelvisDrop, 0)
      leftPadHipRef.current.rotation.set(stride + sitHip, 0, -(spread + Math.max(0, -frontStride)))
      leftPadKneeRef.current.rotation.set(-Math.max(0, -stride * 1.1) + sitKnee, 0, spread * 0.35)
    }
    if (rightPadHipRef.current && rightPadKneeRef.current) {
      rightPadHipRef.current.position.set(0.098, 0.85 - pelvisDrop, 0)
      rightPadHipRef.current.rotation.set(-stride + sitHip, 0, spread + Math.max(0, frontStride))
      rightPadKneeRef.current.rotation.set(-Math.max(0, stride * 1.1) + sitKnee, 0, -spread * 0.35)
    }
  })

  return (
    <group>
      <UnityHumanoidCharacter
        seedKey={playerName || role}
        gender="male"
        outfitColor={jerseyColor}
        accentColor={accentColor}
        pantsColor="#f8fafc"
        shoeColor={role === 'bowler' ? '#38bdf8' : '#ffffff'}
        uniformStyle="cricket"
        lookProfile={profile}
        hideHead
        getBodyAnchor={() => {
          const { pos, yaw } = getBodyAnchor()
          const anim = getAnimState?.() ?? {
            runPhase: 0,
            runSpeed: 0,
            squat: role === 'wicketkeeper' ? 0.65 : role === 'batter' ? 0.16 : 0,
            torsoLean: role === 'wicketkeeper' ? 0.25 : 0.05,
            diveTilt: 0,
          }
          return {
            pos,
            yaw,
            walkSpeed: anim.runSpeed,
            walkPhase: anim.runPhase,
            squat: anim.squat,
            torsoPitch: anim.torsoLean + anim.diveTilt * 0.7,
            torsoTwist: anim.torsoTwist ?? 0,
            headYaw: anim.headYawOffset ?? 0,
            stanceSpread: anim.stanceSpread ?? 0,
            frontStride: anim.frontStride ?? 0,
          }
        }}
        getLeftWrist={getLeftWrist}
        getRightWrist={getRightWrist}
      />

      {/* Synchronized Cricket Gear Overlay (Front/Back Jersey Numbers, Helmet/Cap, Batting Leg Pads) */}
      <group ref={overlayGroupRef}>
        <group ref={upperBadgeRef} position={[0, 0.88, 0]}>
          {/* Front Jersey Name & Number (-Z front chest) */}
          <TextLabel
            position={[0, 0.38, -0.142]}
            rotation={[0, Math.PI, 0]}
            fontSize={0.052}
            color="#f8fafc"
            outlineColor="#020617"
            outlineWidth={0.006}
          >
            {cleanName}
          </TextLabel>
          <TextLabel
            position={[0, 0.24, -0.132]}
            rotation={[0, Math.PI, 0]}
            fontSize={0.098}
            color={accentColor}
            outlineColor="#020617"
            outlineWidth={0.008}
          >
            {jerseyNumber}
          </TextLabel>

          {/* Back Jersey Name & Number (+Z upper back) */}
          <TextLabel
            position={[0, 0.39, 0.132]}
            rotation={[0, 0, 0]}
            fontSize={0.06}
            color="#f8fafc"
            outlineColor="#020617"
            outlineWidth={0.006}
          >
            {cleanName}
          </TextLabel>
          <TextLabel
            position={[0, 0.22, 0.125]}
            rotation={[0, 0, 0]}
            fontSize={0.125}
            color={accentColor}
            outlineColor="#020617"
            outlineWidth={0.008}
          >
            {jerseyNumber}
          </TextLabel>

          {!hideHead && (
            <group ref={headCapRef} position={[0, 0.66, 0]}>
              <HumanFaceHead
                profile={profile}
                showHair={role === 'bowler'}
                allowSunglasses={role === 'bowler'}
                hideNeck
              />
              {role === 'bowler' ? (
                <group position={[0, 0.058, 0]}>
                  <mesh scale={[1.01, 0.9, 1.04]}>
                    <sphereGeometry args={[0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                    <meshStandardMaterial color={jerseyColor} roughness={0.5} />
                  </mesh>
                  <mesh position={[0, -0.005, -0.136]} rotation={[0.15, 0, 0]}>
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

        {hasPads && (
          <>
            {[
              { hipRef: leftPadHipRef, kneeRef: leftPadKneeRef, x: -0.098 },
              { hipRef: rightPadHipRef, kneeRef: rightPadKneeRef, x: 0.098 },
            ].map(({ hipRef, kneeRef, x }, idx) => (
              <group key={idx} ref={hipRef} position={[x, 0.85, 0]}>
                <group ref={kneeRef} position={[0, -0.41, 0]}>
                  <group position={[0, -0.17, -0.054]}>
                    {[-0.036, 0, 0.036].map((bx, bi) => (
                      <mesh key={bi} position={[bx, 0, 0]}>
                        <cylinderGeometry args={[0.022, 0.02, 0.44, 8]} />
                        <meshStandardMaterial color="#ffffff" roughness={0.38} />
                      </mesh>
                    ))}
                    <mesh position={[0, 0.22, -0.005]}>
                      <boxGeometry args={[0.125, 0.085, 0.055]} />
                      <meshStandardMaterial color={jerseyColor} roughness={0.45} />
                    </mesh>
                    {[-0.12, 0.08].map((sy, si) => (
                      <mesh key={si} position={[0, sy, 0.044]}>
                        <cylinderGeometry args={[0.06, 0.06, 0.022, 12]} />
                        <meshStandardMaterial color="#e2e8f0" roughness={0.55} />
                      </mesh>
                    ))}
                  </group>
                </group>
              </group>
            ))}
          </>
        )}
      </group>
    </group>
  )
}
