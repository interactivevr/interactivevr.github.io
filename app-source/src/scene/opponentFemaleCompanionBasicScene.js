import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * Single-file Three.js Scene: Stylized, Fashionable 20-Year-Old Female Companion Design
 * - Procedural geometry: SphereGeometry, CylinderGeometry, CapsuleGeometry, and LatheGeometry
 *   (including LatheGeometry hair bell, cropped mock-neck top, pleated mini-skirt, belt & boot cuffs).
 * - Hierarchical THREE.Group pose rig exposing head, hair, torso, waist, arms, forearms, hands,
 *   legs, knees, and feet pivots so any limb or posture can be posed cleanly.
 * - MeshStandardMaterial with subtle procedural canvas shading for skin, hair, knit fabric,
 *   pleated twill skirt, and leather boots.
 * - Soft three-point studio lighting, soft shadows, studio pedestal, and damped OrbitControls.
 */

function createSkinTexture(baseHex = '#f4c6ae', blushHex = '#e69884') {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = baseHex
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 360; i++) {
      const x = (i * 73) % 256
      const y = (i * 139) % 256
      const r = 8 + (i % 14)
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 224, 206, 0.06)' : `${blushHex}0c`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function createFaceTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#f4c6ae'
    ctx.fillRect(0, 0, 512, 512)

    // In Three.js SphereGeometry: x = -r*cos(phi)*sin(theta), z = +r*sin(phi)*sin(theta)
    // With phi = u * 2*PI, +Z face center sits at u = 0.25 -> canvas x = 128
    const frontX = 128
    const grad = ctx.createRadialGradient(frontX, 250, 50, frontX, 256, 220)
    grad.addColorStop(0, '#f7ccb6')
    grad.addColorStop(0.75, '#f4c6ae')
    grad.addColorStop(1, 'rgba(244, 198, 174, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 512, 512)

    // Rosy cheek blush centered cleanly on the cheekbones facing +Z
    const blushGradL = ctx.createRadialGradient(frontX - 36, 272, 4, frontX - 36, 272, 24)
    blushGradL.addColorStop(0, 'rgba(244, 126, 134, 0.28)')
    blushGradL.addColorStop(1, 'rgba(244, 126, 134, 0)')
    ctx.fillStyle = blushGradL
    ctx.fillRect(frontX - 66, 242, 60, 60)

    const blushGradR = ctx.createRadialGradient(frontX + 36, 272, 4, frontX + 36, 272, 24)
    blushGradR.addColorStop(0, 'rgba(244, 126, 134, 0.28)')
    blushGradR.addColorStop(1, 'rgba(244, 126, 134, 0)')
    ctx.fillStyle = blushGradR
    ctx.fillRect(frontX + 6, 242, 60, 60)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  return tex
}

function createHairTexture(baseHex = '#764f38') {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = baseHex
    ctx.fillRect(0, 0, 256, 256)
    for (let x = 0; x < 256; x += 3) {
      ctx.fillStyle =
        x % 9 === 0
          ? 'rgba(245, 206, 174, 0.16)'
          : x % 6 === 0
            ? 'rgba(255, 255, 255, 0.06)'
            : 'rgba(30, 16, 10, 0.22)'
      ctx.fillRect(x, 0, 1.5, 256)
    }
    const shine = ctx.createLinearGradient(0, 62, 0, 138)
    shine.addColorStop(0, 'rgba(255, 232, 210, 0)')
    shine.addColorStop(0.5, 'rgba(255, 232, 210, 0.22)')
    shine.addColorStop(1, 'rgba(255, 232, 210, 0)')
    ctx.fillStyle = shine
    ctx.fillRect(0, 62, 256, 76)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function createFabricTexture(baseHex, stripeColor, verticalRibs = true) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = baseHex
    ctx.fillRect(0, 0, 256, 256)
    if (verticalRibs) {
      for (let x = 0; x < 256; x += 4) {
        ctx.fillStyle = x % 8 === 0 ? stripeColor : 'rgba(255, 255, 255, 0.05)'
        ctx.fillRect(x, 0, 1.5, 256)
      }
      for (let y = 0; y < 256; y += 6) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.025)'
        ctx.fillRect(0, y, 256, 1)
      }
    } else {
      // Twill weave for skirt
      const pleatCount = 18
      const step = 256 / pleatCount
      for (let i = 0; i < pleatCount; i++) {
        const px = i * step
        const g = ctx.createLinearGradient(px, 0, px + step, 0)
        g.addColorStop(0, 'rgba(0, 0, 0, 0.24)')
        g.addColorStop(0.35, 'rgba(255, 255, 255, 0.06)')
        g.addColorStop(1, 'rgba(0, 0, 0, 0.24)')
        ctx.fillStyle = g
        ctx.fillRect(px, 0, step + 1, 256)
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function enableShadows(root) {
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true
      obj.receiveShadow = true
    }
  })
}

/**
 * Builds the poseable hierarchical 20-year-old female 3D character using procedural geometry.
 * Facing +Z forward, grounded cleanly at y = 0.
 */
export function buildStylizedFemaleCharacter() {
  const character = new THREE.Group()
  character.name = 'OpponentFemaleCompanion'

  // Subtle procedural textures & MeshStandardMaterials
  const skinTex = createSkinTexture('#f4c6ae', '#e69884')
  const faceTex = createFaceTexture()
  const hairTex = createHairTexture('#764f38')
  const knitTex = createFabricTexture('#f4efe9', 'rgba(182, 168, 154, 0.18)', true)
  const skirtTex = createFabricTexture('#7d293b', 'rgba(30, 8, 16, 0.2)', false)

  const skinMat = new THREE.MeshStandardMaterial({
    map: skinTex,
    roughness: 0.52,
    metalness: 0.02,
    emissive: new THREE.Color('#de9a7f'),
    emissiveIntensity: 0.08,
  })
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTex,
    roughness: 0.5,
    metalness: 0.02,
    emissive: new THREE.Color('#de9a7f'),
    emissiveIntensity: 0.08,
  })
  const hairMat = new THREE.MeshStandardMaterial({
    map: hairTex,
    roughness: 0.42,
    metalness: 0.08,
    side: THREE.DoubleSide,
  })
  const knitTopMat = new THREE.MeshStandardMaterial({
    map: knitTex,
    roughness: 0.84,
    metalness: 0.02,
    side: THREE.DoubleSide,
  })
  const skirtMat = new THREE.MeshStandardMaterial({
    map: skirtTex,
    roughness: 0.78,
    metalness: 0.03,
    side: THREE.DoubleSide,
  })
  const darkFabricMat = new THREE.MeshStandardMaterial({
    color: '#23242b',
    roughness: 0.8,
    metalness: 0.03,
  })
  const leatherMat = new THREE.MeshStandardMaterial({
    color: '#1f191b',
    roughness: 0.36,
    metalness: 0.14,
  })
  const goldAccentMat = new THREE.MeshStandardMaterial({
    color: '#e0b86b',
    roughness: 0.25,
    metalness: 0.85,
  })
  const scleraMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.15,
    metalness: 0.02,
  })
  const irisMat = new THREE.MeshStandardMaterial({
    color: '#2d6cdf',
    roughness: 0.18,
    metalness: 0.05,
  })
  const lashMat = new THREE.MeshStandardMaterial({
    color: '#191315',
    roughness: 0.55,
  })
  const browMat = new THREE.MeshStandardMaterial({
    color: '#5a3a28',
    roughness: 0.65,
  })
  const lipMat = new THREE.MeshStandardMaterial({
    color: '#dc737c',
    roughness: 0.38,
    metalness: 0.04,
  })

  // ---------------------------------------------------------------------------
  // 1. ROOT HIPS PIVOT (y = 0.87m)
  // ---------------------------------------------------------------------------
  const hips = new THREE.Group()
  hips.name = 'hips'
  hips.position.set(0, 0.87, 0)
  character.add(hips)

  // Fitted pelvic shorts liner under skirt
  const pelvisGeo = new THREE.SphereGeometry(0.118, 24, 18)
  const pelvisMesh = new THREE.Mesh(pelvisGeo, darkFabricMat)
  pelvisMesh.position.set(0, 0.01, -0.005)
  pelvisMesh.scale.set(1.26, 0.92, 0.96)
  hips.add(pelvisMesh)

  // Fashionable High-Waisted Pleated A-Line Mini Skirt using LatheGeometry
  const skirtPoints = [
    new THREE.Vector2(0.195, -0.175), // inner lining bottom edge
    new THREE.Vector2(0.215, -0.185), // flared outer hem
    new THREE.Vector2(0.188, -0.09),  // mid A-line sweep
    new THREE.Vector2(0.148, 0.015),  // hip hug
    new THREE.Vector2(0.112, 0.095),  // cinched high waist
  ]
  const skirtGeo = new THREE.LatheGeometry(skirtPoints, 72)
  const sPos = skirtGeo.attributes.position
  for (let i = 0; i < sPos.count; i++) {
    const x = sPos.getX(i)
    const y = sPos.getY(i)
    const z = sPos.getZ(i)
    const flareFactor = Math.max(0, (0.095 - y) / 0.28)
    const angle = Math.atan2(x, z)
    const pleat = Math.sin(angle * 18) * 0.011 * flareFactor
    const rad = Math.hypot(x, z) || 1
    const nx = x * (1.22 + (pleat / rad))
    const nz = z * ((z < 0 ? 1.02 : 0.92) + pleat / rad)
    sPos.setXYZ(i, nx, y, nz)
  }
  skirtGeo.computeVertexNormals()
  const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat)
  skirtMesh.position.set(0, 0.01, -0.004)
  hips.add(skirtMesh)

  // Tailored Faux-Leather Waist Belt (LatheGeometry) + Brushed Gold Buckle
  const beltGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.116, 0.088),
      new THREE.Vector2(0.121, 0.091),
      new THREE.Vector2(0.118, 0.124),
      new THREE.Vector2(0.112, 0.127),
    ],
    40
  )
  const beltMesh = new THREE.Mesh(beltGeo, leatherMat)
  beltMesh.scale.set(1.22, 1, 0.92)
  hips.add(beltMesh)

  const buckleGroup = new THREE.Group()
  buckleGroup.position.set(0, 0.107, 0.114)
  const buckleRing = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.008, 20), goldAccentMat)
  buckleRing.rotation.x = Math.PI * 0.5
  const bucklePin = new THREE.Mesh(new THREE.CapsuleGeometry(0.003, 0.016, 4, 8), leatherMat)
  bucklePin.rotation.z = Math.PI * 0.5
  bucklePin.position.z = 0.003
  buckleGroup.add(buckleRing, bucklePin)
  hips.add(buckleGroup)

  // ---------------------------------------------------------------------------
  // 2. TORSO & WAIST HIERARCHY
  // ---------------------------------------------------------------------------
  const torso = new THREE.Group()
  torso.name = 'torso'
  torso.position.set(0, 0.11, 0)
  hips.add(torso)

  // Sculpted bare midriff waist -> ribcage core (LatheGeometry)
  const waistSkinGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.106, -0.01),
      new THREE.Vector2(0.104, 0.03),
      new THREE.Vector2(0.109, 0.085),
      new THREE.Vector2(0.114, 0.12),
    ],
    32
  )
  const midriffMesh = new THREE.Mesh(waistSkinGeo, skinMat)
  midriffMesh.scale.set(1.16, 1, 0.84)
  torso.add(midriffMesh)

  // Fashionable Cropped Fitted Mock-Neck Knit Sweater (LatheGeometry chest shell + bust contours + collar)
  const chestTopGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.108, 0.072),
      new THREE.Vector2(0.119, 0.125),
      new THREE.Vector2(0.132, 0.195),
      new THREE.Vector2(0.135, 0.275),
      new THREE.Vector2(0.118, 0.34),
      new THREE.Vector2(0.056, 0.378),
    ],
    36
  )
  const chestTopMesh = new THREE.Mesh(chestTopGeo, knitTopMat)
  chestTopMesh.scale.set(1.18, 1, 0.86)
  torso.add(chestTopMesh)

  // Balanced medium feminine bust shaping smoothly draped under knit fabric
  for (const side of [-1, 1]) {
    const bust = new THREE.Mesh(new THREE.SphereGeometry(0.065, 24, 20), knitTopMat)
    bust.position.set(side * 0.056, 0.228, 0.053)
    bust.rotation.set(-0.14, side * 0.12, 0)
    bust.scale.set(1.06, 1.14, 0.56)
    torso.add(bust)
  }

  // Mock-neck rolled knit collar (LatheGeometry)
  const collarGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.05, 0.372),
      new THREE.Vector2(0.056, 0.376),
      new THREE.Vector2(0.052, 0.415),
      new THREE.Vector2(0.043, 0.422),
    ],
    28
  )
  const collarMesh = new THREE.Mesh(collarGeo, knitTopMat)
  torso.add(collarMesh)

  // Dainty gold pendant choker accent on sweater front
  const necklaceGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.056, 0.365),
      new THREE.Vector2(0.058, 0.367),
      new THREE.Vector2(0.057, 0.37),
    ],
    32
  )
  const necklaceMesh = new THREE.Mesh(necklaceGeo, goldAccentMat)
  torso.add(necklaceMesh)
  const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.008, 14, 12), goldAccentMat)
  pendant.position.set(0, 0.338, 0.072)
  pendant.scale.set(0.9, 1.35, 0.45)
  torso.add(pendant)

  // ---------------------------------------------------------------------------
  // 3. NECK, HEAD & LAYERED HAIRSTYLE (Spheres, Capsules & LatheGeometry)
  // ---------------------------------------------------------------------------
  const neck = new THREE.Group()
  neck.name = 'neck'
  neck.position.set(0, 0.39, 0)
  torso.add(neck)

  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.085, 20), skinMat)
  neckMesh.position.y = 0.036
  neck.add(neckMesh)

  const head = new THREE.Group()
  head.name = 'head'
  head.position.set(0, 0.078, 0.005)
  neck.add(head)

  // Sculpted cute 20yo oval head sphere (tapered chin vertex pass)
  const skullGeo = new THREE.SphereGeometry(0.104, 36, 28)
  const headPos = skullGeo.attributes.position
  for (let i = 0; i < headPos.count; i++) {
    let x = headPos.getX(i) * 0.9
    let y = headPos.getY(i) * 1.03
    let z = headPos.getZ(i) * 0.94
    if (y < 0) {
      const low = Math.min(1, Math.abs(y) / 0.11)
      x *= 1 - low * 0.32
      z *= 1 - low * 0.16
      if (z > 0) z += Math.pow(low, 2) * 0.005
    }
    headPos.setXYZ(i, x, y, z)
  }
  skullGeo.computeVertexNormals()
  const headMesh = new THREE.Mesh(skullGeo, faceMat)
  headMesh.position.set(0, 0.095, 0)
  head.add(headMesh)

  // Neat ears
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.017, 14, 12), skinMat)
    ear.position.set(side * 0.091, 0.086, -0.004)
    ear.scale.set(0.45, 1.05, 0.7)
    head.add(ear)
  }

  // Facial Features (+Z Front)
  for (const side of [-1, 1]) {
    const eyeGroup = new THREE.Group()
    eyeGroup.position.set(side * 0.034, 0.102, 0.085)
    eyeGroup.rotation.y = side * 0.16

    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.0155, 16, 14), scleraMat)
    sclera.scale.set(1.08, 0.85, 0.6)
    const iris = new THREE.Mesh(new THREE.CylinderGeometry(0.0088, 0.0088, 0.003, 18), irisMat)
    iris.rotation.x = Math.PI * 0.5
    iris.position.z = 0.0082
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0046, 12, 10), lashMat)
    pupil.position.z = 0.0088
    pupil.scale.set(1, 1, 0.5)
    const highlight = new THREE.Mesh(new THREE.SphereGeometry(0.0021, 8, 8), scleraMat)
    highlight.position.set(-0.003, 0.0032, 0.0112)

    const lashArc = new THREE.Mesh(new THREE.CapsuleGeometry(0.0022, 0.022, 4, 8), lashMat)
    lashArc.rotation.z = Math.PI * 0.5 - side * 0.14
    lashArc.position.set(0, 0.012, 0.006)

    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.0024, 0.028, 4, 8), browMat)
    brow.rotation.z = Math.PI * 0.5 - side * 0.1
    brow.position.set(side * 0.002, 0.028, 0.006)

    eyeGroup.add(sclera, iris, pupil, highlight, lashArc, brow)
    head.add(eyeGroup)
  }

  // Petite slightly upturned nose (CapsuleGeometry bridge + SphereGeometry tip)
  const noseBridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.0046, 0.022, 4, 8), skinMat)
  noseBridge.position.set(0, 0.088, 0.097)
  noseBridge.rotation.x = -0.28
  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 12, 10), skinMat)
  noseTip.position.set(0, 0.075, 0.104)
  head.add(noseBridge, noseTip)

  // Soft smiling rose lips (CapsuleGeometry cushions)
  const upperLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0046, 0.024, 6, 10), lipMat)
  upperLip.rotation.z = Math.PI * 0.5
  upperLip.position.set(0, 0.048, 0.094)
  upperLip.scale.set(0.85, 1, 0.72)
  const lowerLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0052, 0.02, 6, 10), lipMat)
  lowerLip.rotation.z = Math.PI * 0.5
  lowerLip.position.set(0, 0.041, 0.093)
  lowerLip.scale.set(0.9, 1, 0.75)
  head.add(upperLip, lowerLip)

  // Hierarchical Hair Group
  const hair = new THREE.Group()
  hair.name = 'hair'
  hair.position.set(0, 0.095, 0)
  head.add(hair)

  // Center-parted cranial hair crown volume (SphereGeometry left & right domes tilted back off forehead)
  for (const side of [-1, 1]) {
    const crownHalf = new THREE.Mesh(
      new THREE.SphereGeometry(0.111, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.46),
      hairMat
    )
    crownHalf.position.set(side * 0.012, 0.01, -0.008)
    crownHalf.rotation.set(-0.36, 0, -side * 0.1)
    crownHalf.scale.set(0.88, 1.02, 0.98)
    hair.add(crownHalf)
  }

  // Flowing shoulder-length hair curtain via LatheGeometry (open across front face +Z!)
  // In Three.js LatheGeometry, (x, z) = (r * sin(phi), r * cos(phi)); phi=0 is +Z face.
  const hairCurtainGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.118, -0.22), // feathered flared tips near collarbone
      new THREE.Vector2(0.122, -0.13), // soft curve beside neck
      new THREE.Vector2(0.115, -0.04), // mid back fullness
      new THREE.Vector2(0.11, 0.04),   // temple wrap
      new THREE.Vector2(0.088, 0.095), // crown taper
    ],
    44,
    0.3 * Math.PI,
    1.4 * Math.PI
  )
  const hairCurtainMesh = new THREE.Mesh(hairCurtainGeo, hairMat)
  hairCurtainMesh.position.set(0, 0, -0.008)
  hairCurtainMesh.scale.set(0.97, 1, 0.99)
  hair.add(hairCurtainMesh)

  // Stylish face-framing curtain bangs & front side strands (CapsuleGeometry, clear of eyes & brow)
  for (const side of [-1, 1]) {
    const bang = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.068, 8, 12), hairMat)
    bang.position.set(side * 0.056, 0.036, 0.072)
    bang.rotation.set(0.22, side * 0.24, side * 0.54)
    bang.scale.set(0.95, 1, 0.48)
    hair.add(bang)

    const sideLock = new THREE.Mesh(new THREE.CapsuleGeometry(0.021, 0.2, 8, 12), hairMat)
    sideLock.position.set(side * 0.095, -0.042, 0.034)
    sideLock.rotation.set(0.14, side * 0.12, side * 0.06)
    sideLock.scale.set(0.88, 1, 0.65)
    hair.add(sideLock)
  }

  // Chic headband hair accessory (LatheGeometry collar arc flush to crown)
  const headbandGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.103, 0),
      new THREE.Vector2(0.107, 0.011),
      new THREE.Vector2(0.103, 0.022),
    ],
    28,
    0.26 * Math.PI,
    1.48 * Math.PI
  )
  const headband = new THREE.Mesh(headbandGeo, skirtMat)
  headband.position.set(0, 0.048, -0.004)
  headband.rotation.x = -0.24
  hair.add(headband)

  // ---------------------------------------------------------------------------
  // 4. POSEABLE LEFT & RIGHT ARMS (Shoulder -> Elbow -> Wrist -> 5-Finger Hand)
  // ---------------------------------------------------------------------------
  const joints = { hips, torso, neck, head, hair }

  const buildArm = (sideName, sideSign) => {
    const shoulder = new THREE.Group()
    shoulder.name = `${sideName}Arm`
    shoulder.position.set(sideSign * 0.142, 0.312, -0.004)
    torso.add(shoulder)

    // Tailored fitted knit shoulder cap & upper sleeve (LatheGeometry)
    const sleeveCap = new THREE.Mesh(new THREE.SphereGeometry(0.039, 18, 14), knitTopMat)
    sleeveCap.position.y = -0.004
    sleeveCap.scale.set(0.92, 1.0, 0.92)
    shoulder.add(sleeveCap)

    const sleeveGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.034, -0.152),
        new THREE.Vector2(0.039, -0.136),
        new THREE.Vector2(0.041, -0.04),
        new THREE.Vector2(0.037, 0.004),
      ],
      20
    )
    const sleeveMesh = new THREE.Mesh(sleeveGeo, knitTopMat)
    shoulder.add(sleeveMesh)

    // Slender lower upper-arm emerging from sleeve cuff down to elbow (-0.24)
    const upperArmBare = new THREE.Mesh(new THREE.CapsuleGeometry(0.029, 0.10, 8, 14), skinMat)
    upperArmBare.position.y = -0.19
    shoulder.add(upperArmBare)

    const elbow = new THREE.Group()
    elbow.name = `${sideName}Forearm`
    elbow.position.set(0, -0.24, 0)
    shoulder.add(elbow)

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.21, 8, 14), skinMat)
    forearm.position.y = -0.105
    elbow.add(forearm)

    const wrist = new THREE.Group()
    wrist.name = `${sideName}Hand`
    wrist.position.set(0, -0.21, 0)
    elbow.add(wrist)

    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 12), skinMat)
    palm.position.set(0, -0.026, 0)
    palm.scale.set(0.45, 1.3, 0.85)
    wrist.add(palm)

    // Delicate stylized fingers gently curled inward
    const fingerSpecs = [
      { z: 0.015, y: -0.024, len: 0.026, rotX: 0.42 }, // thumb
      { z: 0.012, y: -0.048, len: 0.034, rotX: 0.06 },
      { z: 0.004, y: -0.052, len: 0.038, rotX: 0.02 },
      { z: -0.004, y: -0.05, len: 0.035, rotX: -0.04 },
      { z: -0.012, y: -0.046, len: 0.028, rotX: -0.08 },
    ]
    fingerSpecs.forEach((f, idx) => {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, f.len, 4, 8), skinMat)
      finger.position.set(-sideSign * (idx === 0 ? 0.005 : 0.003), f.y - f.len * 0.42, f.z)
      finger.rotation.set(f.rotX, 0, -sideSign * (idx === 0 ? 0.35 : 0.14))
      wrist.add(finger)
    })

    joints[`${sideName}Arm`] = shoulder
    joints[`${sideName}Forearm`] = elbow
    joints[`${sideName}Hand`] = wrist
  }

  buildArm('left', -1)
  buildArm('right', 1)

  // ---------------------------------------------------------------------------
  // 5. POSEABLE LEFT & RIGHT LEGS (Hip -> Knee -> Ankle Boots touching y = 0)
  // ---------------------------------------------------------------------------
  const buildLeg = (sideName, sideSign) => {
    const leg = new THREE.Group()
    leg.name = `${sideName}Leg`
    leg.position.set(sideSign * 0.088, -0.02, 0) // world y = 0.85
    hips.add(leg)

    // Hip socket sphere + contoured bare thigh (CylinderGeometry)
    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.062, 18, 14), darkFabricMat)
    leg.add(hipBall)

    const thighMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.043, 0.40, 24), skinMat)
    thighMesh.position.y = -0.20
    thighMesh.scale.set(1, 1, 1.04)
    leg.add(thighMesh)

    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.043, 18, 14), skinMat)
    kneeBall.position.y = -0.40
    leg.add(kneeBall)

    const knee = new THREE.Group()
    knee.name = `${sideName}Shin`
    knee.position.set(0, -0.40, 0) // world y = 0.45
    leg.add(knee)

    // Bare knee/upper-shin -> knee-high sock cuff -> sleek mid-calf leather boot (CylinderGeometry + LatheGeometry)
    const upperShin = new THREE.Mesh(new THREE.CapsuleGeometry(0.041, 0.11, 8, 18), skinMat)
    upperShin.position.y = -0.055
    knee.add(upperShin)

    // Charcoal knit sock collar peeking neatly above the leather boot
    const sockTop = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.046, 0.075, 22), darkFabricMat)
    sockTop.position.y = -0.125
    knee.add(sockTop)

    // Sleek sculpted boot shaft + top leather cuff via LatheGeometry
    const bootShaftGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.032, -0.37), // ankle base
        new THREE.Vector2(0.036, -0.31), // slim ankle curve
        new THREE.Vector2(0.048, -0.21), // calf curve
        new THREE.Vector2(0.051, -0.155), // top boot rim
        new THREE.Vector2(0.045, -0.153),
      ],
      26
    )
    const bootShaft = new THREE.Mesh(bootShaftGeo, leatherMat)
    knee.add(bootShaft)

    // Tiny gold zipper/hardware accent on outer boot shaft
    const bootBuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 12), goldAccentMat)
    bootBuckle.rotation.z = Math.PI * 0.5
    bootBuckle.position.set(sideSign * 0.051, -0.175, 0.008)
    knee.add(bootBuckle)

    const foot = new THREE.Group()
    foot.name = `${sideName}Foot`
    foot.position.set(0, -0.37, 0) // world y = 0.08
    knee.add(foot)

    // Stylish platform heeled ankle boot grounded accurately at y = -0.08 (world y = 0)
    const ankleJoint = new THREE.Mesh(new THREE.SphereGeometry(0.033, 14, 12), leatherMat)
    foot.add(ankleJoint)

    const vamp = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.072, 8, 16), leatherMat)
    vamp.rotation.x = Math.PI * 0.5 + 0.22
    vamp.position.set(0, -0.038, 0.046)
    vamp.scale.set(0.95, 1, 0.78)
    foot.add(vamp)

    const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), leatherMat)
    toeCap.position.set(0, -0.056, 0.095)
    toeCap.scale.set(0.94, 0.62, 1.25)
    foot.add(toeCap)

    const blockHeel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.056, 16), leatherMat)
    blockHeel.position.set(0, -0.052, -0.016)
    foot.add(blockHeel)

    const soleFront = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.068, 6, 14), leatherMat)
    soleFront.rotation.x = Math.PI * 0.5
    soleFront.position.set(0, -0.067, 0.062)
    soleFront.scale.set(1.02, 1, 0.4)
    foot.add(soleFront)

    joints[`${sideName}Leg`] = leg
    joints[`${sideName}Shin`] = knee
    joints[`${sideName}Foot`] = foot
  }

  buildLeg('left', -1)
  buildLeg('right', 1)

  character.userData.joints = joints
  character.userData.materials = {
    skinMat,
    faceMat,
    hairMat,
    knitTopMat,
    skirtMat,
    darkFabricMat,
    leatherMat,
    goldAccentMat,
  }
  character.userData.textures = [skinTex, faceTex, hairTex, knitTex, skirtTex]

  enableShadows(character)
  applyPose(character, 'fashionStance')
  return character
}

/**
 * Helper to pose any hierarchical joint group on the character cleanly.
 */
export function applyPose(character, preset = 'fashionStance') {
  const j = character.userData?.joints
  if (!j) return

  // Reset rotations cleanly first
  Object.values(j).forEach((grp) => grp.rotation.set(0, 0, 0))

  if (preset === 'fashionStance') {
    j.hips.rotation.set(0, 0.06, 0.025)
    j.torso.rotation.set(-0.02, -0.05, -0.03)
    j.neck.rotation.set(0.02, 0.03, 0)
    j.head.rotation.set(0.02, 0.06, -0.04)

    j.leftArm.rotation.set(0.08, 0, -0.14)
    j.leftForearm.rotation.set(-0.26, 0, 0.05)
    j.leftHand.rotation.set(0, 0, 0.08)

    j.rightArm.rotation.set(-0.06, 0, 0.22)
    j.rightForearm.rotation.set(-0.42, 0.12, -0.22)
    j.rightHand.rotation.set(0.05, 0, -0.12)

    j.leftLeg.rotation.set(-0.04, 0.05, -0.035)
    j.leftShin.rotation.set(0.08, 0, 0)
    j.leftFoot.rotation.set(-0.04, 0, 0.015)

    j.rightLeg.rotation.set(0.05, -0.08, 0.025)
    j.rightShin.rotation.set(0.04, 0, 0)
    j.rightFoot.rotation.set(-0.09, 0, -0.02)
  } else if (preset === 'wave') {
    j.hips.rotation.set(0, -0.04, 0)
    j.head.rotation.set(-0.04, -0.08, 0.06)
    j.leftArm.rotation.set(0.05, 0, -0.12)
    j.leftForearm.rotation.set(-0.2, 0, 0)
    j.rightArm.rotation.set(-0.3, 0.15, 2.35)
    j.rightForearm.rotation.set(-0.2, 0, -0.35)
  }
}

/**
 * Initializes and runs the standalone single-file Three.js studio scene inside a container.
 */
export function initOpponentCompanionStudioScene(container = document.body) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#dad4cd')
  scene.fog = new THREE.Fog('#dad4cd', 6.5, 16)

  const width = container.clientWidth || window.innerWidth
  const height = container.clientHeight || window.innerHeight

  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 40)
  camera.position.set(0.55, 1.38, 2.65)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.06

  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.target.set(0, 0.98, 0)
  controls.minDistance = 0.9
  controls.maxDistance = 5.5
  controls.maxPolarAngle = Math.PI * 0.495
  controls.update()

  // Soft Studio Three-Point Lighting
  const hemiLight = new THREE.HemisphereLight('#fffdf8', '#b89f92', 1.15)
  scene.add(hemiLight)

  const keyLight = new THREE.DirectionalLight('#fff7ee', 1.85)
  keyLight.position.set(2.4, 3.8, 2.8)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(2048, 2048)
  keyLight.shadow.camera.near = 0.5
  keyLight.shadow.camera.far = 10
  keyLight.shadow.camera.left = -2.2
  keyLight.shadow.camera.right = 2.2
  keyLight.shadow.camera.top = 2.5
  keyLight.shadow.camera.bottom = -1.2
  keyLight.shadow.bias = -0.0004
  keyLight.shadow.normalBias = 0.02
  keyLight.shadow.radius = 4
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight('#eef4ff', 0.65)
  fillLight.position.set(-2.6, 2.2, 1.8)
  scene.add(fillLight)

  const rimLight = new THREE.DirectionalLight('#ffe8d6', 0.95)
  rimLight.position.set(-1.1, 2.8, -2.5)
  scene.add(rimLight)

  // Seamless studio floor & subtle pedestal ring (LatheGeometry)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(10, 64),
    new THREE.MeshStandardMaterial({ color: '#d0c9c0', roughness: 0.92, metalness: 0.02 })
  )
  floor.rotation.x = -Math.PI * 0.5
  floor.receiveShadow = true
  scene.add(floor)

  const pedestalGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.56, -0.02),
      new THREE.Vector2(0.54, 0),
      new THREE.Vector2(0.0, 0),
    ],
    48
  )
  const pedestal = new THREE.Mesh(
    pedestalGeo,
    new THREE.MeshStandardMaterial({ color: '#c4bcb2', roughness: 0.85, metalness: 0.04 })
  )
  pedestal.receiveShadow = true
  scene.add(pedestal)

  // Add Hierarchical Female Companion Character
  const character = buildStylizedFemaleCharacter()
  scene.add(character)

  const clock = new THREE.Clock()
  let rafId = 0

  const animate = () => {
    rafId = requestAnimationFrame(animate)
    const t = clock.getElapsedTime()
    const j = character.userData.joints
    if (j) {
      // Gentle living idle breathing & subtle head poise
      j.torso.rotation.x = -0.02 + Math.sin(t * 1.6) * 0.012
      j.head.rotation.x = 0.02 + Math.sin(t * 1.6 - 0.5) * 0.015
      j.hair.rotation.z = Math.sin(t * 1.1) * 0.012
    }
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  const onResize = () => {
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)

  return {
    scene,
    camera,
    renderer,
    controls,
    character,
    setPose: (preset) => applyPose(character, preset),
    dispose: () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      character.userData.textures?.forEach((tex) => tex.dispose())
    },
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const autoMount = document.getElementById('companion-studio-root') || document.body
  if (autoMount && !window.__OPPONENT_COMPANION_AUTO_SKIP__) {
    window.__OPPONENT_COMPANION_SCENE__ = initOpponentCompanionStudioScene(autoMount)
  }
}
