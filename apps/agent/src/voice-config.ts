import { WorkersAIFluxSTT } from "@cloudflare/voice";

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
): WorkersAIFluxSTT | null {
  const ai = resolveWorkersAIBinding(env, logger);
  if (!ai) {
    logger.error(
      "[Voice] transcriber init skipped: env.AI.run is not a function"
    );
    return null;
  }

  return new WorkersAIFluxSTT(ai);
}
