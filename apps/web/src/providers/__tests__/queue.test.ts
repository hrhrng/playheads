import { describe, expect, it, vi } from 'vitest';
import { AppleMusicProvider } from '../AppleMusicProvider';

describe('native queue acknowledgement', () => {
  it('rejects an unresolvable batch and allows the next attempt', async () => {
    const provider = new AppleMusicProvider();
    const failure = new Error('One or more items could not be resolved: 1556175857');
    const playLater = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
    Object.assign(provider, { musicKit: { playLater } });
    await expect(provider.addManyToNativeQueue(['1556175857'])).rejects.toThrow('1556175857');
    await expect(provider.addManyToNativeQueue(['valid'])).resolves.toBeUndefined();
    expect(playLater).toHaveBeenCalledTimes(2);
  });
  it('rejects when the player is unavailable', async () => {
    await expect(new AppleMusicProvider().addManyToNativeQueue(['valid'])).rejects.toThrow();
  });
});
