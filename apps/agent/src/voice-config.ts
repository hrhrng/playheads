import {
  WorkersAIFluxSTT,
  type Transcriber,
} from "@cloudflare/voice";
import { WhisperBufferedSTT } from "./voice-stt";

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

export function createVoiceTranscriber(
  env: VoiceEnvLike,
  logger: VoiceLogger = console
): Transcriber | null {
  const ai = resolveWorkersAIBinding(env, logger);
  if (!ai) {
    logger.error(
      "[Voice] transcriber init skipped: env.AI.run is not a function"
    );
    return null;
  }

  const provider = (env.VOICE_STT_PROVIDER || "whisper").toLowerCase();
  if (provider === "flux") {
    return new WorkersAIFluxSTT(ai);
  }

  return new WhisperBufferedSTT(ai, {
    language: env.VOICE_STT_LANGUAGE || "zh",
  });
}
