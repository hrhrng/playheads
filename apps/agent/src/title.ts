/**
 * Conversation title generation using LLM.
 * Ported from apps/backend/title_generator.py
 */
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
  if (!env.OPENAI_API_KEY) {
    return "New Conversation";
  }

  try {
    const conversationText = messages
      .slice(0, 5)
      .map((m) => `${m.role}: ${m.content || ""}`)
      .join("\n");

    const prompt = TITLE_PROMPT.replace("{conversation}", conversationText);

    // Call OpenAI via AI Gateway
    const baseURL = env.AI_GATEWAY_ID
      ? `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/openai`
      : env.OPENAI_BASE_URL || "https://api.openai.com/v1";

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-nano",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 20,
      }),
    });

    if (!response.ok) {
      console.error("Title generation API error:", response.status);
      return "New Conversation";
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    let title = data.choices?.[0]?.message?.content?.trim() || "";
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
