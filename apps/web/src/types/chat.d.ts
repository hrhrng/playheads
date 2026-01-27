/**
 * Chat message types and interfaces
 * Supports both legacy format (content) and new format (parts)
 */

/**
 * Message role types
 */
export type MessageRole = 'user' | 'agent' | 'system';

/**
 * Message part types - union discriminator pattern
 */
export type MessagePart = TextPart | ThinkingPart | ToolCallPart;

/**
 * Text content part
 */
export interface TextPart {
  type: 'text';
  content: string;
}

/**
 * Thinking process part - shows agent reasoning
 */
export interface ThinkingPart {
  type: 'thinking';
  content: string;
}

/**
 * Tool call part - shows agent tool usage
 */
export interface ToolCallPart {
  type: 'tool_call';
  id: string;
  tool_name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: ToolCallStatus;
}

/**
 * Tool call execution status
 */
export type ToolCallStatus = 'pending' | 'success' | 'error';

/**
 * Legacy message format with plain content
 */
export interface LegacyMessage {
  role: MessageRole;
  content: string;
  parts?: never;
}

/**
 * Modern message format with structured parts
 */
export interface ModernMessage {
  role: MessageRole;
  parts: MessagePart[];
  content?: never;
}

/**
 * Union type for messages - supports both formats
 */
export type Message = LegacyMessage | ModernMessage;

/**
 * Chat history from backend
 */
export interface ChatHistoryEntry {
  role: MessageRole;
  content?: string;
  parts?: MessagePart[];
}

/**
 * SSE event types from backend
 */
export interface SSETextEvent {
  content: string;
}

export interface SSEThinkingEvent {
  content: string;
}

export interface SSEToolStartEvent {
  id: string;
  tool_name: string;
  args: Record<string, unknown>;
}

export interface SSEToolEndEvent {
  id: string;
  result: unknown;
  status: ToolCallStatus;
}

export interface SSEDoneEvent {
  actions: AgentAction[];
}

/**
 * Real-time action event - streamed immediately when tool executes
 */
export interface SSEActionEvent {
  type: AgentAction['type'];
  data?: Record<string, unknown>;
}

/**
 * Agent action types
 */
export interface AgentAction {
  type: 'play_track' | 'add_to_queue' | 'create_playlist' | 'search_tracks' | 'remove_track';
  data?: Record<string, unknown>;
}

/**
 * Type guards for message parts
 */
export function isTextPart(part: MessagePart): part is TextPart {
  return part.type === 'text';
}

export function isThinkingPart(part: MessagePart): part is ThinkingPart {
  return part.type === 'thinking';
}

export function isToolCallPart(part: MessagePart): part is ToolCallPart {
  return part.type === 'tool_call';
}

/**
 * Type guard for modern vs legacy messages
 */
export function isModernMessage(message: Message): message is ModernMessage {
  return 'parts' in message && Array.isArray(message.parts);
}

export function isLegacyMessage(message: Message): message is LegacyMessage {
  return 'content' in message && typeof message.content === 'string';
}
