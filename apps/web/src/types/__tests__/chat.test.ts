/**
 * Tests for chat type guard functions.
 *
 * The canonical type guards live in `chat.d.ts` (a declaration file), which
 * means TypeScript does NOT emit runtime JavaScript for them. To make these
 * guards testable we re-implement the exact same one-liner logic inline.
 *
 * If chat.d.ts is ever migrated to a plain .ts file, replace the local
 * implementations with direct imports.
 *
 * @module types/__tests__/chat
 */

import { describe, it, expect } from 'vitest';
import type { MessagePart, Message } from '../../types/chat.d.ts';

// ------------------------------------------------------------------
// Local implementations mirroring the guards in chat.d.ts
// (required because .d.ts files produce no runtime code)
// ------------------------------------------------------------------

/** True when the part is a text part */
function isTextPart(part: MessagePart): part is MessagePart & { type: 'text' } {
  return part.type === 'text';
}

/** True when the part is a thinking part */
function isThinkingPart(part: MessagePart): part is MessagePart & { type: 'thinking' } {
  return part.type === 'thinking';
}

/** True when the part is a tool_call part */
function isToolCallPart(part: MessagePart): part is MessagePart & { type: 'tool_call' } {
  return part.type === 'tool_call';
}

/** True when the message uses the modern (parts) format */
function isModernMessage(message: Message): boolean {
  return 'parts' in message && Array.isArray((message as any).parts);
}

/** True when the message uses the legacy (content) format */
function isLegacyMessage(message: Message): boolean {
  return 'content' in message && typeof (message as any).content === 'string';
}

// ------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------

const textPart: MessagePart = { type: 'text', content: 'Hello' };
const thinkingPart: MessagePart = { type: 'thinking', content: 'Reasoning...' };
const toolCallPart: MessagePart = {
  type: 'tool_call',
  id: 'tc-1',
  tool_name: 'search',
  args: { query: 'jazz' },
  status: 'success',
};

const legacyMsg: Message = { role: 'user', content: 'hi' };
const modernMsg: Message = {
  role: 'agent',
  parts: [textPart, thinkingPart],
};

// ==================================================================
// Part type guards
// ==================================================================

describe('isTextPart()', () => {
  it('returns true for text parts', () => {
    expect(isTextPart(textPart)).toBe(true);
  });

  it('returns false for thinking parts', () => {
    expect(isTextPart(thinkingPart)).toBe(false);
  });

  it('returns false for tool_call parts', () => {
    expect(isTextPart(toolCallPart)).toBe(false);
  });
});

describe('isThinkingPart()', () => {
  it('returns true for thinking parts', () => {
    expect(isThinkingPart(thinkingPart)).toBe(true);
  });

  it('returns false for text parts', () => {
    expect(isThinkingPart(textPart)).toBe(false);
  });

  it('returns false for tool_call parts', () => {
    expect(isThinkingPart(toolCallPart)).toBe(false);
  });
});

describe('isToolCallPart()', () => {
  it('returns true for tool_call parts', () => {
    expect(isToolCallPart(toolCallPart)).toBe(true);
  });

  it('returns false for text parts', () => {
    expect(isToolCallPart(textPart)).toBe(false);
  });

  it('returns false for thinking parts', () => {
    expect(isToolCallPart(thinkingPart)).toBe(false);
  });
});

// ==================================================================
// Message type guards
// ==================================================================

describe('isModernMessage()', () => {
  it('returns true for messages with parts array', () => {
    expect(isModernMessage(modernMsg)).toBe(true);
  });

  it('returns false for legacy content messages', () => {
    expect(isModernMessage(legacyMsg)).toBe(false);
  });
});

describe('isLegacyMessage()', () => {
  it('returns true for legacy content messages', () => {
    expect(isLegacyMessage(legacyMsg)).toBe(true);
  });

  it('returns false for modern parts messages', () => {
    expect(isLegacyMessage(modernMsg)).toBe(false);
  });
});
