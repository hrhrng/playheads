import type {
  Transcriber,
  TranscriberSession,
  TranscriberSessionOptions,
} from "@cloudflare/voice";

interface VoiceAiLike {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
}

interface WhisperBufferedSTTOptions {
  model?: string;
  language?: string;
  sampleRate?: number;
  speechThreshold?: number;
  silenceChunks?: number;
  minSpeechChunks?: number;
  maxUtteranceChunks?: number;
}

interface WhisperResponse {
  text?: unknown;
}

const DEFAULT_MODEL = "@cf/openai/whisper-large-v3-turbo";
const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_SPEECH_THRESHOLD = 0.012;
const DEFAULT_SILENCE_CHUNKS = 7;
const DEFAULT_MIN_SPEECH_CHUNKS = 3;
const DEFAULT_MAX_UTTERANCE_CHUNKS = 300;

export class WhisperBufferedSTT implements Transcriber {
  constructor(
    private readonly ai: VoiceAiLike,
    private readonly options: WhisperBufferedSTTOptions = {}
  ) {}

  createSession(options?: TranscriberSessionOptions): TranscriberSession {
    return new WhisperBufferedSTTSession(this.ai, this.options, options);
  }
}

class WhisperBufferedSTTSession implements TranscriberSession {
  private readonly model: string;
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
    private readonly ai: VoiceAiLike,
    options: WhisperBufferedSTTOptions,
    sessionOptions?: TranscriberSessionOptions
  ) {
    this.model = options.model ?? DEFAULT_MODEL;
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
        console.error("[WhisperBufferedSTT] transcription failed:", error);
      });
  }

  private async transcribe(chunks: ArrayBuffer[]): Promise<void> {
    const audio = pcm16ChunksToWavBase64(chunks, this.sampleRate);
    const response = (await this.ai.run(this.model, {
      audio,
      ...(this.language ? { language: this.language } : {}),
      task: "transcribe",
      vad_filter: true,
      condition_on_previous_text: false,
      no_speech_threshold: 0.75,
    })) as WhisperResponse;

    const text = typeof response.text === "string" ? response.text.trim() : "";
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

function pcm16ChunksToWavBase64(
  chunks: ArrayBuffer[],
  sampleRate: number
): string {
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

  return uint8ToBase64(wav);
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    target[offset + i] = value.charCodeAt(i);
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;

    output += alphabet[(triple >> 18) & 63];
    output += alphabet[(triple >> 12) & 63];
    output += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : "=";
    output += i + 2 < bytes.length ? alphabet[triple & 63] : "=";
  }

  return output;
}
