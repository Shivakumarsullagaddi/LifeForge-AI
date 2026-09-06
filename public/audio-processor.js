class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Int16Array(this.bufferSize);
    this.bytesWritten = 0;
    this.sumSquares = 0;
    this.peak = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      const raw = channelData[i];
      const absVal = Math.abs(raw);
      if (absVal > this.peak) {
        this.peak = absVal;
      }
      this.sumSquares += raw * raw;

      const s = Math.max(-1, Math.min(1, raw));
      this.buffer[this.bytesWritten++] = s < 0 ? s * 0x8000 : s * 0x7fff;

      if (this.bytesWritten >= this.bufferSize) {
        const rms = Math.sqrt(this.sumSquares / this.bufferSize);
        const isClipping = this.peak >= 0.999;

        this.port.postMessage({
          pcm: this.buffer.slice(0, this.bytesWritten),
          rms: Math.round(rms * 1000) / 1000,
          peak: Math.round(this.peak * 1000) / 1000,
          isClipping,
        });

        this.bytesWritten = 0;
        this.sumSquares = 0;
        this.peak = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
