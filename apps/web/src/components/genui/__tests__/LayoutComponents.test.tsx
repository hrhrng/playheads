/**
 * Tests for GenUI layout components: Section, Grid, Carousel, Stack, Timeline
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Section } from '../Section';
import { Grid } from '../Grid';
import { Carousel } from '../Carousel';
import { Stack } from '../Stack';
import { Timeline } from '../Timeline';
import type { GenUINode, TextNode, StatNode, TimelineItem } from '../../../types/genui';

// Mock fetch globally so AlbumCard enrichment doesn't fire
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

const textNode: TextNode = { type: 'text', content: 'Hello', style: 'body' };
const statNode: StatNode = { type: 'stat', value: '10', label: 'tracks' };

// ------------------------------------------------------------------
// Section
// ------------------------------------------------------------------

describe('Section', () => {
  it('renders title and subtitle', () => {
    render(
      <Section type="section" title="Featured" subtitle="Top picks" children={[textNode]} />
    );
    expect(screen.getByText('Featured')).toBeInTheDocument();
    expect(screen.getByText('Top picks')).toBeInTheDocument();
  });

  it('renders without title/subtitle', () => {
    const { container } = render(
      <Section type="section" children={[textNode]} />
    );
    expect(container.querySelector('h3')).not.toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders children nodes', () => {
    render(
      <Section type="section" title="Test" children={[textNode, statNode]} />
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('tracks')).toBeInTheDocument();
  });
});

// ------------------------------------------------------------------
// Grid
// ------------------------------------------------------------------

describe('Grid', () => {
  it('renders children in a grid', () => {
    const { container } = render(
      <Grid type="grid" columns={2} children={[textNode, statNode]} />
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('grid');
    expect(grid.className).toContain('grid-cols-2');
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('defaults to 2 columns when not specified', () => {
    const { container } = render(
      <Grid type="grid" children={[textNode]} />
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('grid-cols-2');
  });

  it('supports up to 6 columns', () => {
    const { container } = render(
      <Grid type="grid" columns={4} children={[textNode]} />
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('md:grid-cols-4');
  });

  it('clamps columns to valid range', () => {
    const { container } = render(
      <Grid type="grid" columns={10} children={[textNode]} />
    );
    const grid = container.firstChild as HTMLElement;
    // columns = min(max(10, 1), 6) = 6
    expect(grid.className).toContain('md:grid-cols-6');
  });
});

// ------------------------------------------------------------------
// Carousel
// ------------------------------------------------------------------

describe('Carousel', () => {
  it('renders children in a horizontal scrollable container', () => {
    const { container } = render(
      <Carousel type="carousel" children={[textNode, statNode]} />
    );
    const scroller = container.firstChild as HTMLElement;
    expect(scroller.className).toContain('overflow-x-auto');
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders children as shrink-0 flex items', () => {
    const { container } = render(
      <Carousel type="carousel" children={[textNode]} />
    );
    const flexRow = container.querySelector('.flex');
    expect(flexRow).toBeInTheDocument();
    const children = flexRow?.querySelectorAll('.shrink-0');
    expect(children?.length).toBeGreaterThanOrEqual(1);
  });
});

// ------------------------------------------------------------------
// Stack
// ------------------------------------------------------------------

describe('Stack', () => {
  it('defaults to vertical direction', () => {
    const { container } = render(
      <Stack type="stack" children={[textNode, statNode]} />
    );
    const flex = container.firstChild as HTMLElement;
    expect(flex.className).toContain('flex-col');
  });

  it('renders horizontal when direction is horizontal', () => {
    const { container } = render(
      <Stack type="stack" direction="horizontal" children={[textNode]} />
    );
    const flex = container.firstChild as HTMLElement;
    expect(flex.className).toContain('flex-row');
  });

  it('applies custom gap', () => {
    const { container } = render(
      <Stack type="stack" gap={5} children={[textNode]} />
    );
    const flex = container.firstChild as HTMLElement;
    expect(flex.style.gap).toBe('20px'); // gap * 4
  });

  it('defaults gap to 3 (12px)', () => {
    const { container } = render(
      <Stack type="stack" children={[textNode]} />
    );
    const flex = container.firstChild as HTMLElement;
    expect(flex.style.gap).toBe('12px');
  });
});

// ------------------------------------------------------------------
// Timeline
// ------------------------------------------------------------------

describe('Timeline', () => {
  const items: TimelineItem[] = [
    {
      year: '1950s',
      label: 'Bebop',
      description: 'A revolution in jazz',
      children: [textNode],
    },
    {
      year: '1960s',
      label: 'Hard Bop',
      children: [statNode],
    },
  ];

  it('renders all era labels and years', () => {
    render(<Timeline type="timeline" items={items} />);
    expect(screen.getByText('1950s')).toBeInTheDocument();
    expect(screen.getByText('Bebop')).toBeInTheDocument();
    expect(screen.getByText('1960s')).toBeInTheDocument();
    expect(screen.getByText('Hard Bop')).toBeInTheDocument();
  });

  it('renders era descriptions', () => {
    render(<Timeline type="timeline" items={items} />);
    expect(screen.getByText('A revolution in jazz')).toBeInTheDocument();
  });

  it('renders children content within eras', () => {
    render(<Timeline type="timeline" items={items} />);
    expect(screen.getByText('Hello')).toBeInTheDocument(); // from textNode in era 1
    expect(screen.getByText('10')).toBeInTheDocument();     // from statNode in era 2
  });

  it('renders timeline connector dots', () => {
    const { container } = render(<Timeline type="timeline" items={items} />);
    const dots = container.querySelectorAll('.rounded-full.bg-gray-800');
    expect(dots.length).toBe(2);
  });

  it('renders connecting lines between eras', () => {
    const { container } = render(<Timeline type="timeline" items={items} />);
    // The first era has a transparent left line, second has a gray line
    const lines = container.querySelectorAll('.bg-gray-300');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('applies staggered animation delays to era containers', () => {
    const { container } = render(<Timeline type="timeline" items={items} />);
    // The direct era containers (children of the flex row) have animation delays
    const eraContainers = container.querySelectorAll('[style*="animation-delay"]');
    expect(eraContainers.length).toBe(2);
    expect((eraContainers[0] as HTMLElement).style.animationDelay).toBe('0ms');
    expect((eraContainers[1] as HTMLElement).style.animationDelay).toBe('100ms');
  });
});
