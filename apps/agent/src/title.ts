/**
 * Conversation title generation using LLM.
 * Ported from apps/backend/title_generator.py
 */
import { generateText } from "ai";
import { createAiGateway } from "ai-gateway-provider";
import { createAnthropic } from "ai-gateway-provider/providers/anthropic";
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

    const aigateway = createAiGateway({
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      gateway: env.AI_GATEWAY_ID,
      apiKey: env.CF_AIG_TOKEN,
    });
    const anthropic = createAnthropic();

    const { text } = await generateText({
      model: aigateway(anthropic("claude-haiku-4-5-20251001")),
      prompt,
      temperature: 0.7,
      maxTokens: 20,
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
