// AudioWorklet: mono downsample to 16 kHz PCM16 little-endian, posted in ~100 ms frames.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0; // fractional read position into the pending input
    this.pending = [];
    this.pendingLen = 0;
    this.out = new Int16Array(1600);
    this.outLen = 0;
    this.acc = 0;
    this.accN = 0;
    this.next = this.ratio; // sample index at which the current output sample completes
    this.index = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i];
      this.accN += 1;
      this.index += 1;
      if (this.index >= this.next) {
        const v = Math.max(-1, Math.min(1, this.acc / this.accN));
        this.out[this.outLen++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        this.acc = 0;
        this.accN = 0;
        this.next += this.ratio;
        if (this.outLen === this.out.length) {
          const buf = this.out.buffer;
          this.port.postMessage(buf, [buf]);
          this.out = new Int16Array(1600);
          this.outLen = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
