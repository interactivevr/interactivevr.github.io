import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { AvatarGender } from '../types/game'

export interface AthleteLookProfile {
  skinColor: string
  skinShadow: string
  hairColor: string
  eyeColor: string
  lipColor: string
  hasBeard: boolean
  hairStyle: 'short' | 'fade' | 'curly' | 'ponytail' | 'long' | 'bob'
  hasSunglasses: boolean
}

const MALE_PRESETS: readonly AthleteLookProfile[] = [
  { skinColor: '#e2b18c', skinShadow: '#c78c67', hairColor: '#1f1712', eyeColor: '#3b2818', lipColor: '#b0645b', hasBeard: true, hairStyle: 'fade', hasSunglasses: false },
  { skinColor: '#c98b63', skinShadow: '#a66a44', hairColor: '#141110', eyeColor: '#291c14', lipColor: '#9c564f', hasBeard: true, hairStyle: 'short', hasSunglasses: true },
  { skinColor: '#8d5534', skinShadow: '#6c3e23', hairColor: '#111111', eyeColor: '#1f1612', lipColor: '#78413a', hasBeard: false, hairStyle: 'curly', hasSunglasses: false },
  { skinColor: '#f1c7a7', skinShadow: '#d49d79', hairColor: '#4b3320', eyeColor: '#2563eb', lipColor: '#be6e67', hasBeard: false, hairStyle: 'short', hasSunglasses: false },
  { skinColor: '#b57850', skinShadow: '#8e5735', hairColor: '#181412', eyeColor: '#2b1e16', lipColor: '#944f48', hasBeard: true, hairStyle: 'curly', hasSunglasses: true },
  { skinColor: '#d9a17b', skinShadow: '#b87d58', hairColor: '#2c1e16', eyeColor: '#15803d', lipColor: '#ab6058', hasBeard: false, hairStyle: 'fade', hasSunglasses: false },
] as const

const FEMALE_PRESETS: readonly AthleteLookProfile[] = [
  { skinColor: '#ecc09e', skinShadow: '#cf9873', hairColor: '#241711', eyeColor: '#3b2818', lipColor: '#b9535c', hasBeard: false, hairStyle: 'long', hasSunglasses: false },
  { skinColor: '#cfa07a', skinShadow: '#ac7953', hairColor: '#161110', eyeColor: '#2c1d13', lipColor: '#a64952', hasBeard: false, hairStyle: 'ponytail', hasSunglasses: false },
  { skinColor: '#935c3b', skinShadow: '#714227', hairColor: '#121010', eyeColor: '#241711', lipColor: '#8d3f48', hasBeard: false, hairStyle: 'curly', hasSunglasses: false },
  { skinColor: '#f3ccb0', skinShadow: '#d6a483', hairColor: '#5c3921', eyeColor: '#2563eb', lipColor: '#c76168', hasBeard: false, hairStyle: 'bob', hasSunglasses: false },
  { skinColor: '#be845d', skinShadow: '#98603c', hairColor: '#1d1410', eyeColor: '#15803d', lipColor: '#ad4f57', hasBeard: false, hairStyle: 'ponytail', hasSunglasses: false },
  { skinColor: '#dfb08c', skinShadow: '#bd8964', hairColor: '#382214', eyeColor: '#4338ca', lipColor: '#bf5962', hasBeard: false, hairStyle: 'long', hasSunglasses: false },
] as const

export function getAthleteProfile(seedKey: string | number, gender: AvatarGender = 'male'): AthleteLookProfile {
  const pool = gender === 'female' ? FEMALE_PRESETS : MALE_PRESETS
  if (typeof seedKey === 'number') {
    return pool[Math.abs(seedKey) % pool.length]
  }
  let hash = 0
  for (let i = 0; i < seedKey.length; i++) {
    hash = (hash * 31 + seedKey.charCodeAt(i)) | 0
  }
  return pool[Math.abs(hash) % pool.length]
}

function createSkinCanvasTexture(profile: AthleteLookProfile, gender: AvatarGender): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  // High-DPI shaded facial skin gradient with forehead/cheek highlights & jaw depth
  const grad = ctx.createRadialGradient(256, 224, 56, 256, 260, 270)
  grad.addColorStop(0, profile.skinColor)
  grad.addColorStop(0.7, profile.skinColor)
  grad.addColorStop(1, profile.skinShadow)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 512, 512)

  // Soft cheekbone blush & warmth
  ctx.fillStyle = gender === 'female' ? 'rgba(225, 105, 110, 0.16)' : 'rgba(210, 110, 95, 0.11)'
  ctx.beginPath()
  ctx.ellipse(178, 286, 46, 28, -0.1, 0, Math.PI * 2)
  ctx.ellipse(334, 286, 46, 28, 0.1, 0, Math.PI * 2)
  ctx.fill()

  // Subtle nose bridge highlight & temple shading
  ctx.fillStyle = 'rgba(255, 240, 225, 0.12)'
  ctx.fillRect(244, 210, 24, 92)

  // Optional stubble / beard shading on lower jaw (male only)
  if (profile.hasBeard && gender === 'male') {
    ctx.fillStyle = 'rgba(20, 15, 12, 0.34)'
    ctx.beginPath()
    ctx.ellipse(256, 396, 124, 92, 0, 0, Math.PI)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/**
 * Detailed sculpted 3D human head with realistic face features (3D eyes with blinking,
 * eyebrows, eyelashes, nose, lips, ears, styled 3D hair for male/female profiles, and neck).
 */
export function HumanFaceHead({
  profile,
  gender = 'male',
  showHair = true,
  allowSunglasses = true,
  hairOffsetRef,
}: {
  profile: AthleteLookProfile
  gender?: AvatarGender
  showHair?: boolean
  allowSunglasses?: boolean
  hairOffsetRef?: React.MutableRefObject<[number, number, number]>
}) {
  const leftLidRef = useRef<THREE.Mesh>(null)
  const rightLidRef = useRef<THREE.Mesh>(null)
  const hairGroupRef = useRef<THREE.Group>(null)
  const blinkSeed = useMemo(() => Math.random() * 4.5, [])

  const skinTex = useMemo(() => createSkinCanvasTexture(profile, gender), [profile, gender])
  useEffect(() => {
    return () => skinTex.dispose()
  }, [skinTex])

  const isFemale = gender === 'female'

  useFrame((state) => {
    const cycle = (state.clock.elapsedTime + blinkSeed) % 3.6
    const blinking = cycle > 3.46
    const scaleY = blinking ? 1.0 : 0.05
    if (leftLidRef.current) leftLidRef.current.scale.y = scaleY
    if (rightLidRef.current) rightLidRef.current.scale.y = scaleY

    if (hairGroupRef.current && hairOffsetRef) {
      const ho = hairOffsetRef.current
      hairGroupRef.current.position.set(ho[0], 0.032 + ho[1], 0.006 + ho[2])
      hairGroupRef.current.rotation.set(ho[2] * 2.2, 0, -ho[0] * 2.5)
    }
  })

  return (
    <group>
      {/* Anatomical Neck (slightly slenderer for female preset) */}
      <mesh position={[0, -0.145, 0.015]}>
        <cylinderGeometry args={[isFemale ? 0.044 : 0.054, isFemale ? 0.052 : 0.064, 0.125, 16]} />
        <meshStandardMaterial color={profile.skinShadow} roughness={0.6} />
      </mesh>

      {/* Sculpted Cranium & Facial Volume */}
      <mesh scale={[isFemale ? 0.88 : 0.92, 1.07, 0.97]}>
        <sphereGeometry args={[0.126, 26, 20]} />
        <meshStandardMaterial map={skinTex} roughness={0.55} metalness={0.02} />
      </mesh>
      {/* Cheekbones & Tapered Chin / Jawline */}
      <mesh position={[0, -0.054, -0.022]} scale={[isFemale ? 0.68 : 0.78, 0.84, 0.86]}>
        <sphereGeometry args={[0.092, 18, 14]} />
        <meshStandardMaterial map={skinTex} roughness={0.56} />
      </mesh>

      {/* Left & Right Ears */}
      {[-0.116, 0.116].map((ex, i) => (
        <mesh key={i} position={[ex, -0.005, 0.008]} scale={[0.35, 0.95, 0.65]}>
          <sphereGeometry args={[0.03, 10, 8]} />
          <meshStandardMaterial color={profile.skinShadow} roughness={0.65} />
        </mesh>
      ))}

      {/* Sculpted 3D Nose Bridge + Tip */}
      <mesh position={[0, -0.004, -0.122]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[0.022, 0.044, 0.028]} />
        <meshStandardMaterial color={profile.skinColor} roughness={0.56} />
      </mesh>
      <mesh position={[0, -0.022, -0.132]}>
        <sphereGeometry args={[0.014, 10, 8]} />
        <meshStandardMaterial color={profile.skinColor} roughness={0.56} />
      </mesh>

      {/* Left & Right Eyes (Sclera + Colored Iris + Pupil + Blinking Eyelid) */}
      {[-0.04, 0.04].map((ex, i) => (
        <group key={i} position={[ex, 0.018, -0.11]}>
          {/* Sclera */}
          <mesh scale={[1.15, 0.85, 0.65]}>
            <sphereGeometry args={[0.016, 12, 10]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.25} />
          </mesh>
          {/* Iris */}
          <mesh position={[0, 0, -0.0075]} scale={[1, 1, 0.45]}>
            <sphereGeometry args={[0.0085, 12, 10]} />
            <meshStandardMaterial color={profile.eyeColor} roughness={0.14} metalness={0.08} />
          </mesh>
          {/* Pupil */}
          <mesh position={[0, 0, -0.01]} scale={[1, 1, 0.4]}>
            <sphereGeometry args={[0.0044, 8, 8]} />
            <meshBasicMaterial color="#09090b" />
          </mesh>
          {/* Subtle upper eyelashes */}
          {isFemale && (
            <mesh position={[0, 0.011, -0.009]} rotation={[0.18, 0, i === 0 ? 0.12 : -0.12]}>
              <boxGeometry args={[0.03, 0.003, 0.006]} />
              <meshBasicMaterial color="#18181b" />
            </mesh>
          )}
          {/* Eyelid */}
          <mesh
            ref={i === 0 ? leftLidRef : rightLidRef}
            position={[0, 0.002, -0.004]}
            scale={[1.2, 0.05, 0.72]}
          >
            <sphereGeometry args={[0.0165, 10, 8]} />
            <meshStandardMaterial color={profile.skinShadow} roughness={0.6} />
          </mesh>
        </group>
      ))}

      {/* Sculpted Eyebrows */}
      {[-0.04, 0.04].map((ex, i) => (
        <mesh
          key={i}
          position={[ex, 0.042, -0.113]}
          rotation={[0, 0, (i === 0 ? 1 : -1) * (isFemale ? 0.14 : 0.08)]}
        >
          <boxGeometry args={[0.034, isFemale ? 0.0055 : 0.0085, 0.012]} />
          <meshStandardMaterial color={profile.hairColor} roughness={0.8} />
        </mesh>
      ))}

      {/* Mouth / Sculpted Upper & Lower Lips */}
      <mesh position={[0, -0.062, -0.111]} scale={[isFemale ? 1.25 : 1.35, isFemale ? 0.62 : 0.52, 0.65]}>
        <sphereGeometry args={[0.018, 14, 10]} />
        <meshStandardMaterial color={profile.lipColor} roughness={0.42} />
      </mesh>
      {/* Mouth line / expression */}
      <mesh position={[0, -0.061, -0.121]}>
        <boxGeometry args={[0.032, 0.0025, 0.004]} />
        <meshBasicMaterial color="#4a221d" />
      </mesh>

      {/* 3D Chin & Jaw Beard (Male only) */}
      {!isFemale && profile.hasBeard && (
        <group>
          <mesh position={[0, -0.072, -0.056]} scale={[0.84, 0.78, 0.82]}>
            <sphereGeometry args={[0.088, 14, 10, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58]} />
            <meshStandardMaterial color={profile.hairColor} roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.045, -0.118]}>
            <boxGeometry args={[0.046, 0.009, 0.014]} />
            <meshStandardMaterial color={profile.hairColor} roughness={0.9} />
          </mesh>
        </group>
      )}

      {/* Optional Athletic Sunglasses (for fielders/bowlers) */}
      {allowSunglasses && profile.hasSunglasses && (
        <group position={[0, 0.019, -0.122]}>
          <mesh position={[-0.04, 0, 0]}>
            <boxGeometry args={[0.048, 0.025, 0.01]} />
            <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.15} emissive="#0284c7" emissiveIntensity={0.22} />
          </mesh>
          <mesh position={[0.04, 0, 0]}>
            <boxGeometry args={[0.048, 0.025, 0.01]} />
            <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.15} emissive="#0284c7" emissiveIntensity={0.22} />
          </mesh>
          <mesh position={[0, 0.006, 0]}>
            <boxGeometry args={[0.024, 0.006, 0.008]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.6} />
          </mesh>
        </group>
      )}

      {/* Sculpted 3D Hair for Male & Female Presets */}
      {showHair && (
        <group ref={hairGroupRef} position={[0, 0.032, 0.006]}>
          <mesh scale={[isFemale ? 0.94 : 0.96, 0.96, 1.0]}>
            <sphereGeometry args={[0.128, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
            <meshStandardMaterial color={profile.hairColor} roughness={0.78} />
          </mesh>
          {profile.hairStyle === 'curly' && (
            <mesh position={[0, 0.068, -0.02]} scale={[1.05, 0.65, 1.02]}>
              <sphereGeometry args={[0.105, 14, 10]} />
              <meshStandardMaterial color={profile.hairColor} roughness={0.92} />
            </mesh>
          )}
          {profile.hairStyle === 'short' && (
            <mesh position={[0, 0.072, -0.035]} rotation={[-0.25, 0, 0]} scale={[1.0, 0.52, 0.95]}>
              <sphereGeometry args={[0.095, 12, 10]} />
              <meshStandardMaterial color={profile.hairColor} roughness={0.82} />
            </mesh>
          )}
          {(profile.hairStyle === 'long' || profile.hairStyle === 'bob') && (
            <group>
              {/* Back hair cape draping behind neck/shoulders */}
              <mesh position={[0, -0.11, 0.072]} rotation={[0.14, 0, 0]} scale={[1.1, 1.0, 0.46]}>
                <cylinderGeometry
                  args={[0.118, profile.hairStyle === 'long' ? 0.138 : 0.122, profile.hairStyle === 'long' ? 0.34 : 0.18, 18]}
                />
                <meshStandardMaterial color={profile.hairColor} roughness={0.72} />
              </mesh>
              {/* Left & Right framing locks */}
              {[-0.098, 0.098].map((hx, idx) => (
                <mesh
                  key={idx}
                  position={[hx, -0.085, -0.01]}
                  rotation={[0.08, 0, idx === 0 ? -0.12 : 0.12]}
                >
                  <capsuleGeometry args={[0.028, profile.hairStyle === 'long' ? 0.22 : 0.11, 6, 10]} />
                  <meshStandardMaterial color={profile.hairColor} roughness={0.72} />
                </mesh>
              ))}
            </group>
          )}
          {profile.hairStyle === 'ponytail' && (
            <group position={[0, 0.02, 0.12]}>
              <mesh rotation={[0.85, 0, 0]}>
                <torusGeometry args={[0.024, 0.008, 8, 16]} />
                <meshStandardMaterial color="#f43f5e" roughness={0.45} />
              </mesh>
              <mesh position={[0, -0.12, 0.06]} rotation={[-0.45, 0, 0]}>
                <capsuleGeometry args={[0.032, 0.2, 8, 12]} />
                <meshStandardMaterial color={profile.hairColor} roughness={0.74} />
              </mesh>
            </group>
          )}
        </group>
      )}
    </group>
  )
}
