import { expect, it } from 'vitest';
import { createChatStream } from '../../agent/src/chat-stream';

it('continues the existing assistant message rather than duplicating its content under a new ID', async () => {
  const stream = createChatStream([{ id: 'existing', role: 'assistant', parts: [{ type: 'text', text: 'Adding songs.' }] }], {
    execute: ({ writer }) => { writer.write({ type: 'start' }); writer.write({ type: 'finish' }); },
  });
  const reader = stream.getReader();
  expect((await reader.read()).value).toEqual({ type: 'start', messageId: 'existing' });
});
