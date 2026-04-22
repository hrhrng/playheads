/**
 * VoiceDJAgent — realtime voice DJ on Cloudflare Agents SDK.
 *
 * Wraps the base Agent with @cloudflare/voice's withVoice() mixin to get:
 *   - Continuous STT via Workers AI (Deepgram Flux)
 *   - Streaming TTS via Workers AI (Deepgram Aura)
 *   - VAD, interruption detection, and conversation persistence in DO SQLite
 *
 * The onTurn() method is invoked when the user finishes speaking. We run the
 * same LLM + music tools as MusicChatAgent, stream the assistant's reply back
 * as text (which @cloudflare/voice sentence-chunks into TTS), and side-channel
 * music-action events to the client over the same WebSocket via sendJSON.
 */
import { Agent, type Connection } from "agents";
import {
  withVoice,
  WorkersAIFluxSTT,
  WorkersAITTS,
  type TTSProvider,
  type StreamingTTSProvider,
  type VoiceTurnContext,
  type TextSource,
} from "@cloudflare/voice";
import {
  streamText,
  stepCountIs,
  type ModelMessage,
} from "ai";
import { createMusicTools } from "./tools";
import { resolveLLM } from "./resolve-llm";
import { ElevenLabsTTS } from "./elevenlabs-tts";
import type { Env, PlaybackState } from "./types";

// ---------------------------------------------------------------------------
// Voice-mode system prompt
// ---------------------------------------------------------------------------
// NOTE: Unlike the text-chat prompt, voice output is read aloud by TTS.
// Rules: no markdown, no lists, no code blocks, no URLs. Short spoken sentences,
// conversational filler OK ("好的", "来这首"), but not verbose.
// Tools silently mutate state — don't narrate "let me search for that".
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      const t = state.playlist[i];
      lines.push(`  ${i + 1}. ${t.name} - ${t.artist}`);
    }
    if (state.playlist.length > 5) {
      lines.push(`  ... and ${state.playlist.length - 5} more`);
    }
  } else {
    lines.push("Playlist is empty.");
  }
  return {
    role: "user" as const,
    content: "[Current Playback State]\n" + lines.join("\n"),
  };
}

async function loadGlobalState(env: Env, userId: string | undefined): Promise<PlaybackState> {
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

// ---------------------------------------------------------------------------
// VoiceDJAgent
// ---------------------------------------------------------------------------

const VoiceBase = withVoice(Agent<Env>);

// Select a TTS provider based on env: ElevenLabs through Cloudflare AI Gateway
// (unified billing — CF fronts the ElevenLabs bill) when CF_AIG_TOKEN is
// configured, else fall back to Workers AI Aura. Declared as a standalone fn
// so class-property initialization can read `this.env`.
function resolveTTS(env: Env): TTSProvider & Partial<StreamingTTSProvider> {
  if (env.CF_AIG_TOKEN && env.CLOUDFLARE_ACCOUNT_ID && env.AI_GATEWAY_ID) {
    try {
      console.log("[VoiceDJAgent] Using ElevenLabs TTS via AI Gateway (unified billing)", {
        voiceId: env.ELEVENLABS_VOICE_ID,
        model: env.ELEVENLABS_MODEL,
      });
      return new ElevenLabsTTS({
        cfAigToken: env.CF_AIG_TOKEN,
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        gatewayId: env.AI_GATEWAY_ID,
        voiceId: env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
        modelId: env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
      });
    } catch (e) {
      console.warn("[VoiceDJAgent] ElevenLabs init failed, falling back to Aura:", e);
    }
  }
  console.log("[VoiceDJAgent] Using Workers AI Aura TTS (no CF_AIG_TOKEN or gateway)");
  return new WorkersAITTS(env.AI);
}

export class VoiceDJAgent extends VoiceBase {
  // STT via Workers AI Deepgram Flux (no external key required).
  transcriber = new WorkersAIFluxSTT(this.env.AI);
  // TTS: ElevenLabs (via AI Gateway, streaming) when configured; Aura fallback.
  tts = resolveTTS(this.env);

  // Extract userId / storefront from the WebSocket URL query.
  // Set by the client via useVoiceAgent({ query: { userId, storefront } }).
  private connCtx = new WeakMap<
    Connection,
    { userId?: string; storefront: string }
  >();

  override async onCallStart(connection: Connection): Promise<void> {
    // Parse query params passed to the WebSocket connect URL
    const url = new URL((connection as unknown as { uri?: string }).uri || "http://x");
    const userId = url.searchParams.get("userId") || undefined;
    const storefront = url.searchParams.get("storefront") || "us";
    this.connCtx.set(connection, { userId, storefront });

    console.log("[VoiceDJAgent] onCallStart", { userId, storefront });

    // Greet the user — use saved conversation length to decide verbosity
    const history = this.getConversationHistory(1);
    const greeting = history.length
      ? "欢迎回来，想听点什么？"
      : "嘿，我是你的 Playhead DJ。说一句歌名，或者随便聊聊你今天的心情。";
    await this.speak(connection, greeting);
  }

  override async onCallEnd(connection: Connection): Promise<void> {
    this.connCtx.delete(connection);
  }

  override async onTurn(
    transcript: string,
    context: VoiceTurnContext
  ): Promise<TextSource> {
    const ctx = this.connCtx.get(context.connection) || { storefront: "us" };
    const globalState = await loadGlobalState(this.env, ctx.userId);

    console.log("[VoiceDJAgent] onTurn", {
      userId: ctx.userId,
      storefront: ctx.storefront,
      transcriptLen: transcript.length,
      playlistLen: globalState.playlist.length,
    });

    // Resolve LLM (reuse the same resolver as chat — voice uses "chat" caller type)
    const { model, providerOptions, maxOutputTokens } = await resolveLLM(
      this.env,
      "chat"
    );

    // Build tools — same music tools as chat, closures over this request's context.
    // Note: voice mode skips web_search to keep turns snappy.
    const musicTools = createMusicTools({
      env: this.env,
      state: globalState,
      storefront: ctx.storefront,
    });

    // Prior conversation history from voice SQLite — text-only, map to ModelMessages
    const convertedMessages: ModelMessage[] = context.messages.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

    // Append the just-arrived user turn + current playback state
    convertedMessages.push({ role: "user", content: transcript });
    convertedMessages.push(buildStateContext(globalState));

    const conn = context.connection;

    const result = streamText({
      model: model as Parameters<typeof streamText>[0]["model"],
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      providerOptions: providerOptions as Parameters<typeof streamText>[0]["providerOptions"],
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
        // Forward _action payloads from tool results to the client over the
        // same WebSocket. Client's useVoiceDJ hook picks these up from
        // `lastCustomMessage` and dispatches them to MusicKit.
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
            /* tool output wasn't JSON */
          }
        }
      },
    });

    // Persist user + assistant turns to voice SQLite (async, non-blocking).
    this.saveMessage("user", transcript);
    result.text.then(
      (finalText) => {
        if (finalText) this.saveMessage("assistant", finalText);
      },
      () => { /* abort / timeout — ignore */ }
    );

    // TextSource accepts AsyncIterable<string>. textStream streams token chunks;
    // @cloudflare/voice sentence-chunks this into TTS on the fly.
    return result.textStream;
  }
}
