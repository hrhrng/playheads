/**
 * GrokTTS — TTSProvider backed by xAI's Grok TTS API.
 *
 * Default routes through Cloudflare AI Gateway exactly like the LLM does
 * (`gateway.ai.cloudflare.com/v1/{acc}/{gw}/xai/...` + `Authorization: Bearer
 * <CF_AIG_TOKEN>`). If your gateway already authenticates xai chat completions,
 * the same credentials authenticate xai voice — no separate secret needed.
 *
 * Override `baseUrl` + provide an `apiKey` to bypass the gateway and call
 * api.x.ai directly (handy for debugging gateway issues).
 *
 * Endpoint:  POST {baseUrl}/v1/tts
 * Auth:      Authorization: Bearer ${apiKey}
 * Body:      { text, voice_id, language }
 * Response:  audio/mpeg bytes
 *
 * Voices: ara | eve | leo | rex | sal — see https://x.ai/api/voice
 */
import type { TTSProvider, StreamingTTSProvider } from "@cloudflare/voice";

export interface GrokTTSOptions {
  /**
   * Bearer token. Use `CF_AIG_TOKEN` to go through the AI Gateway (same auth
   * pattern as the LLM), or your direct xAI key when bypassing the gateway.
   */
  apiKey: string;
  /**
   * Base URL — defaults to the AI Gateway xai segment so voice rides the
   * same auth/billing path as the LLM. Override to "https://api.x.ai" to
   * skip the gateway.
   */
  baseUrl: string;
  voiceId?: string;
  language?: string;
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
    if (!opts.baseUrl) throw new Error("GrokTTS: baseUrl required");
    this.apiKey = opts.apiKey;
    // Strip trailing slash to keep concat predictable.
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
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
