/**
 * GenUIRenderer — recursively renders a GenUI node tree.
 *
 * Each node type maps to a React component. Layout nodes (section, timeline,
 * grid, carousel, stack) contain children rendered recursively. Leaf nodes
 * (album-card, track-card, text, stat, etc.) render content directly.
 */
import type { GenUINode } from '../../types/genui';
import { AlbumCard } from './AlbumCard';
import { TrackCard } from './TrackCard';
import { TextBlock } from './TextBlock';
import { Stat } from './Stat';
import { ImageBlock } from './ImageBlock';
import { BadgeGroup } from './BadgeGroup';
import { Divider } from './Divider';
import { Section } from './Section';
import { Timeline } from './Timeline';
import { Grid } from './Grid';
import { Carousel } from './Carousel';
import { Stack } from './Stack';

/**
 * Render a single GenUI node. Exported so layout components can call it
 * recursively for their children.
 */
export function renderNode(node: GenUINode, key: string): React.ReactNode {
  switch (node.type) {
    // Layout nodes
    case 'section':
      return <Section key={key} {...node} />;
    case 'timeline':
      return <Timeline key={key} {...node} />;
    case 'grid':
      return <Grid key={key} {...node} />;
    case 'carousel':
      return <Carousel key={key} {...node} />;
    case 'stack':
      return <Stack key={key} {...node} />;

    // Leaf nodes
    case 'album-card':
      return <AlbumCard key={key} {...node} />;
    case 'track-card':
      return <TrackCard key={key} {...node} />;
    case 'text':
      return <TextBlock key={key} {...node} />;
    case 'stat':
      return <Stat key={key} {...node} />;
    case 'image':
      return <ImageBlock key={key} {...node} />;
    case 'badge-group':
      return <BadgeGroup key={key} {...node} />;
    case 'divider':
      return <Divider key={key} />;

    default:
      console.warn('[GenUI] Unknown node type:', (node as { type: string }).type);
      return null;
  }
}

interface GenUIRendererProps {
  sections: GenUINode[];
}

/**
 * Top-level renderer — iterates the root-level sections array.
 */
export function GenUIRenderer({ sections }: GenUIRendererProps) {
  return (
    <div className="space-y-4">
      {sections.map((node, i) => renderNode(node, `root-${i}`))}
    </div>
  );
}
