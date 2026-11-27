import { useFrame, useThree } from '@react-three/fiber'
import { useXR, useXRMeshes, useXRPlanes } from '@react-three/xr'
import { useMemo } from 'react'
import * as THREE from 'three'
import { RoomSurfaceCollider } from './types'
import { myRoomRuntime, useMyRoomStore } from './useMyRoomStore'

const _mat4 = new THREE.Matrix4()
const _quat = new THREE.Quaternion()
const _pos = new THREE.Vector3()
const _normal = new THREE.Vector3()
const _uAxis = new THREE.Vector3()
const _vAxis = new THREE.Vector3()
const _ptWorld = new THREE.Vector3()

/**
 * Clean, lightweight room collider extractor reading BOTH Quest XRPlanes (walls, floor, tables,
 * couches) and XRMeshes into exact world-space colliders — without covering the user's real room
 * in dense distracting wireframe nets.
 */
export function RoomScanner() {
  const showRoomMesh = useMyRoomStore((s) => s.showRoomMesh)
  const planes = useXRPlanes()
  const meshes = useXRMeshes()
  const gl = useThree((s) => s.gl)
  const originRefSpace = useXR((s) => s.originReferenceSpace)

  // Clean minimalist floor perimeter line geometry shown ONLY when user toggles ROOM SCAN: ON
  const perimeterGeo = useMemo(() => new THREE.BufferGeometry(), [])

  useFrame((_, _delta, frame) => {
    if (!frame) return
    const refSpace = originRefSpace ?? gl.xr.getReferenceSpace()
    if (!refSpace) return

    const extracted: RoomSurfaceCollider[] = []
    let floorY = 0
    let foundFloor = false
    let rMinX = Infinity
    let rMaxX = -Infinity
    let rMinZ = Infinity
    let rMaxZ = -Infinity

    // 1. Extract oriented planes (walls, tables, floor, couches, desks)
    for (let i = 0; i < planes.length; i++) {
      const p = planes[i]
      const pose = frame.getPose(p.planeSpace, refSpace)
      if (!pose) continue

      _mat4.fromArray(pose.transform.matrix)
      _pos.setFromMatrixPosition(_mat4)
      _quat.setFromRotationMatrix(_mat4)
      _normal.set(0, 1, 0).applyQuaternion(_quat).normalize()
      _uAxis.set(1, 0, 0).applyQuaternion(_quat).normalize()
      _vAxis.set(0, 0, 1).applyQuaternion(_quat).normalize()

      const poly = p.polygon
      if (!poly || poly.length === 0) continue

      let minU = Infinity
      let maxU = -Infinity
      let minV = Infinity
      let maxV = -Infinity
      let wMinX = Infinity
      let wMaxX = -Infinity
      let wMinY = Infinity
      let wMaxY = -Infinity
      let wMinZ = Infinity
      let wMaxZ = -Infinity

      for (let j = 0; j < poly.length; j++) {
        const pt = poly[j]
        if (pt.x < minU) minU = pt.x
        if (pt.x > maxU) maxU = pt.x
        if (pt.z < minV) minV = pt.z
        if (pt.z > maxV) maxV = pt.z

        _ptWorld.set(pt.x, pt.y, pt.z).applyMatrix4(_mat4)
        if (_ptWorld.x < wMinX) wMinX = _ptWorld.x
        if (_ptWorld.x > wMaxX) wMaxX = _ptWorld.x
        if (_ptWorld.y < wMinY) wMinY = _ptWorld.y
        if (_ptWorld.y > wMaxY) wMaxY = _ptWorld.y
        if (_ptWorld.z < wMinZ) wMinZ = _ptWorld.z
        if (_ptWorld.z > wMaxZ) wMaxZ = _ptWorld.z
      }

      const rawLabel = (p.semanticLabel ?? '').toLowerCase()
      const isHorizontal = p.orientation === 'horizontal' || Math.abs(_normal.y) > 0.72
      const halfU = Math.max(0.12, (maxU - minU) * 0.5)
      const halfV = Math.max(0.12, (maxV - minV) * 0.5)
      const label = rawLabel || (isHorizontal ? 'surface' : 'wall')

      if (label === 'floor' && (!foundFloor || halfU * halfV > 0.5)) {
        floorY = _pos.y
        foundFloor = true
      }

      if (label === 'floor' || label.includes('wall')) {
        rMinX = Math.min(rMinX, wMinX)
        rMaxX = Math.max(rMaxX, wMaxX)
        rMinZ = Math.min(rMinZ, wMinZ)
        rMaxZ = Math.max(rMaxZ, wMaxZ)
      }

      extracted.push({
        id: `plane_${i}_${label}`,
        label,
        orientation: isHorizontal ? 'horizontal' : 'vertical',
        center: [(wMinX + wMaxX) * 0.5, (wMinY + wMaxY) * 0.5, (wMinZ + wMaxZ) * 0.5],
        halfExtents: [
          Math.max(0.08, (wMaxX - wMinX) * 0.5),
          Math.max(0.03, (wMaxY - wMinY) * 0.5),
          Math.max(0.08, (wMaxZ - wMinZ) * 0.5),
        ],
        uAxis: [_uAxis.x, _uAxis.y, _uAxis.z],
        vAxis: [_vAxis.x, _vAxis.y, _vAxis.z],
        halfU,
        halfV,
        minY: wMinY,
        maxY: wMaxY,
        normal: [_normal.x, _normal.y, _normal.z],
      })
    }

    // 2. Extract Quest semantic XRMesh furniture/wall bounding colliders (ignoring whole-room global mesh blob)
    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i]
      const rawLabel = (m.semanticLabel ?? 'mesh').toLowerCase()
      if (rawLabel.includes('global')) continue

      const pose = frame.getPose(m.meshSpace, refSpace)
      if (!pose || m.vertices.length < 9) continue

      _mat4.fromArray(pose.transform.matrix)
      let wMinX = Infinity
      let wMaxX = -Infinity
      let wMinY = Infinity
      let wMaxY = -Infinity
      let wMinZ = Infinity
      let wMaxZ = -Infinity

      const verts = m.vertices
      const step = Math.max(3, Math.floor(verts.length / 180) * 3)
      for (let k = 0; k + 2 < verts.length; k += step) {
        _ptWorld.set(verts[k], verts[k + 1], verts[k + 2]).applyMatrix4(_mat4)
        if (_ptWorld.x < wMinX) wMinX = _ptWorld.x
        if (_ptWorld.x > wMaxX) wMaxX = _ptWorld.x
        if (_ptWorld.y < wMinY) wMinY = _ptWorld.y
        if (_ptWorld.y > wMaxY) wMaxY = _ptWorld.y
        if (_ptWorld.z < wMinZ) wMinZ = _ptWorld.z
        if (_ptWorld.z > wMaxZ) wMaxZ = _ptWorld.z
      }
      if (!Number.isFinite(wMinX)) continue

      const isWall = rawLabel.includes('wall') || rawLabel.includes('window') || rawLabel.includes('door')
      const hX = Math.max(0.08, (wMaxX - wMinX) * 0.5)
      const hY = Math.max(0.04, (wMaxY - wMinY) * 0.5)
      const hZ = Math.max(0.08, (wMaxZ - wMinZ) * 0.5)

      if (isWall) {
        rMinX = Math.min(rMinX, wMinX)
        rMaxX = Math.max(rMaxX, wMaxX)
        rMinZ = Math.min(rMinZ, wMinZ)
        rMaxZ = Math.max(rMaxZ, wMaxZ)
      }

      // Compute primary horizontal direction for vertical wall mesh normal
      _quat.setFromRotationMatrix(_mat4)
      _normal.set(0, 0, 1).applyQuaternion(_quat).normalize()
      _uAxis.set(1, 0, 0).applyQuaternion(_quat).normalize()

      extracted.push({
        id: `mesh_${i}_${rawLabel}`,
        label: rawLabel,
        orientation: isWall ? 'vertical' : 'horizontal',
        center: [(wMinX + wMaxX) * 0.5, (wMinY + wMaxY) * 0.5, (wMinZ + wMaxZ) * 0.5],
        halfExtents: [hX, hY, hZ],
        uAxis: isWall ? [_uAxis.x, 0, _uAxis.z] : [1, 0, 0],
        vAxis: isWall ? [0, 1, 0] : [0, 0, 1],
        halfU: isWall ? Math.max(hX, hZ) : hX,
        halfV: isWall ? hY : hZ,
        minY: wMinY,
        maxY: wMaxY,
        normal: isWall ? [_normal.x, 0, _normal.z] : [0, 1, 0],
      })
    }

    myRoomRuntime.surfaces = extracted
    if (foundFloor) {
      myRoomRuntime.floorY = floorY
    }
    if (Number.isFinite(rMinX) && rMaxX - rMinX > 1.2 && rMaxZ - rMinZ > 1.2) {
      myRoomRuntime.roomBoundsXZ = {
        minX: rMinX,
        maxX: rMaxX,
        minZ: rMinZ,
        maxZ: rMaxZ,
      }
    }

    // Update clean single perimeter border lines when user turns ROOM SCAN overlay on (no net across room!)
    if (showRoomMesh) {
      const b = myRoomRuntime.roomBoundsXZ
      const y = myRoomRuntime.floorY + 0.015
      const pts: number[] = [
        b.minX, y, b.minZ, b.maxX, y, b.minZ,
        b.maxX, y, b.minZ, b.maxX, y, b.maxZ,
        b.maxX, y, b.maxZ, b.minX, y, b.maxZ,
        b.minX, y, b.maxZ, b.minX, y, b.minZ,
      ]
      // Add clean top outline boxes ONLY for horizontal tables/desks/couches (not walls/floor!)
      for (let i = 0; i < extracted.length; i++) {
        const s = extracted[i]
        if (
          s.orientation === 'horizontal' &&
          s.label !== 'floor' &&
          s.label !== 'ceiling'
        ) {
          const x0 = s.center[0] - s.halfExtents[0]
          const x1 = s.center[0] + s.halfExtents[0]
          const z0 = s.center[2] - s.halfExtents[2]
          const z1 = s.center[2] + s.halfExtents[2]
          const sy = s.maxY + 0.01
          pts.push(
            x0, sy, z0, x1, sy, z0,
            x1, sy, z0, x1, sy, z1,
            x1, sy, z1, x0, sy, z1,
            x0, sy, z1, x0, sy, z0
          )
        }
      }
      perimeterGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    }

    const totalCount = extracted.length
    if (useMyRoomStore.getState().scannedSurfaceCount !== totalCount) {
      useMyRoomStore.getState().setScannedSurfaceCount(totalCount)
    }
  })

  if (!showRoomMesh) return null

  return (
    <lineSegments geometry={perimeterGeo}>
      <lineBasicMaterial color="#34d399" transparent opacity={0.75} />
    </lineSegments>
  )
}
