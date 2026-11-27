# VR Catch Arena (`app-source`)

Cross-platform peer-to-peer interactive catch game built with React, Three.js (`@react-three/fiber`, `@react-three/xr`), and serverless WebRTC (`trystero`) with 3D spatial peer voice chat (`THREE.PositionalAudio`).

## Local Development

```bash
cd app-source
npm install
npm run dev
```

- Open the printed local URL in **multiple PC browser tabs** with the same `#room=CODE` URL to test cross-peer throwing, catching, avatar sync, and voice audio.
- On `localhost`, `@react-three/xr` enables the built-in **Meta Quest 3 WebXR emulator** (`iwer`), allowing you to click **Enter Meta Quest VR** directly in a desktop browser for VR testing.

## Playing from a Real Meta Quest Headset

1. **Via GitHub Pages HTTPS (`https://interactivevr.github.io`)**:
   Push to `main` so [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) builds `app-source/` and publishes to GitHub Pages over HTTPS (required by Meta Quest Browser for WebXR and microphone permissions).
2. **Via USB Debugging (`adb reverse`)**:
   ```bash
   adb reverse tcp:5173 tcp:5173
   ```
   Then open `http://localhost:5173` inside **Meta Quest Browser**.

## Controls

- **Meta Quest VR**:
  - **Grab / Catch**: Hold **Grip** (`squeeze`) or **Trigger** (`select`) — or **Pinch** in hand tracking — when a ball enters your hand catch ring.
  - **Throw**: Swing your arm and release Grip / Trigger / Pinch.
  - **Move / Turn**: Left thumbstick moves; right thumbstick snap-turns (`45°`).
  - **In-World VR Menu**: Point controller ray or pinch-ray at the floating side-rail console to Reset Balls, Rotate Roles, Switch Mode, Mute Mic, or Exit VR.
- **PC Browser**:
  - **Aim & Move**: Click the arena to lock mouse aim; move with `WASD` or Arrow keys (`Esc` unlocks cursor).
  - **Grab Ball**: `Left-Click` or press `F` near a ball.
  - **Catch Mitt**: Hold `Right-Click`, `Space`, or `E` to extend your catching mitt.
  - **Throw**: While holding a ball, hold `Left-Click` to charge the parabolic trajectory arc, then release to throw.
