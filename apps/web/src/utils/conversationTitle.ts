/**
 * Shared rule for displaying a conversation's title in lists/rows.
 *
 * Auto-title runs after the first AI response; until it completes, `title`
 * can be null. In that window we prefer the user's first message
 * (`last_message_preview`) over a generic "New Conversation" placeholder
 * because it's far more informative — the user can recognise what the
 * conversation was about at a glance.
 *
 * Used everywhere we render a conversation row so left sidebar and
 * Discovery don't disagree on what the same untitled chat is called.
 */
import type { Conversation } from '../types';

export function displayConversationTitle(
  c: Pick<Conversation, 'title' | 'last_message_preview'>,
  fallback: string,
): string {
  const title = c.title?.trim();
  if (title) return title;
  const preview = c.last_message_preview?.trim();
  if (preview) return preview;
  return fallback;
}
