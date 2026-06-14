/**
 * Tests for the playback seek bar layout.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlaybackSeekBar } from '../PlaybackSeekBar';

describe('PlaybackSeekBar', () => {
  it('uses the full available width so the rail does not collapse to the time labels', () => {
    render(
      <PlaybackSeekBar
        current={156}
        total={236}
        onSeekStart={vi.fn()}
        onSeekChange={vi.fn()}
        onSeekCommit={vi.fn()}
      />,
    );

    const group = screen.getByLabelText('Playback progress group');
    const input = screen.getByLabelText('Seek playback');

    expect(group).toHaveClass('w-full');
    expect(group).toHaveClass('max-w-sm');
    expect(input).toHaveAttribute('type', 'range');
    expect(input).toHaveAttribute('max', '236');
  });

  it('commits the chosen seek time on pointer release', () => {
    const onSeekCommit = vi.fn();
    render(
      <PlaybackSeekBar
        current={10}
        total={100}
        onSeekStart={vi.fn()}
        onSeekChange={vi.fn()}
        onSeekCommit={onSeekCommit}
      />,
    );

    fireEvent.pointerUp(screen.getByLabelText('Seek playback'), {
      target: { value: '42' },
    });

    expect(onSeekCommit).toHaveBeenCalledWith(42);
  });
});
