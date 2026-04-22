/**
 * ElevenLabsTTS — TTSProvider implementation that routes through Cloudflare
 * AI Gateway to ElevenLabs. Used by VoiceDJAgent for higher-quality multilingual
 * voices than the default Workers AI (Deepgram Aura) provider.
 *
 * Auth: Cloudflare AI Gateway unified billing. We send
 *   cf-aig-authorization: Bearer <CF_AIG_TOKEN>
 * and do NOT forward an xi-api-key — Cloudflare provisions the upstream
 * credentials (either CF-managed or BYOK stored in Secrets Store). This also
 * sidesteps a known conflict where xi-api-key clashes with gateway-injected
 * headers for ElevenLabs specifically.
 *
 * Gateway route: https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/elevenlabs
 * ElevenLabs endpoint: POST /v1/text-to-speech/{voice_id}[/stream]
 *
 * @cloudflare/voice-elevenlabs is not published on npm (as of 0.1.2), so we
 * implement the one-method interface directly. No dependency cost.
 */
import type { TTSProvider, StreamingTTSProvider } from "@cloudflare/voice";

export interface ElevenLabsTTSOptions {
  /**
   * Cloudflare AI Gateway token (Bearer). Used as cf-aig-authorization.
   * Under unified billing CF fronts the ElevenLabs bill; under BYOK CF
   * injects your stored xi-api-key automatically.
   */
  cfAigToken: string;

  /** Cloudflare account ID for AI Gateway routing. */
  accountId: string;

  /** AI Gateway ID for routing + observability. */
  gatewayId: string;

  /**
   * ElevenLabs voice ID. Browse voices at https://elevenlabs.io/voice-library.
   * Examples:
   *   - "21m00Tcm4TlvDq8ikWAM" — Rachel (English, warm)
   *   - "XrExE9yKIg1WjnnlVkGX" — Matilda (English, soft)
   *   - Chinese voices: pick from the multilingual voice library
   */
  voiceId: string;

  /**
   * Model ID. Defaults to eleven_multilingual_v2 for CJK support.
   * Faster alternatives: eleven_flash_v2_5 (~75 ms), eleven_turbo_v2_5.
   */
  modelId?: string;

  /**
   * Voice tuning. ElevenLabs defaults unless overridden.
   */
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };

  /**
   * Output format. MP3 is supported by both Workers AI audio playback and
   * browser HTMLAudioElement. PCM formats are lower-latency but need
   * a matching client decoder.
   * @default "mp3_44100_128"
   */
  outputFormat?: string;
}

/**
 * ElevenLabs TTS provider with streaming support.
 *
 * Usage:
 *   tts = new ElevenLabsTTS({ apiKey, accountId, gatewayId, voiceId });
 */
export class ElevenLabsTTS implements TTSProvider, StreamingTTSProvider {
  private readonly baseUrl: string;
  private readonly cfAigToken: string;
  private readonly voiceId: string;
  private readonly modelId: string;
  private readonly outputFormat: string;
  private readonly voiceSettings: ElevenLabsTTSOptions["voiceSettings"];

  constructor(opts: ElevenLabsTTSOptions) {
    if (!opts.cfAigToken) throw new Error("ElevenLabsTTS: cfAigToken required");
    if (!opts.accountId) throw new Error("ElevenLabsTTS: accountId required");
    if (!opts.gatewayId) throw new Error("ElevenLabsTTS: gatewayId required");
    if (!opts.voiceId) throw new Error("ElevenLabsTTS: voiceId required");

    this.baseUrl = `https://gateway.ai.cloudflare.com/v1/${opts.accountId}/${opts.gatewayId}/elevenlabs`;
    this.cfAigToken = opts.cfAigToken;
    this.voiceId = opts.voiceId;
    this.modelId = opts.modelId ?? "eleven_multilingual_v2";
    this.outputFormat = opts.outputFormat ?? "mp3_44100_128";
    this.voiceSettings = opts.voiceSettings;
  }

  private buildBody(text: string): string {
    return JSON.stringify({
      text,
      model_id: this.modelId,
      ...(this.voiceSettings ? { voice_settings: this.voiceSettings } : {}),
    });
  }

  private buildHeaders(): Record<string, string> {
    return {
      // Unified billing / BYOK — CF injects upstream credentials for us.
      // Do NOT also send xi-api-key; it conflicts with gateway-managed auth.
      "cf-aig-authorization": `Bearer ${this.cfAigToken}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    };
  }

  /**
   * Non-streaming synthesis — returns the full MP3 buffer.
   * Used when the voice pipeline prefers a complete ArrayBuffer.
   */
  async synthesize(text: string, signal?: AbortSignal): Promise<ArrayBuffer | null> {
    const url = `${this.baseUrl}/v1/text-to-speech/${this.voiceId}?output_format=${encodeURIComponent(this.outputFormat)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: this.buildBody(text),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(
        `[ElevenLabsTTS] synthesize failed: ${res.status} ${res.statusText} ${errText.slice(0, 200)}`
      );
      return null;
    }
    return await res.arrayBuffer();
  }

  /**
   * Streaming synthesis — yields chunks as they arrive.
   * The voice pipeline feeds chunks to the client as soon as the first one
   * lands, cutting time-to-first-audio dramatically vs. full buffering.
   */
  async *synthesizeStream(
    text: string,
    signal?: AbortSignal
  ): AsyncGenerator<ArrayBuffer> {
    const url = `${this.baseUrl}/v1/text-to-speech/${this.voiceId}/stream?output_format=${encodeURIComponent(this.outputFormat)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: this.buildBody(text),
      signal,
    });

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => "");
      console.error(
        `[ElevenLabsTTS] synthesizeStream failed: ${res.status} ${res.statusText} ${errText.slice(0, 200)}`
      );
      return;
    }

    const reader = res.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          // value is Uint8Array; copy into a standalone ArrayBuffer
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
