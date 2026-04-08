/**
 * Tests for the _genui payload preservation in useAgentChatAdapter.
 *
 * The adapter's mapUIMessagesToMessages function is not exported directly,
 * so we test the logic by replicating the critical displayResult mapping
 * that determines whether GenUI payloads are preserved or stripped.
 */
import { describe, it, expect } from 'vitest';

/**
 * Replicate the exact displayResult logic from useAgentChatAdapter.ts (lines 93-106).
 * This is the critical code path that determines GenUI behavior.
 */
function mapDisplayResult(output: unknown, hasOutput: boolean, hasError: boolean, errorText?: string): unknown {
  let displayResult: unknown = undefined;

  if (hasOutput && !hasError && typeof output === 'string') {
    try {
      const parsed = JSON.parse(output);
      if (parsed?._genui) displayResult = parsed;           // GenUI: preserve full payload
      else if (parsed?.message) displayResult = parsed.message;
      else displayResult = output;
    } catch {
      displayResult = output;
    }
  } else if (hasError) {
    displayResult = errorText ?? 'Tool execution failed';
  } else if (hasOutput) {
    displayResult = output;
  }

  return displayResult;
}

describe('GenUI payload preservation in adapter', () => {
  it('preserves full payload when _genui is present', () => {
    const output = JSON.stringify({
      _genui: true,
      message: 'Here is a visual',
      data: {
        title: 'Test',
        sections: [{ type: 'text', content: 'Hello' }],
      },
    });

    const result = mapDisplayResult(output, true, false);
    expect(result).toEqual({
      _genui: true,
      message: 'Here is a visual',
      data: {
        title: 'Test',
        sections: [{ type: 'text', content: 'Hello' }],
      },
    });
  });

  it('extracts message for regular tool results (non-GenUI)', () => {
    const output = JSON.stringify({
      message: "Added 'So What' to queue",
      _action: { type: 'add_to_queue', data: {} },
    });

    const result = mapDisplayResult(output, true, false);
    expect(result).toBe("Added 'So What' to queue");
  });

  it('returns raw output when JSON has no message or _genui', () => {
    const output = JSON.stringify({ status: 'ok' });
    const result = mapDisplayResult(output, true, false);
    expect(result).toBe(output);
  });

  it('returns raw output for non-JSON strings', () => {
    const output = 'Search results:\n1. Track A\n2. Track B';
    const result = mapDisplayResult(output, true, false);
    expect(result).toBe(output);
  });

  it('returns error text on error', () => {
    const result = mapDisplayResult('error output', true, true, 'API failed');
    expect(result).toBe('API failed');
  });

  it('returns default error message when no errorText', () => {
    const result = mapDisplayResult('error output', true, true);
    expect(result).toBe('Tool execution failed');
  });

  it('returns undefined when no output', () => {
    const result = mapDisplayResult(undefined, false, false);
    expect(result).toBeUndefined();
  });

  it('prioritizes _genui over message field', () => {
    const output = JSON.stringify({
      _genui: true,
      message: 'Some message',
    });

    const result = mapDisplayResult(output, true, false);
    // Should return full object, not just the message string
    expect(result).toEqual({ _genui: true, message: 'Some message' });
    expect(typeof result).toBe('object');
  });

  it('preserves complex nested GenUI data', () => {
    const payload = {
      _genui: true,
      message: 'Timeline',
      data: {
        title: 'Jazz History',
        subtitle: 'A journey',
        gradient: ['#000', '#fff'],
        sections: [
          {
            type: 'timeline',
            items: [
              {
                year: '1920s',
                label: 'Early Jazz',
                children: [
                  { type: 'album-card', title: 'A', subtitle: 'B', songId: '1' },
                  { type: 'text', content: 'Description', style: 'caption' },
                ],
              },
            ],
          },
        ],
      },
    };

    const output = JSON.stringify(payload);
    const result = mapDisplayResult(output, true, false);
    expect(result).toEqual(payload);
  });
});
