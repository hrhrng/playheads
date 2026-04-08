/**
 * GenUI tools — generalized visual UI rendering for the chat agent.
 *
 * The `show_visual` tool lets the LLM compose a rich UI from a library of
 * base component primitives (timeline, grid, carousel, album-card, etc.).
 * The server enriches music items with Apple Music data (artwork, song IDs)
 * before returning the tree to the client for rendering.
 */
import { tool } from "ai";
import { z } from "zod";
import { appleMusicGet } from "../apple-music";
import type { ToolContext } from "./music-tools";

// ---------------------------------------------------------------------------
// Zod schemas for the GenUI component tree
// ---------------------------------------------------------------------------

const badgeSchema = z.object({
  label: z.string(),
  color: z.string().optional(),
});

/**
 * Item schema — leaf-level content nodes.
 * The LLM fills these; the server enriches album/track items.
 */
const itemSchema = z.object({
  type: z.enum(["album-card", "track-card", "text", "stat", "image", "badge-group", "divider"]),
  // album-card / track-card
  title: z.string().optional(),
  subtitle: z.string().optional(),
  query: z.string().optional().describe("Apple Music search query for enrichment, e.g. 'Kind of Blue Miles Davis'"),
  year: z.string().optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  // text
  content: z.string().optional(),
  style: z.enum(["heading", "body", "caption"]).optional(),
  // stat
  value: z.string().optional(),
  label: z.string().optional(),
  // image
  src: z.string().optional(),
  alt: z.string().optional(),
  // badge-group
  badges: z.array(badgeSchema).optional(),
});

/**
 * Section schema — a logical group with optional layout override.
 * Sections contain items (leaf nodes).
 */
const sectionSchema: z.ZodType<SectionSchemaInput> = z.object({
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
  children: z.array(z.lazy((): z.ZodType<SectionSchemaInput> => sectionSchema)).optional().describe("Nested sub-sections"),
});

/** Explicit type for the recursive section schema to satisfy TS7022/TS7024. */
interface SectionSchemaInput {
  type?: "section" | "timeline-era" | "grid" | "carousel" | "stack";
  title?: string;
  subtitle?: string;
  description?: string;
  year?: string;
  label?: string;
  direction?: "horizontal" | "vertical";
  columns?: number;
  gap?: number;
  items?: z.infer<typeof itemSchema>[];
  children?: SectionSchemaInput[];
}

type SectionInput = z.infer<typeof sectionSchema>;
type ItemInput = z.infer<typeof itemSchema>;

// ---------------------------------------------------------------------------
// Apple Music enrichment
// ---------------------------------------------------------------------------

interface EnrichedItem extends ItemInput {
  artworkUrl?: string;
  songId?: string;
  albumId?: string;
}

/** Maximum nesting depth for sections to prevent DoS via deeply nested trees. */
const MAX_SECTION_DEPTH = 5;

/**
 * Walk the section tree and enrich album-card / track-card items
 * with Apple Music data (artwork URL, song ID for playback).
 */
async function enrichSections(
  sections: SectionInput[],
  storefront: string,
  env: import("../types").Env,
  depth = 0,
): Promise<SectionInput[]> {
  if (depth >= MAX_SECTION_DEPTH) {
    console.warn(`[GenUI] Max section nesting depth (${MAX_SECTION_DEPTH}) reached, skipping deeper children`);
    return sections;
  }

  return Promise.all(
    sections.map(async (section) => {
      const enrichedItems = section.items
        ? await enrichItems(section.items, storefront, env)
        : undefined;

      const enrichedChildren = section.children
        ? await enrichSections(section.children, storefront, env, depth + 1)
        : undefined;

      return { ...section, items: enrichedItems, children: enrichedChildren };
    }),
  );
}

async function enrichItems(
  items: ItemInput[],
  storefront: string,
  env: import("../types").Env,
): Promise<EnrichedItem[]> {
  return Promise.all(
    items.map(async (item): Promise<EnrichedItem> => {
      if (
        (item.type === "album-card" || item.type === "track-card") &&
        item.query
      ) {
        try {
          return await enrichMusicItem(item, storefront, env);
        } catch (e) {
          console.warn("[GenUI] enrichment failed for query:", item.query, e);
          return item;
        }
      }
      return item;
    }),
  );
}

async function enrichMusicItem(
  item: ItemInput,
  storefront: string,
  env: import("../types").Env,
): Promise<EnrichedItem> {
  if (item.type === "album-card") {
    // Search for album
    const result = await appleMusicGet(
      `v1/catalog/${storefront}/search`,
      env,
      { term: item.query!, types: "albums", limit: 1 },
    );
    const resultsObj = result?.results as Record<string, unknown> | undefined;
    const albumsObj = resultsObj?.albums as Record<string, unknown> | undefined;
    const albums = albumsObj?.data as Array<Record<string, unknown>> | undefined;
    const found = albums?.[0];
    if (!found) return item;

    const attrs = (found.attributes ?? {}) as Record<string, unknown>;
    const artwork = (attrs.artwork ?? {}) as Record<string, unknown>;
    const rawUrl = typeof artwork.url === "string" ? artwork.url : "";
    const artworkUrl = rawUrl.replace("{w}", "300").replace("{h}", "300");

    // Fetch first track from the album for playback
    let songId: string | undefined;
    try {
      const tracksResult = await appleMusicGet(
        `v1/catalog/${storefront}/albums/${found.id}/tracks`,
        env,
        { limit: 1 },
      );
      const tracks = Array.isArray(tracksResult?.data) ? tracksResult.data as Array<Record<string, unknown>> : [];
      const firstId = tracks[0]?.id;
      songId = typeof firstId === "string" ? firstId : undefined;
    } catch (e) {
      console.warn("[GenUI] album track lookup failed:", e);
    }

    return {
      ...item,
      title: item.title || (typeof attrs.name === "string" ? attrs.name : "") || item.title,
      subtitle: item.subtitle || (typeof attrs.artistName === "string" ? attrs.artistName : "") || item.subtitle,
      artworkUrl,
      albumId: String(found.id ?? ""),
      songId,
    };
  }

  // track-card: search for song directly
  const result = await appleMusicGet(
    `v1/catalog/${storefront}/search`,
    env,
    { term: item.query!, types: "songs", limit: 1 },
  );
  const resultsObj = result?.results as Record<string, unknown> | undefined;
  const songsObj = resultsObj?.songs as Record<string, unknown> | undefined;
  const songs = songsObj?.data as Array<Record<string, unknown>> | undefined;
  const found = songs?.[0];
  if (!found) return item;

  const attrs = (found.attributes ?? {}) as Record<string, unknown>;
  const artwork = (attrs.artwork ?? {}) as Record<string, unknown>;
  const rawUrl = typeof artwork.url === "string" ? artwork.url : "";
  const artworkUrl = rawUrl.replace("{w}", "300").replace("{h}", "300");

  return {
    ...item,
    title: item.title || (typeof attrs.name === "string" ? attrs.name : ""),
    artist: item.artist || (typeof attrs.artistName === "string" ? attrs.artistName : ""),
    artworkUrl,
    songId: found.id as string,
  };
}

// ---------------------------------------------------------------------------
// Convert flat section input → GenUI node tree for the client
// ---------------------------------------------------------------------------

function sectionsToGenUINodes(sections: SectionInput[]): unknown[] {
  return sections.map((section) => {
    const children: unknown[] = [];

    // Add items as leaf nodes
    if (section.items) {
      for (const item of section.items) {
        children.push(itemToGenUINode(item as EnrichedItem));
      }
    }

    // Add nested children
    if (section.children) {
      children.push(...sectionsToGenUINodes(section.children));
    }

    switch (section.type) {
      case "timeline-era":
        // Timeline eras get collected by the parent into a TimelineNode
        return {
          _era: true,
          year: section.year || "",
          label: section.label || section.title || "",
          description: section.description,
          children,
        };

      case "grid":
        return {
          type: "grid",
          columns: section.columns,
          children,
        };

      case "carousel":
        return { type: "carousel", children };

      case "stack":
        return {
          type: "stack",
          direction: section.direction,
          gap: section.gap,
          children,
        };

      case "section":
      default:
        return {
          type: "section",
          title: section.title,
          subtitle: section.subtitle,
          children,
        };
    }
  });
}

/**
 * If the top-level sections are all timeline-era, wrap them in a timeline node.
 */
function maybeWrapTimeline(nodes: unknown[]): unknown[] {
  const allEras = nodes.length > 0 && nodes.every((n: any) => n._era);
  if (allEras) {
    return [
      {
        type: "timeline",
        items: nodes.map((n: any) => {
          const { _era, ...rest } = n;
          return rest;
        }),
      },
    ];
  }
  return nodes;
}

function itemToGenUINode(item: EnrichedItem): unknown {
  switch (item.type) {
    case "album-card":
      return {
        type: "album-card",
        title: item.title || "",
        subtitle: item.subtitle || "",
        query: item.query,          // kept for client-side enrichment fallback
        artworkUrl: item.artworkUrl,
        songId: item.songId,
        albumId: item.albumId,
        year: item.year,
      };

    case "track-card":
      return {
        type: "track-card",
        title: item.title || "",
        artist: item.artist || "",
        query: item.query,
        album: item.album,
        artworkUrl: item.artworkUrl,
        songId: item.songId,
      };

    case "text":
      return {
        type: "text",
        content: item.content || "",
        style: item.style,
      };

    case "stat":
      return {
        type: "stat",
        value: item.value || "",
        label: item.label || "",
      };

    case "image":
      return {
        type: "image",
        src: item.src || "",
        alt: item.alt,
      };

    case "badge-group":
      return {
        type: "badge-group",
        badges: item.badges || [],
      };

    case "divider":
      return { type: "divider" };

    default:
      return { type: "text", content: "", style: "body" };
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGenUITools(ctx: ToolContext) {
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
        "the server will enrich with artwork and playback IDs from Apple Music.",
      inputSchema: z.object({
        title: z.string().describe("Main title for the visual"),
        subtitle: z.string().optional().describe("Subtitle or tagline"),
        gradient: z
          .tuple([z.string(), z.string()])
          .optional()
          .describe("Two hex colors for header gradient, e.g. ['#1a1a2e', '#16213e']"),
        sections: z
          .array(sectionSchema)
          .min(1)
          .describe("Ordered list of sections composing the visual"),
      }),
      execute: async ({ title, subtitle, gradient, sections }) => {
        const apiStart = Date.now();
        const enriched = await enrichSections(sections, ctx.storefront, ctx.env);
        console.log(
          "[GenUI] show_visual enrichment elapsed=%dms sections=%d",
          Date.now() - apiStart,
          sections.length,
        );

        // Convert to GenUI node tree for client rendering
        let nodes = sectionsToGenUINodes(enriched);
        nodes = maybeWrapTimeline(nodes);

        return JSON.stringify({
          _genui: true,
          message: `Here's a visual for: ${title}`,
          data: {
            title,
            subtitle,
            gradient,
            sections: nodes,
          },
        });
      },
    }),
  };
}
