export function float32ToInt16PCM(float32Array: Float32Array): Int16Array {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    const intSample = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(i * 2, intSample, true);
  }
  return new Int16Array(buffer);
}

export function resampleTo16k(
  inputBuffer: Float32Array,
  inputSampleRate: number
): Float32Array {
  if (inputSampleRate === 16000) {
    return inputBuffer;
  }
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(inputBuffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const origIndex = i * ratio;
    const indexFloor = Math.min(Math.floor(origIndex), inputBuffer.length - 1);
    const indexCeil = Math.min(indexFloor + 1, inputBuffer.length - 1);
    const fraction = origIndex - Math.floor(origIndex);
    result[i] = inputBuffer[indexFloor] * (1 - fraction) + inputBuffer[indexCeil] * fraction;
  }
  return result;
}

export function calculateRMS(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

export function pcmInt16ToBase64(int16Array: Int16Array): string {
  const bytes = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToPcmInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

export function pcmInt16ToAudioBuffer(
  audioCtx: AudioContext,
  int16Array: Int16Array,
  sampleRate = 24000
): AudioBuffer {
  const audioBuffer = audioCtx.createBuffer(1, int16Array.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  for (let i = 0; i < int16Array.length; i++) {
    channelData[i] = int16Array[i] / (int16Array[i] < 0 ? 32768 : 32767);
  }
  return audioBuffer;
}

export class LiveAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private gainNode: GainNode | null = null;
  private isMuted = false;

  constructor(private sampleRate = 24000) {}

  public init(existingCtx?: AudioContext | null) {
    if (existingCtx && existingCtx.state !== 'closed') {
      this.audioCtx = existingCtx;
    } else if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass({ sampleRate: this.sampleRate });
    }
    if (!this.gainNode && this.audioCtx) {
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.connect(this.audioCtx.destination);
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  public getAudioContext(): AudioContext | null {
    return this.audioCtx;
  }

  public enqueueAudioChunk(
    base64Pcm24k: string,
    onEndedCallback?: () => void
  ): { scheduled: boolean; duration: number } {
    if (!this.audioCtx || this.isMuted) return { scheduled: false, duration: 0 };

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    try {
      const pcm16 = base64ToPcmInt16(base64Pcm24k);
      const audioBuffer = pcmInt16ToAudioBuffer(this.audioCtx, pcm16, this.sampleRate);

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode || this.audioCtx.destination);

      const currentTime = this.audioCtx.currentTime;
      const startTime = Math.max(currentTime + 0.005, this.nextStartTime);
      source.start(startTime);
      this.nextStartTime = startTime + audioBuffer.duration;

      this.activeSources.push(source);

      source.onended = () => {
        const index = this.activeSources.indexOf(source);
        if (index > -1) {
          this.activeSources.splice(index, 1);
        }
        onEndedCallback?.();
      };
      return { scheduled: true, duration: audioBuffer.duration };
    } catch (err) {
      console.error('Failed to enqueue live audio chunk:', err);
      return { scheduled: false, duration: 0 };
    }
  }

  public getActiveSourceCount(): number {
    return this.activeSources.length;
  }

  public stopAndFlush(): number {
    const stoppedCount = this.activeSources.length;
    for (const source of this.activeSources) {
      try {
        source.onended = null;
        source.stop(0);
        source.disconnect();
      } catch {}
    }
    this.activeSources = [];
    if (this.audioCtx) {
      this.nextStartTime = this.audioCtx.currentTime;
    }
    return stoppedCount;
  }

  public setVolume(volume: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopAndFlush();
    } else {
      this.resume().catch(() => {});
    }
  }

  public resume(): Promise<void> {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      return this.audioCtx.resume();
    }
    return Promise.resolve();
  }

  public destroy() {
    this.stopAndFlush();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
