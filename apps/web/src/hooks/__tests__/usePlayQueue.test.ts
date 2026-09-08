import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePlayQueue } from '../usePlayQueue';

describe('client queue result', () => {
  it('returns actual track metadata and refreshes without a MusicKit event', async () => {
    const tracks = [{ id: '1', name: 'One', provider: 'apple-music' }];
    let items: any[] = [];
    const provider = {
      onQueueChange: () => () => {}, onNowPlayingChange: () => () => {},
      getQueueSnapshot: () => ({ items, position: 0 }),
      addManyToNativeQueue: vi.fn(async () => { items = tracks; }),
    };
    const { result } = renderHook(() => usePlayQueue({ provider: provider as any, userId: null }));
    expect(result.current).toHaveProperty('addTrackIds');
    await act(async () => { expect(await result.current.addTrackIds(['1'])).toEqual({ tracks, failed: [] }); });
    expect(result.current.queue).toEqual(tracks);
  });
  it('keeps valid tracks in order when one ID is unavailable', async () => {
    const items: any[] = [];
    const provider = {
      onQueueChange: () => () => {}, onNowPlayingChange: () => () => {},
      getQueueSnapshot: () => ({ items, position: 0 }),
      addManyToNativeQueue: vi.fn(async ([id]: string[]) => {
        if (id === 'bad') throw new Error('NOT_FOUND: bad');
        items.push({ id, name: id });
      }),
    };
    const { result } = renderHook(() => usePlayQueue({ provider: provider as any, userId: null }));
    let receipt: any;
    await act(async () => { receipt = await result.current.addTrackIds(['1', 'bad', '2']); });
    expect(receipt.tracks.map((t: any) => t.id)).toEqual(['1', '2']);
    expect(receipt.failed).toEqual([{ id: 'bad', error: 'NOT_FOUND: bad' }]);
    expect(result.current.queue.map(t => t.id)).toEqual(['1', '2']);
  });
});
