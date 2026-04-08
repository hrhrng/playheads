/**
 * Generative UI (GenUI) type definitions.
 *
 * Defines a composable component tree that the LLM constructs and the
 * client renders recursively.  The agent calls `show_visual` with a tree
 * of these nodes; the server enriches music items with Apple Music data
 * (artwork, song IDs) before returning the tree to the client.
 */

// ---------------------------------------------------------------------------
// Leaf (content) nodes
// ---------------------------------------------------------------------------

export interface AlbumCardNode {
  type: 'album-card';
  title: string;
  subtitle: string;       // artist name
  query?: string;          // "Album Artist" — used by server for Apple Music lookup
  artworkUrl?: string;     // enriched by server
  songId?: string;         // enriched — first track ID for playback
  albumId?: string;        // enriched
  year?: string;
}

export interface TrackCardNode {
  type: 'track-card';
  title: string;
  artist: string;
  album?: string;
  query?: string;
  artworkUrl?: string;
  songId?: string;
}

export interface TextNode {
  type: 'text';
  content: string;         // supports markdown
  style?: 'heading' | 'body' | 'caption';
}

export interface StatNode {
  type: 'stat';
  value: string;
  label: string;
}

export interface ImageNode {
  type: 'image';
  src: string;
  alt?: string;
}

export interface BadgeGroupNode {
  type: 'badge-group';
  badges: { label: string; color?: string }[];
}

export interface DividerNode {
  type: 'divider';
}

// ---------------------------------------------------------------------------
// Layout (container) nodes — contain children
// ---------------------------------------------------------------------------

export interface SectionNode {
  type: 'section';
  title?: string;
  subtitle?: string;
  children: GenUINode[];
}

export interface TimelineNode {
  type: 'timeline';
  items: TimelineItem[];
}

export interface TimelineItem {
  year: string;
  label: string;
  description?: string;
  children: GenUINode[];
}

export interface GridNode {
  type: 'grid';
  columns?: number;        // 2–4, default 2
  children: GenUINode[];
}

export interface CarouselNode {
  type: 'carousel';
  children: GenUINode[];
}

export interface StackNode {
  type: 'stack';
  direction?: 'horizontal' | 'vertical';
  gap?: number;
  children: GenUINode[];
}

// ---------------------------------------------------------------------------
// Union & top-level payload
// ---------------------------------------------------------------------------

export type GenUINode =
  | SectionNode
  | TimelineNode
  | GridNode
  | CarouselNode
  | StackNode
  | AlbumCardNode
  | TrackCardNode
  | TextNode
  | StatNode
  | ImageNode
  | BadgeGroupNode
  | DividerNode;

/**
 * Top-level GenUI payload returned by the `show_visual` tool.
 * Rendered inside a GenUIContainer with hero header and share button.
 */
export interface GenUIPayload {
  title: string;
  subtitle?: string;
  gradient?: [string, string];
  sections: GenUINode[];
}
