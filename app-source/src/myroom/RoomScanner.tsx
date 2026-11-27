import { useFrame } from '@react-three/fiber'
import { useXRMeshes, useXRPlanes, XRMeshModel, XRPlaneModel } from '@react-three/xr'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomSurfaceCollider } from './types'
import { myRoomRuntime, useMyRoomStore } from './useMyRoomStore'

const _mat4 = new THREE.Matrix4()
const _quat = new THREE.Quaternion()
const _pos = new THREE.Vector3()
const _normal = new THREE.Vector3()

/**
 * Scans real-world Meta Quest / WebXR AR room planes & meshes (tables, floors, walls, couches)
 * into live room physics colliders and renders an optional subtle wireframe overlay.
 */
export function RoomScanner() {
  const showRoomMesh = useMyRoomStore((s) => s.showRoomMesh)
  const planes = useXRPlanes()
  const meshes = useXRMeshes()
  const gl = useThree((s) => s.gl)

  useFrame((_, _delta, frame) => {
    if (!frame) return
    const refSpace = gl.xr.getReferenceSpace()
    if (!refSpace) return

    const extracted: RoomSurfaceCollider[] = []

    for (let i = 0; i < planes.length; i++) {
      const p = planes[i]
      const pose = frame.getPose(p.planeSpace, refSpace)
      if (!pose) continue

      _mat4.fromArray(pose.transform.matrix)
      _pos.setFromMatrixPosition(_mat4)
      _quat.setFromRotationMatrix(_mat4)
      _normal.set(0, 1, 0).applyQuaternion(_quat).normalize()

      // Compute local XZ polygon bounding extents
      let minX = Infinity
      let maxX = -Infinity
      let minZ = Infinity
      let maxZ = -Infinity
      const poly = p.polygon
      for (let j = 0; j < poly.length; j++) {
        const pt = poly[j]
        if (pt.x < minX) minX = pt.x
        if (pt.x > maxX) maxX = pt.x
        if (pt.z < minZ) minZ = pt.z
        if (pt.z > maxZ) maxZ = pt.z
      }
      if (!Number.isFinite(minX)) continue

      const halfW = Math.max(0.15, (maxX - minX) * 0.5)
      const halfD = Math.max(0.15, (maxZ - minZ) * 0.5)
      const isHorizontal = p.orientation === 'horizontal' || Math.abs(_normal.y) > 0.72

      extracted.push({
        id: `plane_${i}_${p.semanticLabel ?? 'surface'}`,
        label: p.semanticLabel ?? (isHorizontal ? 'surface' : 'wall'),
        orientation: isHorizontal ? 'horizontal' : 'vertical',
        center: [_pos.x, _pos.y, _pos.z],
        halfExtents: isHorizontal ? [halfW, 0.03, halfD] : [halfW, 1.35, halfD],
        normal: [_normal.x, _normal.y, _normal.z],
      })
    }

    myRoomRuntime.surfaces = extracted
    const totalCount = extracted.length + meshes.length
    if (useMyRoomStore.getState().scannedSurfaceCount !== totalCount) {
      useMyRoomStore.getState().setScannedSurfaceCount(totalCount)
    }
  })

  return (
    <group visible={showRoomMesh}>
      {planes.map((plane, idx) => (
        <XRPlaneModel key={`mr-plane-${idx}`} plane={plane}>
          <meshBasicMaterial
            color={
              plane.semanticLabel === 'floor'
                ? '#10b981'
                : plane.semanticLabel === 'table' || plane.semanticLabel === 'desk'
                  ? '#fbbf24'
                  : '#38bdf8'
            }
            wireframe
            transparent
            opacity={0.28}
            depthWrite={false}
          />
        </XRPlaneModel>
      ))}
      {meshes.map((xrMesh, idx) => (
        <XRMeshModel key={`mr-mesh-${idx}`} mesh={xrMesh}>
          <meshBasicMaterial
            color="#a855f7"
            wireframe
            transparent
            opacity={0.22}
            depthWrite={false}
          />
        </XRMeshModel>
      ))}
    </group>
  )
}
