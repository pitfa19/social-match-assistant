// Framework free session core for continuous realtime voice. The React hook is a thin shell
// around this class so the pause/flush protocol can be tested against a scripted server.
//
// Protocol (ElevenLabs Scribe realtime, commit_strategy=vad):
//  - We stream PCM16 frames as input_audio_chunk. The server commits one segment per silence
//    (committed_transcript). Only one uncommitted segment exists at a time.
//  - While paused (handler running) we stream SILENCE instead of mic audio and send ONE
//    commit=true chunk. The server closes whatever segment was open (speech that began in
//    flight before the pause) and answers with a committed_transcript, which the gate swallows.
//    If no answer arrives (nothing buffered), a timeout settles the flush.
//  - Resume is deferred until that flush settles, so a trailing commit can never be attributed
//    to the next question.
import {
  TurnGate, audioChunkMessage, classifyServerEvent, toBase64, type VoiceErrorKind, type GateOptions,
} from "./realtimeVoiceLogic.ts";

export type ControllerState = "starting" | "listening" | "paused" | "stopped";

export interface ControllerOptions {
  send: (message: string) => void;
  onFinal: (text: string) => void | Promise<unknown>;
  onPartial?: (text: string) => void;
  onState?: (s: ControllerState) => void;
  onFail?: (kind: VoiceErrorKind) => void;
  now?: () => number;
  gate?: GateOptions;
}

const SILENCE = toBase64(new Uint8Array(3200)); // 100 ms of PCM16 silence at 16 kHz

export class TurnController {
  private readonly gate: TurnGate;
  private readonly o: ControllerOptions;
  private readonly now: () => number;
  private ready = false;
  private disposed = false;
  private holds = 0; // in-flight onFinal handlers
  private manual = false; // caller requested pause
  private emitted: ControllerState = "starting";
  lastSpeechAt: number;

  constructor(o: ControllerOptions) {
    this.o = o;
    this.now = o.now ?? (() => Date.now());
    this.gate = new TurnGate(o.gate);
    this.lastSpeechAt = this.now();
  }

  get state(): ControllerState {
    if (this.disposed) return "stopped";
    if (!this.ready) return "starting";
    return this.gate.state === "listening" ? "listening" : "paused";
  }

  get isListening(): boolean {
    return !this.disposed && this.ready && this.gate.state === "listening";
  }

  markReady(): void {
    this.ready = true;
    this.sync();
  }

  /** Mic frame (base64 PCM16). Replaced by silence whenever routing is paused. */
  onAudio(b64: string): void {
    if (this.disposed || !this.ready) return;
    this.o.send(audioChunkMessage(this.gate.canStreamAudio(this.now()) ? b64 : SILENCE));
    this.sync();
  }

  /** Parsed server event. */
  onMessage(m: { message_type?: string; text?: string }): void {
    if (this.disposed) return;
    const type = m.message_type || "";
    const now = this.now();
    if (type === "session_started") return this.markReady();
    if (type === "partial_transcript") {
      const t = typeof m.text === "string" ? m.text : "";
      if (t.trim()) this.lastSpeechAt = now;
      this.gate.onPartial(t);
      if (this.gate.state === "listening") this.o.onPartial?.(t);
      return;
    }
    if (type === "committed_transcript") {
      this.o.onPartial?.("");
      const d = this.gate.onCommitted(typeof m.text === "string" ? m.text : "", now);
      this.sync(); // a swallowed flush may have resumed us
      if (d.deliver) this.deliver(d.deliver);
      return;
    }
    const kind = classifyServerEvent(type);
    if (kind) this.o.onFail?.(kind);
  }

  private deliver(text: string): void {
    this.lastSpeechAt = this.now();
    this.holds += 1;
    this.pause();
    let r: void | Promise<unknown>;
    try { r = this.o.onFinal(text); } catch { r = undefined; }
    void Promise.resolve(r).catch(() => undefined).then(() => {
      this.holds = Math.max(0, this.holds - 1);
      this.maybeResume();
    });
  }

  /** Manual pause (in addition to the automatic one around onFinal). */
  setSuspended(suspended: boolean): void {
    if (this.disposed) return;
    this.manual = suspended;
    if (suspended) this.pause();
    else this.maybeResume();
  }

  private pause(): void {
    if (this.gate.suspend(this.now())) this.o.send(audioChunkMessage(SILENCE, true));
    this.o.onPartial?.("");
    this.sync();
  }

  private maybeResume(): void {
    if (this.disposed || this.holds > 0 || this.manual) return; // stop() or a newer turn wins
    this.gate.resume(this.now());
    this.lastSpeechAt = this.now();
    this.sync();
  }

  /** Idempotent. After this no callback fires and no frame is sent. */
  stop(): void {
    this.disposed = true;
    this.holds = 0;
    this.sync();
  }

  private sync(): void {
    const s = this.state;
    if (s !== this.emitted) {
      this.emitted = s;
      this.o.onState?.(s);
    }
  }
}
