import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleLyrics } from './lyrics';
import type { Env } from './types';

beforeEach(() => {
  vi.restoreAllMocks();
});

function envWithAppleToken(overrides: Partial<Env> = {}): Env {
  const first = vi.fn(async () => ({ appleMusicToken: 'user-token' }));
  const bind = vi.fn(() => ({ first }));
  const prepare = vi.fn(() => ({ bind }));

  return {
    APPLE_LYRICS_SOURCE: 'apple-first',
    APPLE_MUSIC_WEB_TOKEN: 'web-token',
    DB: { prepare },
    ...overrides,
  } as unknown as Env;
}

describe('handleLyrics', () => {
  it('uses Apple private lyrics first when track id and user token are available', async () => {
    const ttml = [
      '<tt><body><div>',
      '<p begin="00:00:01.250"><span>Hello</span> <span>world</span></p>',
      '<p begin="00:00:04.500">Next &amp; line</p>',
      '</div></body></tt>',
    ].join('');
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [{ attributes: { ttml } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const env = envWithAppleToken();
    const res = await handleLyrics(
      new Request('https://agent.test/lyrics?track_id=123&storefront=hk&user_id=user-1&artist_name=方大同&track_name=红豆'),
      env,
    );
    const json = await res.json() as { syncedLyrics: string | null; plainLyrics: string | null; source: string };

    expect(res.status).toBe(200);
    expect(json.source).toBe('apple-music');
    expect(json.syncedLyrics).toContain('[00:01.25]Hello world');
    expect(json.syncedLyrics).toContain('[00:04.50]Next & line');
    expect(json.plainLyrics).toBe('Hello world\nNext & line');

    const firstCall = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit?];
    const firstUrl = new URL(String(firstCall[0]));
    const firstHeaders = firstCall[1]?.headers as Record<string, string>;
    expect(firstUrl.href).toBe('https://amp-api.music.apple.com/v1/catalog/hk/songs/123/syllable-lyrics');
    expect(firstHeaders.authorization).toBe('Bearer web-token');
    expect(firstHeaders['media-user-token']).toBe('user-token');
  });

  it('falls back to LRCLIB when Apple private lyrics rejects the request', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('amp-api.music.apple.com')) {
        return Response.json({ errors: [{ status: '401' }] }, { status: 401 });
      }
      return Response.json({
        syncedLyrics: '[00:01.00] lrclib line',
        plainLyrics: 'lrclib line',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await handleLyrics(
      new Request('https://agent.test/lyrics?track_id=123&storefront=hk&user_id=user-1&artist_name=方大同&track_name=红豆'),
      envWithAppleToken(),
    );
    const json = await res.json() as { syncedLyrics: string | null; source: string };

    expect(res.status).toBe(200);
    expect(json.source).toBe('lrclib');
    expect(json.syncedLyrics).toBe('[00:01.00] lrclib line');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('uses relaxed LRCLIB get params first because album metadata often does not match', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        syncedLyrics: '[00:01.00] line',
        plainLyrics: 'line',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await handleLyrics(new Request('https://agent.test/lyrics?artist_name=方大同&track_name=红豆&album_name=一可啦思刻&duration=236'));

    expect(res.status).toBe(200);
    const firstCall = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit?];
    const firstUrl = new URL(String(firstCall[0]));
    expect(firstUrl.pathname).toBe('/api/get');
    expect(firstUrl.searchParams.get('artist_name')).toBe('方大同');
    expect(firstUrl.searchParams.get('track_name')).toBe('红豆');
    expect(firstUrl.searchParams.has('album_name')).toBe(false);
    expect(firstUrl.searchParams.has('duration')).toBe(false);
  });

  it('falls back to LRCLIB search when direct get does not find the track', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/get?')) {
        return Response.json({ message: 'not found' }, { status: 404 });
      }
      return Response.json([
        {
          trackName: '红豆',
          artistName: '方大同',
          albumName: 'Timeless演唱会',
          duration: 236.09,
          syncedLyrics: '[00:01.00] searched line',
          plainLyrics: 'searched line',
        },
      ]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await handleLyrics(new Request('https://agent.test/lyrics?artist_name=方大同&track_name=红豆&album_name=一可啦思刻&duration=236'));
    const json = await res.json() as { syncedLyrics: string | null; plainLyrics: string | null; source: string };

    expect(res.status).toBe(200);
    expect(json.syncedLyrics).toBe('[00:01.00] searched line');
    expect(json.plainLyrics).toBe('searched line');
    expect(json.source).toBe('lrclib-search');
  });
});
