/**
 * GenUI tools — generalized visual UI rendering for the chat agent.
 *
 * The `show_visual` tool lets the LLM compose a rich UI from a library of
 * base component primitives (timeline, grid, carousel, album-card, etc.).
 *
 * ZERO server-side enrichment — the tool returns instantly.
 * Each album-card / track-card enriches itself on the client via Apple Music API,
 * giving a natural streaming feel as artwork loads in progressively.
 */
import { tool } from "ai";
import { z } from "zod";
import type { ToolContext } from "./music-tools";

// ---------------------------------------------------------------------------
// Zod schemas for the GenUI component tree
// ---------------------------------------------------------------------------

const badgeSchema = z.object({
  label: z.string(),
  color: z.string().optional(),
});

const itemSchema = z.object({
  type: z.enum(["album-card", "track-card", "text", "stat", "image", "badge-group", "divider"]),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  query: z.string().optional().describe("Apple Music search query for client-side enrichment, e.g. 'Kind of Blue Miles Davis'"),
  year: z.string().optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  content: z.string().optional(),
  style: z.enum(["heading", "body", "caption"]).optional(),
  value: z.string().optional(),
  label: z.string().optional(),
  src: z.string().optional(),
  alt: z.string().optional(),
  badges: z.array(badgeSchema).optional(),
});

const sectionSchema = z.object({
  type: z.enum(["section", "timeline-era", "grid", "carousel", "stack"]).default("section"),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  year: z.string().optional().describe("Year or range for timeline eras, e.g. '1960s'"),
  label: z.string().optional().describe("Short label for timeline node, e.g. 'Bebop Era'"),
  direction: z.enum(["horizontal", "vertical"]).optional(),
  columns: z.number().min(1).max(6).optional(),
  gap: z.number().optional(),
  items: z.array(itemSchema).optional().describe("Leaf-level content items"),
});

type SectionInput = z.infer<typeof sectionSchema>;
type ItemInput = z.infer<typeof itemSchema>;

// ---------------------------------------------------------------------------
// Convert flat section input → GenUI node tree for the client
// (no enrichment — pure synchronous transform, instant return)
// ---------------------------------------------------------------------------

function sectionsToGenUINodes(sections: SectionInput[]): unknown[] {
  return sections.map((section) => {
    const children: unknown[] = [];
    if (section.items) {
      for (const item of section.items) {
        children.push(itemToNode(item));
      }
    }

    switch (section.type) {
      case "timeline-era":
        return {
          _era: true,
          year: section.year || "",
          label: section.label || section.title || "",
          description: section.description,
          children,
        };
      case "grid":
        return { type: "grid", columns: section.columns, children };
      case "carousel":
        return { type: "carousel", children };
      case "stack":
        return { type: "stack", direction: section.direction, gap: section.gap, children };
      case "section":
      default:
        return { type: "section", title: section.title, subtitle: section.subtitle, children };
    }
  });
}

function maybeWrapTimeline(nodes: unknown[]): unknown[] {
  const allEras = nodes.length > 0 && nodes.every((n: any) => n._era);
  if (allEras) {
    return [{
      type: "timeline",
      items: nodes.map((n: any) => {
        const { _era, ...rest } = n;
        return rest;
      }),
    }];
  }
  return nodes;
}

function itemToNode(item: ItemInput): unknown {
  switch (item.type) {
    case "album-card":
      return { type: "album-card", title: item.title || "", subtitle: item.subtitle || "", query: item.query, year: item.year };
    case "track-card":
      return { type: "track-card", title: item.title || "", artist: item.artist || "", query: item.query, album: item.album };
    case "text":
      return { type: "text", content: item.content || "", style: item.style };
    case "stat":
      return { type: "stat", value: item.value || "", label: item.label || "" };
    case "image":
      return { type: "image", src: item.src || "", alt: item.alt };
    case "badge-group":
      return { type: "badge-group", badges: item.badges || [] };
    case "divider":
      return { type: "divider" };
    default:
      return { type: "text", content: "", style: "body" };
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGenUITools(_ctx: ToolContext) {
  return {
    show_visual: tool({
      description:
        "Render a rich, interactive visual UI inline in the chat. " +
        "Compose a component tree from base primitives. Available section types: " +
        "'section' (titled group), 'timeline-era' (node on a horizontal timeline), " +
        "'grid' (responsive grid), 'carousel' (horizontal scroll), 'stack' (flex layout). " +
        "Available item types: 'album-card' (album with artwork + play/queue buttons — provide query for Apple Music lookup), " +
        "'track-card' (compact track row), 'text' (markdown), 'stat' (key metric), " +
        "'image', 'badge-group' (tags), 'divider'. " +
        "Use for genre timelines, album showcases, comparisons, 'best of' lists, artist spotlights, etc. " +
        "For album-card and track-card items, set the 'query' field to 'Album/Song Name Artist Name' — " +
        "the client will automatically fetch artwork and playback IDs from Apple Music.",
      inputSchema: z.object({
        title: z.string().describe("Main title for the visual"),
        subtitle: z.string().optional().describe("Subtitle or tagline"),
        gradient: z
          .array(z.string())
          .min(2)
          .max(2)
          .optional()
          .describe("Two hex colors for header gradient, e.g. ['#1a1a2e', '#16213e']"),
        sections: z
          .array(sectionSchema)
          .min(1)
          .describe("Ordered list of sections composing the visual"),
      }),
      execute: async ({ title, subtitle, gradient, sections }) => {
        // Pure transform — no API calls, returns instantly
        let nodes = sectionsToGenUINodes(sections);
        nodes = maybeWrapTimeline(nodes);

        return JSON.stringify({
          _genui: true,
          message: `Here's a visual for: ${title}`,
          data: { title, subtitle, gradient, sections: nodes },
        });
      },
    }),
  };
}
