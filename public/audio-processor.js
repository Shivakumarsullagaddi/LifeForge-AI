// Low-latency AudioWorkletProcessor for 16kHz PCM audio streaming
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048; // ~128ms at 16kHz for balanced latency and network efficiency
    this.buffer = new Int16Array(this.bufferSize);
    this.bytesWritten = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // Float32 samples from microphone (-1.0 to +1.0)
    for (let i = 0; i < channelData.length; i++) {
      // Clamp and convert Float32 to Int16
      const s = Math.max(-1, Math.min(1, channelData[i]));
      this.buffer[this.bytesWritten++] = s < 0 ? s * 0x8000 : s * 0x7fff;

      if (this.bytesWritten >= this.bufferSize) {
        // Send a copy of the PCM buffer to main thread
        this.port.postMessage(this.buffer.slice(0, this.bytesWritten));
        this.bytesWritten = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
