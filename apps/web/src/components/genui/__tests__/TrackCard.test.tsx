/**
 * Tests for GenUI TrackCard component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrackCard } from '../TrackCard';
import { GenUIActionsProvider } from '../GenUIContext';
import type { QueueOperations } from '../../../hooks/useAgentChatAdapter';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockQueueOps(): QueueOperations {
  return {
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    playAtIndex: vi.fn().mockResolvedValue(undefined),
    skipNext: vi.fn().mockResolvedValue(undefined),
  };
}

function renderWithActions(ui: React.ReactElement, queueOps?: QueueOperations) {
  return render(
    <GenUIActionsProvider value={queueOps || null}>
      {ui}
    </GenUIActionsProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: false });
});

describe('TrackCard', () => {
  it('renders title and artist', () => {
    renderWithActions(
      <TrackCard  title="So What" artist="Miles Davis" />
    );
    expect(screen.getByText('So What')).toBeInTheDocument();
    expect(screen.getByText('Miles Davis')).toBeInTheDocument();
  });

  it('renders album info separated by dot', () => {
    renderWithActions(
      <TrackCard  title="So What" artist="Miles Davis" album="Kind of Blue" />
    );
    expect(screen.getByText(/Miles Davis.*Kind of Blue/)).toBeInTheDocument();
  });

  it('renders artwork when artworkUrl is provided', () => {
    renderWithActions(
      <TrackCard
        
        title="So What"
        artist="Miles Davis"
        artworkUrl="https://example.com/art.jpg"
      />
    );
    const img = screen.getByAltText('So What');
    expect(img).toHaveAttribute('src', 'https://example.com/art.jpg');
  });

  it('shows action buttons when songId and actions available', () => {
    const queueOps = createMockQueueOps();
    const { container } = renderWithActions(
      <TrackCard
        
        title="So What"
        artist="Miles Davis"
        songId="12345"
      />,
      queueOps,
    );

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(2);
  });

  it('hides action buttons when no songId', () => {
    const queueOps = createMockQueueOps();
    const { container } = renderWithActions(
      <TrackCard  title="So What" artist="Miles Davis" />,
      queueOps,
    );

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });

  it('calls addTrack when queue button is clicked', () => {
    const queueOps = createMockQueueOps();
    const { container } = renderWithActions(
      <TrackCard
        
        title="So What"
        artist="Miles Davis"
        songId="12345"
      />,
      queueOps,
    );

    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[1]); // Queue button

    expect(queueOps.addTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '12345',
        name: 'So What',
        artist: 'Miles Davis',
        provider: 'apple-music',
      })
    );
  });

  it('attempts client-side enrichment when query but no artwork', () => {
    renderWithActions(
      <TrackCard
        
        title="So What"
        artist="Miles Davis"
        query="So What Miles Davis"
      />
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('catalog/search'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
