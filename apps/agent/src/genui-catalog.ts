/**
 * Music GenUI catalog — defines the component vocabulary the LLM can compose.
 *
 * Uses defineSchema + defineCatalog from @json-render/core (no React dependency,
 * safe for Cloudflare Workers).
 */
import { defineCatalog, defineSchema } from "@json-render/core";
import { z } from "zod";

/**
 * Define the same schema structure as @json-render/react/schema
 * but without depending on the React package.
 */
const schema = defineSchema((s) => ({
  spec: s.object({
    root: s.string(),
    elements: s.record(
      s.object({
        type: s.ref("catalog.components"),
        props: s.propsOf("catalog.components"),
        children: s.array(s.string()),
        visible: s.any(),
      })
    ),
  }),
  catalog: s.object({
    components: s.map({
      props: s.zod(),
      slots: s.array(s.string()),
      description: s.string(),
      example: s.any(),
    }),
    actions: s.map({
      params: s.zod(),
      description: s.string(),
    }),
  }),
}));

export const musicCatalog = defineCatalog(schema, {
  components: {
    Section: {
      description: "Titled group of content. Use as a container for related items.",
      props: z.object({
        title: z.string().nullable(),
        subtitle: z.string().nullable(),
      }),
    },
    TimelineEra: {
      description:
        "A labelled node on a horizontal timeline. Place album cards as children. " +
        "Use multiple TimelineEra children inside a Section to build a timeline.",
      props: z.object({
        year: z.string().describe("Year or decade, e.g. '1994' or '1990s'"),
        label: z.string().describe("Short era name, e.g. 'Cantopop Era'"),
        description: z.string().nullable().describe("Brief era description"),
      }),
    },
    AlbumCard: {
      description:
        "Album cover card with artwork, title, artist, and year. " +
        "Set 'query' to 'Album Name Artist Name' — artwork is auto-fetched from Apple Music. " +
        "Users can play or add to queue via on.play / on.queue events.",
      props: z.object({
        title: z.string().describe("Album title"),
        subtitle: z.string().describe("Artist name"),
        query: z.string().nullable().describe("Apple Music search query for artwork, e.g. 'Fable Faye Wong'"),
        year: z.string().nullable(),
      }),
      example: { title: "Fable", subtitle: "Faye Wong", query: "Fable Faye Wong", year: "2000" },
    },
    TrackCard: {
      description: "Compact track row with small artwork. Set 'query' for Apple Music lookup.",
      props: z.object({
        title: z.string(),
        artist: z.string(),
        album: z.string().nullable(),
        query: z.string().nullable(),
      }),
    },
    TextBlock: {
      description: "Markdown text block. Use style 'heading' for titles, 'caption' for small notes.",
      props: z.object({
        content: z.string().describe("Markdown text"),
        style: z.enum(["heading", "body", "caption"]).nullable(),
      }),
    },
    Stat: {
      description: "Key metric — large value with small label underneath.",
      props: z.object({
        value: z.string(),
        label: z.string(),
      }),
    },
    BadgeGroup: {
      description: "Cluster of coloured tag badges.",
      props: z.object({
        badges: z.array(z.object({ label: z.string(), color: z.string().nullable() })),
      }),
    },
    Divider: {
      description: "Horizontal separator line.",
      props: z.object({}),
    },
  },
  actions: {
    play: {
      description: "Play a track via Apple Music. Triggered by AlbumCard / TrackCard on.play event.",
    },
    queue: {
      description: "Add a track to the playback queue. Triggered by on.queue event.",
    },
  },
});
