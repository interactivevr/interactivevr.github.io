import { createXRStore } from '@react-three/xr'

export const xrStore = createXRStore({
  controller: {
    left: true,
    right: true,
    rayPointer: {
      rayModel: { color: '#38bdf8' },
    },
  },
  hand: {
    left: { model: false },
    right: { model: false },
  },
  planeDetection: true,
  meshDetection: true,
  anchors: true,
  hitTest: true,
  handTracking: true,
  foveation: 0.5,
  frameRate: 'high',
  emulate: {
    type: 'metaQuest3',
    syntheticEnvironment: false,
  },
})
