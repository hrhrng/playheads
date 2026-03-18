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

    const llmProvider = env.LLM_PROVIDER || "anthropic";
    let titleModel: Parameters<typeof generateText>[0]["model"];

    if (llmProvider === "doubao") {
      const doubao = createOpenAICompatible({
        name: "doubao",
        apiKey: env.DOUBAO_API_KEY,
        baseURL: "https://ark.cn-beijing.volces.com/api/v3",
      });
      // Use the lite model for cost-efficient title generation
      titleModel = doubao("doubao-1.5-lite-32k");
    } else {
      const anthropic = createAnthropic({
        apiKey: env.CF_AIG_TOKEN,
        baseURL: `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/anthropic`,
      });
      titleModel = anthropic("claude-haiku-4-5-20251001");
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
