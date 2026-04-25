/**
 * GrokBufferedSTT — Transcriber backed by xAI's Grok STT REST API.
 *
 * Same buffered-VAD shape as WhisperBufferedSTT (collect PCM chunks until
 * silence, ship the utterance as a WAV blob). Default upload target is the
 * Cloudflare AI Gateway xai segment — same auth/billing path as the LLM.
 * Override `baseUrl` to "https://api.x.ai" to call xAI directly with a BYO key.
 *
 * Endpoint: POST {baseUrl}/v1/stt
 * Auth:     Authorization: Bearer ${apiKey}
 * Form:     model=grok-stt&language=...&format=json&file=<wav>
 * Response: { text, ...word-level timestamps }
 */
import type {
  Transcriber,
  TranscriberSession,
  TranscriberSessionOptions,
} from "@cloudflare/voice";

interface GrokSTTOptions {
  /**
   * Bearer token. Use CF_AIG_TOKEN for gateway routing (same as LLM), or
   * your xAI key when bypassing the gateway.
   */
  apiKey: string;
  /**
   * Base URL — defaults to the AI Gateway xai segment so STT rides the same
   * auth path as the LLM. Required (no implicit default to keep config explicit).
   */
  baseUrl: string;
  model?: string;
  language?: string;
  fetchImpl?: typeof fetch;
  sampleRate?: number;
  speechThreshold?: number;
  silenceChunks?: number;
  minSpeechChunks?: number;
  maxUtteranceChunks?: number;
}

interface GrokSTTResponse {
  text?: unknown;
}

const DEFAULT_MODEL = "grok-stt";
const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_SPEECH_THRESHOLD = 0.012;
const DEFAULT_SILENCE_CHUNKS = 7;
const DEFAULT_MIN_SPEECH_CHUNKS = 3;
const DEFAULT_MAX_UTTERANCE_CHUNKS = 300;

export class GrokBufferedSTT implements Transcriber {
  constructor(private readonly options: GrokSTTOptions) {
    if (!options.apiKey) throw new Error("GrokBufferedSTT: apiKey required");
    if (!options.baseUrl) throw new Error("GrokBufferedSTT: baseUrl required");
  }

  createSession(options?: TranscriberSessionOptions): TranscriberSession {
    return new GrokBufferedSTTSession(this.options, options);
  }
}

class GrokBufferedSTTSession implements TranscriberSession {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly language: string | undefined;
  private readonly sampleRate: number;
  private readonly speechThreshold: number;
  private readonly silenceChunks: number;
  private readonly minSpeechChunks: number;
  private readonly maxUtteranceChunks: number;
  private readonly onUtterance?: (text: string) => void;

  private preRoll: ArrayBuffer[] = [];
  private utteranceChunks: ArrayBuffer[] = [];
  private speechChunks = 0;
  private silentChunks = 0;
  private closed = false;
  private flushing: Promise<void> = Promise.resolve();

  constructor(
    options: GrokSTTOptions,
    sessionOptions?: TranscriberSessionOptions
  ) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    // Strip trailing slash to keep concat predictable.
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.language = options.language;
    this.sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.speechThreshold = options.speechThreshold ?? DEFAULT_SPEECH_THRESHOLD;
    this.silenceChunks = options.silenceChunks ?? DEFAULT_SILENCE_CHUNKS;
    this.minSpeechChunks =
      options.minSpeechChunks ?? DEFAULT_MIN_SPEECH_CHUNKS;
    this.maxUtteranceChunks =
      options.maxUtteranceChunks ?? DEFAULT_MAX_UTTERANCE_CHUNKS;
    this.onUtterance = sessionOptions?.onUtterance;
  }

  feed(chunk: ArrayBuffer): void {
    if (this.closed || chunk.byteLength < 2) return;

    const audioChunk = chunk.slice(0);
    const isSpeech = pcm16Rms(audioChunk) >= this.speechThreshold;

    if (isSpeech) {
      if (this.utteranceChunks.length === 0) {
        this.utteranceChunks = [...this.preRoll];
        this.preRoll = [];
      }
      this.utteranceChunks.push(audioChunk);
      this.speechChunks += 1;
      this.silentChunks = 0;
    } else if (this.utteranceChunks.length > 0) {
      this.utteranceChunks.push(audioChunk);
      this.silentChunks += 1;
    } else {
      this.preRoll.push(audioChunk);
      if (this.preRoll.length > 3) this.preRoll.shift();
    }

    if (
      this.utteranceChunks.length > 0 &&
      (this.silentChunks >= this.silenceChunks ||
        this.utteranceChunks.length >= this.maxUtteranceChunks)
    ) {
      this.flushUtterance();
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.utteranceChunks = [];
    this.preRoll = [];
    this.speechChunks = 0;
    this.silentChunks = 0;
  }

  private flushUtterance(): void {
    const chunks = this.utteranceChunks;
    const speechChunks = this.speechChunks;
    this.utteranceChunks = [];
    this.speechChunks = 0;
    this.silentChunks = 0;

    if (speechChunks < this.minSpeechChunks) return;

    this.flushing = this.flushing
      .then(() => this.transcribe(chunks))
      .catch((error) => {
        console.error("[GrokBufferedSTT] transcription failed:", error);
      });
  }

  private async transcribe(chunks: ArrayBuffer[]): Promise<void> {
    const wav = pcm16ChunksToWav(chunks, this.sampleRate);
    // Blob() in strict TS rejects Uint8Array<ArrayBufferLike>; pass the raw
    // ArrayBuffer slice so the type lands on the ArrayBuffer overload.
    const wavBuffer = wav.buffer.slice(
      wav.byteOffset,
      wav.byteOffset + wav.byteLength
    ) as ArrayBuffer;

    // multipart form — Grok STT REST endpoint accepts file upload only
    const form = new FormData();
    form.set("model", this.model);
    form.set("format", "json");
    if (this.language) form.set("language", this.language);
    form.set("file", new Blob([wavBuffer], { type: "audio/wav" }), "utterance.wav");

    const res = await this.fetchImpl(`${this.baseUrl}/v1/stt`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(
        `[GrokBufferedSTT] STT failed: ${res.status} ${res.statusText} ${errText.slice(0, 200)}`
      );
      return;
    }
    const data = (await res.json()) as GrokSTTResponse;
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (text) this.onUtterance?.(text);
  }
}

function pcm16Rms(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);
  let sum = 0;
  let samples = 0;

  for (let offset = 0; offset + 1 < view.byteLength; offset += 2) {
    const sample = view.getInt16(offset, true) / 32768;
    sum += sample * sample;
    samples += 1;
  }

  return samples > 0 ? Math.sqrt(sum / samples) : 0;
}

function pcm16ChunksToWav(
  chunks: ArrayBuffer[],
  sampleRate: number
): Uint8Array {
  const dataLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const wav = new Uint8Array(44 + dataLength);
  const view = new DataView(wav.buffer);

  writeAscii(wav, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(wav, 8, "WAVE");
  writeAscii(wav, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(wav, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (const chunk of chunks) {
    wav.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return wav;
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    target[offset + i] = value.charCodeAt(i);
  }
}
