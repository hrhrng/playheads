/**
 * Tests for GenUIRenderer — the recursive node renderer.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GenUIRenderer, renderNode } from '../GenUIRenderer';
import type {
  GenUINode,
  TextNode,
  StatNode,
  SectionNode,
  GridNode,
  TimelineNode,
  AlbumCardNode,
  DividerNode,
} from '../../../types/genui';

// Mock fetch for AlbumCard enrichment
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

// ------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------

const text: TextNode = { type: 'text', content: 'Hello world', style: 'body' };
const stat: StatNode = { type: 'stat', value: '42', label: 'Albums' };
const divider: DividerNode = { type: 'divider' };
const albumCard: AlbumCardNode = {
  type: 'album-card',
  title: 'Kind of Blue',
  subtitle: 'Miles Davis',
  artworkUrl: 'https://example.com/art.jpg',
};

// ------------------------------------------------------------------
// renderNode tests
// ------------------------------------------------------------------

describe('renderNode', () => {
  it('renders text nodes', () => {
    const { container } = render(<>{renderNode(text, 'k1')}</>);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders stat nodes', () => {
    render(<>{renderNode(stat, 'k2')}</>);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Albums')).toBeInTheDocument();
  });

  it('renders divider nodes', () => {
    const { container } = render(<>{renderNode(divider, 'k3')}</>);
    expect(container.querySelector('.border-t')).toBeInTheDocument();
  });

  it('renders album-card nodes', () => {
    render(<>{renderNode(albumCard, 'k4')}</>);
    expect(screen.getByText('Kind of Blue')).toBeInTheDocument();
    expect(screen.getByText('Miles Davis')).toBeInTheDocument();
  });

  it('renders section nodes with children', () => {
    const section: SectionNode = {
      type: 'section',
      title: 'My Section',
      children: [text, stat],
    };
    render(<>{renderNode(section, 'k5')}</>);
    expect(screen.getByText('My Section')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders grid nodes with children', () => {
    const grid: GridNode = {
      type: 'grid',
      columns: 2,
      children: [text, stat],
    };
    const { container } = render(<>{renderNode(grid, 'k6')}</>);
    expect(container.querySelector('.grid')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders timeline nodes', () => {
    const timeline: TimelineNode = {
      type: 'timeline',
      items: [
        { year: '1959', label: 'Modal Jazz', children: [text] },
      ],
    };
    render(<>{renderNode(timeline, 'k7')}</>);
    expect(screen.getByText('1959')).toBeInTheDocument();
    expect(screen.getByText('Modal Jazz')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('returns null for unknown node types', () => {
    const unknown = { type: 'unknown-type' } as unknown as GenUINode;
    const { container } = render(<>{renderNode(unknown, 'k99')}</>);
    expect(container.innerHTML).toBe('');
  });
});

// ------------------------------------------------------------------
// GenUIRenderer (top-level component)
// ------------------------------------------------------------------

describe('GenUIRenderer', () => {
  it('renders multiple root-level sections', () => {
    render(<GenUIRenderer sections={[text, stat, divider]} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders empty when sections array is empty', () => {
    const { container } = render(<GenUIRenderer sections={[]} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.children.length).toBe(0);
  });

  it('renders deeply nested structures', () => {
    const deep: SectionNode = {
      type: 'section',
      title: 'L1',
      children: [
        {
          type: 'section',
          title: 'L2',
          children: [
            {
              type: 'section',
              title: 'L3',
              children: [text],
            },
          ],
        },
      ],
    };
    render(<GenUIRenderer sections={[deep]} />);
    expect(screen.getByText('L1')).toBeInTheDocument();
    expect(screen.getByText('L2')).toBeInTheDocument();
    expect(screen.getByText('L3')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders mixed layout and content nodes', () => {
    const nodes: GenUINode[] = [
      text,
      {
        type: 'grid',
        columns: 2,
        children: [stat, stat],
      },
      divider,
      {
        type: 'carousel',
        children: [albumCard],
      },
    ];
    render(<GenUIRenderer sections={nodes} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getAllByText('42').length).toBe(2);
    expect(screen.getByText('Kind of Blue')).toBeInTheDocument();
  });
});
