/**
 * Tests for playlist-extractor — URL parsing and platform-specific extraction.
 *
 * URL parsing tests are pure (no network). Platform extraction tests mock
 * globalThis.fetch to verify request construction and response parsing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parsePlaylistUrl, extractPlaylistFromUrl, _resetSpotifyTokenCache } from "../playlist-extractor";
import type { Env } from "../types";

// ============================================================================
// URL Parsing (pure, no network)
// ============================================================================

describe("parsePlaylistUrl", () => {
  // ── Apple Music ──
  describe("Apple Music", () => {
    it("extracts playlist ID and storefront from standard URL", () => {
      const result = parsePlaylistUrl(
        "https://music.apple.com/cn/playlist/some-playlist/pl.abc123"
      );
      expect(result.platform).toBe("apple_music");
      expect(result.id).toBe("pl.abc123");
      expect(result.storefront).toBe("cn");
    });

    it("defaults storefront to us when not in URL", () => {
      const result = parsePlaylistUrl(
        "https://music.apple.com/playlist/pl.xyz789"
      );
      expect(result.platform).toBe("apple_music");
      expect(result.id).toBe("pl.xyz789");
      expect(result.storefront).toBe("us");
    });

    it("handles long playlist IDs with hyphens", () => {
      const result = parsePlaylistUrl(
        "https://music.apple.com/us/playlist/my-fav/pl.a1b2c3d4-e5f6"
      );
      expect(result.platform).toBe("apple_music");
      expect(result.id).toBe("pl.a1b2c3d4-e5f6");
    });

    it("throws for Apple Music URL without playlist ID", () => {
      expect(() =>
        parsePlaylistUrl("https://music.apple.com/cn/album/some-album/123")
      ).toThrow("Could not extract Apple Music playlist ID");
    });
  });

  // ── Spotify ──
  describe("Spotify", () => {
    it("extracts playlist ID from standard URL", () => {
      const result = parsePlaylistUrl(
        "https://open.spotify.com/playlist/37i9dQZEVXd9As9cbyWkCC"
      );
      expect(result.platform).toBe("spotify");
      expect(result.id).toBe("37i9dQZEVXd9As9cbyWkCC");
    });

    it("ignores tracking params", () => {
      const result = parsePlaylistUrl(
        "https://open.spotify.com/playlist/37i9dQZEVXd9As9cbyWkCC?si=abc&nd=1"
      );
      expect(result.id).toBe("37i9dQZEVXd9As9cbyWkCC");
    });

    it("throws for non-playlist Spotify URL", () => {
      expect(() =>
        parsePlaylistUrl("https://open.spotify.com/track/abc123")
      ).toThrow("Unsupported URL");
    });
  });

  // ── NetEase ──
  describe("NetEase / 网易云音乐", () => {
    it("extracts ID from hash-based URL", () => {
      const result = parsePlaylistUrl(
        "https://music.163.com/#/playlist?id=123456789"
      );
      expect(result.platform).toBe("netease");
      expect(result.id).toBe("123456789");
    });

    it("extracts ID from query-based URL", () => {
      const result = parsePlaylistUrl(
        "https://music.163.com/playlist?id=987654321"
      );
      expect(result.platform).toBe("netease");
      expect(result.id).toBe("987654321");
    });

    it("throws for NetEase URL without id", () => {
      expect(() =>
        parsePlaylistUrl("https://music.163.com/#/discover")
      ).toThrow("Could not extract NetEase playlist ID");
    });
  });

  // ── QQ Music ──
  describe("QQ Music / QQ音乐", () => {
    it("extracts ID from path-based URL", () => {
      const result = parsePlaylistUrl(
        "https://y.qq.com/n/ryqq/playlist/1234567890"
      );
      expect(result.platform).toBe("qqmusic");
      expect(result.id).toBe("1234567890");
    });

    it("extracts ID from query param", () => {
      const result = parsePlaylistUrl(
        "https://i.y.qq.com/n2/m/share/details/taoge.html?id=9876543"
      );
      expect(result.platform).toBe("qqmusic");
      expect(result.id).toBe("9876543");
    });

    it("throws for QQ Music URL without numeric ID", () => {
      expect(() =>
        parsePlaylistUrl("https://y.qq.com/n/ryqq/singer/abcdef")
      ).toThrow("Could not extract QQ Music playlist ID");
    });
  });

  // ── Resso / 汽水音乐 ──
  describe("Resso / 汽水音乐", () => {
    it("accepts qishui.douyin.com short link", () => {
      const result = parsePlaylistUrl(
        "https://qishui.douyin.com/s/ixRD36co/"
      );
      expect(result.platform).toBe("resso");
      // ID is the full URL for resso (needs redirect following)
      expect(result.id).toContain("qishui.douyin.com");
    });
  });

  // ── Unsupported ──
  describe("unsupported URLs", () => {
    it("throws for YouTube", () => {
      expect(() =>
        parsePlaylistUrl("https://www.youtube.com/playlist?list=abc")
      ).toThrow("Unsupported URL");
    });

    it("throws for random domain", () => {
      expect(() =>
        parsePlaylistUrl("https://example.com/some/path")
      ).toThrow("Unsupported URL");
    });
  });
});

// ============================================================================
// Platform Extraction (mocked fetch)
// ============================================================================

/** Minimal mock Env for tests. */
function mockEnv(overrides?: Partial<Env>): Env {
  return {
    MusicChatAgent: {} as any,
    DB: {} as any,
    ANTHROPIC_MODEL: "test",
    ANTHROPIC_THINKING_BUDGET: "0",
    CLOUDFLARE_ACCOUNT_ID: "test",
    AI_GATEWAY_ID: "test",
    CF_AIG_TOKEN: "test",
    APPLE_MUSIC_TEAM_ID: "test",
    APPLE_MUSIC_KEY_ID: "test",
    APPLE_MUSIC_PRIVATE_KEY: "test",
    APPLE_MUSIC_TOKEN_TTL_SECONDS: "3600",
    SPOTIFY_CLIENT_ID: "test_client_id",
    SPOTIFY_CLIENT_SECRET: "test_client_secret",
    ...overrides,
  };
}

describe("extractPlaylistFromUrl — Spotify", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    _resetSpotifyTokenCache();
    // Mock fetch for Spotify
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      // Token endpoint
      if (url.includes("accounts.spotify.com/api/token")) {
        return new Response(
          JSON.stringify({ access_token: "mock_token", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Playlist endpoint
      if (url.includes("api.spotify.com/v1/playlists/")) {
        return new Response(
          JSON.stringify({
            name: "Test Playlist",
            description: "A test",
            images: [{ url: "https://img.spotify.com/cover.jpg" }],
            tracks: {
              total: 2,
              items: [
                {
                  track: {
                    name: "Song One",
                    artists: [{ name: "Artist A" }],
                    album: { name: "Album X" },
                    duration_ms: 210000,
                  },
                },
                {
                  track: {
                    name: "Song Two",
                    artists: [{ name: "Artist B" }, { name: "Artist C" }],
                    album: { name: "Album Y" },
                    duration_ms: 180000,
                  },
                },
                { track: null }, // Local file — should be skipped
              ],
              next: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Not found", { status: 404 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches and parses a Spotify playlist", async () => {
    const result = await extractPlaylistFromUrl(
      "https://open.spotify.com/playlist/abc123",
      mockEnv()
    );

    expect(result.platform).toBe("spotify");
    expect(result.name).toBe("Test Playlist");
    expect(result.track_count).toBe(2);
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0].name).toBe("Song One");
    expect(result.tracks[0].artist).toBe("Artist A");
    expect(result.tracks[1].artist).toBe("Artist B, Artist C");
    expect(result.artwork_url).toBe("https://img.spotify.com/cover.jpg");
  });

  it("sends correct auth header for token request", async () => {
    await extractPlaylistFromUrl(
      "https://open.spotify.com/playlist/abc123",
      mockEnv()
    );

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const tokenCall = calls.find(
      ([url]: [string]) =>
        typeof url === "string" && url.includes("accounts.spotify.com")
    );
    expect(tokenCall).toBeDefined();
    const tokenInit = tokenCall![1] as RequestInit;
    expect(tokenInit.headers).toHaveProperty(
      "Authorization",
      `Basic ${btoa("test_client_id:test_client_secret")}`
    );
  });
});

describe("extractPlaylistFromUrl — NetEase", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("music.163.com")) {
        return new Response(
          JSON.stringify({
            code: 200,
            playlist: {
              name: "网易云测试歌单",
              description: "测试描述",
              coverImgUrl: "https://p1.music.126.net/cover.jpg",
              tracks: [
                {
                  name: "歌曲一",
                  ar: [{ name: "歌手A" }],
                  al: { name: "专辑X" },
                  dt: 240000,
                },
                {
                  name: "歌曲二",
                  ar: [{ name: "歌手B" }, { name: "歌手C" }],
                  al: { name: "专辑Y" },
                  dt: 300000,
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Not found", { status: 404 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches and parses a NetEase playlist", async () => {
    const result = await extractPlaylistFromUrl(
      "https://music.163.com/#/playlist?id=12345",
      mockEnv()
    );

    expect(result.platform).toBe("netease");
    expect(result.name).toBe("网易云测试歌单");
    expect(result.track_count).toBe(2);
    expect(result.tracks[0].name).toBe("歌曲一");
    expect(result.tracks[0].artist).toBe("歌手A");
    expect(result.tracks[1].artist).toBe("歌手B, 歌手C");
  });

  it("sends correct headers (Referer, User-Agent)", async () => {
    await extractPlaylistFromUrl(
      "https://music.163.com/#/playlist?id=12345",
      mockEnv()
    );

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const neteaseCall = calls.find(
      ([url]: [string]) =>
        typeof url === "string" && url.includes("music.163.com")
    );
    expect(neteaseCall).toBeDefined();
    const init = neteaseCall![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Referer).toBe("https://music.163.com/");
    expect(headers["User-Agent"]).toBeDefined();
  });
});

describe("extractPlaylistFromUrl — QQ Music", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          cdlist: [
            {
              dissname: "QQ音乐测试歌单",
              desc: "测试",
              logo: "https://qq.com/logo.jpg",
              songlist: [
                {
                  songname: "歌曲A",
                  singer: [{ name: "歌手X" }],
                  albumname: "专辑一",
                  interval: 240,
                },
                {
                  songname: "歌曲B",
                  singer: [{ name: "歌手Y" }, { name: "歌手Z" }],
                  albumname: "专辑二",
                  interval: 300,
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches and parses a QQ Music playlist", async () => {
    const result = await extractPlaylistFromUrl(
      "https://y.qq.com/n/ryqq/playlist/1234567",
      mockEnv()
    );

    expect(result.platform).toBe("qqmusic");
    expect(result.name).toBe("QQ音乐测试歌单");
    expect(result.track_count).toBe(2);
    expect(result.tracks[0].name).toBe("歌曲A");
    expect(result.tracks[0].artist).toBe("歌手X");
    expect(result.tracks[1].artist).toBe("歌手Y, 歌手Z");
  });
});

describe("extractPlaylistFromUrl — error handling", () => {
  it("throws for unsupported URL", async () => {
    await expect(
      extractPlaylistFromUrl("https://example.com/nothing", mockEnv())
    ).rejects.toThrow("Unsupported URL");
  });

  it("throws for missing Spotify credentials", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ error: "invalid_client" }),
        { status: 401 }
      );
    }) as typeof fetch;

    await expect(
      extractPlaylistFromUrl(
        "https://open.spotify.com/playlist/abc123",
        mockEnv({ SPOTIFY_CLIENT_ID: "", SPOTIFY_CLIENT_SECRET: "" })
      )
    ).rejects.toThrow();

    globalThis.fetch = originalFetch;
  });
});
