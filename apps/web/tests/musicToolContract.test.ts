/// <reference types="@cloudflare/workers-types" />
import { describe, expect, it } from 'vitest';
import { createMusicTools } from '../../agent/src/tools/music-tools';

describe('server tool declarations', () => {
  it('leaves add_to_queue execution to the client', () => {
    const tools = createMusicTools({ env: {} as any, state: {} as any, storefront: 'us' });
    expect(tools.add_to_queue.execute).toBeUndefined();
  });
});

// Topic history must contain only tracks MusicKit actually accepted.
import * as musicTools from '../../agent/src/tools/music-tools';
it('persists only acknowledged additions, including partial success', async () => {
  expect(musicTools).toHaveProperty('persistQueueToolResults');
  const updates: string[] = [];
  const env = { DB: { prepare: () => ({ bind: (...args: any[]) => ({
    first: async () => ({ playlist: '[]' }),
    run: async () => { updates.push(args[0]); },
  }) }) } } as any;
  const good = { id: 'good', name: 'Good', artist: 'Artist', album: '', artworkUrl: '', durationSeconds: 1, provider: 'apple-music' };
  await musicTools.persistQueueToolResults(env, 'chat', [{ role: 'assistant', parts: [
    { type: 'tool-add_to_queue', state: 'output-available', output: JSON.stringify({ ok: true, partial: true, tracks: [good], failed: [{ id: 'bad' }] }) },
    { type: 'tool-add_to_queue', state: 'output-available', output: JSON.stringify({ ok: false, tracks: [{ id: 'bad' }] }) },
  ] }] as any);
  expect(updates).toEqual([JSON.stringify([good])]);
});
