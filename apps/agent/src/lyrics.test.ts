import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleLyrics } from './lyrics';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('handleLyrics', () => {
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
