import {
  WorkersAIFluxSTT,
  type Transcriber,
} from "@cloudflare/voice";
import { WhisperBufferedSTT } from "./voice-stt";
import { GrokBufferedSTT } from "./grok-stt";

interface VoiceLogger {
  error: (...args: unknown[]) => void;
}

interface VoiceAiLike {
  run: (...args: unknown[]) => Promise<unknown>;
}

interface VoiceEnvLike {
  AI?: {
    run?: unknown;
  };
  VOICE_STT_PROVIDER?: string;
  VOICE_STT_LANGUAGE?: string;
  XAI_API_KEY?: string;
  CF_AIG_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  GROK_STT_MODEL?: string;
}

/**
 * Mirror the LLM resolver pattern: prefer the AI Gateway xai segment with
 * CF_AIG_TOKEN (so STT shares the same auth/billing path as chat completions),
 * fall back to api.x.ai direct if only XAI_API_KEY is set.
 * Returns null when neither auth path is reachable.
 */
function resolveGrokAuth(
  env: VoiceEnvLike
): { baseUrl: string; apiKey: string; source: string } | null {
  const haveGateway =
    env.CLOUDFLARE_ACCOUNT_ID && env.AI_GATEWAY_ID && env.CF_AIG_TOKEN;
  if (haveGateway) {
    return {
      baseUrl: `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/xai`,
      apiKey: env.XAI_API_KEY || env.CF_AIG_TOKEN!,
      source: env.XAI_API_KEY ? "XAI_API_KEY+gateway" : "CF_AIG_TOKEN+gateway",
    };
  }
  if (env.XAI_API_KEY) {
    return {
      baseUrl: "https://api.x.ai",
      apiKey: env.XAI_API_KEY,
      source: "XAI_API_KEY+direct",
    };
  }
  return null;
}

function resolveWorkersAIBinding(
  env: VoiceEnvLike,
  logger: VoiceLogger
): VoiceAiLike | null {
  const ai = env.AI;
  if (ai && typeof ai.run === "function") {
    return ai as VoiceAiLike;
  }

  const envKeys = Object.keys(env as object);
  const aiType = typeof ai;
  const aiKeys = ai && typeof ai === "object" ? Object.keys(ai) : [];
  const aiRunType = typeof ai?.run;

  logger.error(
    `[Voice][diag] invalid AI binding: envKeys=[${envKeys.join(",")}] ` +
      `aiType=${aiType} aiTruthy=${!!ai} aiKeys=[${aiKeys.join(",")}] ` +
      `aiRunType=${aiRunType}`
  );

  return null;
}

/**
 * Pick a transcriber based on VOICE_STT_PROVIDER:
 *   "grok"    → Grok STT via api.x.ai (requires XAI_API_KEY)
 *   "flux"    → Workers AI Deepgram Flux (English realtime)
 *   "whisper" → Workers AI Whisper buffered (default, best Chinese)
 *
 * Grok needs no Workers AI binding so it works even when env.AI is missing.
 * The other two require env.AI.run.
 */
export function createVoiceTranscriber(
  env: VoiceEnvLike,
  logger: VoiceLogger = console
): Transcriber | null {
  const provider = (env.VOICE_STT_PROVIDER || "whisper").toLowerCase();

  if (provider === "grok") {
    const auth = resolveGrokAuth(env);
    if (!auth) {
      logger.error(
        "[Voice] Grok STT requested but no xAI auth available " +
          "(set CF_AIG_TOKEN+gateway info OR XAI_API_KEY) — cannot init transcriber"
      );
      return null;
    }
    console.log("[Voice] Using Grok STT", {
      baseUrl: auth.baseUrl,
      keySource: auth.source,
      model: env.GROK_STT_MODEL,
      language: env.VOICE_STT_LANGUAGE,
    });
    return new GrokBufferedSTT({
      apiKey: auth.apiKey,
      baseUrl: auth.baseUrl,
      model: env.GROK_STT_MODEL || "grok-stt",
      language: env.VOICE_STT_LANGUAGE,
    });
  }

  const ai = resolveWorkersAIBinding(env, logger);
  if (!ai) {
    logger.error(
      "[Voice] transcriber init skipped: env.AI.run is not a function"
    );
    return null;
  }

  if (provider === "flux") {
    return new WorkersAIFluxSTT(ai);
  }

  return new WhisperBufferedSTT(ai, {
    language: env.VOICE_STT_LANGUAGE || "zh",
  });
}
