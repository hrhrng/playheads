/**
 * Tests for GenUI type definitions.
 * Validates the TypeScript types work correctly at runtime with the
 * discriminated union pattern.
 */
import { describe, it, expect } from 'vitest';
import type {
  GenUINode,
  GenUIPayload,
  AlbumCardNode,
  TrackCardNode,
  TextNode,
  StatNode,
  ImageNode,
  BadgeGroupNode,
  DividerNode,
  SectionNode,
  TimelineNode,
  GridNode,
  CarouselNode,
  StackNode,
  TimelineItem,
} from '../../types/genui';

// ------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------

const albumCard: AlbumCardNode = {
  type: 'album-card',
  title: 'Kind of Blue',
  subtitle: 'Miles Davis',
  query: 'Kind of Blue Miles Davis',
  artworkUrl: 'https://example.com/art.jpg',
  songId: '12345',
  albumId: 'al-1',
  year: '1959',
};

const trackCard: TrackCardNode = {
  type: 'track-card',
  title: 'So What',
  artist: 'Miles Davis',
  album: 'Kind of Blue',
  query: 'So What Miles Davis',
  songId: '67890',
};

const textNode: TextNode = {
  type: 'text',
  content: 'Hello **world**',
  style: 'heading',
};

const statNode: StatNode = {
  type: 'stat',
  value: '42',
  label: 'Albums',
};

const imageNode: ImageNode = {
  type: 'image',
  src: 'https://example.com/photo.jpg',
  alt: 'A photo',
};

const badgeGroup: BadgeGroupNode = {
  type: 'badge-group',
  badges: [
    { label: 'Jazz', color: '#0055D4' },
    { label: 'Bebop' },
  ],
};

const divider: DividerNode = {
  type: 'divider',
};

const section: SectionNode = {
  type: 'section',
  title: 'Featured',
  subtitle: 'Top picks',
  children: [albumCard, textNode],
};

const timelineItem: TimelineItem = {
  year: '1950s',
  label: 'Bebop Era',
  description: 'A revolution in jazz',
  children: [albumCard],
};

const timeline: TimelineNode = {
  type: 'timeline',
  items: [timelineItem],
};

const grid: GridNode = {
  type: 'grid',
  columns: 3,
  children: [albumCard, albumCard],
};

const carousel: CarouselNode = {
  type: 'carousel',
  children: [albumCard, albumCard, albumCard],
};

const stack: StackNode = {
  type: 'stack',
  direction: 'horizontal',
  gap: 4,
  children: [textNode, statNode],
};

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('GenUI node type discrimination', () => {
  function getNodeType(node: GenUINode): string {
    return node.type;
  }

  it('discriminates leaf nodes by type', () => {
    expect(getNodeType(albumCard)).toBe('album-card');
    expect(getNodeType(trackCard)).toBe('track-card');
    expect(getNodeType(textNode)).toBe('text');
    expect(getNodeType(statNode)).toBe('stat');
    expect(getNodeType(imageNode)).toBe('image');
    expect(getNodeType(badgeGroup)).toBe('badge-group');
    expect(getNodeType(divider)).toBe('divider');
  });

  it('discriminates layout nodes by type', () => {
    expect(getNodeType(section)).toBe('section');
    expect(getNodeType(timeline)).toBe('timeline');
    expect(getNodeType(grid)).toBe('grid');
    expect(getNodeType(carousel)).toBe('carousel');
    expect(getNodeType(stack)).toBe('stack');
  });

  it('covers all 12 node types', () => {
    const allNodes: GenUINode[] = [
      albumCard, trackCard, textNode, statNode, imageNode,
      badgeGroup, divider, section, timeline, grid, carousel, stack,
    ];
    const types = new Set(allNodes.map(n => n.type));
    expect(types.size).toBe(12);
  });
});

describe('GenUIPayload', () => {
  it('holds a complete visual payload', () => {
    const payload: GenUIPayload = {
      title: 'Evolution of Jazz',
      subtitle: 'From New Orleans to the World',
      gradient: ['#1a1a2e', '#16213e'],
      sections: [timeline, section, grid],
    };

    expect(payload.title).toBe('Evolution of Jazz');
    expect(payload.gradient).toEqual(['#1a1a2e', '#16213e']);
    expect(payload.sections).toHaveLength(3);
  });

  it('works with minimal payload (no optional fields)', () => {
    const payload: GenUIPayload = {
      title: 'Simple Visual',
      sections: [textNode],
    };

    expect(payload.subtitle).toBeUndefined();
    expect(payload.gradient).toBeUndefined();
    expect(payload.sections).toHaveLength(1);
  });
});

describe('AlbumCardNode', () => {
  it('has all required fields', () => {
    expect(albumCard.title).toBe('Kind of Blue');
    expect(albumCard.subtitle).toBe('Miles Davis');
  });

  it('supports optional enrichment fields', () => {
    const unenriched: AlbumCardNode = {
      type: 'album-card',
      title: 'Unknown Album',
      subtitle: 'Unknown Artist',
      query: 'query',
    };
    expect(unenriched.artworkUrl).toBeUndefined();
    expect(unenriched.songId).toBeUndefined();
    expect(unenriched.albumId).toBeUndefined();
  });
});

describe('TimelineNode', () => {
  it('contains items with year, label, and children', () => {
    expect(timeline.items).toHaveLength(1);
    expect(timeline.items[0].year).toBe('1950s');
    expect(timeline.items[0].label).toBe('Bebop Era');
    expect(timeline.items[0].children).toHaveLength(1);
    expect(timeline.items[0].children[0].type).toBe('album-card');
  });
});

describe('Nested node composition', () => {
  it('allows deeply nested structures', () => {
    const deep: SectionNode = {
      type: 'section',
      title: 'Level 1',
      children: [
        {
          type: 'grid',
          columns: 2,
          children: [
            {
              type: 'section',
              title: 'Level 3',
              children: [albumCard],
            },
          ],
        },
      ],
    };

    expect(deep.children[0].type).toBe('grid');
    const gridChild = deep.children[0] as GridNode;
    expect(gridChild.children[0].type).toBe('section');
    const innerSection = gridChild.children[0] as SectionNode;
    expect(innerSection.children[0].type).toBe('album-card');
  });
});
