import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationItem } from '../ConversationItem';
import type { Conversation } from '../../types/global.d.ts';

const makeConv = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 'conv-1',
  title: 'Test Chat',
  message_count: 3,
  is_pinned: false,
  ...overrides,
});

describe('ConversationItem', () => {
  // ── Rendering ──────────────────────────────────────────────────────

  it('renders the conversation title', () => {
    render(<ConversationItem conversation={makeConv()} expanded />);
    expect(screen.getByText('Test Chat')).toBeInTheDocument();
  });

  it('renders "New Conversation" when title is empty', () => {
    render(<ConversationItem conversation={makeConv({ title: '' })} expanded />);
    expect(screen.getByText('New Conversation')).toBeInTheDocument();
  });

  it('applies active styling when isActive is true', () => {
    const { container } = render(
      <ConversationItem conversation={makeConv()} expanded isActive />
    );
    const button = container.querySelector('button');
    expect(button?.className).toContain('bg-white');
  });

  // ── Selection ──────────────────────────────────────────────────────

  it('calls onSelect when clicked', async () => {
    const onSelect = vi.fn();
    render(<ConversationItem conversation={makeConv()} expanded onSelect={onSelect} />);
    await userEvent.click(screen.getByText('Test Chat'));
    expect(onSelect).toHaveBeenCalledWith('conv-1');
  });

  // ── Three-dot menu ─────────────────────────────────────────────────

  it('shows three-dot menu button on hover', async () => {
    const { container } = render(
      <ConversationItem conversation={makeConv()} expanded />
    );
    const menuBtn = container.querySelector('[data-testid="menu-button"]') as HTMLElement;
    expect(menuBtn).toBeInTheDocument();
  });

  it('opens dropdown when three-dot button is clicked', async () => {
    render(<ConversationItem conversation={makeConv()} expanded />);
    const menuBtn = screen.getByTestId('menu-button');
    await userEvent.click(menuBtn);

    expect(screen.getByText('Pin chat')).toBeInTheDocument();
    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('shows "Unpin chat" when conversation is pinned', async () => {
    render(<ConversationItem conversation={makeConv({ is_pinned: true })} expanded />);
    await userEvent.click(screen.getByTestId('menu-button'));
    expect(screen.getByText('Unpin chat')).toBeInTheDocument();
  });

  it('calls onPin when Pin is clicked and closes menu', async () => {
    const onPin = vi.fn();
    render(<ConversationItem conversation={makeConv()} expanded onPin={onPin} />);
    await userEvent.click(screen.getByTestId('menu-button'));
    await userEvent.click(screen.getByText('Pin chat'));

    expect(onPin).toHaveBeenCalledWith('conv-1', true);
    expect(screen.queryByText('Pin chat')).not.toBeInTheDocument();
  });

  it('calls onDelete when Delete is clicked and closes menu', async () => {
    const onDelete = vi.fn();
    render(<ConversationItem conversation={makeConv()} expanded onDelete={onDelete} />);
    await userEvent.click(screen.getByTestId('menu-button'));
    await userEvent.click(screen.getByText('Delete'));

    expect(onDelete).toHaveBeenCalledWith('conv-1');
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  // ── Inline rename ──────────────────────────────────────────────────

  it('enters edit mode when Rename is clicked from menu', async () => {
    render(<ConversationItem conversation={makeConv()} expanded />);
    await userEvent.click(screen.getByTestId('menu-button'));
    await userEvent.click(screen.getByText('Rename'));

    const input = screen.getByDisplayValue('Test Chat');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });

  it('enters edit mode on double-click of title', async () => {
    render(<ConversationItem conversation={makeConv()} expanded />);
    fireEvent.doubleClick(screen.getByText('Test Chat'));

    const input = screen.getByDisplayValue('Test Chat');
    expect(input).toBeInTheDocument();
  });

  it('calls onRename and exits edit mode on Enter', async () => {
    const onRename = vi.fn();
    render(<ConversationItem conversation={makeConv()} expanded onRename={onRename} />);
    fireEvent.doubleClick(screen.getByText('Test Chat'));

    const input = screen.getByDisplayValue('Test Chat');
    await userEvent.clear(input);
    await userEvent.type(input, 'Renamed{Enter}');

    expect(onRename).toHaveBeenCalledWith('conv-1', 'Renamed');
    expect(screen.queryByDisplayValue('Renamed')).not.toBeInTheDocument();
  });

  it('cancels edit mode on Escape without calling onRename', async () => {
    const onRename = vi.fn();
    render(<ConversationItem conversation={makeConv()} expanded onRename={onRename} />);
    fireEvent.doubleClick(screen.getByText('Test Chat'));

    await userEvent.keyboard('{Escape}');
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText('Test Chat')).toBeInTheDocument();
  });

  // ── Collapsed sidebar ──────────────────────────────────────────────

  it('hides title and menu when collapsed', () => {
    const { container } = render(
      <ConversationItem conversation={makeConv()} expanded={false} />
    );
    expect(screen.getByText('Test Chat').className).toContain('opacity-0');
    expect(container.querySelector('[data-testid="menu-button"]')).not.toBeInTheDocument();
  });
});
