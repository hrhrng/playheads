/**
 * Tests for GenUIErrorBoundary and error handling edge cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GenUIErrorBoundary } from '../GenUIErrorBoundary';
import { GenUIRenderer } from '../GenUIRenderer';
import { GenUIContainer } from '../GenUIContainer';
import type { GenUINode, GenUIPayload } from '../../../types/genui';

// Mock fetch and html2canvas
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    toBlob: (cb: (blob: Blob | null) => void) => cb(new Blob(['test'])),
  }),
}));

// Suppress error boundary console.error in tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('GenUIErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <GenUIErrorBoundary>
        <div>All good</div>
      </GenUIErrorBoundary>
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('renders fallback UI when child throws', () => {
    const ThrowingComponent = () => {
      throw new Error('Test crash');
    };

    render(
      <GenUIErrorBoundary>
        <ThrowingComponent />
      </GenUIErrorBoundary>
    );

    expect(screen.getByText('Visual could not be rendered')).toBeInTheDocument();
    expect(screen.getByText(/encountered a display error/)).toBeInTheDocument();
  });
});

describe('GenUIRenderer edge cases', () => {
  it('handles unknown node types gracefully', () => {
    const unknownNode = { type: 'some-future-type' } as unknown as GenUINode;
    const { container } = render(<GenUIRenderer sections={[unknownNode]} />);
    // Should not crash, just skip
    expect(container.querySelector('.space-y-4')).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledWith(
      '[GenUI] Unknown node type:',
      'some-future-type'
    );
  });

  it('handles empty children arrays in layout nodes', () => {
    const nodes: GenUINode[] = [
      { type: 'grid', columns: 2, children: [] },
      { type: 'carousel', children: [] },
      { type: 'stack', children: [] },
      { type: 'section', children: [] },
    ];
    const { container } = render(<GenUIRenderer sections={nodes} />);
    expect(container.querySelector('.space-y-4')).toBeInTheDocument();
  });

  it('handles timeline with no items', () => {
    const nodes: GenUINode[] = [
      { type: 'timeline', items: [] },
    ];
    const { container } = render(<GenUIRenderer sections={nodes} />);
    expect(container.querySelector('.space-y-4')).toBeInTheDocument();
  });
});

describe('GenUIContainer with malformed data', () => {
  it('renders without crashing when sections is empty', () => {
    const payload: GenUIPayload = { title: 'Empty', sections: [] };
    render(<GenUIContainer data={payload} />);
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });

  it('renders without crashing when gradient is undefined', () => {
    const payload: GenUIPayload = { title: 'No Gradient', sections: [] };
    render(<GenUIContainer data={payload} />);
    expect(screen.getByText('No Gradient')).toBeInTheDocument();
  });
});

describe('AlbumCard API failure handling', () => {
  it('renders without crashing when enrichment fetch fails', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    render(
      <GenUIRenderer
        sections={[
          {
            type: 'album-card',
            title: 'Test Album',
            subtitle: 'Test Artist',
            query: 'Test Album Test Artist',
          },
        ]}
      />
    );

    // Should still render the title even if enrichment fails
    expect(screen.getByText('Test Album')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });
});

describe('Deeply nested structures', () => {
  it('renders 4 levels of nesting without crashing', () => {
    const deep: GenUINode = {
      type: 'section',
      title: 'L1',
      children: [{
        type: 'section',
        title: 'L2',
        children: [{
          type: 'grid',
          columns: 2,
          children: [{
            type: 'section',
            title: 'L4',
            children: [{ type: 'text', content: 'Deepest', style: 'body' }],
          }],
        }],
      }],
    };

    render(<GenUIRenderer sections={[deep]} />);
    expect(screen.getByText('L1')).toBeInTheDocument();
    expect(screen.getByText('L2')).toBeInTheDocument();
    expect(screen.getByText('L4')).toBeInTheDocument();
    expect(screen.getByText('Deepest')).toBeInTheDocument();
  });
});
