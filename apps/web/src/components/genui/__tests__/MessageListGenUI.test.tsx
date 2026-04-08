/**
 * Tests for GenUI routing in MessageList.
 * Verifies that tool_call parts with _genui marker render GenUIContainer
 * instead of the default ToolCall component.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageList } from '../../chat/MessageList';
import type { Message } from '../../../types';

// Mock fetch for AlbumCard enrichment
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

// Mock html2canvas
vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    toBlob: (cb: (blob: Blob | null) => void) => cb(new Blob(['test'])),
  }),
}));

describe('MessageList GenUI routing', () => {
  it('renders GenUIContainer for tool_call with _genui result', () => {
    const messages: Message[] = [
      {
        role: 'agent',
        parts: [
          {
            type: 'tool_call',
            id: 'tc-1',
            tool_name: 'show_visual',
            args: {},
            status: 'success',
            result: {
              _genui: true,
              message: 'Here is a visual',
              data: {
                title: 'Test GenUI',
                subtitle: 'A test visual',
                sections: [
                  { type: 'text', content: 'GenUI content here', style: 'body' },
                ],
              },
            },
          },
        ],
      },
    ];

    render(<MessageList messages={messages} isLoading={false} />);

    // Should render the GenUI container with title and content
    expect(screen.getByText('Test GenUI')).toBeInTheDocument();
    expect(screen.getByText('A test visual')).toBeInTheDocument();
    expect(screen.getByText('GenUI content here')).toBeInTheDocument();
    expect(screen.getByText('Playheads')).toBeInTheDocument();
  });

  it('renders loading skeleton for pending GenUI tool_call', () => {
    const messages: Message[] = [
      {
        role: 'agent',
        parts: [
          {
            type: 'tool_call',
            id: 'tc-2',
            tool_name: 'show_visual',
            args: {},
            status: 'pending',
            result: {
              _genui: true,
            },
          },
        ],
      },
    ];

    const { container } = render(<MessageList messages={messages} isLoading={false} />);
    // Skeleton has animate-pulse class
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders regular ToolCall for non-GenUI tool_call', () => {
    const messages: Message[] = [
      {
        role: 'agent',
        parts: [
          {
            type: 'tool_call',
            id: 'tc-3',
            tool_name: 'search_music',
            args: { queries: ['jazz'] },
            status: 'success',
            result: 'Found 5 tracks',
          },
        ],
      },
    ];

    render(<MessageList messages={messages} isLoading={false} />);

    // Should render the regular ToolCall component
    expect(screen.getByText('Search Music')).toBeInTheDocument();
    // Should NOT render GenUI elements
    expect(screen.queryByText('Playheads')).not.toBeInTheDocument();
  });

  it('renders regular ToolCall when result has no _genui marker', () => {
    const messages: Message[] = [
      {
        role: 'agent',
        parts: [
          {
            type: 'tool_call',
            id: 'tc-4',
            tool_name: 'add_to_queue',
            args: { track_id: '123' },
            status: 'success',
            result: "Added 'So What' to queue",
          },
        ],
      },
    ];

    render(<MessageList messages={messages} isLoading={false} />);
    expect(screen.getByText('Add to Queue')).toBeInTheDocument();
  });

  it('renders GenUI with complex timeline layout', () => {
    const messages: Message[] = [
      {
        role: 'agent',
        parts: [
          {
            type: 'tool_call',
            id: 'tc-5',
            tool_name: 'show_visual',
            args: {},
            status: 'success',
            result: {
              _genui: true,
              message: 'Timeline visual',
              data: {
                title: 'Jazz History',
                gradient: ['#000', '#333'],
                sections: [
                  {
                    type: 'timeline',
                    items: [
                      {
                        year: '1920s',
                        label: 'New Orleans',
                        children: [
                          { type: 'text', content: 'Where it all began', style: 'caption' },
                        ],
                      },
                      {
                        year: '1940s',
                        label: 'Bebop',
                        children: [
                          { type: 'stat', value: '50', label: 'key albums' },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    ];

    render(<MessageList messages={messages} isLoading={false} />);

    expect(screen.getByText('Jazz History')).toBeInTheDocument();
    expect(screen.getByText('1920s')).toBeInTheDocument();
    expect(screen.getByText('New Orleans')).toBeInTheDocument();
    expect(screen.getByText('1940s')).toBeInTheDocument();
    expect(screen.getByText('Bebop')).toBeInTheDocument();
    expect(screen.getByText('Where it all began')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('renders mix of text parts and GenUI tool_call in same message', () => {
    const messages: Message[] = [
      {
        role: 'agent',
        parts: [
          { type: 'text', content: 'Here is the timeline:' },
          {
            type: 'tool_call',
            id: 'tc-6',
            tool_name: 'show_visual',
            args: {},
            status: 'success',
            result: {
              _genui: true,
              data: {
                title: 'Visual Title',
                sections: [{ type: 'text', content: 'Inside GenUI', style: 'body' }],
              },
            },
          },
        ],
      },
    ];

    render(<MessageList messages={messages} isLoading={false} />);

    // Both the text part and the GenUI should render
    expect(screen.getByText('Here is the timeline:')).toBeInTheDocument();
    expect(screen.getByText('Visual Title')).toBeInTheDocument();
    expect(screen.getByText('Inside GenUI')).toBeInTheDocument();
  });

  it('still renders loading indicator when isLoading is true', () => {
    render(<MessageList messages={[]} isLoading={true} />);
    expect(screen.getByText('ON AIR...')).toBeInTheDocument();
  });
});
