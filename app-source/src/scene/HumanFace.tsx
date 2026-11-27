import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

export interface AthleteLookProfile {
  skinColor: string
  skinShadow: string
  hairColor: string
  eyeColor: string
  hasBeard: boolean
  hairStyle: 'short' | 'fade' | 'curly'
  hasSunglasses: boolean
}

const ATHLETE_PRESETS: readonly AthleteLookProfile[] = [
  { skinColor: '#e2b18c', skinShadow: '#c78c67', hairColor: '#1f1712', eyeColor: '#3b2818', hasBeard: true, hairStyle: 'fade', hasSunglasses: false },
  { skinColor: '#c98b63', skinShadow: '#a66a44', hairColor: '#141110', eyeColor: '#291c14', hasBeard: true, hairStyle: 'short', hasSunglasses: true },
  { skinColor: '#8d5534', skinShadow: '#6c3e23', hairColor: '#111111', eyeColor: '#1f1612', hasBeard: false, hairStyle: 'curly', hasSunglasses: false },
  { skinColor: '#f1c7a7', skinShadow: '#d49d79', hairColor: '#4b3320', eyeColor: '#2563eb', hasBeard: false, hairStyle: 'short', hasSunglasses: false },
  { skinColor: '#b57850', skinShadow: '#8e5735', hairColor: '#181412', eyeColor: '#2b1e16', hasBeard: true, hairStyle: 'curly', hasSunglasses: true },
  { skinColor: '#d9a17b', skinShadow: '#b87d58', hairColor: '#2c1e16', eyeColor: '#15803d', hasBeard: false, hairStyle: 'fade', hasSunglasses: false },
] as const

export function getAthleteProfile(seedKey: string | number): AthleteLookProfile {
  if (typeof seedKey === 'number') {
    return ATHLETE_PRESETS[Math.abs(seedKey) % ATHLETE_PRESETS.length]
  }
  let hash = 0
  for (let i = 0; i < seedKey.length; i++) {
    hash = (hash * 31 + seedKey.charCodeAt(i)) | 0
  }
  return ATHLETE_PRESETS[Math.abs(hash) % ATHLETE_PRESETS.length]
}

function createSkinCanvasTexture(profile: AthleteLookProfile): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  // Soft shaded skin gradient (warm cheek highlights + subtle jaw shadow)
  const grad = ctx.createRadialGradient(128, 118, 28, 128, 132, 138)
  grad.addColorStop(0, profile.skinColor)
  grad.addColorStop(0.75, profile.skinColor)
  grad.addColorStop(1, profile.skinShadow)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 256, 256)

  // Subtle rosy athletic cheek blush
  ctx.fillStyle = 'rgba(220, 110, 95, 0.14)'
  ctx.beginPath()
  ctx.ellipse(90, 142, 22, 14, 0, 0, Math.PI * 2)
  ctx.ellipse(166, 142, 22, 14, 0, 0, Math.PI * 2)
  ctx.fill()

  // Optional stubble / beard shading on lower jaw
  if (profile.hasBeard) {
    ctx.fillStyle = 'rgba(20, 15, 12, 0.34)'
    ctx.beginPath()
    ctx.ellipse(128, 198, 62, 46, 0, 0, Math.PI)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/**
 * Detailed sculpted 3D human head with realistic face features (3D eyes with blinking,
 * eyebrows, nose, lips, ears, sculpted hair, optional beard & sunglasses, and neck).
 */
export function HumanFaceHead({
  profile,
  showHair = true,
  allowSunglasses = true,
}: {
  profile: AthleteLookProfile
  showHair?: boolean
  allowSunglasses?: boolean
}) {
  const leftLidRef = useRef<THREE.Mesh>(null)
  const rightLidRef = useRef<THREE.Mesh>(null)
  const blinkSeed = useMemo(() => Math.random() * 4.5, [])

  const skinTex = useMemo(() => createSkinCanvasTexture(profile), [profile])
  useEffect(() => {
    return () => skinTex.dispose()
  }, [skinTex])

  useFrame((state) => {
    // Natural periodic blink every ~3.5 seconds
    const cycle = (state.clock.elapsedTime + blinkSeed) % 3.6
    const blinking = cycle > 3.46
    const scaleY = blinking ? 1.0 : 0.05
    if (leftLidRef.current) leftLidRef.current.scale.y = scaleY
    if (rightLidRef.current) rightLidRef.current.scale.y = scaleY
  })

  return (
    <group>
      {/* Anatomical Neck */}
      <mesh position={[0, -0.145, 0.015]}>
        <cylinderGeometry args={[0.054, 0.064, 0.12, 12]} />
        <meshStandardMaterial color={profile.skinShadow} roughness={0.62} />
      </mesh>

      {/* Sculpted Cranium & Jaw (slight athletic oval along Y and Z) */}
      <mesh scale={[0.92, 1.08, 0.98]}>
        <sphereGeometry args={[0.128, 22, 18]} />
        <meshStandardMaterial map={skinTex} roughness={0.58} metalness={0.02} />
      </mesh>
      {/* Lower Jaw / Chin sculpt */}
      <mesh position={[0, -0.055, -0.024]} scale={[0.78, 0.85, 0.88]}>
        <sphereGeometry args={[0.095, 16, 12]} />
        <meshStandardMaterial map={skinTex} roughness={0.6} />
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
            <sphereGeometry args={[0.0085, 10, 8]} />
            <meshStandardMaterial color={profile.eyeColor} roughness={0.2} />
          </mesh>
          {/* Pupil */}
          <mesh position={[0, 0, -0.01]} scale={[1, 1, 0.4]}>
            <sphereGeometry args={[0.0044, 8, 8]} />
            <meshBasicMaterial color="#09090b" />
          </mesh>
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
          rotation={[0, 0, i === 0 ? 0.08 : -0.08]}
        >
          <boxGeometry args={[0.036, 0.008, 0.014]} />
          <meshStandardMaterial color={profile.hairColor} roughness={0.8} />
        </mesh>
      ))}

      {/* Mouth / Lips */}
      <mesh position={[0, -0.062, -0.111]} scale={[1.35, 0.52, 0.65]}>
        <sphereGeometry args={[0.018, 12, 8]} />
        <meshStandardMaterial color="#a85a52" roughness={0.5} />
      </mesh>
      {/* Mouth line / athletic expression */}
      <mesh position={[0, -0.061, -0.121]}>
        <boxGeometry args={[0.036, 0.003, 0.004]} />
        <meshBasicMaterial color="#4a221d" />
      </mesh>

      {/* 3D Chin & Jaw Beard */}
      {profile.hasBeard && (
        <group>
          <mesh position={[0, -0.072, -0.056]} scale={[0.84, 0.78, 0.82]}>
            <sphereGeometry args={[0.088, 14, 10, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58]} />
            <meshStandardMaterial color={profile.hairColor} roughness={0.9} />
          </mesh>
          {/* Mustache */}
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

      {/* Sculpted 3D Hair */}
      {showHair && (
        <group position={[0, 0.032, 0.006]}>
          <mesh scale={[0.96, 0.96, 1.0]}>
            <sphereGeometry args={[0.128, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.54]} />
            <meshStandardMaterial color={profile.hairColor} roughness={0.85} />
          </mesh>
          {profile.hairStyle === 'curly' && (
            <mesh position={[0, 0.068, -0.02]} scale={[1.05, 0.65, 1.02]}>
              <sphereGeometry args={[0.105, 14, 10]} />
              <meshStandardMaterial color={profile.hairColor} roughness={0.95} />
            </mesh>
          )}
          {profile.hairStyle === 'short' && (
            <mesh position={[0, 0.072, -0.035]} rotation={[-0.25, 0, 0]} scale={[1.0, 0.52, 0.95]}>
              <sphereGeometry args={[0.095, 12, 10]} />
              <meshStandardMaterial color={profile.hairColor} roughness={0.85} />
            </mesh>
          )}
        </group>
      )}
    </group>
  )
}
