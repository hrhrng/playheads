/**
 * Tests for GenUI tree transformation logic.
 *
 * The server-side genui-tools.ts has internal functions (sectionsToGenUINodes,
 * maybeWrapTimeline, itemToGenUINode) that are not exported. We replicate
 * the same logic here to test the transformation rules, similar to how
 * chat.test.ts replicates type guards from chat.d.ts.
 */
import { describe, it, expect } from 'vitest';

// ------------------------------------------------------------------
// Replicated transformation logic from genui-tools.ts
// ------------------------------------------------------------------

interface SectionInput {
  type: string;
  title?: string;
  subtitle?: string;
  description?: string;
  year?: string;
  label?: string;
  direction?: string;
  columns?: number;
  gap?: number;
  items?: ItemInput[];
  children?: SectionInput[];
}

interface ItemInput {
  type: string;
  title?: string;
  subtitle?: string;
  content?: string;
  style?: string;
  value?: string;
  label?: string;
  query?: string;
  artworkUrl?: string;
  songId?: string;
  albumId?: string;
  year?: string;
  artist?: string;
  album?: string;
  src?: string;
  alt?: string;
  badges?: { label: string; color?: string }[];
}

function itemToGenUINode(item: ItemInput): unknown {
  switch (item.type) {
    case 'album-card':
      return {
        type: 'album-card',
        title: item.title || '',
        subtitle: item.subtitle || '',
        query: item.query,
        artworkUrl: item.artworkUrl,
        songId: item.songId,
        albumId: item.albumId,
        year: item.year,
      };
    case 'track-card':
      return {
        type: 'track-card',
        title: item.title || '',
        artist: item.artist || '',
        query: item.query,
        album: item.album,
        artworkUrl: item.artworkUrl,
        songId: item.songId,
      };
    case 'text':
      return { type: 'text', content: item.content || '', style: item.style };
    case 'stat':
      return { type: 'stat', value: item.value || '', label: item.label || '' };
    case 'image':
      return { type: 'image', src: item.src || '', alt: item.alt };
    case 'badge-group':
      return { type: 'badge-group', badges: item.badges || [] };
    case 'divider':
      return { type: 'divider' };
    default:
      return { type: 'text', content: '', style: 'body' };
  }
}

function sectionsToGenUINodes(sections: SectionInput[]): unknown[] {
  return sections.map((section) => {
    const children: unknown[] = [];

    if (section.items) {
      for (const item of section.items) {
        children.push(itemToGenUINode(item));
      }
    }

    if (section.children) {
      children.push(...sectionsToGenUINodes(section.children));
    }

    switch (section.type) {
      case 'timeline-era':
        return {
          _era: true,
          year: section.year || '',
          label: section.label || section.title || '',
          description: section.description,
          children,
        };
      case 'grid':
        return { type: 'grid', columns: section.columns, children };
      case 'carousel':
        return { type: 'carousel', children };
      case 'stack':
        return { type: 'stack', direction: section.direction, gap: section.gap, children };
      case 'section':
      default:
        return { type: 'section', title: section.title, subtitle: section.subtitle, children };
    }
  });
}

function maybeWrapTimeline(nodes: unknown[]): unknown[] {
  const allEras = nodes.length > 0 && nodes.every((n: any) => n._era);
  if (allEras) {
    return [
      {
        type: 'timeline',
        items: nodes.map((n: any) => {
          const { _era, ...rest } = n;
          return rest;
        }),
      },
    ];
  }
  return nodes;
}

// ------------------------------------------------------------------
// itemToGenUINode tests
// ------------------------------------------------------------------

describe('itemToGenUINode', () => {
  it('converts album-card items', () => {
    const result = itemToGenUINode({
      type: 'album-card',
      title: 'Kind of Blue',
      subtitle: 'Miles Davis',
      query: 'Kind of Blue Miles Davis',
      artworkUrl: 'https://example.com/art.jpg',
      songId: '123',
      albumId: 'al-1',
      year: '1959',
    });
    expect(result).toEqual({
      type: 'album-card',
      title: 'Kind of Blue',
      subtitle: 'Miles Davis',
      query: 'Kind of Blue Miles Davis',
      artworkUrl: 'https://example.com/art.jpg',
      songId: '123',
      albumId: 'al-1',
      year: '1959',
    });
  });

  it('converts track-card items', () => {
    const result = itemToGenUINode({
      type: 'track-card',
      title: 'So What',
      artist: 'Miles Davis',
      album: 'Kind of Blue',
      songId: '456',
    });
    expect(result).toEqual(expect.objectContaining({
      type: 'track-card',
      title: 'So What',
      artist: 'Miles Davis',
      songId: '456',
    }));
  });

  it('converts text items', () => {
    expect(itemToGenUINode({ type: 'text', content: 'Hello', style: 'heading' }))
      .toEqual({ type: 'text', content: 'Hello', style: 'heading' });
  });

  it('converts stat items', () => {
    expect(itemToGenUINode({ type: 'stat', value: '42', label: 'albums' }))
      .toEqual({ type: 'stat', value: '42', label: 'albums' });
  });

  it('converts badge-group items', () => {
    const result = itemToGenUINode({
      type: 'badge-group',
      badges: [{ label: 'Jazz' }, { label: 'Bebop', color: '#ff0' }],
    });
    expect(result).toEqual({
      type: 'badge-group',
      badges: [{ label: 'Jazz' }, { label: 'Bebop', color: '#ff0' }],
    });
  });

  it('converts divider items', () => {
    expect(itemToGenUINode({ type: 'divider' })).toEqual({ type: 'divider' });
  });

  it('defaults unknown types to empty text', () => {
    expect(itemToGenUINode({ type: 'unknown' }))
      .toEqual({ type: 'text', content: '', style: 'body' });
  });

  it('handles missing optional fields with defaults', () => {
    const result = itemToGenUINode({ type: 'album-card' });
    expect(result).toEqual(expect.objectContaining({
      type: 'album-card',
      title: '',
      subtitle: '',
    }));
  });
});

// ------------------------------------------------------------------
// sectionsToGenUINodes tests
// ------------------------------------------------------------------

describe('sectionsToGenUINodes', () => {
  it('converts section types', () => {
    const result = sectionsToGenUINodes([{
      type: 'section',
      title: 'Featured',
      subtitle: 'Top picks',
      items: [{ type: 'text', content: 'Hello' }],
    }]);

    expect(result).toEqual([{
      type: 'section',
      title: 'Featured',
      subtitle: 'Top picks',
      children: [{ type: 'text', content: 'Hello', style: undefined }],
    }]);
  });

  it('converts timeline-era types with _era marker', () => {
    const result = sectionsToGenUINodes([{
      type: 'timeline-era',
      year: '1950s',
      label: 'Bebop',
      description: 'A revolution',
      items: [{ type: 'text', content: 'Info' }],
    }]);

    expect(result).toEqual([{
      _era: true,
      year: '1950s',
      label: 'Bebop',
      description: 'A revolution',
      children: [{ type: 'text', content: 'Info', style: undefined }],
    }]);
  });

  it('converts grid types', () => {
    const result = sectionsToGenUINodes([{
      type: 'grid',
      columns: 3,
      items: [{ type: 'stat', value: '10', label: 'tracks' }],
    }]);

    expect(result).toEqual([{
      type: 'grid',
      columns: 3,
      children: [{ type: 'stat', value: '10', label: 'tracks' }],
    }]);
  });

  it('converts carousel types', () => {
    const result = sectionsToGenUINodes([{
      type: 'carousel',
      items: [{ type: 'album-card', title: 'A', subtitle: 'B' }],
    }]);

    expect(result[0]).toEqual(expect.objectContaining({ type: 'carousel' }));
  });

  it('converts stack types with direction and gap', () => {
    const result = sectionsToGenUINodes([{
      type: 'stack',
      direction: 'horizontal',
      gap: 4,
      items: [{ type: 'text', content: 'X' }],
    }]);

    expect(result).toEqual([{
      type: 'stack',
      direction: 'horizontal',
      gap: 4,
      children: [{ type: 'text', content: 'X', style: undefined }],
    }]);
  });

  it('handles nested children recursively', () => {
    const result = sectionsToGenUINodes([{
      type: 'section',
      title: 'Parent',
      children: [{
        type: 'section',
        title: 'Child',
        items: [{ type: 'text', content: 'Deep' }],
      }],
    }]);

    const parent = result[0] as any;
    expect(parent.title).toBe('Parent');
    expect(parent.children[0].title).toBe('Child');
    expect(parent.children[0].children[0]).toEqual({ type: 'text', content: 'Deep', style: undefined });
  });

  it('merges items and nested children', () => {
    const result = sectionsToGenUINodes([{
      type: 'section',
      title: 'Mixed',
      items: [{ type: 'text', content: 'Item' }],
      children: [{
        type: 'section',
        title: 'Nested',
        items: [{ type: 'text', content: 'Child item' }],
      }],
    }]);

    const section = result[0] as any;
    expect(section.children).toHaveLength(2); // 1 item + 1 nested section
    expect(section.children[0]).toEqual({ type: 'text', content: 'Item', style: undefined });
    expect(section.children[1].title).toBe('Nested');
  });

  it('falls back to section for unknown types', () => {
    const result = sectionsToGenUINodes([{
      type: 'some-unknown-type',
      title: 'Unknown',
      items: [],
    }]);

    expect(result[0]).toEqual(expect.objectContaining({ type: 'section' }));
  });
});

// ------------------------------------------------------------------
// maybeWrapTimeline tests
// ------------------------------------------------------------------

describe('maybeWrapTimeline', () => {
  it('wraps all-era nodes in a timeline node', () => {
    const eras = [
      { _era: true, year: '1920s', label: 'Early Jazz', children: [] },
      { _era: true, year: '1940s', label: 'Bebop', children: [] },
    ];

    const result = maybeWrapTimeline(eras);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'timeline',
      items: [
        { year: '1920s', label: 'Early Jazz', children: [] },
        { year: '1940s', label: 'Bebop', children: [] },
      ],
    });
  });

  it('strips _era marker from wrapped items', () => {
    const eras = [{ _era: true, year: '1920s', label: 'Early', children: [] }];
    const result = maybeWrapTimeline(eras);
    const timeline = result[0] as any;
    expect(timeline.items[0]._era).toBeUndefined();
  });

  it('returns nodes unchanged when not all eras', () => {
    const mixed = [
      { _era: true, year: '1920s', label: 'Early', children: [] },
      { type: 'section', title: 'Other', children: [] },
    ];

    const result = maybeWrapTimeline(mixed);
    expect(result).toBe(mixed); // Same reference, unchanged
  });

  it('returns empty array unchanged', () => {
    const result = maybeWrapTimeline([]);
    expect(result).toEqual([]);
  });

  it('returns non-era nodes unchanged', () => {
    const nodes = [
      { type: 'section', title: 'A', children: [] },
      { type: 'grid', columns: 2, children: [] },
    ];

    const result = maybeWrapTimeline(nodes);
    expect(result).toBe(nodes);
  });
});

// ------------------------------------------------------------------
// End-to-end transformation
// ------------------------------------------------------------------

describe('Full pipeline: sections → nodes → maybeWrapTimeline', () => {
  it('transforms timeline-era sections into a timeline node', () => {
    const sections: SectionInput[] = [
      {
        type: 'timeline-era',
        year: '1920s',
        label: 'New Orleans',
        items: [{ type: 'album-card', title: 'Album A', subtitle: 'Artist A' }],
      },
      {
        type: 'timeline-era',
        year: '1940s',
        label: 'Bebop',
        items: [{ type: 'album-card', title: 'Album B', subtitle: 'Artist B' }],
      },
    ];

    let nodes = sectionsToGenUINodes(sections);
    nodes = maybeWrapTimeline(nodes);

    expect(nodes).toHaveLength(1);
    const timeline = nodes[0] as any;
    expect(timeline.type).toBe('timeline');
    expect(timeline.items).toHaveLength(2);
    expect(timeline.items[0].year).toBe('1920s');
    expect(timeline.items[0].children[0].type).toBe('album-card');
    expect(timeline.items[1].year).toBe('1940s');
  });

  it('transforms mixed sections without timeline wrapping', () => {
    const sections: SectionInput[] = [
      {
        type: 'section',
        title: 'Intro',
        items: [{ type: 'text', content: 'Welcome' }],
      },
      {
        type: 'grid',
        columns: 3,
        items: [
          { type: 'album-card', title: 'A', subtitle: 'X' },
          { type: 'album-card', title: 'B', subtitle: 'Y' },
        ],
      },
    ];

    let nodes = sectionsToGenUINodes(sections);
    nodes = maybeWrapTimeline(nodes);

    expect(nodes).toHaveLength(2);
    expect((nodes[0] as any).type).toBe('section');
    expect((nodes[1] as any).type).toBe('grid');
  });
});
