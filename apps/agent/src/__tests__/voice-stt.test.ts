import { describe, expect, it, vi } from "vitest";
import { WhisperBufferedSTT } from "../voice-stt";

function pcmChunk(amplitude: number, samples = 1600): ArrayBuffer {
  const buffer = new ArrayBuffer(samples * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples; i++) {
    view.setInt16(i * 2, amplitude, true);
  }
  return buffer;
}

describe("WhisperBufferedSTT", () => {
  it("transcribes buffered speech chunks with Chinese language config", async () => {
    const run = vi.fn(async () => ({ text: "放点周杰伦" }));
    const transcriber = new WhisperBufferedSTT(
      { run },
      {
        language: "zh",
        silenceChunks: 2,
        speechThreshold: 0.01,
        minSpeechChunks: 1,
      }
    );
    const onUtterance = vi.fn();
    const session = transcriber.createSession({ onUtterance });

    session.feed(pcmChunk(6000));
    session.feed(pcmChunk(0));
    session.feed(pcmChunk(0));

    await vi.waitFor(() => {
      expect(onUtterance).toHaveBeenCalledWith("放点周杰伦");
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      "@cf/openai/whisper-large-v3-turbo",
      expect.objectContaining({
        audio: expect.any(String),
        language: "zh",
        task: "transcribe",
        vad_filter: true,
      })
    );
  });

  it("does not transcribe silence-only audio", async () => {
    const run = vi.fn(async () => ({ text: "noise" }));
    const transcriber = new WhisperBufferedSTT(
      { run },
      {
        silenceChunks: 2,
        speechThreshold: 0.01,
        minSpeechChunks: 1,
      }
    );
    const onUtterance = vi.fn();
    const session = transcriber.createSession({ onUtterance });

    session.feed(pcmChunk(0));
    session.feed(pcmChunk(0));
    session.close();

    expect(run).not.toHaveBeenCalled();
    expect(onUtterance).not.toHaveBeenCalled();
  });
});
