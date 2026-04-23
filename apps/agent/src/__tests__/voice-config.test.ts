import { describe, expect, it, vi } from "vitest";
import { WorkersAIFluxSTT } from "@cloudflare/voice";
import { createVoiceTranscriber } from "../voice-config";
import { WhisperBufferedSTT } from "../voice-stt";

describe("createVoiceTranscriber", () => {
  it("returns a Chinese Whisper transcriber by default", () => {
    const env = {
      AI: {
        run: vi.fn(async () => ({})),
      },
    };

    const transcriber = createVoiceTranscriber(env);

    expect(transcriber).toBeInstanceOf(WhisperBufferedSTT);
  });

  it("can still return Flux when explicitly configured", () => {
    const env = {
      VOICE_STT_PROVIDER: "flux",
      AI: {
        run: vi.fn(async () => ({})),
      },
    };

    const transcriber = createVoiceTranscriber(env);

    expect(transcriber).toBeInstanceOf(WorkersAIFluxSTT);
  });

  it("returns null and logs diagnostics when env.AI.run is missing", () => {
    const logger = {
      error: vi.fn(),
    };

    const transcriber = createVoiceTranscriber(
      { AI: {} },
      logger
    );

    expect(transcriber).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});
