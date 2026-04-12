/**
 * Tests for GenUI AlbumCard component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlbumCard } from '../AlbumCard';
import { GenUIProvider } from '../GenUIContext';
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
    addTracks: vi.fn(),
  };
}

function renderWithActions(ui: React.ReactElement, queueOps?: QueueOperations) {
  return render(
    <GenUIProvider queueOps={queueOps || null} storefront="us">
      {ui}
    </GenUIProvider>
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
        
        title="Album"
        subtitle="Artist"
      />
    );
    // Should show music icon placeholder
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('shows play and queue buttons on hover when songId and actions available', () => {
    const queueOps = createMockQueueOps();
    const { container } = renderWithActions(
      <AlbumCard

        title="Album"
        subtitle="Artist"
        artworkUrl="https://example.com/art.jpg"
        songId="12345"
      />,
      queueOps,
    );

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(2); // Play album + Add to queue
  });

  it('hides action buttons when no songId', () => {
    const queueOps = createMockQueueOps();
    const { container } = renderWithActions(
      <AlbumCard
        
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
        
        title="Album"
        subtitle="Artist"
        artworkUrl="https://example.com/art.jpg"
        songId="12345"
      />
    );

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });

  it('play album button is clickable on collapsed card', () => {
    const queueOps = createMockQueueOps();
    const { container } = renderWithActions(
      <AlbumCard

        title="Kind of Blue"
        subtitle="Miles Davis"
        artworkUrl="https://example.com/art.jpg"
        songId="12345"
      />,
      queueOps,
    );

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    // Click should not throw (actual album fetch is async + mocked to fail)
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
  });

  it('play album button fetches tracks from API', async () => {
    const queueOps = createMockQueueOps();
    const { container } = renderWithActions(
      <AlbumCard

        title="Kind of Blue"
        subtitle="Miles Davis"
        artworkUrl="https://example.com/art.jpg"
        songId="12345"
        albumId="al-123"
      />,
      queueOps,
    );

    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[0]); // Play album

    // Should attempt to fetch album tracks
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('catalog/albums/al-123'),
    );

    vi.useRealTimers();
  });

  it('attempts client-side enrichment when query is provided but no artworkUrl', () => {
    renderWithActions(
      <AlbumCard
        
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
        
        title="Album"
        subtitle="Artist"
      />
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
