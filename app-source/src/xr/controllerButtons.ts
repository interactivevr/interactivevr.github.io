import { XRControllerState } from '@react-three/xr'

/**
 * Reads an xr-standard controller button state across both named component ids (e.g. 'a-button', 'b-button')
 * and raw WebXR gamepad button indices (4 = lower face A/X, 5 = upper face B/Y).
 */
export function isXRControllerButtonPressed(
  ctrl: XRControllerState | undefined,
  componentId: string,
  fallbackButtonIndex: number
): boolean {
  if (!ctrl) return false
  const comp = ctrl.gamepad?.[componentId]
  if (comp?.state === 'pressed' || (comp?.button ?? 0) > 0.5) {
    return true
  }
  const rawBtn = ctrl.inputSource?.gamepad?.buttons?.[fallbackButtonIndex]
  return Boolean(rawBtn?.pressed || (rawBtn?.value ?? 0) > 0.5)
}

export function pulseXRControllerHaptics(
  inputSource: XRInputSource | undefined,
  intensity: number,
  durationMs: number
): void {
  if (!inputSource?.gamepad) return
  try {
    const actuators = (
      inputSource.gamepad as Gamepad & {
        hapticActuators?: Array<{ pulse?: (v: number, d: number) => Promise<boolean> }>
      }
    ).hapticActuators
    if (actuators && typeof actuators[0]?.pulse === 'function') {
      void actuators[0].pulse(intensity, durationMs)
    }
  } catch {
    // Ignore browsers without WebXR hapticActuators
  }
}
