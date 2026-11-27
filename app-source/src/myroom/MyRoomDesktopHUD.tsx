import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { playMaterialActionSfx } from '../audio/myroomSfx'
import { p2pClient } from '../net/p2pClient'
import { voiceAudio } from '../net/voiceAudio'
import { runtimeState, useGameStore } from '../store/useGameStore'
import { xrStore } from '../xr/xrStore'
import { computeAIDartThrowVelocity, findDartboardPlacement } from './dartEngine'
import { raycastRoomPlacementPoint } from './roomPhysics'
import { computeDecorPlacement } from './RoomShowcaseLayer'
import {
  CraftMaterialKind,
  CraftShapePreset,
  getAllPaletteColors,
  getDefaultColorForKind,
  MATERIAL_PHYSICS,
  ROOM_DECOR_CATALOG,
  RoomDecorKind,
  WALLMATE_SCENERY_NAMES,
  WristToolKind,
} from './types'
import {
  clearAllCreatedRoomContent,
  clearAllMyRoomDecor,
  clearAllMyRoomObjects,
  deleteRuntimeCraftObject,
  deleteRuntimeDecor,
  getCombinedRoomSurfaces,
  myRoomRuntime,
  spawnRuntimeCraftObject,
  spawnRuntimeDecor,
  useMyRoomStore,
} from './useMyRoomStore'

const _q = new THREE.Quaternion()
const _fwd = new THREE.Vector3()

function getCameraPoseAndFwd(): { pos: [number, number, number]; fwd: [number, number, number] } {
  const lp = runtimeState.localPose
  _q.set(lp.headQuat[0], lp.headQuat[1], lp.headQuat[2], lp.headQuat[3])
  _fwd.set(0, 0, -1).applyQuaternion(_q).normalize()
  return {
    pos: [lp.headPos[0], lp.headPos[1], lp.headPos[2]],
    fwd: [_fwd.x, _fwd.y, _fwd.z],
  }
}

export function MyRoomDesktopHUD() {
  const [optionsOpen, setOptionsOpen] = useState(true)
  const inXR = useGameStore((s) => s.inXR)
  const arSupported = useGameStore((s) => s.arSupported)
  const xrSupported = useGameStore((s) => s.xrSupported)
  const vrMenuVisible = useGameStore((s) => s.vrMenuVisible)
  const aiGender = useGameStore((s) => s.aiAvatarGender)
  const micEnabled = useGameStore((s) => s.micEnabled)
  const localPeerId = useGameStore((s) => s.localPeerId)

  const objectCount = useMyRoomStore((s) => s.objectCount)
  useMyRoomStore((s) => s.objectListVersion)
  const decorCount = useMyRoomStore((s) => s.decorCount)
  useMyRoomStore((s) => s.decorVersion)
  const showcaseOpen = useMyRoomStore((s) => s.showcaseOpen)
  const showRoomMesh = useMyRoomStore((s) => s.showRoomMesh)
  const showAiOpponent = useMyRoomStore((s) => s.showAiOpponent)
  const aiDressupStyle = useMyRoomStore((s) => s.aiDressupStyle)
  const aiCanProduceObjects = useMyRoomStore((s) => s.aiCanProduceObjects)
  const aiAutoRotate = useMyRoomStore((s) => s.aiAutoRotate)
  const selectedCraftId = useMyRoomStore((s) => s.selectedCraftId)
  const selectedDecorId = useMyRoomStore((s) => s.selectedDecorId)
  const showSelfBody = useMyRoomStore((s) => s.showSelfBody)
  const opponentMode = useMyRoomStore((s) => s.opponentMode)
  const activeTool = useMyRoomStore((s) => s.activeTool)
  const selectedColor = useMyRoomStore((s) => s.selectedColor)
  const dartGame = useMyRoomStore((s) => s.dartGame)
  const statusHint = useMyRoomStore((s) => s.statusHint)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab' || e.code === 'KeyO') {
        e.preventDefault()
        setOptionsOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (inXR) return null

  const spawnInRoom = (kind: CraftMaterialKind, preset: CraftShapePreset) => {
    const { pos, fwd } = getCameraPoseAndFwd()
    const placePos = raycastRoomPlacementPoint(
      pos,
      fwd,
      getCombinedRoomSurfaces(),
      myRoomRuntime.floorY,
      1.15
    )
    const spec = MATERIAL_PHYSICS[kind]
    spawnRuntimeCraftObject({
      ownerId: null,
      creatorId: localPeerId || 'local',
      kind,
      preset,
      color: getDefaultColorForKind(kind),
      pos: placePos,
      broadcast: true,
    })
    useMyRoomStore.getState().setStatusHint(`Spawned ${spec.label} (${spec.massKg}kg)`)
  }

  const spawnDecor = (kind: RoomDecorKind) => {
    const { pos, fwd } = getCameraPoseAndFwd()
    const placement = computeDecorPlacement(
      kind,
      pos,
      fwd,
      getCombinedRoomSurfaces(),
      myRoomRuntime.floorY,
      myRoomRuntime.roomBoundsXZ
    )
    const variantIdx =
      kind === 'wallmate' ? Math.floor(Math.random() * WALLMATE_SCENERY_NAMES.length) : 0
    spawnRuntimeDecor({
      creatorId: localPeerId || 'local',
      kind,
      variantIdx,
      pos: placement.pos,
      yaw: placement.yaw,
      broadcast: true,
    })
    playMaterialActionSfx('wood', 'fold')
    useMyRoomStore.getState().setStatusHint(`Placed ${ROOM_DECOR_CATALOG[kind].label}`)
  }

  const throwDesktopDart = () => {
    const st = useMyRoomStore.getState()
    const dg = st.dartGame
    const myId = localPeerId || 'local'
    if (!dg.active || dg.finished) return
    if (dg.turnOwnerId !== myId && dg.turnOwnerId !== 'local') return
    const myCount = dg.throws.filter((t) => t.thrower === 'local').length
    if (myCount >= 6) return
    if (myRoomRuntime.darts.flyingDarts.some((d) => d.thrower === 'local' && !d.settled)) return

    const { pos } = getCameraPoseAndFwd()
    const launchPos: [number, number, number] = [pos[0] + 0.14, pos[1] - 0.12, pos[2]]
    const vel = computeAIDartThrowVelocity(launchPos, dg.boardPose)
    myRoomRuntime.darts.flyingDarts.push({
      id: `tap_dart_${dg.matchId}_${myCount}_${Date.now()}`,
      thrower: 'local',
      throwerId: myId,
      throwIndex: myCount,
      inFlight: true,
      settled: false,
      flightTimeSec: 0,
      pos: launchPos,
      prevPos: [...launchPos],
      vel,
      quat: [0, 0, 0, 1],
    })
    myRoomRuntime.darts.readyDart = null
    myRoomRuntime.darts.lastThrowAtSec = performance.now() / 1000
  }

  const tools: Array<{ kind: WristToolKind; label: string }> = [
    { kind: 'none', label: 'Hand' },
    { kind: 'pen', label: 'Pen' },
    { kind: 'knife', label: 'Knife' },
    { kind: 'axe', label: 'Axe' },
    { kind: 'tester', label: 'Tester' },
  ]

  const decorButtons: Array<{ kind: RoomDecorKind; label: string }> = [
    { kind: 'wallmate', label: '+ Wallmate' },
    { kind: 'lamp', label: '+ Lamp' },
    { kind: 'tv', label: '+ Smart TV' },
    { kind: 'table', label: '+ Table' },
    { kind: 'showcase', label: '+ Showcase' },
    { kind: 'sofa', label: '+ Sofa' },
    { kind: 'plant', label: '+ Plant' },
    { kind: 'clock', label: '+ Clock' },
    { kind: 'rug', label: '+ Rug' },
  ]

  return (
    <div className="hud-layer">
      <div className="hud-topbar">
        <div className="hud-card">
          <div className="hud-stat">
            <span className="hud-stat-label">MyRoom 3D Preview</span>
            <span className="hud-stat-val" style={{ color: '#38bdf8', fontSize: '0.82rem' }}>
              Objects: {objectCount} • Decor: {decorCount}
            </span>
          </div>

          <button
            type="button"
            className="hud-btn"
            style={{
              background: optionsOpen ? '#0284c7' : undefined,
              borderColor: optionsOpen ? '#38bdf8' : undefined,
            }}
            onClick={() => setOptionsOpen((v) => !v)}
          >
            {optionsOpen ? 'Hide Options (Tab)' : 'App Options (Tab)'}
          </button>

          <button
            type="button"
            className="hud-btn"
            style={{
              background: vrMenuVisible ? '#059669' : undefined,
            }}
            onClick={() => useGameStore.getState().toggleVrMenu()}
          >
            {vrMenuVisible ? '3D Menu: ON (B)' : '3D Menu: OFF (B)'}
          </button>

          <button
            type="button"
            className="hud-btn"
            style={{
              background: showcaseOpen ? '#b45309' : undefined,
            }}
            onClick={() => useMyRoomStore.getState().setShowcaseOpen(!showcaseOpen)}
          >
            {showcaseOpen ? 'Showcase: ON' : 'Showcase: OFF'}
          </button>

          <button
            type="button"
            className="hud-btn"
            onClick={() => useMyRoomStore.getState().setShowAiOpponent(!showAiOpponent)}
          >
            {showAiOpponent ? 'AI: Visible' : 'AI: Hidden'}
          </button>

          <button
            type="button"
            className="hud-btn"
            style={{
              background:
                aiDressupStyle === 'sport'
                  ? '#0284c7'
                  : aiDressupStyle === 'nerdy'
                    ? '#4338ca'
                    : '#7d293b',
            }}
            onClick={() => {
              const next =
                aiDressupStyle === 'chic' ? 'nerdy' : aiDressupStyle === 'nerdy' ? 'sport' : 'chic'
              useMyRoomStore.getState().setAiDressupStyle(next)
            }}
          >
            Dress: {aiDressupStyle === 'sport' ? 'Sporty' : aiDressupStyle === 'nerdy' ? 'Nerdy' : 'Chic'}
          </button>

          <button
            type="button"
            className="hud-btn"
            title="Rotate Model Left 45°"
            onClick={() => useMyRoomStore.getState().rotateAiModelBy(-Math.PI * 0.25)}
          >
            ⟲ -45°
          </button>
          <button
            type="button"
            className="hud-btn"
            title="Rotate Model Right 45°"
            onClick={() => useMyRoomStore.getState().rotateAiModelBy(Math.PI * 0.25)}
          >
            ⟳ +45°
          </button>
          <button
            type="button"
            className="hud-btn"
            style={{
              background: aiAutoRotate ? '#0ea5e9' : undefined,
            }}
            onClick={() => useMyRoomStore.getState().setAiAutoRotate(!aiAutoRotate)}
          >
            {aiAutoRotate ? 'Spin: ON (R)' : 'Spin: OFF (R)'}
          </button>

          {arSupported && (
            <button type="button" className="hud-btn vr-enter" onClick={() => void xrStore.enterAR()}>
              Enter AR
            </button>
          )}
          {xrSupported && (
            <button type="button" className="hud-btn vr-enter" onClick={() => void xrStore.enterVR()}>
              Enter VR
            </button>
          )}
          <button
            type="button"
            className="hud-btn danger"
            onClick={() => {
              void p2pClient.disconnect()
              useGameStore.getState().leaveRoomReset()
            }}
          >
            Back to Lobby
          </button>
        </div>
      </div>

      {optionsOpen && (
        <div
          style={{
            position: 'absolute',
            top: '74px',
            right: '16px',
            width: '320px',
            maxHeight: 'calc(100vh - 140px)',
            overflowY: 'auto',
            pointerEvents: 'auto',
            background: 'rgba(11, 18, 32, 0.9)',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            backdropFilter: 'blur(10px)',
            borderRadius: '14px',
            padding: '12px',
            display: 'grid',
            gap: '10px',
            color: '#f8fafc',
            fontSize: '0.78rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ color: '#38bdf8' }}>MyRoom Studio &amp; Options</strong>
            <button
              type="button"
              className="hud-btn"
              style={{ padding: '3px 8px', fontSize: '0.72rem' }}
              onClick={() => setOptionsOpen(false)}
            >
              Close
            </button>
          </div>

          {statusHint && (
            <div
              style={{
                background: 'rgba(250, 204, 21, 0.12)',
                border: '1px solid rgba(250, 204, 21, 0.3)',
                borderRadius: '8px',
                padding: '6px 8px',
                color: '#fde047',
                fontSize: '0.72rem',
              }}
            >
              {statusHint}
            </div>
          )}

          <div>
            <div className="hud-stat-label" style={{ marginBottom: '5px' }}>
              Avatar &amp; Scene
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                type="button"
                className="hud-btn"
                onClick={() =>
                  useGameStore.getState().setAiAvatarGender(aiGender === 'male' ? 'female' : 'male')
                }
              >
                AI: {aiGender === 'female' ? 'Female' : 'Male'}
              </button>
              <button
                type="button"
                className="hud-btn"
                style={{
                  background:
                    aiDressupStyle === 'sport'
                      ? '#0284c7'
                      : aiDressupStyle === 'nerdy'
                        ? '#4338ca'
                        : '#7d293b',
                }}
                onClick={() => {
                  const next =
                    aiDressupStyle === 'chic' ? 'nerdy' : aiDressupStyle === 'nerdy' ? 'sport' : 'chic'
                  useMyRoomStore.getState().setAiDressupStyle(next)
                }}
              >
                Dressup: {aiDressupStyle === 'sport' ? 'Sporty' : aiDressupStyle === 'nerdy' ? 'Nerdy' : 'Chic'}
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => useMyRoomStore.getState().rotateAiModelBy(-Math.PI * 0.25)}
              >
                Rotate Left (-45°)
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => useMyRoomStore.getState().rotateAiModelBy(Math.PI * 0.25)}
              >
                Rotate Right (+45°)
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => useMyRoomStore.getState().rotateAiModelBy(Math.PI)}
              >
                Turn 180° (Back)
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => useMyRoomStore.getState().resetAiModelRotation()}
              >
                Reset Front
              </button>
              <button
                type="button"
                className="hud-btn"
                style={{
                  background: aiAutoRotate ? '#0ea5e9' : undefined,
                }}
                onClick={() => useMyRoomStore.getState().setAiAutoRotate(!aiAutoRotate)}
              >
                Auto-Spin: {aiAutoRotate ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => useMyRoomStore.getState().setShowAiOpponent(!showAiOpponent)}
              >
                {showAiOpponent ? 'Hide AI' : 'Show AI'}
              </button>
              <button
                type="button"
                className="hud-btn"
                style={{
                  background: aiCanProduceObjects ? '#059669' : undefined,
                }}
                onClick={() => useMyRoomStore.getState().setAiCanProduceObjects(!aiCanProduceObjects)}
              >
                AI Produce: {aiCanProduceObjects ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => {
                  const next =
                    opponentMode === 'auto' ? 'computer' : opponentMode === 'computer' ? 'peer' : 'auto'
                  useMyRoomStore.getState().setOpponentMode(next)
                }}
              >
                Mode: {opponentMode.toUpperCase()}
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => {
                  myRoomRuntime.ai.pullToUserActive = true
                  useMyRoomStore.getState().setStatusHint('Pulling companion nearest to you!')
                }}
              >
                Pull AI Near Me
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => useMyRoomStore.getState().setShowRoomMesh(!showRoomMesh)}
              >
                Scan: {showRoomMesh ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => useMyRoomStore.getState().setShowSelfBody(!showSelfBody)}
              >
                My Body: {showSelfBody ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => {
                  voiceAudio.setMicEnabled(!micEnabled)
                  p2pClient.broadcastProfile()
                }}
              >
                {micEnabled ? 'Mic: ON' : 'Mic: Muted'}
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => useGameStore.getState().toggleVrMenu()}
              >
                3D Menu: {vrMenuVisible ? 'Shown' : 'Hidden'}
              </button>
            </div>
          </div>

          <div>
            <div className="hud-stat-label" style={{ marginBottom: '5px' }}>
              Watch Tools
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {tools.map((t) => (
                <button
                  key={t.kind}
                  type="button"
                  className="hud-btn"
                  style={{
                    background: activeTool === t.kind ? '#0284c7' : undefined,
                    padding: '4px 9px',
                    fontSize: '0.74rem',
                  }}
                  onClick={() => useMyRoomStore.getState().setActiveTool(t.kind)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="hud-stat-label" style={{ marginBottom: '5px' }}>
              Craft Materials
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
              <button type="button" className="hud-btn" onClick={() => spawnInRoom('clay', 'sphere')}>
                + Clay (0.7kg)
              </button>
              <button type="button" className="hud-btn" onClick={() => spawnInRoom('paper', 'sheet')}>
                + Paper (15g)
              </button>
              <button type="button" className="hud-btn" onClick={() => spawnInRoom('cloth', 'towel')}>
                + Cloth (0.2kg)
              </button>
              <button type="button" className="hud-btn" onClick={() => spawnInRoom('wood', 'block')}>
                + Wood Block
              </button>
              <button type="button" className="hud-btn" onClick={() => spawnInRoom('wood', 'plate')}>
                + Wood Plate
              </button>
              <button type="button" className="hud-btn" onClick={() => spawnInRoom('metal', 'block')}>
                + Metal Block
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => {
                  const all = getAllPaletteColors()
                  const next = all[(all.indexOf(selectedColor) + 1) % all.length]
                  useMyRoomStore.getState().setSelectedColor(next)
                }}
              >
                Next Color
              </button>
              <button
                type="button"
                className="hud-btn"
                style={{ background: '#ea580c' }}
                onClick={() => {
                  const keys = Array.from(myRoomRuntime.objects.keys())
                  const targetId =
                    selectedCraftId && myRoomRuntime.objects.has(selectedCraftId)
                      ? selectedCraftId
                      : keys[keys.length - 1]
                  if (targetId) deleteRuntimeCraftObject(targetId, true)
                }}
              >
                {selectedCraftId ? 'Remove Selected' : 'Remove Last Obj'}
              </button>
              <button
                type="button"
                className="hud-btn danger"
                onClick={() => clearAllMyRoomObjects()}
              >
                Clear All Objs
              </button>
              <button
                type="button"
                className="hud-btn danger"
                style={{ gridColumn: '1 / -1' }}
                onClick={() => {
                  clearAllCreatedRoomContent()
                  useMyRoomStore.getState().setStatusHint('Removed all created craft objects and room decor!')
                }}
              >
                Remove All Created Objects &amp; Decor
              </button>
            </div>
          </div>

          {(objectCount > 0 || decorCount > 0) && (
            <div>
              <div className="hud-stat-label" style={{ marginBottom: '5px' }}>
                Remove Individual Created Items ({objectCount + decorCount})
              </div>
              <div
                style={{
                  maxHeight: '120px',
                  overflowY: 'auto',
                  display: 'grid',
                  gap: '4px',
                  paddingRight: '2px',
                }}
              >
                {Array.from(myRoomRuntime.objects.values()).map((obj) => (
                  <div
                    key={obj.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background:
                        selectedCraftId === obj.id
                          ? 'rgba(56, 189, 248, 0.2)'
                          : 'rgba(30, 41, 59, 0.72)',
                      borderRadius: '6px',
                      padding: '3px 7px',
                    }}
                  >
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#e2e8f0',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onClick={() => useMyRoomStore.getState().setSelectedCraftId(obj.id)}
                    >
                      {MATERIAL_PHYSICS[obj.kind].label} ({obj.preset}, {obj.creatorId})
                    </button>
                    <button
                      type="button"
                      className="hud-btn danger"
                      style={{ padding: '2px 7px', fontSize: '0.68rem' }}
                      onClick={() => deleteRuntimeCraftObject(obj.id, true)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {Array.from(myRoomRuntime.decorItems.values()).map((dec) => (
                  <div
                    key={dec.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background:
                        selectedDecorId === dec.id
                          ? 'rgba(251, 191, 36, 0.2)'
                          : 'rgba(30, 41, 59, 0.72)',
                      borderRadius: '6px',
                      padding: '3px 7px',
                    }}
                  >
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#fde68a',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onClick={() => useMyRoomStore.getState().setSelectedDecorId(dec.id)}
                    >
                      Decor: {ROOM_DECOR_CATALOG[dec.kind].label}
                    </button>
                    <button
                      type="button"
                      className="hud-btn danger"
                      style={{ padding: '2px 7px', fontSize: '0.68rem' }}
                      onClick={() => deleteRuntimeDecor(dec.id, true)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="hud-stat-label" style={{ marginBottom: '5px' }}>
              Showcase Room Redesign
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px' }}>
              {decorButtons.map((d) => (
                <button
                  key={d.kind}
                  type="button"
                  className="hud-btn"
                  style={{ padding: '4px 6px', fontSize: '0.72rem' }}
                  onClick={() => spawnDecor(d.kind)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginTop: '5px' }}>
              <button
                type="button"
                className="hud-btn"
                onClick={() => useMyRoomStore.getState().setShowcaseOpen(!showcaseOpen)}
              >
                {showcaseOpen ? 'Hide 3D Showcase' : 'Show 3D Showcase'}
              </button>
              <button
                type="button"
                className="hud-btn danger"
                onClick={() => clearAllMyRoomDecor()}
              >
                Clear Decor
              </button>
            </div>
          </div>

          <div>
            <div className="hud-stat-label" style={{ marginBottom: '5px' }}>
              6-Dart Match ({dartGame.active ? dartGame.lastCallout : 'Ready'})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
              <button
                type="button"
                className="hud-btn"
                style={{ background: dartGame.active && !dartGame.finished ? '#e11d48' : '#16a34a' }}
                onClick={() => {
                  const st = useMyRoomStore.getState()
                  if (!st.dartGame.active || st.dartGame.finished) {
                    const { pos, fwd } = getCameraPoseAndFwd()
                    st.startDartMatch(
                      findDartboardPlacement(
                        pos,
                        [fwd[0], fwd[2]],
                        myRoomRuntime.surfaces,
                        myRoomRuntime.floorY,
                        myRoomRuntime.roomBoundsXZ
                      ),
                      localPeerId || 'local',
                      true
                    )
                  } else {
                    st.stopDartMatch(true)
                  }
                }}
              >
                {dartGame.active ? (dartGame.finished ? 'Rematch Darts' : 'End 6 Darts') : 'Play 6 Darts'}
              </button>
              <button
                type="button"
                className="hud-btn"
                disabled={!dartGame.active || dartGame.finished}
                onClick={throwDesktopDart}
              >
                Throw Dart
              </button>
            </div>
          </div>

          <div style={{ color: '#94a3b8', fontSize: '0.7rem', lineHeight: 1.4 }}>
            Drag model / Right-drag / J &amp; L / [ ]: Rotate model • R: Auto-spin • Drag scene: Look • WASD: Walk • Q/E: Height • B: 3D Menu • Tab: Options
          </div>
        </div>
      )}
    </div>
  )
}
