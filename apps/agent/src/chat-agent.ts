/**
 * MusicChatAgent — AI DJ running on Cloudflare Agents SDK.
 *
 * Extends AIChatAgent for text chat (automatic message persistence, resumable
 * streaming, multi-device sync) AND wraps with @cloudflare/voice's withVoice()
 * mixin so the SAME Durable Object class handles realtime voice too:
 *   - onChatMessage() — text chat path (Vercel AI SDK streaming)
 *   - onTurn()        — voice path (continuous STT + streaming TTS)
 *
 * Both paths share the SAME music tools, same LLM resolver, and same D1-backed
 * playback state. Text chat instances are keyed by sessionId; voice instances
 * are keyed by userId (persistent DJ across chats).
 *
 * Ported from apps/backend/agent.py
 */
import { AIChatAgent } from "@cloudflare/ai-chat";
import { streamText, convertToModelMessages, stepCountIs, tool, createUIMessageStream, createUIMessageStreamResponse, type ModelMessage } from "ai";
import { z } from "zod";
import type { Connection } from "agents";
import {
  withVoice,
  WorkersAIFluxSTT,
  WorkersAITTS,
  type TTSProvider,
  type StreamingTTSProvider,
  type VoiceTurnContext,
  type TextSource,
} from "@cloudflare/voice";
import { ElevenLabsTTS } from "./elevenlabs-tts";
import { createMusicTools } from "./tools";
import { pipeYamlRender } from "@json-render/yaml";
import { yamlPrompt } from "@json-render/yaml";
import { musicCatalog } from "./genui-catalog";
import { generateAndUpdateTitle } from "./title";
import { resolveLLM, decryptApiKey } from "./resolve-llm";
import type { Env, PlaybackState } from "./types";

// ---------------------------------------------------------------------------
// System Prompt (ported from agent.py:298-322)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_STATIC = `You are a friendly music DJ assistant called "Playhead DJ". You help users discover and play music.

Available Tools:
- search_music(query) — search Apple Music catalog. Returns track list with IDs.
- web_search(query) — search the web for music recommendations, playlist ideas, artist info, trending songs, or genre exploration.
- get_now_playing() — check what's currently playing.
- get_playlist() — show the current playlist/queue.
- add_to_queue(track_id) — add a track by Apple Music ID (from search_music results).
- play_track(index) — play a track ALREADY in the playlist (1-indexed position).
- skip_next() — skip to the next track.
- remove_from_playlist(index) — remove a track by position (1-indexed).

You can also render rich visual UIs (timelines, album grids, artist spotlights) inline using YAML spec blocks. See the GENUI section below for details.

Workflow:
- "Play X" → search_music(X) → add_to_queue(id) → play_track(position)
- "Add X to queue" → search_music(X) → add_to_queue(id)
- "Search X" → search_music(X) — just search, show results
- "Play track N" → play_track(N) — play an existing track in the playlist
- "Skip" / "Next" → skip_next()
- "Remove N" → remove_from_playlist(N)
- "What's playing?" → get_now_playing()
- "Show queue" → get_playlist()
- "Recommend" → web_search(query) → show results → wait for user to pick
- "History of X" / "How did X evolve?" / "Best albums of Y" / "Compare X vs Y" / "Show me artist's discography" → FIRST call search_music for each key album/track to get real Apple Music IDs, THEN output a yaml-spec block using those real IDs in trackId props. Never make up IDs.

IMPORTANT:
- search_music only searches — it does NOT add to queue or play.
- add_to_queue needs a track_id from search_music results.
- play_track plays a track ALREADY in the playlist (1-indexed).
- remove_from_playlist takes a 1-indexed position.
- web_search is for discovery and recommendations (web results). search_music is for finding specific tracks on Apple Music.
- When asked to build a playlist, use web_search for ideas, then search_music + add_to_queue for each track.

Be conversational and fun! Keep responses concise.`;

// Hoist GENUI prompt to module level — musicCatalog is constant
const GENUI_PROMPT = yamlPrompt(musicCatalog, {
  mode: "inline",
  system:
    "\n\nGENUI — Rich Visual UI\n" +
    "When asked about genre history, album timelines, artist spotlights, best-of lists, or comparisons:\n" +
    "1. FIRST call search_music for EVERY album/track you plan to display. trackId is REQUIRED for AlbumCard, AlbumDetail, TrackCard, and LyricsCard — these components will NOT work without a real trackId.\n" +
    "2. THEN output a yaml-spec block using those real IDs in the trackId prop.\n" +
    "3. NEVER fabricate track IDs. NEVER leave trackId empty or null. Only use IDs returned by search_music.\n" +
    "4. Respond conversationally, then include the yaml-spec block.",
  customRules: [
    "CRITICAL: trackId is REQUIRED for AlbumCard, AlbumDetail, TrackCard, and LyricsCard. You MUST call search_music BEFORE outputting any yaml-spec that contains these components. Do NOT skip the search step. Do NOT use made-up IDs. Do NOT leave trackId null.",
    "For AlbumCard, set trackId to a real Apple Music song ID (e.g. '965771855'). Artwork is auto-fetched from the track.",
    "The 'query' field is NOT a substitute for trackId. Always search first, always provide trackId.",
    "Use TimelineEra children inside a Section to build vertical timelines.",
    "Use multiple AlbumCard children inside a TimelineEra for albums of that period.",
    "Keep visuals focused — 3-6 TimelineEra nodes for timelines, 4-9 AlbumCards for grids.",
    "Do NOT add call-to-action text like '点选播放', '快来听', 'add 红豆', '试试加到队列' in subtitles or conversational text after the yaml-spec. Keep responses clean and concise.",
  ],
});

const STATIC_SYSTEM = SYSTEM_PROMPT_STATIC + "\n\n" + GENUI_PROMPT;

/**
 * Build a web_search tool.
 * Priority: DB config (from search_provider_config table) > env vars.
 *
 * SEARCH_PROVIDER env values: "brave" | "tavily" | "none" (anything else = no search)
 * Defaults for Anthropic provider are handled in the caller (native webSearch_20250305).
 */
function buildWebSearchTool(env: Env, dbOverride?: { providerType: string; apiKey: string }) {
  const provider = (dbOverride?.providerType || env.SEARCH_PROVIDER || "").toLowerCase();
  console.log(`[WebSearch] buildWebSearchTool provider=${provider} dbOverride=${JSON.stringify(dbOverride ? { providerType: dbOverride.providerType, hasApiKey: !!dbOverride.apiKey } : null)} envProvider=${env.SEARCH_PROVIDER || "unset"}`);

  if (provider === "brave") {
    const apiKey = dbOverride?.apiKey || env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
      console.log("[WebSearch] Brave: no API key, returning undefined");
      return undefined;
    }
    console.log("[WebSearch] Brave: building tool");
    return tool({
      description: "Search the web for music recommendations, artist info, trending songs, or genre exploration.",
      inputSchema: z.object({ query: z.string().describe("Search query") }),
      execute: async ({ query }: { query: string }) => {
        console.log(`[WebSearch] Brave: executing query="${query}"`);
        try {
          const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
          const res = await fetch(url, { headers: { "X-Subscription-Token": apiKey, Accept: "application/json" } });
          console.log(`[WebSearch] Brave: status=${res.status} statusText=${res.statusText}`);
          const rawText = await res.text();
          console.log(`[WebSearch] Brave: rawResponse=${rawText.substring(0, 500)}`);
          const data = JSON.parse(rawText) as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
          const results = data.web?.results || [];
          console.log(`[WebSearch] Brave: resultCount=${results.length}`);
          if (!results.length) return `No results found for: ${query}`;
          return results.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.description}`).join("\n\n");
        } catch (e) {
          console.error(`[WebSearch] Brave: error=`, e);
          return `Web search failed: ${e}`;
        }
      },
    });
  }

  if (provider === "tavily") {
    const apiKey = dbOverride?.apiKey || env.TAVILY_API_KEY;
    if (!apiKey) {
      console.log("[WebSearch] Tavily: no API key, returning undefined");
      return undefined;
    }
    console.log("[WebSearch] Tavily: building tool");
    return tool({
      description: "Search the web for music recommendations, artist info, trending songs, or genre exploration.",
      inputSchema: z.object({ query: z.string().describe("Search query") }),
      execute: async ({ query }: { query: string }) => {
        console.log(`[WebSearch] Tavily: executing query="${query}"`);
        try {
          const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ query, max_results: 5, search_depth: "basic" }),
          });
          console.log(`[WebSearch] Tavily: status=${res.status} statusText=${res.statusText}`);
          const rawText = await res.text();
          console.log(`[WebSearch] Tavily: rawResponse=${rawText.substring(0, 500)}`);
          const data = JSON.parse(rawText) as { results?: Array<{ title: string; url: string; content: string }> };
          const resultCount = (data.results || []).length;
          console.log(`[WebSearch] Tavily: resultCount=${resultCount}`);
          return (data.results || []).map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.content}`).join("\n\n");
        } catch (e) {
          console.error(`[WebSearch] Tavily: error=`, e);
          return `Web search failed: ${e}`;
        }
      },
    });
  }

  console.log(`[WebSearch] No matching provider for "${provider}", returning undefined`);
  return undefined;
}

function buildStateContext(state: PlaybackState): ModelMessage {
  const lines: string[] = [];

  if (state.currentTrack) {
    lines.push(
      `Currently playing: ${state.currentTrack.name} by ${state.currentTrack.artist}`
    );
  } else {
    lines.push("Nothing is currently playing.");
  }

  if (state.playlist.length) {
    lines.push(`Playlist has ${state.playlist.length} tracks:`);
    for (let i = 0; i < Math.min(state.playlist.length, 5); i++) {
      const track = state.playlist[i];
      lines.push(`  ${i + 1}. ${track.name} - ${track.artist}`);
    }
    if (state.playlist.length > 5) {
      lines.push(`  ... and ${state.playlist.length - 5} more`);
    }
  } else {
    lines.push("Playlist is empty.");
  }

  return { role: "user" as const, content: "[Current Playback State]\n" + lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a plain-text preview from a UIMessage (for conversation list). */
function extractTextPreview(msg: import("ai").UIMessage): string {
  for (const part of msg.parts) {
    if (part.type === "text" && part.text) return part.text;
  }
  return "...";
}

// ---------------------------------------------------------------------------
// Voice pipeline — config + helpers
// ---------------------------------------------------------------------------

/**
 * Voice-mode system prompt. Unlike the text-chat prompt, voice output is read
 * aloud by TTS — so: no markdown, no lists, no URLs. Short spoken sentences.
 * Tools mutate state silently — don't narrate "let me search for that".
 */
const VOICE_SYSTEM_PROMPT = `你是 "Playhead DJ" —— 一个实时语音电台主持人。
你的回答会被直接朗读出来，所以：
- 只说人话：短句、口语化、有呼吸感
- 绝对不要 markdown、列表、标题、代码、URL、表情符号
- 不要念 "第一、第二"；不要念 "井号、冒号"
- 英文专有名词（歌名、乐队名）直接念英文
- 提到具体数字/年份，用汉字说出来（比如 "两千年"，不是 "2000"）

工具使用：
- 用户说"播 X" → search_music(X) → add_to_queue → play_track
- 用户说"下一首" → skip_next
- 用户说"现在放的什么" → 直接根据上下文回答，必要时 get_now_playing
- 调工具前不要罗嗦 "让我帮你查一下"，直接做；做完简短说结果（"来这首，XXX 的 YYY"）
- 如果只是闲聊/推荐，不必每次都 search_music，先聊再说

语气：
- 像深夜电台 DJ，不是客服
- 一段话最多两三句，别讲课
- 用户打断你的时候，立刻停下来听`;

/** Read the user-level global queue from D1 (same source chat uses). */
async function loadGlobalState(
  env: Env,
  userId: string | undefined
): Promise<PlaybackState> {
  const empty: PlaybackState = {
    currentTrack: null,
    playlist: [],
    isPlaying: false,
    playbackPosition: 0,
  };
  if (!userId) return empty;
  try {
    const row = await env.DB
      .prepare('SELECT "queue", "queueIndex" FROM "profile" WHERE "id" = ?')
      .bind(userId)
      .first<{ queue: string; queueIndex: number }>();
    if (!row) return empty;
    const tracks = JSON.parse(row.queue || "[]") as PlaybackState["playlist"];
    const idx = row.queueIndex ?? -1;
    return {
      currentTrack: idx >= 0 && idx < tracks.length ? tracks[idx] : null,
      playlist: tracks,
      isPlaying: false,
      playbackPosition: 0,
    };
  } catch {
    return empty;
  }
}

/**
 * Pick a TTS provider: ElevenLabs via AI Gateway (streaming) when any auth
 * mode is configured; otherwise fall back to Workers AI Aura.
 *
 * Auth priority — mirrors the LLM route in @playheads/llm-config:
 *   1. ELEVENLABS_API_KEY → xi-api-key (direct BYO key)
 *   2. CF_AIG_TOKEN only  → Authorization: Bearer (unified billing / BYOK
 *                            stored in AI Gateway dashboard)
 */
function resolveTTS(env: Env): TTSProvider & Partial<StreamingTTSProvider> {
  const haveGateway = env.CLOUDFLARE_ACCOUNT_ID && env.AI_GATEWAY_ID;
  const haveAuth = env.ELEVENLABS_API_KEY || env.CF_AIG_TOKEN;
  if (haveGateway && haveAuth) {
    try {
      const authMode = env.ELEVENLABS_API_KEY ? "xi-api-key" : "Authorization (unified billing)";
      console.log("[Voice] Using ElevenLabs TTS via AI Gateway", {
        auth: authMode,
        voiceId: env.ELEVENLABS_VOICE_ID,
        model: env.ELEVENLABS_MODEL,
      });
      return new ElevenLabsTTS({
        apiKey: env.ELEVENLABS_API_KEY || undefined,
        cfAigToken: env.CF_AIG_TOKEN || undefined,
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        gatewayId: env.AI_GATEWAY_ID,
        voiceId: env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
        modelId: env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
      });
    } catch (e) {
      console.warn("[Voice] ElevenLabs init failed, falling back to Aura:", e);
    }
  }
  console.log("[Voice] Using Workers AI Aura TTS (no ElevenLabs auth configured)");
  return new WorkersAITTS(env.AI);
}

// ---------------------------------------------------------------------------
// MusicChatAgent — text chat (AIChatAgent.onChatMessage) + voice (withVoice.onTurn)
// ---------------------------------------------------------------------------

const VoiceChatBase = withVoice(AIChatAgent<Env, PlaybackState>);

export class MusicChatAgent extends VoiceChatBase {
  // Playback state synced in real-time to all connected clients via setState()
  initialState: PlaybackState = {
    currentTrack: null,
    playlist: [],
    isPlaying: false,
    playbackPosition: 0,
  };

  // ── Voice pipeline providers ────────────────────────────────────────────
  // Lazy getters so we can log the AI binding shape at first access — lets us
  // diagnose cases where wrangler declares [ai] binding but the DO sees
  // env.AI === undefined (account not enrolled in Workers AI, model not
  // provisioned, or deploy didn't apply the binding).
  private _transcriber?: WorkersAIFluxSTT;
  get transcriber(): WorkersAIFluxSTT {
    if (!this._transcriber) {
      const ai = this.env.AI as unknown as { run?: unknown } | undefined;
      // Verbose so we can see what's actually bound. Uses console.error so it
      // survives log filtering.
      console.error("[Voice][diag] transcriber getter", {
        envKeys: Object.keys(this.env as object),
        aiType: typeof ai,
        aiTruthy: !!ai,
        aiKeys: ai && typeof ai === "object" ? Object.keys(ai) : [],
        aiRunType: typeof ai?.run,
      });
      if (!ai || typeof ai.run !== "function") {
        throw new Error(
          `[Voice] env.AI.run is not a function (typeof=${typeof ai?.run}). ` +
          `The [ai] binding is either missing from the deploy or this CF ` +
          `account has no Workers AI access. Check dashboard → Workers & Pages ` +
          `→ Settings → Workers AI.`
        );
      }
      // ai is validated to have .run above; cast to satisfy WorkersAIFluxSTT's
      // AiLike interface without depending on its private type.
      this._transcriber = new WorkersAIFluxSTT(ai as never);
    }
    return this._transcriber;
  }

  // TTS: ElevenLabs via AI Gateway (streaming) with Aura fallback.
  // Lazy — so we don't hit ElevenLabs/gateway auth at DO construction.
  private _tts?: TTSProvider & Partial<StreamingTTSProvider>;
  get tts(): TTSProvider & Partial<StreamingTTSProvider> {
    if (!this._tts) {
      this._tts = resolveTTS(this.env);
    }
    return this._tts;
  }

  // Per-connection voice context (userId, storefront) pulled from the WS query
  // string. Used by onTurn to load D1 queue state without relying on chat body.
  private voiceCtx = new WeakMap<
    Connection,
    { userId?: string; storefront: string }
  >();

  async onChatMessage(
    onFinish?: Parameters<AIChatAgent<Env, PlaybackState>["onChatMessage"]>[0],
    options?: Parameters<AIChatAgent<Env, PlaybackState>["onChatMessage"]>[1]
  ) {
    // Extract session context from custom body
    const body = (options?.body || {}) as Record<string, unknown>;
    const sessionId = body.session_id as string | undefined;
    const userId = body.user_id as string | undefined;
    const storefront = (body.storefront as string) || "us";
    const messageCount = this.messages.length;

    // Read global queue from D1 profile (user-level, not per-session)
    let globalState: PlaybackState = this.state;
    if (userId) {
      try {
        const row = await this.env.DB.prepare(
          'SELECT "queue", "queueIndex" FROM "profile" WHERE "id" = ?'
        ).bind(userId).first<{ queue: string; queueIndex: number }>();
        if (row) {
          const queueTracks = JSON.parse(row.queue || "[]") as PlaybackState["playlist"];
          const idx = row.queueIndex ?? -1;
          globalState = {
            currentTrack: idx >= 0 && idx < queueTracks.length ? queueTracks[idx] : null,
            playlist: queueTracks,
            isPlaying: this.state.isPlaying,
            playbackPosition: this.state.playbackPosition,
          };
        }
      } catch (e) {
        console.warn("[MusicChatAgent] Failed to read global queue:", e);
      }
    }

    console.log("[MusicChatAgent] onChatMessage", {
      sessionId,
      userId,
      storefront,
      messageCount,
      playlistLength: globalState.playlist.length,
      currentTrack: globalState.currentTrack?.name || null,
      isPlaying: globalState.isPlaying,
    });

    // ---------------------------------------------------------------------------
    // Resolve LLM via Model Card architecture (DB caller → resource → card)
    // ---------------------------------------------------------------------------
    const { model, card, providerOptions, maxOutputTokens, anthropicInstance } =
      await resolveLLM(this.env, "chat");

    // Resolve search provider: DB config > env vars
    const dbSearchConfig = await this.env.DB.prepare(
      "SELECT providerType, apiKey FROM search_provider_config WHERE isActive = 1 LIMIT 1"
    ).first<{ providerType: string; apiKey: string }>().catch(() => null);

    const searchDbOverride = dbSearchConfig
      ? { providerType: dbSearchConfig.providerType, apiKey: dbSearchConfig.apiKey ? await decryptApiKey(dbSearchConfig.apiKey, this.env) : "" }
      : undefined;

    // Build web search tool: native Anthropic search or external (Brave/Tavily)
    const effectiveSearchProvider = (searchDbOverride?.providerType || this.env.SEARCH_PROVIDER || (card?.nativeSearch ? "anthropic" : "")).toLowerCase();
    console.log(`[WebSearch] Resolution: dbOverride=${JSON.stringify(searchDbOverride ? { providerType: searchDbOverride.providerType, hasApiKey: !!searchDbOverride.apiKey } : null)} envProvider=${this.env.SEARCH_PROVIDER || "unset"} nativeSearch=${card?.nativeSearch} effective="${effectiveSearchProvider}" hasAnthropicInstance=${!!anthropicInstance}`);

    const toolCtx = { env: this.env, state: globalState, storefront };
    const musicTools = createMusicTools(toolCtx);
    let tools: Parameters<typeof streamText>[0]["tools"] = { ...musicTools };

    if (effectiveSearchProvider === "anthropic" && anthropicInstance) {
      console.log("[WebSearch] Using Anthropic native webSearch_20250305");
      tools = { ...musicTools, web_search: anthropicInstance.tools.webSearch_20250305({ maxUses: 5 }) as typeof tools[string] };
    } else {
      const webSearchTool = buildWebSearchTool(this.env, searchDbOverride);
      console.log(`[WebSearch] Custom tool built: ${webSearchTool ? "yes" : "no (undefined)"}`);
      if (webSearchTool) {
        tools = { ...musicTools, web_search: webSearchTool };
      } else {
        console.log("[WebSearch] WARNING: No web search tool registered!");
      }
    }

    console.log(`[MusicChatAgent] card=${card?.id || "unknown"} thinking=${!!providerOptions} maxOut=${maxOutputTokens} search=${effectiveSearchProvider || "none"}`);

    const convertedMessages = await convertToModelMessages(this.messages);
    // Append dynamic playback state as a user message (keeps system prefix 100% stable for caching)
    convertedMessages.push(buildStateContext(globalState));

    const agentMessages = this.messages;
    const agentEnv = this.env;

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const result = streamText({
          model: model as Parameters<typeof streamText>[0]["model"],
          ...(maxOutputTokens ? { maxOutputTokens } : {}),
          providerOptions: providerOptions as Parameters<typeof streamText>[0]["providerOptions"],
          system: {
            role: "system" as const,
            content: STATIC_SYSTEM,
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
          },
          messages: convertedMessages,
          tools,
          stopWhen: stepCountIs(10),
          abortSignal: options?.abortSignal,
          onStepFinish: ({ toolResults }) => {
            // Emit music actions as transient data parts (not persisted to SQLite)
            for (const tr of toolResults) {
              const output = (tr as unknown as { result: unknown }).result ?? (tr as unknown as { output: unknown }).output;
              try {
                const parsed = typeof output === "string" ? JSON.parse(output) : null;
                if (parsed?._action) {
                  writer.write({
                    transient: true,
                    type: "data-music-action",
                    data: { ...parsed._action, id: (tr as unknown as { toolCallId: string }).toolCallId },
                  });
                }
              } catch { /* not JSON */ }
            }
          },
          onFinish: async ({ text, usage }) => {
            console.log(JSON.stringify({
              event: "streamText.onFinish",
              sessionId,
              textLen: text?.length || 0,
              usage: {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                cacheReadTokens: (usage as Record<string, unknown>).inputTokenDetails
                  ? ((usage as Record<string, unknown>).inputTokenDetails as Record<string, unknown>)?.cacheReadTokens
                  : undefined,
                cacheWriteTokens: (usage as Record<string, unknown>).inputTokenDetails
                  ? ((usage as Record<string, unknown>).inputTokenDetails as Record<string, unknown>)?.cacheWriteTokens
                  : undefined,
              },
            }));
            if (!sessionId) return;

            const now = Date.now();
            const totalMessages = messageCount + 1;
            const preview = (text || "...").slice(0, 100);

            agentEnv.DB.batch([
              agentEnv.DB.prepare(
                'UPDATE "conversation" SET "messageCount" = ?, "lastMessagePreview" = ?, "lastMessageAt" = ?, "updatedAt" = ? WHERE "id" = ?'
              ).bind(totalMessages, preview, now, now, sessionId),
            ]).catch((e) => console.warn("D1 metadata sync failed:", e));

            if (userId && messageCount <= 2) {
              const simplifiedMessages = agentMessages.map((m) => ({
                role: m.role,
                content: m.parts
                  .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
                  .map((p) => p.text)
                  .join("") || "",
              }));
              simplifiedMessages.push({ role: "assistant", content: text });

              generateAndUpdateTitle(
                agentEnv.DB,
                sessionId,
                simplifiedMessages.slice(0, 5),
                agentEnv
              ).catch((e) => console.warn("Title generation failed:", e));
            }
          },
        });

        // Pipe through YAML transform: intercepts ```yaml-spec fences,
        // parses them incrementally, and emits json-render data parts.
        writer.merge(pipeYamlRender(result.toUIMessageStream()));
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  // =========================================================================
  // Voice pipeline (withVoice mixin hooks)
  // =========================================================================

  override async onCallStart(connection: Connection): Promise<void> {
    // Log immediately so we can confirm the WS reached the DO before any
    // provider init (TTS/STT) potentially throws and aborts the connection.
    console.error("[Voice] onCallStart ENTER", { connId: connection.id });

    // userId / storefront arrive as query params on the voice WebSocket URL
    // (set by the client via useVoiceAgent({ query: { ... } })).
    const url = new URL(
      (connection as unknown as { uri?: string }).uri || "http://x"
    );
    const userId = url.searchParams.get("userId") || undefined;
    const storefront = url.searchParams.get("storefront") || "us";
    this.voiceCtx.set(connection, { userId, storefront });

    console.error("[Voice] onCallStart", { userId, storefront });

    // Eagerly init transcriber so any binding misconfiguration (env.AI
    // undefined, Workers AI not enabled on the account, etc.) surfaces here
    // — and we can tell the client about it rather than failing silently
    // inside FluxSession's catch block.
    try {
      const t = this.transcriber;
      console.error("[Voice] transcriber ready", { ctor: t?.constructor?.name });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Voice] transcriber init FAILED:", msg);
      try {
        connection.send(
          JSON.stringify({ type: "error", message: `STT init failed: ${msg}` })
        );
      } catch { /* connection may already be torn down */ }
      return;
    }

    // Greeting — wrapped in try/catch so a TTS misconfiguration (ElevenLabs
    // 401, missing key, etc.) doesn't tear down the whole WS connection.
    // The user can still chat via text; voice-out is just degraded.
    try {
      const history = this.getConversationHistory(1);
      const greeting = history.length
        ? "欢迎回来，想听点什么？"
        : "嘿，我是你的 Playhead DJ。说一句歌名，或者随便聊聊你今天的心情。";
      await this.speak(connection, greeting);
      console.error("[Voice] greeting sent OK");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Voice] greeting failed (continuing without voice-out):", msg);
      try {
        connection.send(
          JSON.stringify({ type: "error", message: `TTS failed: ${msg}` })
        );
      } catch { /* ignore */ }
    }
  }

  override async onCallEnd(connection: Connection): Promise<void> {
    this.voiceCtx.delete(connection);
  }

  override async onTurn(
    transcript: string,
    context: VoiceTurnContext
  ): Promise<TextSource> {
    const ctx = this.voiceCtx.get(context.connection) || { storefront: "us" };
    const globalState = await loadGlobalState(this.env, ctx.userId);

    console.log("[Voice] onTurn", {
      userId: ctx.userId,
      storefront: ctx.storefront,
      transcriptLen: transcript.length,
      playlistLen: globalState.playlist.length,
    });

    // Same LLM resolver as chat — voice uses the "chat" caller type.
    const { model, providerOptions, maxOutputTokens } = await resolveLLM(
      this.env,
      "chat"
    );

    // Same music tools, same closure pattern. Voice skips web_search to keep
    // turns snappy (spoken search results are rarely useful).
    const musicTools = createMusicTools({
      env: this.env,
      state: globalState,
      storefront: ctx.storefront,
    });

    // Voice history is stored separately (saveMessage / getConversationHistory)
    // — text-only, simple mapping to ModelMessage[].
    const convertedMessages: ModelMessage[] = context.messages.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));
    convertedMessages.push({ role: "user", content: transcript });
    convertedMessages.push(buildStateContext(globalState));

    const conn = context.connection;

    const result = streamText({
      model: model as Parameters<typeof streamText>[0]["model"],
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      providerOptions:
        providerOptions as Parameters<typeof streamText>[0]["providerOptions"],
      system: {
        role: "system" as const,
        content: VOICE_SYSTEM_PROMPT,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      messages: convertedMessages,
      tools: musicTools,
      stopWhen: stepCountIs(6),
      abortSignal: context.signal,
      onStepFinish: ({ toolResults }) => {
        // Forward tool _action payloads to the client over the same WebSocket.
        // Client's useVoiceDJ hook picks these up from lastCustomMessage and
        // dispatches them to MusicKit — same pattern as the chat data-part flow.
        for (const tr of toolResults) {
          const output =
            (tr as unknown as { result: unknown }).result ??
            (tr as unknown as { output: unknown }).output;
          try {
            const parsed = typeof output === "string" ? JSON.parse(output) : null;
            if (parsed?._action) {
              conn.send(
                JSON.stringify({
                  type: "music-action",
                  id: (tr as unknown as { toolCallId: string }).toolCallId,
                  action: parsed._action,
                })
              );
            }
          } catch {
            /* tool output wasn't JSON — ignore */
          }
        }
      },
    });

    // Persist voice turn to the voice-specific SQLite table (async, non-blocking).
    this.saveMessage("user", transcript);
    result.text.then(
      (finalText) => {
        if (finalText) this.saveMessage("assistant", finalText);
      },
      () => { /* abort / timeout — ignore */ }
    );

    // textStream is AsyncIterable<string>; @cloudflare/voice sentence-chunks
    // this and pipes each chunk to TTS the moment a sentence boundary lands.
    return result.textStream;
  }
}

// Wrap onChatMessage to send errors back to the client instead of silently failing
const _orig = MusicChatAgent.prototype.onChatMessage;
MusicChatAgent.prototype.onChatMessage = async function (this: MusicChatAgent, ...args) {
  try {
    return await _orig.apply(this, args);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Log full error details for API errors (status, body, headers)
    const details: Record<string, unknown> = { message: msg };
    if (e && typeof e === "object") {
      if ("statusCode" in e) details.statusCode = (e as Record<string, unknown>).statusCode;
      if ("responseBody" in e) details.responseBody = (e as Record<string, unknown>).responseBody;
      if ("url" in e) details.url = (e as Record<string, unknown>).url;
      if ("cause" in e) details.cause = String((e as Record<string, unknown>).cause);
    }
    console.error("[MusicChatAgent] onChatMessage error:", JSON.stringify(details));
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(`3:"Agent error: ${msg.replace(/"/g, "'")}"\n`));
        c.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "X-Vercel-AI-Data-Stream": "v1" },
    });
  }
};
