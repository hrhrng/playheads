import { describe, expect, it } from "vitest";
import type { PlaybackState } from "../types";
import { loadVoiceGlobalState } from "../voice-state";

describe("loadVoiceGlobalState", () => {
  it("preserves live playback flags when hydrating queue state from D1", async () => {
    const baseState: PlaybackState = {
      currentTrack: null,
      playlist: [],
      isPlaying: true,
      playbackPosition: 87,
    };

    const env = {
      DB: {
        prepare() {
          return {
            bind() {
              return {
                first: async () => ({
                  queue: JSON.stringify([
                    { id: "1", name: "Track 1", artist: "Artist 1" },
                    { id: "2", name: "Track 2", artist: "Artist 2" },
                  ]),
                  queueIndex: 1,
                }),
              };
            },
          };
        },
      },
    };

    const state = await loadVoiceGlobalState(
      env,
      "user-1",
      baseState
    );

    expect(state.currentTrack?.id).toBe("2");
    expect(state.playlist).toHaveLength(2);
    expect(state.isPlaying).toBe(true);
    expect(state.playbackPosition).toBe(87);
  });
});
