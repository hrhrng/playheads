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
        "Album cover card. IMPORTANT: Before using AlbumCard in a yaml-spec, you MUST call search_music " +
        "to find the real track. Then fill trackId with the Apple Music song ID from search results, " +
        "and set title/subtitle from the actual search result. " +
        "If trackId is provided, artwork is fetched automatically from Apple Music. " +
        "Only use 'query' as a fallback if you cannot call search_music first.",
      props: z.object({
        title: z.string().describe("Album title (from search_music results)"),
        subtitle: z.string().describe("Artist name (from search_music results)"),
        trackId: z.string().nullable().describe("Apple Music song ID from search_music results, e.g. '965771855'"),
        year: z.string().nullable(),
        query: z.string().nullable().describe("Fallback: Apple Music search query if trackId unavailable"),
      }),
      example: { title: "天空", subtitle: "王菲", trackId: "965771855", year: "1994", query: null },
    },
    AlbumDetail: {
      description:
        "Album with expandable tracklist. Same as AlbumCard but shows track list on tap. " +
        "Use search_music first to get a real trackId.",
      props: z.object({
        title: z.string().describe("Album title"),
        subtitle: z.string().describe("Artist name"),
        trackId: z.string().nullable().describe("Apple Music song ID from search_music"),
        year: z.string().nullable(),
        query: z.string().nullable().describe("Fallback search query"),
      }),
      example: { title: "天空", subtitle: "王菲", trackId: "965771855", year: "1994", query: null },
    },
    TrackCard: {
      description:
        "Compact track row. Use search_music first to get the real track ID. " +
        "Fill trackId with the Apple Music song ID.",
      props: z.object({
        title: z.string(),
        artist: z.string(),
        album: z.string().nullable(),
        trackId: z.string().nullable().describe("Apple Music song ID from search_music"),
        query: z.string().nullable().describe("Fallback search query"),
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
        "Use search_music first to get a real trackId. Fill lyric with the quote text.",
      props: z.object({
        lyric: z.string().describe("The lyric quote text (1-4 lines)"),
        translation: z.string().nullable().describe("Optional translation of the lyric"),
        trackName: z.string().describe("Song name"),
        artist: z.string().describe("Artist name"),
        trackId: z.string().nullable().describe("Apple Music song ID from search_music"),
        query: z.string().nullable().describe("Fallback search query"),
      }),
      example: { lyric: "一个人走在白茫茫的雾里", translation: "Walking alone in the white fog", trackName: "旋木", artist: "王菲", trackId: "965771855", query: null },
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
    MoodBoard: {
      description:
        "Mood-based music recommendation card with gradient header and emoji. " +
        "Place AlbumCard children below for recommendations. " +
        "Use for 'rainy day music', 'workout playlist', 'chill vibes' etc.",
      props: z.object({
        mood: z.string().describe("Mood name, e.g. '雨天听什么'"),
        description: z.string().nullable().describe("Short mood description"),
        emoji: z.string().nullable().describe("A single emoji for the mood"),
        gradient: z.array(z.string()).min(2).max(2).nullable().describe("Two hex colors for header gradient"),
      }),
      example: { mood: "雨天听什么", description: "温柔治愈的旋律，陪你度过雨天", emoji: "🌧️", gradient: ["#667eea", "#764ba2"] },
    },
  },
  actions: {
    play: { description: "Play a track via Apple Music." },
    queue: { description: "Add a track to the playback queue." },
  },
});
