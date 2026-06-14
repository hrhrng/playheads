/**
 * Tests for ChatInput interactions.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatInput } from '../ChatInput';

function renderChatInput(overrides: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
  const props: React.ComponentProps<typeof ChatInput> = {
    input: '',
    isLoading: false,
    isDJSpeaking: false,
    isPlaying: true,
    onInputChange: vi.fn(),
    onSend: vi.fn(),
    onAttach: vi.fn(),
    attachments: [],
    onRemoveAttachment: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<ChatInput {...props} />),
    props,
  };
}

describe('ChatInput', () => {
  it('starts voice input from the collapsed mic without activating chat', () => {
    const onActivate = vi.fn();
    const onVoiceHoldStart = vi.fn();
    const onVoiceHoldEnd = vi.fn();

    renderChatInput({
      collapsed: true,
      onActivate,
      onVoiceHoldStart,
      onVoiceHoldEnd,
    });

    const mic = screen.getByRole('button', { name: 'Voice' });
    fireEvent.pointerDown(mic);
    fireEvent.pointerUp(mic);
    fireEvent.click(mic);

    expect(onVoiceHoldStart).toHaveBeenCalledTimes(1);
    expect(onVoiceHoldEnd).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });
});
