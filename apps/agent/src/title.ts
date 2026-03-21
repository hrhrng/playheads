/**
 * Conversation title generation using LLM.
 * Ported from apps/backend/title_generator.py
 */
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { Env } from "./types";

const TITLE_PROMPT = `Based on this music conversation, generate a short, descriptive title (max 5 words).
The title should capture the main topic or vibe.

Examples:
- "Chill Jazz Playlist"
- "90s Rock Recommendations"
- "Study Focus Music"
- "Workout Energy Mix"

Conversation:
{conversation}

Title (5 words max):`;

export async function generateConversationTitle(
  messages: Array<{ role: string; content?: string }>,
  env: Env
): Promise<string> {
  try {
    const conversationText = messages
      .slice(0, 5)
      .map((m) => `${m.role}: ${m.content || ""}`)
      .join("\n");

    const prompt = TITLE_PROMPT.replace("{conversation}", conversationText);

    // Resolve provider from DB config (same logic as chat-agent.ts)
    const dbConfig = await (env.DB as D1Database).prepare(
      "SELECT providerType, model, apiKey, baseUrl FROM llm_provider_config WHERE isActive = 1 LIMIT 1"
    ).first<{ providerType: string; model: string; apiKey: string; baseUrl: string | null }>().catch(() => null);

    const decryptKey = async (encoded: string): Promise<string> => {
      const hex = (env as unknown as Record<string, string>)["ADMIN_ENCRYPTION_KEY"];
      if (!hex || hex.length < 64) return encoded;
      try {
        const raw = new Uint8Array(hex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
        const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
        const buf = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
        return new TextDecoder().decode(pt);
      } catch { return encoded; }
    };

    const resolvedProvider = dbConfig?.providerType || env.LLM_PROVIDER || "anthropic";
    let titleModel: Parameters<typeof generateText>[0]["model"];

    if (resolvedProvider === "anthropic") {
      const apiKey = dbConfig ? await decryptKey(dbConfig.apiKey) : env.CF_AIG_TOKEN;
      const baseURL = `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/anthropic`;
      const anthropic = createAnthropic({ apiKey, baseURL });
      titleModel = anthropic("claude-haiku-4-5-20251001") as unknown as Parameters<typeof generateText>[0]["model"];
    } else {
      const apiKey = dbConfig ? await decryptKey(dbConfig.apiKey) : env.DOUBAO_API_KEY;
      const baseURL = dbConfig?.baseUrl ||
        (resolvedProvider === "doubao" ? "https://ark.cn-beijing.volces.com/api/v3" : "https://api.openai.com/v1");
      const provider = createOpenAICompatible({ name: resolvedProvider, apiKey, baseURL });
      // Prefer a lite/cheap model for title generation; fall back to active model
      const titleModelId = resolvedProvider === "doubao" ? "doubao-1.5-lite-32k" : (dbConfig?.model || "gpt-4o-mini");
      titleModel = provider(titleModelId) as unknown as Parameters<typeof generateText>[0]["model"];
    }

    const { text } = await generateText({
      model: titleModel,
      prompt,
      temperature: 0.7,
      maxOutputTokens: 20,
    });

    let title = text.trim();
    title = title.replace(/^["']|["']$/g, "").trim();

    if (title.length > 50) {
      title = title.slice(0, 47) + "...";
    }

    return title || "New Conversation";
  } catch (e) {
    console.error("Title generation error:", e);
    return "New Conversation";
  }
}

/**
 * Generate title and update conversation in D1.
 */
export async function generateAndUpdateTitle(
  db: D1Database,
  sessionId: string,
  messages: Array<{ role: string; content?: string }>,
  env: Env
): Promise<void> {
  try {
    const title = await generateConversationTitle(messages, env);
    console.log("Generated title:", title);

    await db
      .prepare('UPDATE "conversation" SET "title" = ? WHERE "id" = ?')
      .bind(title, sessionId)
      .run();
  } catch (e) {
    console.warn("Background title generation failed:", e);
    try {
      await db
        .prepare('UPDATE "conversation" SET "title" = ? WHERE "id" = ?')
        .bind("New Conversation", sessionId)
        .run();
    } catch (fallbackError) {
      console.warn("Failed to set default title:", fallbackError);
    }
  }
}
