import {
  WorkersAITTS,
  type StreamingTTSProvider,
  type TTSProvider,
} from "@cloudflare/voice";
import { ElevenLabsTTS } from "./elevenlabs-tts";
import type { Env } from "./types";

export class FallbackTTS implements TTSProvider, StreamingTTSProvider {
  constructor(
    private readonly primary: TTSProvider & Partial<StreamingTTSProvider>,
    private readonly fallback: TTSProvider
  ) {}

  async synthesize(
    text: string,
    signal?: AbortSignal
  ): Promise<ArrayBuffer | null> {
    try {
      const audio = await this.primary.synthesize(text, signal);
      if (audio) return audio;
    } catch (e) {
      console.warn("[Voice] Primary TTS synthesize failed, falling back:", e);
    }
    return this.fallback.synthesize(text, signal);
  }

  async *synthesizeStream(
    text: string,
    signal?: AbortSignal
  ): AsyncGenerator<ArrayBuffer> {
    let emitted = false;
    try {
      if (this.primary.synthesizeStream) {
        for await (const chunk of this.primary.synthesizeStream(text, signal)) {
          if (chunk.byteLength > 0) {
            emitted = true;
            yield chunk;
          }
        }
      } else {
        const audio = await this.primary.synthesize(text, signal);
        if (audio) {
          emitted = true;
          yield audio;
        }
      }
    } catch (e) {
      console.warn("[Voice] Primary TTS stream failed, falling back:", e);
    }

    if (!emitted) {
      const fallbackAudio = await this.fallback.synthesize(text, signal);
      if (fallbackAudio) yield fallbackAudio;
    }
  }
}

export function resolveVoiceTTS(
  env: Env
): TTSProvider & Partial<StreamingTTSProvider> {
  const fallback = new WorkersAITTS(env.AI);
  const haveGateway = env.CLOUDFLARE_ACCOUNT_ID && env.AI_GATEWAY_ID;
  const haveAuth = env.ELEVENLABS_API_KEY || env.CF_AIG_TOKEN;

  if (!haveGateway || !haveAuth) {
    console.log("[Voice] Using Workers AI Aura TTS (no ElevenLabs auth configured)");
    return fallback;
  }

  try {
    const authMode = env.ELEVENLABS_API_KEY
      ? "xi-api-key"
      : "Authorization (unified billing)";
    console.log("[Voice] Using ElevenLabs TTS via AI Gateway with Aura fallback", {
      auth: authMode,
      voiceId: env.ELEVENLABS_VOICE_ID,
      model: env.ELEVENLABS_MODEL,
    });

    return new FallbackTTS(
      new ElevenLabsTTS({
        apiKey: env.ELEVENLABS_API_KEY || undefined,
        cfAigToken: env.CF_AIG_TOKEN || undefined,
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        gatewayId: env.AI_GATEWAY_ID,
        voiceId: env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
        modelId: env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
      }),
      fallback
    );
  } catch (e) {
    console.warn("[Voice] ElevenLabs init failed, falling back to Aura:", e);
    return fallback;
  }
}
