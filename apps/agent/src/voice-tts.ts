import {
  WorkersAITTS,
  type StreamingTTSProvider,
  type TTSProvider,
} from "@cloudflare/voice";
import { ElevenLabsTTS } from "./elevenlabs-tts";
import { GrokTTS } from "./grok-tts";
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

/**
 * Build the auth context for an xAI route. Mirrors the LLM resolver pattern
 * in @playheads/llm-config: bearer = XAI_API_KEY (BYOK) || CF_AIG_TOKEN
 * (gateway / unified billing). Routes through gateway by default so voice
 * traffic shares the LLM's billing + observability path; falls back to
 * api.x.ai direct when only XAI_API_KEY is present without gateway info.
 */
function resolveGrokAuth(env: Env): { baseUrl: string; apiKey: string } | null {
  const haveGateway =
    env.CLOUDFLARE_ACCOUNT_ID && env.AI_GATEWAY_ID && env.CF_AIG_TOKEN;
  if (haveGateway) {
    return {
      baseUrl: `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/xai`,
      apiKey: env.XAI_API_KEY || env.CF_AIG_TOKEN,
    };
  }
  if (env.XAI_API_KEY) {
    return { baseUrl: "https://api.x.ai", apiKey: env.XAI_API_KEY };
  }
  return null;
}

/**
 * Pick a TTS primary in priority order, always wrap with Aura fallback so
 * misconfiguration doesn't silence the DJ.
 *
 * Priority:
 *   1. Grok TTS         — when xAI is reachable (gateway with CF_AIG_TOKEN OR
 *                          direct with XAI_API_KEY); cheapest + same vendor as LLM
 *   2. ElevenLabs       — when ELEVENLABS_API_KEY or CF_AIG_TOKEN is configured
 *   3. Workers AI Aura  — fallback only (also primary if nothing else available)
 */
export function resolveVoiceTTS(
  env: Env
): TTSProvider & Partial<StreamingTTSProvider> {
  const fallback = new WorkersAITTS(env.AI);

  const grokAuth = resolveGrokAuth(env);
  if (grokAuth) {
    try {
      console.log("[Voice] Using Grok TTS with Aura fallback", {
        baseUrl: grokAuth.baseUrl,
        keySource: env.XAI_API_KEY ? "XAI_API_KEY" : "CF_AIG_TOKEN",
        voiceId: env.GROK_TTS_VOICE_ID,
        language: env.GROK_TTS_LANGUAGE,
      });
      return new FallbackTTS(
        new GrokTTS({
          apiKey: grokAuth.apiKey,
          baseUrl: grokAuth.baseUrl,
          voiceId: env.GROK_TTS_VOICE_ID || "ara",
          language: env.GROK_TTS_LANGUAGE || "auto",
        }),
        fallback
      );
    } catch (e) {
      console.warn("[Voice] Grok TTS init failed, trying next provider:", e);
    }
  }

  const haveGateway = env.CLOUDFLARE_ACCOUNT_ID && env.AI_GATEWAY_ID;
  const haveElevenAuth = env.ELEVENLABS_API_KEY || env.CF_AIG_TOKEN;
  if (haveGateway && haveElevenAuth) {
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

  console.log("[Voice] Using Workers AI Aura TTS (no Grok / ElevenLabs auth configured)");
  return fallback;
}
