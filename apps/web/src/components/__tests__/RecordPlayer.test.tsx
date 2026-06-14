/**
 * Tests for RecordPlayer layout invariants.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RecordPlayer } from '../RecordPlayer';
import type { UnifiedTrack } from '../../providers/types';

const track: UnifiedTrack = {
  id: 'song-1',
  name: 'Test Track',
  artist: 'Test Artist',
  album: 'Test Album',
  artworkUrl: 'https://example.com/art/{w}x{h}.jpg',
  durationSeconds: 180,
  provider: 'apple-music',
};

describe('RecordPlayer', () => {
  it('keeps the cover frame square by sizing from the smaller available axis', () => {
    render(
      <div className="h-[640px] w-[360px]">
        <RecordPlayer
          currentTrack={track}
          isPaused={false}
          togglePlay={vi.fn()}
        />
      </div>,
    );

    const image = screen.getByAltText('Test Track');
    const coverFrame = image.parentElement;

    expect(coverFrame).toBeInTheDocument();
    expect(coverFrame).toHaveClass('aspect-square');
    expect(coverFrame).not.toHaveClass('h-full');
    expect(coverFrame).toHaveStyle({
      width: 'min(100cqw, 100cqh)',
      height: 'min(100cqw, 100cqh)',
    });
  });
});
