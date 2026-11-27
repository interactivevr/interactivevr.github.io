import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { AvatarGender } from '../types/game'
import { buildUnitySculptedHeadGeometry, createUnityFaceTexture } from './unityHumanoidBuilder'

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

function createIrisCanvasTexture(eyeColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = eyeColor
  ctx.fillRect(0, 0, 128, 128)
  const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 62)
  grad.addColorStop(0, '#09090b')
  grad.addColorStop(0.32, eyeColor)
  grad.addColorStop(0.84, eyeColor)
  grad.addColorStop(1, '#09090b')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
  ctx.lineWidth = 1.6
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(64 + Math.cos(a) * 16, 64 + Math.sin(a) * 16)
    ctx.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function createHairTexture(hairColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = hairColor
  ctx.fillRect(0, 0, 256, 256)
  for (let x = 0; x < 256; x += 3) {
    ctx.fillStyle = x % 6 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.16)'
    ctx.fillRect(x, 0, 1.5, 256)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}

/**
 * Unity-grade sculpted continuous 3D human head with anatomical orbital eye sockets,
 * continuous nasal bridge + nostrils, sculpted cheekbones & lips, glossy clearcoat eyes,
 * responsive blinking eyelids, and layered hair mesh.
 */
export function HumanFaceHead({
  profile,
  gender = 'male',
  showHair = true,
  allowSunglasses = true,
  hideNeck = false,
  hairOffsetRef,
}: {
  profile: AthleteLookProfile
  gender?: AvatarGender
  showHair?: boolean
  allowSunglasses?: boolean
  hideNeck?: boolean
  hairOffsetRef?: React.MutableRefObject<[number, number, number]>
}) {
  const leftLidRef = useRef<THREE.Mesh>(null)
  const rightLidRef = useRef<THREE.Mesh>(null)
  const hairGroupRef = useRef<THREE.Group>(null)
  const blinkSeed = useMemo(() => Math.random() * 4.5, [])

  const isFemale = gender === 'female'

  const headGeo = useMemo(() => buildUnitySculptedHeadGeometry(gender), [gender])
  const skinTex = useMemo(() => createUnityFaceTexture(profile, gender), [profile, gender])
  const irisTex = useMemo(() => createIrisCanvasTexture(profile.eyeColor), [profile.eyeColor])
  const hairTex = useMemo(() => createHairTexture(profile.hairColor), [profile.hairColor])

  useEffect(() => {
    return () => {
      headGeo.dispose()
      skinTex.dispose()
      irisTex.dispose()
      hairTex.dispose()
    }
  }, [headGeo, skinTex, irisTex, hairTex])

  useFrame((state) => {
    const cycle = (state.clock.elapsedTime + blinkSeed) % 3.8
    const blinking = cycle > 3.65
    const scaleY = blinking ? 1.0 : 0.06
    if (leftLidRef.current) leftLidRef.current.scale.y = scaleY
    if (rightLidRef.current) rightLidRef.current.scale.y = scaleY

    if (hairGroupRef.current && hairOffsetRef) {
      const ho = hairOffsetRef.current
      hairGroupRef.current.position.set(ho[0], 0.022 + ho[1], 0.004 + ho[2])
      hairGroupRef.current.rotation.set(ho[2] * 2.2, 0, -ho[0] * 2.5)
    }
  })

  return (
    <group>
      {/* Optional neck only for legacy disconnected mounts; SkinnedMesh includes continuous neck */}
      {!hideNeck && (
        <mesh position={[0, -0.145, 0.014]}>
          <cylinderGeometry args={[isFemale ? 0.044 : 0.054, isFemale ? 0.052 : 0.064, 0.125, 16]} />
          <meshStandardMaterial color={profile.skinShadow} roughness={0.56} />
        </mesh>
      )}

      {/* Continuous Sculpted High-Poly 3D Head & Facial Topography */}
      <mesh geometry={headGeo} castShadow receiveShadow>
        <meshStandardMaterial map={skinTex} roughness={0.5} metalness={0.02} />
      </mesh>

      {/* Recessed Glossy 3D Eyeballs seated cleanly inside orbital eye sockets */}
      {[-0.036, 0.036].map((ex, i) => (
        <group key={i} position={[ex, 0.017, -0.095]}>
          {/* Sclera */}
          <mesh scale={[1.05, 0.92, 0.92]}>
            <sphereGeometry args={[0.0145, 16, 14]} />
            <meshPhysicalMaterial color="#f8fafc" roughness={0.14} clearcoat={0.9} clearcoatRoughness={0.08} />
          </mesh>
          {/* Radial Iris */}
          <mesh position={[0, 0, -0.0085]} scale={[1, 1, 0.55]}>
            <sphereGeometry args={[0.0076, 16, 12]} />
            <meshPhysicalMaterial map={irisTex} roughness={0.08} clearcoat={1.0} clearcoatRoughness={0.04} />
          </mesh>
          {/* Specular Corneal Highlight */}
          <mesh position={[-0.0025, 0.0026, -0.0128]}>
            <sphereGeometry args={[0.0016, 6, 6]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          {/* Deep Pupil */}
          <mesh position={[0, 0, -0.0112]} scale={[1, 1, 0.45]}>
            <sphereGeometry args={[0.0038, 10, 8]} />
            <meshBasicMaterial color="#09090b" />
          </mesh>
          {/* Upper lash ridge */}
          <mesh position={[0, 0.01, -0.0085]} rotation={[0.15, 0, i === 0 ? 0.1 : -0.1]}>
            <boxGeometry args={[0.024, isFemale ? 0.003 : 0.002, 0.005]} />
            <meshBasicMaterial color="#18181b" />
          </mesh>
          {/* Blinking upper eyelid conforming to orbital curve */}
          <mesh
            ref={i === 0 ? leftLidRef : rightLidRef}
            position={[0, 0.002, -0.0025]}
            scale={[1.15, 0.06, 0.96]}
          >
            <sphereGeometry args={[0.015, 12, 10]} />
            <meshStandardMaterial color={profile.skinShadow} roughness={0.55} />
          </mesh>
        </group>
      ))}

      {/* Optional Athletic Sunglasses */}
      {allowSunglasses && profile.hasSunglasses && (
        <group position={[0, 0.018, -0.114]}>
          <mesh position={[-0.036, 0, 0]}>
            <boxGeometry args={[0.045, 0.023, 0.009]} />
            <meshStandardMaterial color="#0f172a" metalness={0.78} roughness={0.14} emissive="#0284c7" emissiveIntensity={0.2} />
          </mesh>
          <mesh position={[0.036, 0, 0]}>
            <boxGeometry args={[0.045, 0.023, 0.009]} />
            <meshStandardMaterial color="#0f172a" metalness={0.78} roughness={0.14} emissive="#0284c7" emissiveIntensity={0.2} />
          </mesh>
          <mesh position={[0, 0.005, 0]}>
            <boxGeometry args={[0.022, 0.005, 0.007]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.65} />
          </mesh>
        </group>
      )}

      {/* Sculpted Multi-Layered 3D Strand-Textured Hair (all-angle front/back/side/top coverage!) */}
      {showHair && (
        <group ref={hairGroupRef} position={[0, 0.022, 0.004]}>
          {/* Fitted cranial hair cap wrapping top, temples & occipital nape */}
          <mesh position={[0, 0.006, 0.006]} scale={[isFemale ? 0.91 : 0.96, 1.02, 0.99]}>
            <sphereGeometry args={[0.121, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
            <meshStandardMaterial map={hairTex} roughness={0.68} />
          </mesh>
          {/* Occipital back-of-head hairline coverage (clean from behind!) */}
          <mesh position={[0, -0.045, 0.058]} rotation={[0.12, 0, 0]} scale={[isFemale ? 0.9 : 0.94, 1, 0.62]}>
            <cylinderGeometry args={[0.098, isFemale ? 0.092 : 0.068, 0.09, 18]} />
            <meshStandardMaterial map={hairTex} roughness={0.7} />
          </mesh>

          {profile.hairStyle === 'fade' && (
            <group>
              <mesh position={[0, 0.072, -0.028]} rotation={[-0.22, 0, 0]} scale={[0.92, 0.44, 0.92]}>
                <sphereGeometry args={[0.088, 18, 12]} />
                <meshStandardMaterial map={hairTex} roughness={0.65} />
              </mesh>
              {[-0.04, 0, 0.04].map((xOff, k) => (
                <mesh key={k} position={[xOff, 0.088, -0.05]} rotation={[-0.45, 0, xOff * 1.4]}>
                  <capsuleGeometry args={[0.022, 0.045, 6, 10]} />
                  <meshStandardMaterial map={hairTex} roughness={0.65} />
                </mesh>
              ))}
            </group>
          )}

          {profile.hairStyle === 'curly' && (
            <group>
              {[
                [0, 0.086, -0.025, 0.068],
                [-0.055, 0.068, -0.01, 0.052],
                [0.055, 0.068, -0.01, 0.052],
                [0, 0.052, 0.055, 0.06],
              ].map(([cx, cy, cz, r], idx) => (
                <mesh key={idx} position={[cx, cy, cz]}>
                  <sphereGeometry args={[r, 14, 12]} />
                  <meshStandardMaterial map={hairTex} roughness={0.82} />
                </mesh>
              ))}
            </group>
          )}

          {profile.hairStyle === 'short' && (
            <mesh position={[0, 0.068, -0.032]} rotation={[-0.22, 0, 0]} scale={[0.98, 0.48, 0.94]}>
              <sphereGeometry args={[0.094, 18, 12]} />
              <meshStandardMaterial map={hairTex} roughness={0.7} />
            </mesh>
          )}

          {(profile.hairStyle === 'long' || profile.hairStyle === 'bob') && (
            <group>
              {/* Layered curved flowing back hair cape hugging shoulders naturally */}
              <mesh position={[0, -0.105, 0.072]} rotation={[0.14, 0, 0]} scale={[1.04, 1.0, 0.48]}>
                <cylinderGeometry
                  args={[0.105, profile.hairStyle === 'long' ? 0.132 : 0.115, profile.hairStyle === 'long' ? 0.31 : 0.17, 22]}
                />
                <meshStandardMaterial map={hairTex} roughness={0.62} />
              </mesh>
              {/* Side framing locks + swept front fringe */}
              {[-0.088, 0.088].map((hx, idx) => (
                <mesh
                  key={idx}
                  position={[hx, -0.078, -0.006]}
                  rotation={[0.08, 0, idx === 0 ? -0.12 : 0.12]}
                >
                  <capsuleGeometry args={[0.024, profile.hairStyle === 'long' ? 0.21 : 0.11, 8, 12]} />
                  <meshStandardMaterial map={hairTex} roughness={0.62} />
                </mesh>
              ))}
              <mesh position={[0.02, 0.068, -0.065]} rotation={[0.5, 0.35, -0.2]} scale={[1.25, 0.45, 0.5]}>
                <sphereGeometry args={[0.058, 14, 10]} />
                <meshStandardMaterial map={hairTex} roughness={0.62} />
              </mesh>
            </group>
          )}

          {profile.hairStyle === 'ponytail' && (
            <group position={[0, 0.02, 0.112]}>
              <mesh rotation={[0.85, 0, 0]}>
                <torusGeometry args={[0.022, 0.007, 10, 18]} />
                <meshStandardMaterial color="#f43f5e" roughness={0.42} />
              </mesh>
              <mesh position={[0, -0.11, 0.055]} rotation={[-0.42, 0, 0]}>
                <capsuleGeometry args={[0.028, 0.19, 10, 14]} />
                <meshStandardMaterial map={hairTex} roughness={0.62} />
              </mesh>
              <mesh position={[0, -0.22, 0.11]} rotation={[-0.2, 0, 0]}>
                <coneGeometry args={[0.026, 0.09, 12]} />
                <meshStandardMaterial map={hairTex} roughness={0.62} />
              </mesh>
            </group>
          )}
        </group>
      )}
    </group>
  )
}
