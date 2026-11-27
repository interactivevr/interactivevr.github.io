import * as THREE from 'three'
import { setSfxAudioContext, unlockAudioContext } from '../audio/sfx'
import { runtimeState, useGameStore } from '../store/useGameStore'

interface RemoteVoiceRig {
  peerId: string
  stream: MediaStream
  bridgeAudioEl: HTMLAudioElement
  positionalAudio: THREE.PositionalAudio | null
  sourceNode: MediaStreamAudioSourceNode | null
  analyser: AnalyserNode | null
  freqData: Uint8Array<ArrayBuffer> | null
  attachedParent: THREE.Object3D | null
}

class VoiceAudioManager {
  private localStream: MediaStream | null = null
  private rigs = new Map<string, RemoteVoiceRig>()
  private visibilityBound = false

  ensureListener(camera: THREE.Camera): THREE.AudioListener {
    if (!runtimeState.audioListener) {
      const listener = new THREE.AudioListener()
      camera.add(listener)
      runtimeState.audioListener = listener
      setSfxAudioContext(listener.context)
    } else if (runtimeState.audioListener.parent !== camera) {
      camera.add(runtimeState.audioListener)
    }

    if (!this.visibilityBound && typeof document !== 'undefined') {
      this.visibilityBound = true
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.resumeContext()
        }
      })
    }

    return runtimeState.audioListener
  }

  resumeContext(): void {
    const ctx = runtimeState.audioListener?.context
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume()
    }
    unlockAudioContext()
    // Re-trigger hidden bridge audio elements if browser paused them on background
    this.rigs.forEach((rig) => {
      if (rig.bridgeAudioEl.paused) {
        void rig.bridgeAudioEl.play().catch(() => {})
      }
    })
  }

  async initLocalMic(): Promise<MediaStream | null> {
    if (this.localStream) {
      const enabled = useGameStore.getState().micEnabled
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = enabled
      })
      return this.localStream
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      useGameStore.getState().setMicStatus('unavailable')
      return null
    }

    useGameStore.getState().setMicStatus('connecting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      this.localStream = stream
      const enabled = useGameStore.getState().micEnabled
      stream.getAudioTracks().forEach((track) => {
        track.enabled = enabled
      })
      useGameStore.getState().setMicStatus('active')
      return stream
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        useGameStore.getState().setMicStatus('denied')
      } else {
        useGameStore.getState().setMicStatus('unavailable')
      }
      return null
    }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  setMicEnabled(enabled: boolean): void {
    useGameStore.getState().setMicEnabled(enabled)
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled
      })
    }
  }

  registerRemoteStream(peerId: string, stream: MediaStream): void {
    this.unregisterRemoteStream(peerId)
    runtimeState.remoteStreams[peerId] = stream

    // Chromium / Meta Quest Bug 933677 workaround:
    // A muted <audio> element must consume the MediaStream so Chromium's
    // WebRTCAudioRenderer actively pulls samples into Web Audio API nodes.
    const bridgeAudioEl = document.createElement('audio')
    bridgeAudioEl.srcObject = stream
    bridgeAudioEl.autoplay = true
    bridgeAudioEl.setAttribute('playsinline', 'true')
    bridgeAudioEl.muted = true
    bridgeAudioEl.style.display = 'none'
    document.body.appendChild(bridgeAudioEl)
    void bridgeAudioEl.play().catch(() => {
      // Will resume on next user gesture via resumeContext()
    })

    const rig: RemoteVoiceRig = {
      peerId,
      stream,
      bridgeAudioEl,
      positionalAudio: null,
      sourceNode: null,
      analyser: null,
      freqData: null,
      attachedParent: null,
    }
    this.rigs.set(peerId, rig)
  }

  attachRigToAvatarHead(peerId: string, headObject: THREE.Object3D): void {
    const rig = this.rigs.get(peerId)
    const listener = runtimeState.audioListener
    if (!rig || !listener) return

    if (rig.attachedParent === headObject && rig.positionalAudio) {
      return
    }

    if (rig.positionalAudio && rig.positionalAudio.parent) {
      rig.positionalAudio.parent.remove(rig.positionalAudio)
    }

    if (!rig.positionalAudio) {
      try {
        const positional = new THREE.PositionalAudio(listener)
        positional.setRefDistance(2.2)
        positional.setMaxDistance(36)
        positional.setRolloffFactor(1.1)
        positional.setDistanceModel('inverse')

        const ctx = listener.context
        const sourceNode = ctx.createMediaStreamSource(rig.stream)
        positional.setNodeSource(sourceNode as unknown as AudioBufferSourceNode)

        const analyser = ctx.createAnalyser()
        analyser.fftSize = 64
        sourceNode.connect(analyser)

        rig.positionalAudio = positional
        rig.sourceNode = sourceNode
        rig.analyser = analyser
        rig.freqData = new Uint8Array(analyser.frequencyBinCount)
      } catch {
        // Fallback: unmute bridge element if Web Audio node routing fails on an unsupported device
        rig.bridgeAudioEl.muted = false
        return
      }
    }

    headObject.add(rig.positionalAudio)
    rig.attachedParent = headObject
  }

  sampleSpeakingLevels(): void {
    this.rigs.forEach((rig) => {
      if (!rig.analyser || !rig.freqData) return
      rig.analyser.getByteFrequencyData(rig.freqData)
      let sum = 0
      for (let i = 0; i < rig.freqData.length; i++) {
        sum += rig.freqData[i]
      }
      const avg = sum / (rig.freqData.length * 255)
      const level = Math.min(1, avg * 3.2)
      useGameStore.getState().setPeerSpeaking(rig.peerId, level)
    })
  }

  unregisterRemoteStream(peerId: string): void {
    const rig = this.rigs.get(peerId)
    if (!rig) return
    if (rig.positionalAudio) {
      try {
        rig.positionalAudio.disconnect()
      } catch {
        // ignore
      }
      rig.positionalAudio.parent?.remove(rig.positionalAudio)
    }
    try {
      rig.sourceNode?.disconnect()
      rig.analyser?.disconnect()
    } catch {
      // ignore
    }
    rig.bridgeAudioEl.srcObject = null
    rig.bridgeAudioEl.remove()
    this.rigs.delete(peerId)
    delete runtimeState.remoteStreams[peerId]
  }

  disposeAll(): void {
    Array.from(this.rigs.keys()).forEach((peerId) => this.unregisterRemoteStream(peerId))
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop())
      this.localStream = null
    }
  }
}

export const voiceAudio = new VoiceAudioManager()
