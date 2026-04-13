/**
 * Music GenUI catalog — defines the component vocabulary the LLM can compose.
 */
import { defineCatalog, defineSchema } from "@json-render/core";
import { z } from "zod";

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
      description: "Titled group of content. Tap title to collapse/expand. Use collapsedHint to show a summary when collapsed, e.g. '6 eras · 1990-2003'.",
      props: z.object({
        title: z.string().nullable(),
        subtitle: z.string().nullable(),
        collapsedHint: z.string().nullable().describe("Text shown when collapsed, e.g. '6 eras · 1990-2003'"),
      }),
    },
    TimelineEra: {
      description:
        "A labelled node on a vertical timeline. Place AlbumCard or TrackCard as children.",
      props: z.object({
        year: z.string().describe("Year or decade, e.g. '1994' or '1990s'"),
        label: z.string().describe("Short era name, e.g. 'Cantopop Era'"),
        description: z.string().nullable().describe("Brief era description"),
      }),
    },
    AlbumCard: {
      description:
        "Album cover card. REQUIRES trackId — you MUST call search_music BEFORE using this component " +
        "to obtain a real Apple Music song ID. Do NOT use this component without first searching. " +
        "Artwork is fetched automatically from the trackId.",
      props: z.object({
        title: z.string().describe("Album title (from search_music results)"),
        subtitle: z.string().describe("Artist name (from search_music results)"),
        trackId: z.string().describe("REQUIRED. Apple Music song ID obtained from search_music results, e.g. '965771855'. Must call search_music first."),
        year: z.string().nullable(),
        query: z.string().nullable().describe("Ignored when trackId is present. Do not omit trackId."),
      }),
      example: { title: "天空", subtitle: "王菲", trackId: "965771855", year: "1994", query: null },
    },
    AlbumDetail: {
      description:
        "Album with expandable tracklist. Same as AlbumCard but shows track list on tap. " +
        "REQUIRES trackId — you MUST call search_music BEFORE using this component.",
      props: z.object({
        title: z.string().describe("Album title"),
        subtitle: z.string().describe("Artist name"),
        trackId: z.string().describe("REQUIRED. Apple Music song ID obtained from search_music. Must call search_music first."),
        year: z.string().nullable(),
        query: z.string().nullable().describe("Ignored when trackId is present. Do not omit trackId."),
      }),
      example: { title: "天空", subtitle: "王菲", trackId: "965771855", year: "1994", query: null },
    },
    TrackCard: {
      description:
        "Compact track row. REQUIRES trackId — you MUST call search_music BEFORE using this component " +
        "to obtain a real Apple Music song ID.",
      props: z.object({
        title: z.string(),
        artist: z.string(),
        album: z.string().nullable(),
        trackId: z.string().describe("REQUIRED. Apple Music song ID obtained from search_music. Must call search_music first."),
        query: z.string().nullable().describe("Ignored when trackId is present. Do not omit trackId."),
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
      props: z.object({ value: z.string(), label: z.string() }),
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
    LyricsCard: {
      description:
        "Beautiful lyric quote card with album art background — ideal for sharing. " +
        "REQUIRES trackId — you MUST call search_music BEFORE using this component. " +
        "IMPORTANT: Only pick 2-4 most iconic lines from the song. Do NOT paste the full lyrics. " +
        "Do NOT include translations. Keep the original language only.",
      props: z.object({
        lines: z.array(z.string()).describe("2-4 iconic lyric lines as an array. Each element is one line. Original language only."),
        trackName: z.string().describe("Song name"),
        artist: z.string().describe("Artist name"),
        trackId: z.string().describe("REQUIRED. Apple Music song ID obtained from search_music. Must call search_music first."),
        query: z.string().nullable().describe("Ignored when trackId is present. Do not omit trackId."),
      }),
      example: { lines: ["等到风景都看透", "也许你会陪我看细水长流"], trackName: "红豆", artist: "王菲", trackId: "965771855", query: null },
    },
    ArtistSpotlight: {
      description:
        "Magazine-style artist profile card with image, stats, and bio. " +
        "Use for artist introductions and spotlights.",
      props: z.object({
        name: z.string(),
        subtitle: z.string().nullable().describe("e.g. 'Chinese Pop Icon' or '华语天后'"),
        bio: z.string().nullable().describe("1-3 sentence bio"),
        imageUrl: z.string().nullable().describe("Artist photo URL if available"),
        stats: z.array(z.object({ label: z.string(), value: z.string() })).nullable().describe("Key stats like albums count, active years"),
      }),
      example: { name: "王菲", subtitle: "华语天后", bio: "王菲是华语乐坛最具影响力的女歌手之一。", imageUrl: null, stats: [{ label: "Albums", value: "15" }, { label: "Active", value: "1989-" }] },
    },
  },
  actions: {
    play: { description: "Play a track via Apple Music." },
    queue: { description: "Add a track to the playback queue." },
  },
});
