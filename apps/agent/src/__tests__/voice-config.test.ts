import { describe, expect, it, vi } from "vitest";
import { WorkersAIFluxSTT } from "@cloudflare/voice";
import { createVoiceTranscriber } from "../voice-config";

describe("createVoiceTranscriber", () => {
  it("returns a Flux transcriber when env.AI.run is available", () => {
    const env = {
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
