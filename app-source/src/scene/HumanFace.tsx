import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { AvatarGender } from '../types/game'
import {
  buildSculptedLongHairGeometry,
  buildUnitySculptedHeadGeometry,
  createUnityFaceTexture,
} from './unityHumanoidBuilder'

export interface AthleteLookProfile {
  skinColor: string
  skinShadow: string
  hairColor: string
  eyeColor: string
  lipColor: string
  hasBeard: boolean
  hairStyle: 'short' | 'fade' | 'curly' | 'ponytail' | 'long' | 'bob' | 'center-long'
  hasSunglasses: boolean
}

const MALE_PRESETS: readonly AthleteLookProfile[] = [
  { skinColor: '#f5d2ba', skinShadow: '#dfb094', hairColor: '#3b2922', eyeColor: '#4a2511', lipColor: '#c97b72', hasBeard: false, hairStyle: 'short', hasSunglasses: false },
  { skinColor: '#c98b63', skinShadow: '#a66a44', hairColor: '#141110', eyeColor: '#291c14', lipColor: '#9c564f', hasBeard: true, hairStyle: 'short', hasSunglasses: true },
  { skinColor: '#8d5534', skinShadow: '#6c3e23', hairColor: '#111111', eyeColor: '#1f1612', lipColor: '#78413a', hasBeard: false, hairStyle: 'curly', hasSunglasses: false },
  { skinColor: '#f1c7a7', skinShadow: '#d49d79', hairColor: '#4b3320', eyeColor: '#2563eb', lipColor: '#be6e67', hasBeard: false, hairStyle: 'short', hasSunglasses: false },
  { skinColor: '#b57850', skinShadow: '#8e5735', hairColor: '#181412', eyeColor: '#2b1e16', lipColor: '#944f48', hasBeard: true, hairStyle: 'curly', hasSunglasses: true },
  { skinColor: '#d9a17b', skinShadow: '#b87d58', hairColor: '#2c1e16', eyeColor: '#15803d', lipColor: '#ab6058', hasBeard: false, hairStyle: 'fade', hasSunglasses: false },
] as const

const FEMALE_PRESETS: readonly AthleteLookProfile[] = [
  // Flagship 20yo Cute Western Female Look: true warm peach-rose girl skin, sunlit honey-chestnut center-parted hair,
  // sparkling sky-blue/hazel eyes & soft coral-rose smile
  { skinColor: '#f4c6ae', skinShadow: '#de9a7f', hairColor: '#7b553c', eyeColor: '#2d6cdf', lipColor: '#e07b82', hasBeard: false, hairStyle: 'center-long', hasSunglasses: false },
  { skinColor: '#d9a47e', skinShadow: '#b47852', hairColor: '#2c1e18', eyeColor: '#2c1d13', lipColor: '#ab4b54', hasBeard: false, hairStyle: 'ponytail', hasSunglasses: false },
  { skinColor: '#9b613f', skinShadow: '#764528', hairColor: '#121010', eyeColor: '#241711', lipColor: '#8d3f48', hasBeard: false, hairStyle: 'curly', hasSunglasses: false },
  { skinColor: '#f1bfa6', skinShadow: '#d89378', hairColor: '#5c3921', eyeColor: '#2563eb', lipColor: '#cc646c', hasBeard: false, hairStyle: 'center-long', hasSunglasses: false },
  { skinColor: '#c48962', skinShadow: '#9c633f', hairColor: '#1d1410', eyeColor: '#15803d', lipColor: '#ad4f57', hasBeard: false, hairStyle: 'ponytail', hasSunglasses: false },
  { skinColor: '#e3b38f', skinShadow: '#c18c67', hairColor: '#3d281f', eyeColor: '#3b2416', lipColor: '#bf5962', hasBeard: false, hairStyle: 'long', hasSunglasses: false },
] as const

export function getAthleteProfile(seedKey: string | number, gender: AvatarGender = 'male'): AthleteLookProfile {
  const pool = gender === 'female' ? FEMALE_PRESETS : MALE_PRESETS
  if (typeof seedKey === 'number') {
    return pool[Math.abs(seedKey) % pool.length]
  }
  const low = seedKey.toLowerCase()
  if (low.includes('computer') || low.includes('ai-opponent') || low === 'local' || low === 'player') {
    return pool[0]
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
  grad.addColorStop(0, '#070505')
  grad.addColorStop(0.28, eyeColor)
  grad.addColorStop(0.76, eyeColor)
  grad.addColorStop(1, '#0d1424')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  // Subtle warm hazel-gold inner ring for Western eye depth
  const innerRing = ctx.createRadialGradient(64, 64, 14, 64, 64, 36)
  innerRing.addColorStop(0, 'rgba(217, 155, 67, 0.34)')
  innerRing.addColorStop(1, 'rgba(217, 155, 67, 0)')
  ctx.fillStyle = innerRing
  ctx.fillRect(0, 0, 128, 128)
  ctx.strokeStyle = 'rgba(255, 240, 225, 0.34)'
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
    ctx.fillStyle =
      x % 9 === 0
        ? 'rgba(235, 206, 185, 0.16)'
        : x % 6 === 0
          ? 'rgba(255,255,255,0.08)'
          : 'rgba(22,14,10,0.18)'
    ctx.fillRect(x, 0, 1.5, 256)
  }
  const shineGrad = ctx.createLinearGradient(0, 48, 0, 118)
  shineGrad.addColorStop(0, 'rgba(245, 220, 200, 0)')
  shineGrad.addColorStop(0.5, 'rgba(245, 220, 200, 0.22)')
  shineGrad.addColorStop(1, 'rgba(245, 220, 200, 0)')
  ctx.fillStyle = shineGrad
  ctx.fillRect(0, 48, 256, 70)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}

/**
 * Sculpted Semi-Realistic 3D Human Head with bright open almond eyes, curved lash arcs,
 * soft warm peach skin lighting, sculpted Cupid's bow lips, and smooth center-parted chestnut hair.
 */
export function HumanFaceHead({
  profile,
  gender = 'male',
  showHair = true,
  allowSunglasses = true,
  hasGlasses = false,
  hideNeck = false,
  hairOffsetRef,
}: {
  profile: AthleteLookProfile
  gender?: AvatarGender
  showHair?: boolean
  allowSunglasses?: boolean
  hasGlasses?: boolean
  hideNeck?: boolean
  hairOffsetRef?: React.MutableRefObject<[number, number, number]>
}) {
  const leftLidRef = useRef<THREE.Mesh>(null)
  const rightLidRef = useRef<THREE.Mesh>(null)
  const hairGroupRef = useRef<THREE.Group>(null)
  const blinkSeed = useMemo(() => Math.random() * 4.5, [])

  const isFemale = gender === 'female'
  const isCenterLong = profile.hairStyle === 'center-long'

  const headGeo = useMemo(() => buildUnitySculptedHeadGeometry(gender), [gender])
  const centerLongHairGeo = useMemo(
    () => (isCenterLong ? buildSculptedLongHairGeometry() : null),
    [isCenterLong]
  )
  const skinTex = useMemo(() => createUnityFaceTexture(profile, gender), [profile, gender])
  const irisTex = useMemo(() => createIrisCanvasTexture(profile.eyeColor), [profile.eyeColor])
  const hairTex = useMemo(() => createHairTexture(profile.hairColor), [profile.hairColor])

  useEffect(() => {
    return () => {
      headGeo.dispose()
      centerLongHairGeo?.dispose()
      skinTex.dispose()
      irisTex.dispose()
      hairTex.dispose()
    }
  }, [headGeo, centerLongHairGeo, skinTex, irisTex, hairTex])

  useFrame((state) => {
    const cycle = (state.clock.elapsedTime + blinkSeed) % 4.0
    const blinking = cycle > 3.86
    if (leftLidRef.current) leftLidRef.current.visible = blinking
    if (rightLidRef.current) rightLidRef.current.visible = blinking

    if (hairGroupRef.current && hairOffsetRef) {
      const ho = hairOffsetRef.current
      const baseY = isCenterLong ? 0 : 0.02
      const baseZ = isCenterLong ? 0 : 0.004
      hairGroupRef.current.position.set(ho[0], baseY + ho[1], baseZ + ho[2])
      hairGroupRef.current.rotation.set(ho[2] * 2.0, 0, -ho[0] * 2.2)
    }
  })

  return (
    <group>
      {/* Optional neck only for legacy disconnected mounts; SkinnedMesh includes continuous neck */}
      {!hideNeck && (
        <mesh position={[0, -0.145, 0.014]}>
          <cylinderGeometry args={[isFemale ? 0.039 : 0.052, isFemale ? 0.044 : 0.062, 0.125, 16]} />
          <meshPhysicalMaterial
            color={profile.skinColor}
            roughness={isFemale ? 0.44 : 0.5}
            metalness={0.0}
            sheen={isFemale ? 0.52 : 0.2}
            sheenRoughness={0.58}
            sheenColor={isFemale ? '#ff9d8a' : '#e0a28c'}
            emissive={isFemale ? profile.skinShadow : '#000000'}
            emissiveIntensity={isFemale ? 0.16 : 0}
          />
        </mesh>
      )}

      {/* Continuous Sculpted High-Poly 3D Head with soft warm subsurface fill */}
      <mesh geometry={headGeo} castShadow receiveShadow>
        <meshPhysicalMaterial
          map={skinTex}
          roughness={isFemale ? 0.44 : 0.52}
          metalness={0.0}
          sheen={isFemale ? 0.52 : 0.2}
          sheenRoughness={0.58}
          sheenColor={isFemale ? '#ff9d8a' : '#e0a28c'}
          clearcoat={isFemale ? 0.08 : 0.02}
          clearcoatRoughness={0.48}
          emissive={isFemale ? profile.skinShadow : '#000000'}
          emissiveIntensity={isFemale ? 0.16 : 0}
        />
      </mesh>

      {/* Bright Open Realistic Almond Eyes seated cleanly in orbital sockets */}
      {[-0.034, 0.034].map((ex, i) => (
        <group
          key={i}
          position={[ex, 0.012, -0.092]}
          rotation={[0, i === 0 ? 0.08 : -0.08, 0]}
        >
          {/* Bright Clean Sclera */}
          <mesh scale={isFemale ? [1.1, 0.88, 0.9] : [1.05, 0.92, 0.92]}>
            <sphereGeometry args={[0.014, 16, 14]} />
            <meshPhysicalMaterial
              color="#ffffff"
              emissive="#fff8f4"
              emissiveIntensity={0.22}
              roughness={0.12}
              clearcoat={0.9}
              clearcoatRoughness={0.06}
            />
          </mesh>
          {/* Rich Vivid Iris */}
          <mesh position={[0, 0, -0.0076]} scale={[1, 1, 0.55]}>
            <sphereGeometry args={[isFemale ? 0.0094 : 0.0078, 16, 12]} />
            <meshPhysicalMaterial
              map={irisTex}
              emissive={profile.eyeColor}
              emissiveIntensity={0.18}
              roughness={0.08}
              clearcoat={1.0}
              clearcoatRoughness={0.04}
            />
          </mesh>
          {/* Crisp Pupil */}
          <mesh position={[0, 0, -0.0112]} scale={[1, 1, 0.45]}>
            <sphereGeometry args={[0.0042, 10, 8]} />
            <meshBasicMaterial color="#090707" />
          </mesh>
          {/* Specular Corneal Highlight */}
          <mesh position={[-0.0026, 0.0025, -0.0126]}>
            <sphereGeometry args={[0.0017, 6, 6]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          {/* Symmetrical Curved Upper Eyelash Arch above iris opening */}
          <mesh position={[0, 0.0068, -0.0072]} rotation={[0.16, 0, 0.11 * Math.PI + (i === 0 ? -0.05 : 0.05)]}>
            <torusGeometry args={[0.0124, isFemale ? 0.0014 : 0.0011, 6, 14, Math.PI * 0.78]} />
            <meshBasicMaterial color="#181214" />
          </mesh>
          {/* Blinking eyelid only visible during brief blink frames */}
          <mesh
            ref={i === 0 ? leftLidRef : rightLidRef}
            visible={false}
            position={[0, 0, -0.0015]}
            scale={[1.15, 0.94, 0.96]}
          >
            <sphereGeometry args={[0.0144, 12, 10]} />
            <meshStandardMaterial
              color={isFemale ? profile.skinColor : profile.skinShadow}
              emissive={isFemale ? profile.skinShadow : '#000000'}
              emissiveIntensity={isFemale ? 0.14 : 0}
              roughness={0.48}
            />
          </mesh>
        </group>
      ))}

      {/* Stylish Clear-Lens Nerdy Optical Glasses */}
      {hasGlasses && (
        <group position={[0, 0.013, -0.107]}>
          {[-0.034, 0.034].map((lx, idx) => (
            <group key={idx} position={[lx, 0, 0]} rotation={[0, idx === 0 ? 0.08 : -0.08, 0]}>
              <mesh scale={[1.14, 0.94, 1]}>
                <torusGeometry args={[0.0165, 0.0018, 10, 24]} />
                <meshStandardMaterial color="#2c1d14" roughness={0.28} metalness={0.22} />
              </mesh>
              <mesh position={[0, 0, 0.0006]} rotation={[0, Math.PI, 0]} scale={[1.1, 0.9, 1]}>
                <circleGeometry args={[0.0155, 20]} />
                <meshPhysicalMaterial
                  color="#eef8ff"
                  transparent
                  opacity={0.18}
                  roughness={0.05}
                  clearcoat={1}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          ))}
          {/* Sleek metallic bridge over nose */}
          <mesh position={[0, 0.002, -0.001]} rotation={[0, 0, Math.PI * 0.5]}>
            <cylinderGeometry args={[0.0013, 0.0013, 0.032, 8]} />
            <meshStandardMaterial color="#d4af37" metalness={0.85} roughness={0.22} />
          </mesh>
          {/* Thin temple arms sweeping cleanly back toward ears */}
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.054, 0.003, 0.05]}
              rotation={[0.06, side * 0.08, 0]}
            >
              <boxGeometry args={[0.0022, 0.0026, 0.095]} />
              <meshStandardMaterial color="#2c1d14" roughness={0.32} metalness={0.2} />
            </mesh>
          ))}
        </group>
      )}

      {/* Optional Athletic Sports Sunglasses */}
      {allowSunglasses && profile.hasSunglasses && (
        <group position={[0, 0.018, -0.106]}>
          {[-0.036, 0.036].map((lx, idx) => (
            <mesh key={idx} position={[lx, 0, 0]} scale={[1.35, 0.82, 0.4]}>
              <boxGeometry args={[0.034, 0.026, 0.012]} />
              <meshPhysicalMaterial
                color="#09090b"
                roughness={0.08}
                metalness={0.85}
                clearcoat={1}
              />
            </mesh>
          ))}
          <mesh position={[0, 0.004, 0.001]}>
            <boxGeometry args={[0.028, 0.004, 0.006]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.9} roughness={0.2} />
          </mesh>
        </group>
      )}

      {/* Sculpted Smooth Center-Parted Hair or Preset Styles */}
      {showHair && (
        <group ref={hairGroupRef} position={[0, isCenterLong ? 0 : 0.02, isCenterLong ? 0 : 0.004]}>
          {isCenterLong && centerLongHairGeo ? (
            <mesh geometry={centerLongHairGeo} castShadow receiveShadow>
              <meshStandardMaterial
                map={hairTex}
                roughness={0.48}
                metalness={0.05}
                side={THREE.DoubleSide}
              />
            </mesh>
          ) : (
            <>
              {/* Fitted cranial hair cap wrapping top, temples & occipital nape */}
              <mesh position={[0, 0.008, 0.008]} scale={[isFemale ? 0.94 : 0.96, 1.04, 0.99]}>
                <sphereGeometry args={[0.121, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
                <meshStandardMaterial map={hairTex} roughness={0.54} metalness={0.04} />
              </mesh>
              <mesh
                position={[0, isFemale ? -0.044 : -0.045, 0.056]}
                rotation={[0.12, 0, 0]}
                scale={[0.94, 1, 0.66]}
              >
                <cylinderGeometry args={[0.1, isFemale ? 0.098 : 0.068, 0.095, 20]} />
                <meshStandardMaterial map={hairTex} roughness={0.54} />
              </mesh>
            </>
          )}

          {profile.hairStyle === 'fade' && (
            <group>
              <mesh position={[0, 0.072, -0.028]} rotation={[-0.22, 0, 0]} scale={[0.92, 0.44, 0.92]}>
                <sphereGeometry args={[0.088, 18, 12]} />
                <meshStandardMaterial map={hairTex} roughness={0.62} />
              </mesh>
              {[-0.04, 0, 0.04].map((xOff, k) => (
                <mesh key={k} position={[xOff, 0.088, -0.05]} rotation={[-0.45, 0, xOff * 1.4]}>
                  <capsuleGeometry args={[0.022, 0.045, 6, 10]} />
                  <meshStandardMaterial map={hairTex} roughness={0.62} />
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
              <meshStandardMaterial map={hairTex} roughness={0.62} />
            </mesh>
          )}

          {(profile.hairStyle === 'bob' || profile.hairStyle === 'long') && (
            <group>
              <mesh position={[0, profile.hairStyle === 'long' ? -0.1 : -0.055, 0.048]} rotation={[0.1, 0, 0]} scale={[1.03, 1.0, 0.62]}>
                <cylinderGeometry
                  args={[0.108, profile.hairStyle === 'long' ? 0.128 : 0.106, profile.hairStyle === 'long' ? 0.28 : 0.135, 22]}
                />
                <meshStandardMaterial map={hairTex} roughness={0.55} />
              </mesh>
              {[-0.088, 0.088].map((hx, idx) => (
                <mesh
                  key={idx}
                  position={[hx, -0.078, -0.006]}
                  rotation={[0.08, 0, idx === 0 ? -0.12 : 0.12]}
                >
                  <capsuleGeometry args={[0.024, profile.hairStyle === 'long' ? 0.21 : 0.11, 8, 12]} />
                  <meshStandardMaterial map={hairTex} roughness={0.55} />
                </mesh>
              ))}
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
