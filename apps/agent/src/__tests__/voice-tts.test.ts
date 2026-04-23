import { describe, expect, it, vi } from "vitest";
import { FallbackTTS } from "../voice-tts";

describe("FallbackTTS", () => {
  it("falls back when primary synthesize returns null", async () => {
    const fallbackAudio = new Uint8Array([1, 2, 3]).buffer;
    const fallback = {
      synthesize: vi.fn(async () => fallbackAudio),
    };

    const tts = new FallbackTTS(
      { synthesize: vi.fn(async () => null) },
      fallback
    );

    await expect(tts.synthesize("hello")).resolves.toBe(fallbackAudio);
    expect(fallback.synthesize).toHaveBeenCalledWith("hello", undefined);
  });

  it("falls back when primary stream yields no audio", async () => {
    const fallbackAudio = new Uint8Array([4, 5, 6]).buffer;
    const fallback = {
      synthesize: vi.fn(async () => fallbackAudio),
    };

    const tts = new FallbackTTS(
      {
        synthesize: vi.fn(async () => null),
        async *synthesizeStream() {
          return;
        },
      },
      fallback
    );

    const chunks: ArrayBuffer[] = [];
    for await (const chunk of tts.synthesizeStream("hello")) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([fallbackAudio]);
    expect(fallback.synthesize).toHaveBeenCalledWith("hello", undefined);
  });

  it("ignores empty primary stream chunks before falling back", async () => {
    const fallbackAudio = new Uint8Array([7, 8, 9]).buffer;
    const fallback = {
      synthesize: vi.fn(async () => fallbackAudio),
    };

    const tts = new FallbackTTS(
      {
        synthesize: vi.fn(async () => null),
        async *synthesizeStream() {
          yield new ArrayBuffer(0);
        },
      },
      fallback
    );

    const chunks: ArrayBuffer[] = [];
    for await (const chunk of tts.synthesizeStream("hello")) {
      chunks.push(chunk);
    }

    expect(chunks.map((chunk) => chunk.byteLength)).toEqual([
      fallbackAudio.byteLength,
    ]);
    expect(fallback.synthesize).toHaveBeenCalledWith("hello", undefined);
  });
});
