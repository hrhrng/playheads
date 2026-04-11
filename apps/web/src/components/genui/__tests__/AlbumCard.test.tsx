/**
 * Tests for GenUI AlbumCard component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlbumCard } from '../AlbumCard';
import { GenUIActionsProvider } from '../GenUIContext';
import type { QueueOperations } from '../../../hooks/useAgentChatAdapter';

// Mock fetch for client-side enrichment
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

describe('AlbumCard', () => {
  it('renders title and subtitle', () => {
    renderWithActions(
      <AlbumCard
        type="album-card"
        title="Kind of Blue"
        subtitle="Miles Davis"
        artworkUrl="https://example.com/art.jpg"
      />
    );
    expect(screen.getByText('Kind of Blue')).toBeInTheDocument();
    expect(screen.getByText('Miles Davis')).toBeInTheDocument();
  });

  it('renders year when provided', () => {
    renderWithActions(
      <AlbumCard
        type="album-card"
        title="Album"
        subtitle="Artist"
        year="1959"
      />
    );
    expect(screen.getByText('1959')).toBeInTheDocument();
  });

  it('renders artwork image when artworkUrl is provided', () => {
    renderWithActions(
      <AlbumCard
        type="album-card"
        title="Album"
        subtitle="Artist"
        artworkUrl="https://example.com/art.jpg"
      />
    );
    const img = screen.getByAltText('Album by Artist');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/art.jpg');
  });

  it('renders placeholder when no artworkUrl', () => {
    const { container } = renderWithActions(
      <AlbumCard
        type="album-card"
        title="Album"
        subtitle="Artist"
      />
    );
    // Should show music icon placeholder
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('shows play button on hover when songId and actions available', () => {
    const queueOps = createMockQueueOps();
    const { container } = renderWithActions(
      <AlbumCard
        type="album-card"
        title="Album"
        subtitle="Artist"
        artworkUrl="https://example.com/art.jpg"
        songId="12345"
      />,
      queueOps,
    );

    // Play overlay button on collapsed card
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(1); // Play only (queue is in expanded tracklist)
  });

  it('hides action buttons when no songId', () => {
    const queueOps = createMockQueueOps();
    const { container } = renderWithActions(
      <AlbumCard
        type="album-card"
        title="Album"
        subtitle="Artist"
        artworkUrl="https://example.com/art.jpg"
      />,
      queueOps,
    );

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });

  it('hides action buttons when no queue operations context', () => {
    const { container } = renderWithActions(
      <AlbumCard
        type="album-card"
        title="Album"
        subtitle="Artist"
        artworkUrl="https://example.com/art.jpg"
        songId="12345"
      />
    );

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });

  it('calls addTrack + skipNext when play button is clicked on collapsed card', () => {
    vi.useFakeTimers();
    const queueOps = createMockQueueOps();
    const { container } = renderWithActions(
      <AlbumCard
        type="album-card"
        title="Kind of Blue"
        subtitle="Miles Davis"
        artworkUrl="https://example.com/art.jpg"
        songId="12345"
      />,
      queueOps,
    );

    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[0]); // Play button

    expect(queueOps.addTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '12345',
        name: 'Kind of Blue',
        artist: 'Miles Davis',
        provider: 'apple-music',
      })
    );
    vi.advanceTimersByTime(300);
    expect(queueOps.skipNext).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('calls addTrack + skipNext when play button is clicked', async () => {
    vi.useFakeTimers();
    const queueOps = createMockQueueOps();
    const { container } = renderWithActions(
      <AlbumCard
        type="album-card"
        title="Kind of Blue"
        subtitle="Miles Davis"
        artworkUrl="https://example.com/art.jpg"
        songId="12345"
      />,
      queueOps,
    );

    // Click the first button (Play)
    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[0]); // Play button

    expect(queueOps.addTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: '12345' })
    );

    // skipNext is called after a 300ms delay
    vi.advanceTimersByTime(300);
    expect(queueOps.skipNext).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('attempts client-side enrichment when query is provided but no artworkUrl', () => {
    renderWithActions(
      <AlbumCard
        type="album-card"
        title="Album"
        subtitle="Artist"
        query="Kind of Blue Miles Davis"
      />
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('catalog/search'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('Kind%20of%20Blue%20Miles%20Davis'),
      expect.anything(),
    );
  });

  it('does not attempt enrichment when artworkUrl is already present', () => {
    renderWithActions(
      <AlbumCard
        type="album-card"
        title="Album"
        subtitle="Artist"
        query="query"
        artworkUrl="https://example.com/already-enriched.jpg"
      />
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not attempt enrichment when query is absent', () => {
    renderWithActions(
      <AlbumCard
        type="album-card"
        title="Album"
        subtitle="Artist"
      />
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
