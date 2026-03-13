import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationList } from '../ConversationList';
import type { Conversation } from '../../types/global.d.ts';

const makeConv = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 'conv-1',
  title: 'Chat One',
  message_count: 1,
  is_pinned: false,
  ...overrides,
});

describe('ConversationList', () => {
  it('shows empty state when no conversations', () => {
    render(<ConversationList conversations={[]} expanded />);
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });

  it('renders each conversation', () => {
    const convs = [
      makeConv({ id: '1', title: 'Alpha' }),
      makeConv({ id: '2', title: 'Beta' }),
    ];
    render(<ConversationList conversations={convs} expanded />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('passes activeConversationId to mark active item', () => {
    const convs = [
      makeConv({ id: '1', title: 'Alpha' }),
      makeConv({ id: '2', title: 'Beta' }),
    ];
    const { container } = render(
      <ConversationList conversations={convs} expanded activeConversationId="2" />
    );
    // The active item should have bg-white + font-medium
    const buttons = container.querySelectorAll('button');
    // Second conversation button (index 1) should have active styling
    const activeBtn = Array.from(buttons).find(b => b.textContent?.includes('Beta'));
    expect(activeBtn?.className).toContain('bg-white');
  });

  it('delegates onSelect to parent', async () => {
    const onSelect = vi.fn();
    render(
      <ConversationList
        conversations={[makeConv()]}
        expanded
        onSelectConversation={onSelect}
      />
    );
    await userEvent.click(screen.getByText('Chat One'));
    expect(onSelect).toHaveBeenCalledWith('conv-1');
  });

  it('hides empty state when sidebar is collapsed', () => {
    render(<ConversationList conversations={[]} expanded={false} />);
    expect(screen.queryByText('No conversations yet')).not.toBeInTheDocument();
  });
});
