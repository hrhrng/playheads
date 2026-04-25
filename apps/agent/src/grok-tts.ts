/**
 * GrokTTS — TTSProvider implementation backed by xAI's Grok TTS API.
 *
 * Direct call to api.x.ai/v1/tts — does NOT route through CF AI Gateway
 * because the gateway's `xai` provider segment was added for chat completions
 * and may not yet recognize voice endpoints. Direct call costs us gateway
 * caching/observability for TTS requests but guarantees the route works.
 *
 * Endpoint:  POST https://api.x.ai/v1/tts
 * Auth:      Authorization: Bearer ${XAI_API_KEY}
 * Body:      { text, voice_id, language }
 * Response:  audio/mpeg bytes
 *
 * Voices: ara | eve | leo | rex | sal — see https://x.ai/api/voice
 * Models: grok-tts (default)
 */
import type { TTSProvider, StreamingTTSProvider } from "@cloudflare/voice";

export interface GrokTTSOptions {
  /** xAI API key. Required. */
  apiKey: string;
  /** Voice id, case-insensitive. Defaults to "ara". */
  voiceId?: string;
  /**
   * BCP-47 language code (en, zh, pt-BR…) or "auto".
   * Defaults to "auto" so the model detects from text.
   */
  language?: string;
  /** Custom base URL — useful for proxies. */
  baseUrl?: string;
  /** Override fetch — useful for tests. */
  fetchImpl?: typeof fetch;
}

export class GrokTTS implements TTSProvider, StreamingTTSProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly voiceId: string;
  private readonly language: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GrokTTSOptions) {
    if (!opts.apiKey) throw new Error("GrokTTS: apiKey required");
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? "https://api.x.ai";
    this.voiceId = opts.voiceId ?? "ara";
    this.language = opts.language ?? "auto";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    };
  }

  private buildBody(text: string): string {
    return JSON.stringify({
      text,
      voice_id: this.voiceId,
      language: this.language,
    });
  }

  async synthesize(
    text: string,
    signal?: AbortSignal
  ): Promise<ArrayBuffer | null> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/tts`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: this.buildBody(text),
      signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(
        `[GrokTTS] synthesize failed: ${res.status} ${res.statusText} ${errText.slice(0, 200)}`
      );
      return null;
    }
    return await res.arrayBuffer();
  }

  /**
   * Streaming via chunked transfer — xAI returns the mp3 with chunked encoding,
   * so we yield chunks as they land instead of waiting for the full buffer.
   * If the upstream doesn't actually chunk (delivers whole body at once) we
   * still yield a single big chunk — the voice pipeline plays it the same way.
   */
  async *synthesizeStream(
    text: string,
    signal?: AbortSignal
  ): AsyncGenerator<ArrayBuffer> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/tts`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: this.buildBody(text),
      signal,
    });
    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => "");
      console.error(
        `[GrokTTS] synthesizeStream failed: ${res.status} ${res.statusText} ${errText.slice(0, 200)}`
      );
      return;
    }
    const reader = res.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          yield value.buffer.slice(
            value.byteOffset,
            value.byteOffset + value.byteLength
          ) as ArrayBuffer;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
