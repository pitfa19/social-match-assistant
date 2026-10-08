// Pure, dependency free turn gating for continuous realtime voice. Testable in node.
// The ElevenLabs VAD strategy commits one segment per silence. This gate decides which
// commits become answers: never while suspended, never stale, never empty, never duplicated.

export type GateMode = "listening" | "suspended" | "flushing";

export type Decision =
  | { deliver: string }
  | { deliver: null; reason: "suspended" | "flushing" | "empty" | "too-short" | "duplicate" };

export interface GateOptions {
  /** Minimum letters for a commit to count as an answer. */
  minLetters?: number;
  /** A commit equal to (or contained in) the last delivered text within this window is trailing. */
  dedupMs?: number;
  /** Max wait for the server flush commit after suspend before audio may resume. */
  flushTimeoutMs?: number;
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function letterCount(text: string): number {
  return (text.match(/\p{L}/gu) || []).length;
}

export class TurnGate {
  private mode: GateMode = "listening";
  private pendingSpeech = false; // partial text seen since the last commit
  private flushDeadline = 0;
  private resumeRequested = false;
  private lastText = "";
  private lastAt = -Infinity;
  private readonly minLetters: number;
  private readonly dedupMs: number;
  private readonly flushTimeoutMs: number;

  constructor(opts: GateOptions = {}) {
    this.minLetters = opts.minLetters ?? 2;
    this.dedupMs = opts.dedupMs ?? 2500;
    this.flushTimeoutMs = opts.flushTimeoutMs ?? 1500;
  }

  get state(): GateMode {
    return this.mode;
  }

  /** Audio frames may be streamed only while listening. */
  canStreamAudio(now: number): boolean {
    this.tick(now);
    return this.mode === "listening";
  }

  onPartial(text: string): void {
    if (this.mode === "listening" && normalize(text)) this.pendingSpeech = true;
  }

  onCommitted(text: string, now: number): Decision {
    this.tick(now);
    if (this.mode === "suspended") {
      this.pendingSpeech = false;
      return { deliver: null, reason: "suspended" };
    }
    if (this.mode === "flushing") {
      // This is the flush commit (or a late trailing one). Always stale, then resume.
      this.pendingSpeech = false;
      this.mode = this.resumeRequested ? "listening" : "suspended";
      this.resumeRequested = false;
      return { deliver: null, reason: "flushing" };
    }
    this.pendingSpeech = false;
    const clean = text.trim();
    if (!normalize(clean)) return { deliver: null, reason: "empty" };
    if (letterCount(clean) < this.minLetters) return { deliver: null, reason: "too-short" };
    const n = normalize(clean);
    if (now - this.lastAt < this.dedupMs && this.lastText && (n === this.lastText || this.lastText.includes(n))) {
      return { deliver: null, reason: "duplicate" };
    }
    this.lastText = n;
    this.lastAt = now;
    return { deliver: clean };
  }

  /**
   * Stop routing transcripts and audio. Returns true when the caller should send a
   * flush commit so buffered speech from the previous turn is closed out server side.
   */
  suspend(now: number): boolean {
    if (this.mode !== "listening") return false;
    // Always flush. Speech may have started in flight (after the server's last commit, before
    // our pause) without any partial having reached us yet. Closing the open segment and
    // swallowing its commit is the only way to guarantee it cannot surface as the next question.
    this.pendingSpeech = false;
    this.resumeRequested = false;
    this.mode = "flushing";
    this.flushDeadline = now + this.flushTimeoutMs;
    return true;
  }

  /** Resume listening. If a flush is still pending the resume completes when it settles. */
  resume(now: number): void {
    this.tick(now);
    if (this.mode === "suspended") this.mode = "listening";
    else if (this.mode === "flushing") this.resumeRequested = true;
  }

  private tick(now: number): void {
    if (this.mode === "flushing" && now >= this.flushDeadline) {
      this.mode = this.resumeRequested ? "listening" : "suspended";
      this.resumeRequested = false;
    }
  }
}

// Typed, visible failures.
export type VoiceErrorKind =
  | "unsupported"
  | "permission"
  | "token"
  | "network"
  | "quota"
  | "server"
  | "timeout"
  | "idle"
  | "hidden";

export interface VoiceError {
  kind: VoiceErrorKind;
  message: string;
}

const MESSAGES: Record<VoiceErrorKind, string> = {
  unsupported: "Ovaj preglednik ne podržava govor uživo. Upiši odgovor.",
  permission: "Mikrofon nije dopušten. Dopusti ga ili upiši odgovor.",
  token: "Govor trenutno nije dostupan. Upiši odgovor.",
  network: "Veza za govor je prekinuta. Pokreni ponovno ili upiši odgovor.",
  quota: "Govor je privremeno nedostupan. Upiši odgovor.",
  server: "Nešto je pošlo po zlu s govorom. Upiši odgovor.",
  timeout: "Sesija govora je istekla. Pokreni ponovno ili upiši odgovor.",
  idle: "Mikrofon je isključen jer dugo nisi ništa rekao/la. Pokreni ponovno ili upiši odgovor.",
  hidden: "Mikrofon je isključen jer je kartica skrivena. Pokreni ponovno ili upiši odgovor.",
};

export function voiceError(kind: VoiceErrorKind): VoiceError {
  return { kind, message: MESSAGES[kind] };
}

/** Map a realtime STT server error event type to a typed failure. */
export function classifyServerEvent(messageType: string): VoiceErrorKind | null {
  switch (messageType) {
    case "auth_error":
      return "token";
    case "quota_exceeded":
    case "rate_limited":
    case "resource_exhausted":
    case "queue_overflow":
    case "commit_throttled":
      return "quota";
    case "session_time_limit_exceeded":
      return "timeout";
    case "error":
    case "input_error":
    case "invalid_request":
    case "chunk_size_exceeded":
    case "transcriber_error":
    case "unaccepted_terms":
      return "server";
    default:
      return null; // includes insufficient_audio_activity: harmless silence
  }
}

export const REALTIME = {
  host: "wss://api.elevenlabs.io/v1/speech-to-text/realtime",
  modelId: "scribe_v2_realtime",
  sampleRate: 16000,
  language: "hr",
  vadSilenceSecs: 1.5,
  vadThreshold: 0.4,
  minSpeechMs: 250,
  minSilenceMs: 100,
  maxSessionMs: 5 * 60_000,
  idleMs: 60_000,
  handshakeMs: 10_000,
  keepaliveMs: 5000,
} as const;

export function realtimeUrl(token: string, language: string = REALTIME.language): string {
  const q = new URLSearchParams({
    model_id: REALTIME.modelId,
    token,
    audio_format: "pcm_16000",
    language_code: language,
    commit_strategy: "vad",
    vad_silence_threshold_secs: String(REALTIME.vadSilenceSecs),
    vad_threshold: String(REALTIME.vadThreshold),
    min_speech_duration_ms: String(REALTIME.minSpeechMs),
    min_silence_duration_ms: String(REALTIME.minSilenceMs),
  });
  return `${REALTIME.host}?${q.toString()}`;
}

export function audioChunkMessage(base64: string, commit = false): string {
  return JSON.stringify({
    message_type: "input_audio_chunk",
    audio_base_64: base64,
    commit,
    sample_rate: REALTIME.sampleRate,
  });
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
