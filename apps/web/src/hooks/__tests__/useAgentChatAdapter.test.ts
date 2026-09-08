import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentChatAdapter } from '../useAgentChatAdapter';
const sdk = vi.hoisted(() => ({ options: {} as any, messages: [] as any[] }));
vi.mock('agents/react', () => ({ useAgent: () => ({}) }));
vi.mock('@cloudflare/ai-chat/react', () => ({ useAgentChat: (options: any) => {
  sdk.options = options;
  return { messages: sdk.messages, sendMessage: vi.fn(), clearHistory: vi.fn(), status: 'ready' };
} }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('add_to_queue client tool', () => {
  beforeEach(() => { sdk.messages = []; });
  it('waits for MusicKit before reporting success', async () => {
    let finish!: (value: any) => void;
    const addTrackIds = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    renderHook(() => useAgentChatAdapter({ sessionId: 'chat', userId: 'user', queueOps: { addTrackIds } as any }));
    expect(sdk.options.onToolCall).toBeTypeOf('function');
    const addToolOutput = vi.fn();
    const pending = sdk.options.onToolCall({ toolCall: { toolName: 'add_to_queue', toolCallId: 'call', input: { track_ids: ['1'] } }, addToolOutput });
    expect(addToolOutput).not.toHaveBeenCalled();
    finish({ tracks: [{ id: '1', name: 'Song' }], failed: [] });
    await act(async () => { await pending; });
    expect(JSON.parse(addToolOutput.mock.calls[0][0].output)).toMatchObject({ ok: true, tracks: [{ id: '1' }] });
  });
  it('reports partial success with failed IDs for targeted recovery', async () => {
    const addTrackIds = vi.fn().mockResolvedValue({ tracks: [{ id: '1' }], failed: [{ id: 'bad', error: 'NOT_FOUND' }] });
    renderHook(() => useAgentChatAdapter({ sessionId: 'chat', userId: 'user', queueOps: { addTrackIds } as any }));
    const addToolOutput = vi.fn();
    await act(async () => { await sdk.options.onToolCall({ toolCall: { toolName: 'add_to_queue', toolCallId: 'partial', input: { track_ids: ['1', 'bad'] } }, addToolOutput }); });
    expect(JSON.parse(addToolOutput.mock.calls[0][0].output)).toMatchObject({ ok: true, partial: true, tracks: [{ id: '1' }], failed: [{ id: 'bad' }] });
  });
  it('returns failure to the model and displays an error instead of a success tick', async () => {
    const addTrackIds = vi.fn().mockRejectedValue(new Error('NOT_FOUND: 1556175857'));
    const { result, rerender } = renderHook(() => useAgentChatAdapter({ sessionId: 'chat', userId: 'user', queueOps: { addTrackIds } as any }));
    expect(sdk.options.onToolCall).toBeTypeOf('function');
    const addToolOutput = vi.fn();
    await act(async () => { await sdk.options.onToolCall({ toolCall: { toolName: 'add_to_queue', toolCallId: 'call', input: { track_ids: ['1556175857'] } }, addToolOutput }); });
    const output = addToolOutput.mock.calls[0][0].output;
    expect(JSON.parse(output)).toMatchObject({ ok: false });
    expect(output).toContain('1556175857');
    // A normal output lets the SDK auto-continue so the model can recover.
    expect(addToolOutput.mock.calls[0][0].state).not.toBe('output-error');
    sdk.messages = [{ id: 'msg', role: 'assistant', parts: [{ type: 'tool-add_to_queue', toolCallId: 'call', state: 'output-available', output }] }];
    rerender();
    expect(result.current.messages[0].parts?.[0]).toMatchObject({ status: 'error' });
  });
});
