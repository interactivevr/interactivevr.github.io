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
  { skinColor: '#f5d2ba', skinShadow: '#dfb094', hairColor: '#13192b', eyeColor: '#4a2511', lipColor: '#c97b72', hasBeard: false, hairStyle: 'short', hasSunglasses: false },
  { skinColor: '#c98b63', skinShadow: '#a66a44', hairColor: '#141110', eyeColor: '#291c14', lipColor: '#9c564f', hasBeard: true, hairStyle: 'short', hasSunglasses: true },
  { skinColor: '#8d5534', skinShadow: '#6c3e23', hairColor: '#111111', eyeColor: '#1f1612', lipColor: '#78413a', hasBeard: false, hairStyle: 'curly', hasSunglasses: false },
  { skinColor: '#f1c7a7', skinShadow: '#d49d79', hairColor: '#4b3320', eyeColor: '#2563eb', lipColor: '#be6e67', hasBeard: false, hairStyle: 'short', hasSunglasses: false },
  { skinColor: '#b57850', skinShadow: '#8e5735', hairColor: '#181412', eyeColor: '#2b1e16', lipColor: '#944f48', hasBeard: true, hairStyle: 'curly', hasSunglasses: true },
  { skinColor: '#d9a17b', skinShadow: '#b87d58', hairColor: '#2c1e16', eyeColor: '#15803d', lipColor: '#ab6058', hasBeard: false, hairStyle: 'fade', hasSunglasses: false },
] as const

const FEMALE_PRESETS: readonly AthleteLookProfile[] = [
  // Flagship VRoid / Unity stylized anime look: fair porcelain skin, midnight-navy bob & warm amber eyes
  { skinColor: '#fce3d2', skinShadow: '#f0c5ad', hairColor: '#13192b', eyeColor: '#b45309', lipColor: '#e28882', hasBeard: false, hairStyle: 'bob', hasSunglasses: false },
  { skinColor: '#cfa07a', skinShadow: '#ac7953', hairColor: '#161110', eyeColor: '#2c1d13', lipColor: '#a64952', hasBeard: false, hairStyle: 'ponytail', hasSunglasses: false },
  { skinColor: '#935c3b', skinShadow: '#714227', hairColor: '#121010', eyeColor: '#241711', lipColor: '#8d3f48', hasBeard: false, hairStyle: 'curly', hasSunglasses: false },
  { skinColor: '#fce3d2', skinShadow: '#f0c5ad', hairColor: '#5c3921', eyeColor: '#2563eb', lipColor: '#c76168', hasBeard: false, hairStyle: 'bob', hasSunglasses: false },
  { skinColor: '#be845d', skinShadow: '#98603c', hairColor: '#1d1410', eyeColor: '#15803d', lipColor: '#ad4f57', hasBeard: false, hairStyle: 'ponytail', hasSunglasses: false },
  { skinColor: '#dfb08c', skinShadow: '#bd8964', hairColor: '#13192b', eyeColor: '#b45309', lipColor: '#bf5962', hasBeard: false, hairStyle: 'long', hasSunglasses: false },
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

function createIrisCanvasTexture(eyeColor: string, animeStyle: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  if (animeStyle) {
    // Rich VRoid stylized iris: deep chocolate/shadowed top fading into glowing lower crescent + dual highlights
    const vGrad = ctx.createLinearGradient(0, 12, 0, 118)
    vGrad.addColorStop(0, '#180c07')
    vGrad.addColorStop(0.42, '#421d0c')
    vGrad.addColorStop(0.74, eyeColor)
    vGrad.addColorStop(0.92, '#f59e0b')
    vGrad.addColorStop(1, '#3b1808')
    ctx.fillStyle = vGrad
    ctx.fillRect(0, 0, 128, 128)

    // Soft dark outer limbal ring
    const ring = ctx.createRadialGradient(64, 64, 34, 64, 64, 64)
    ring.addColorStop(0, 'rgba(0,0,0,0)')
    ring.addColorStop(0.72, 'rgba(0,0,0,0.18)')
    ring.addColorStop(1, 'rgba(10,6,5,0.88)')
    ctx.fillStyle = ring
    ctx.fillRect(0, 0, 128, 128)

    // Subtle radial anime iris spokes
    ctx.strokeStyle = 'rgba(255, 220, 165, 0.25)'
    ctx.lineWidth = 1.6
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(64 + Math.cos(a) * 18, 64 + Math.sin(a) * 18)
      ctx.lineTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52)
      ctx.stroke()
    }

    // Crisp pupil
    ctx.fillStyle = '#090707'
    ctx.beginPath()
    ctx.ellipse(64, 62, 20, 24, 0, 0, Math.PI * 2)
    ctx.fill()

    // Upper-left crisp anime catchlight + smaller lower catchlight
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(46, 44, 12, 10, -0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(80, 84, 5.5, 5.5, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
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

  // Silky anime strand sheen + soft horizontal angel-ring highlight band across mid crown
  for (let x = 0; x < 256; x += 3) {
    ctx.fillStyle = x % 6 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.16)'
    ctx.fillRect(x, 0, 1.5, 256)
  }
  const shineGrad = ctx.createLinearGradient(0, 66, 0, 124)
  shineGrad.addColorStop(0, 'rgba(148, 175, 240, 0)')
  shineGrad.addColorStop(0.45, 'rgba(148, 175, 240, 0.22)')
  shineGrad.addColorStop(0.55, 'rgba(180, 205, 255, 0.28)')
  shineGrad.addColorStop(1, 'rgba(148, 175, 240, 0)')
  ctx.fillStyle = shineGrad
  ctx.fillRect(0, 66, 256, 58)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}

/**
 * Stylized Unity / VRoid Sculpted Continuous 3D Human Head with expressive anime eyes,
 * clean porcelain skin shading, blinking eyelids, feathered bangs, cheek side-locks & hair clip.
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
  const irisTex = useMemo(
    () => createIrisCanvasTexture(profile.eyeColor, isFemale || profile.hairStyle === 'short'),
    [profile.eyeColor, isFemale, profile.hairStyle]
  )
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
      hairGroupRef.current.position.set(ho[0], 0.02 + ho[1], 0.004 + ho[2])
      hairGroupRef.current.rotation.set(ho[2] * 2.2, 0, -ho[0] * 2.5)
    }
  })

  return (
    <group>
      {/* Optional neck only for legacy disconnected mounts; SkinnedMesh includes continuous neck */}
      {!hideNeck && (
        <mesh position={[0, -0.145, 0.014]}>
          <cylinderGeometry args={[isFemale ? 0.039 : 0.052, isFemale ? 0.044 : 0.062, 0.125, 16]} />
          <meshStandardMaterial color={profile.skinShadow} roughness={0.48} />
        </mesh>
      )}

      {/* Continuous Sculpted High-Poly 3D Head */}
      <mesh geometry={headGeo} castShadow receiveShadow>
        <meshStandardMaterial
          map={skinTex}
          roughness={isFemale ? 0.42 : 0.5}
          metalness={0.01}
          emissive={isFemale ? profile.skinColor : '#000000'}
          emissiveIntensity={isFemale ? 0.07 : 0}
        />
      </mesh>

      {/* Large Expressive VRoid / Anime Eyes (-Z forward) */}
      {[-0.036, 0.036].map((ex, i) => (
        <group
          key={i}
          position={[ex, isFemale ? 0.008 : 0.016, isFemale ? -0.091 : -0.095]}
          rotation={[0, i === 0 ? 0.14 : -0.14, 0]}
        >
          {/* Bright Sclera */}
          <mesh scale={isFemale ? [1.22, 1.38, 0.42] : [1.05, 0.92, 0.92]}>
            <sphereGeometry args={[isFemale ? 0.0175 : 0.0145, 18, 16]} />
            <meshPhysicalMaterial
              color="#fffcf9"
              roughness={0.14}
              clearcoat={0.9}
              clearcoatRoughness={0.08}
            />
          </mesh>
          {/* Glowing Dual-Tone Anime Iris Disc */}
          <mesh position={[0, -0.001, isFemale ? -0.0068 : -0.0085]} scale={isFemale ? [1.05, 1.24, 0.35] : [1, 1, 0.55]}>
            <sphereGeometry args={[isFemale ? 0.0138 : 0.0076, 18, 14]} />
            <meshPhysicalMaterial
              map={irisTex}
              roughness={0.08}
              clearcoat={1.0}
              clearcoatRoughness={0.04}
              emissive={isFemale ? profile.eyeColor : '#000000'}
              emissiveIntensity={isFemale ? 0.16 : 0}
            />
          </mesh>
          {/* Winged Dark Upper Eyelash Curve */}
          <mesh
            position={[0, isFemale ? 0.017 : 0.01, isFemale ? -0.004 : -0.0085]}
            rotation={[0.15, 0, i === 0 ? 0.14 : -0.14]}
          >
            <boxGeometry args={[isFemale ? 0.036 : 0.024, isFemale ? 0.0042 : 0.0022, 0.006]} />
            <meshBasicMaterial color="#18121e" />
          </mesh>
          {/* Delicate Wing Extension on Outer Eye Corner */}
          {isFemale && (
            <mesh
              position={[i === 0 ? -0.019 : 0.019, 0.015, -0.003]}
              rotation={[0, 0, i === 0 ? -0.25 : 0.25]}
            >
              <boxGeometry args={[0.008, 0.0028, 0.004]} />
              <meshBasicMaterial color="#18121e" />
            </mesh>
          )}
          {/* Blinking Upper Eyelid */}
          <mesh
            ref={i === 0 ? leftLidRef : rightLidRef}
            position={[0, 0.004, isFemale ? -0.0015 : -0.0025]}
            scale={isFemale ? [1.32, 0.06, 0.54] : [1.15, 0.06, 0.96]}
          >
            <sphereGeometry args={[isFemale ? 0.0185 : 0.015, 12, 10]} />
            <meshStandardMaterial color={profile.skinColor} roughness={0.48} />
          </mesh>
        </group>
      ))}

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

      {/* Sculpted Multi-Layered 3D Strand-Textured Hair */}
      {showHair && (
        <group ref={hairGroupRef} position={[0, 0.02, 0.004]}>
          {/* Fitted cranial hair cap wrapping top, temples & occipital nape */}
          <mesh position={[0, 0.006, 0.004]} scale={[isFemale ? 0.95 : 0.96, 1.03, 0.99]}>
            <sphereGeometry args={[0.121, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.59]} />
            <meshStandardMaterial map={hairTex} roughness={0.55} metalness={0.05} />
          </mesh>

          {/* Back hairline bob / nape coverage */}
          <mesh
            position={[0, isFemale ? -0.042 : -0.045, 0.052]}
            rotation={[0.12, 0, 0]}
            scale={[isFemale ? 0.96 : 0.94, 1, 0.66]}
          >
            <cylinderGeometry args={[0.102, isFemale ? 0.098 : 0.068, 0.095, 20]} />
            <meshStandardMaterial map={hairTex} roughness={0.55} />
          </mesh>

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
            <group>
              <mesh position={[0, 0.068, -0.032]} rotation={[-0.22, 0, 0]} scale={[0.98, 0.48, 0.94]}>
                <sphereGeometry args={[0.094, 18, 12]} />
                <meshStandardMaterial map={hairTex} roughness={0.62} />
              </mesh>
              {[-0.05, -0.018, 0.015, 0.05].map((bx, k) => (
                <mesh
                  key={k}
                  position={[bx, 0.048, -0.092]}
                  rotation={[0.25, 0, bx * 1.5]}
                  scale={[1.1, 1, 0.45]}
                >
                  <coneGeometry args={[0.022, 0.065, 8]} />
                  <meshStandardMaterial map={hairTex} roughness={0.58} />
                </mesh>
              ))}
            </group>
          )}

          {(profile.hairStyle === 'bob' || profile.hairStyle === 'long') && (
            <group>
              {/* Layered rounded back bob hugging behind ears & nape neatly */}
              <mesh position={[0, profile.hairStyle === 'long' ? -0.1 : -0.055, 0.048]} rotation={[0.1, 0, 0]} scale={[1.03, 1.0, 0.62]}>
                <cylinderGeometry
                  args={[0.108, profile.hairStyle === 'long' ? 0.128 : 0.106, profile.hairStyle === 'long' ? 0.28 : 0.135, 22]}
                />
                <meshStandardMaterial map={hairTex} roughness={0.55} />
              </mesh>

              {/* Feathered Anime Forehead Bangs parted gently around eyebrows & eyes */}
              {[
                { x: -0.072, y: 0.036, z: -0.072, len: 0.075, rz: 0.18, ry: -0.55 },
                { x: -0.044, y: 0.044, z: -0.094, len: 0.068, rz: 0.08, ry: -0.25 },
                { x: -0.014, y: 0.046, z: -0.103, len: 0.064, rz: 0.02, ry: -0.08 },
                { x: 0.018, y: 0.046, z: -0.102, len: 0.065, rz: -0.04, ry: 0.08 },
                { x: 0.048, y: 0.044, z: -0.092, len: 0.07, rz: -0.12, ry: 0.28 },
                { x: 0.075, y: 0.036, z: -0.07, len: 0.076, rz: -0.2, ry: 0.55 },
              ].map((s, idx) => (
                <mesh
                  key={idx}
                  position={[s.x, s.y, s.z]}
                  rotation={[Math.PI + 0.16, s.ry, s.rz]}
                  scale={[1.1, 1.0, 0.42]}
                >
                  <coneGeometry args={[0.021, s.len, 8]} />
                  <meshStandardMaterial map={hairTex} roughness={0.55} />
                </mesh>
              ))}

              {/* Curved Cheek-Framing Hime Side-Locks in front of ears */}
              {[-1, 1].map((side) => (
                <group key={side} position={[side * 0.092, -0.018, -0.035]}>
                  <mesh
                    position={[0, profile.hairStyle === 'long' ? -0.06 : -0.024, 0.008]}
                    rotation={[0.08, 0, side * 0.1]}
                    scale={[0.8, 1.0, 0.55]}
                  >
                    <capsuleGeometry args={[0.022, profile.hairStyle === 'long' ? 0.18 : 0.078, 8, 10]} />
                    <meshStandardMaterial map={hairTex} roughness={0.55} />
                  </mesh>
                  {/* Tapered pointed cheek lock tip */}
                  <mesh
                    position={[-side * 0.006, profile.hairStyle === 'long' ? -0.17 : -0.085, -0.014]}
                    rotation={[Math.PI - 0.14, 0, side * 0.18]}
                    scale={[0.75, 1.0, 0.45]}
                  >
                    <coneGeometry args={[0.018, 0.065, 8]} />
                    <meshStandardMaterial map={hairTex} roughness={0.55} />
                  </mesh>
                </group>
              ))}

              {/* Signature Bright Orange-Red Chevron Hair Clip on Left Temple (above left eye) */}
              {profile.hairStyle === 'bob' && (
                <group position={[-0.07, 0.044, -0.084]} rotation={[0.08, -0.58, 0.1]}>
                  <mesh position={[0.004, 0.008, 0]} rotation={[0, 0, 0.48]}>
                    <boxGeometry args={[0.024, 0.0042, 0.005]} />
                    <meshStandardMaterial color="#ea580c" roughness={0.28} metalness={0.12} />
                  </mesh>
                  <mesh position={[0.004, -0.006, 0]} rotation={[0, 0, -0.45]}>
                    <boxGeometry args={[0.022, 0.0042, 0.005]} />
                    <meshStandardMaterial color="#ea580c" roughness={0.28} metalness={0.12} />
                  </mesh>
                </group>
              )}
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
