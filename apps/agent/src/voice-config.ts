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
  GROK_STT_MODEL?: string;
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
    if (!env.XAI_API_KEY) {
      logger.error(
        "[Voice] Grok STT requested but XAI_API_KEY is not set — cannot init transcriber"
      );
      return null;
    }
    console.log("[Voice] Using Grok STT via api.x.ai", {
      model: env.GROK_STT_MODEL,
      language: env.VOICE_STT_LANGUAGE,
    });
    return new GrokBufferedSTT({
      apiKey: env.XAI_API_KEY,
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
