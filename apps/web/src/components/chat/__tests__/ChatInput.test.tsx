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
  it('starts dictation from the collapsed mic on click without activating chat', () => {
    const onActivate = vi.fn();
    const onVoiceHoldStart = vi.fn();

    renderChatInput({
      collapsed: true,
      onActivate,
      onVoiceHoldStart,
    });

    const mic = screen.getByRole('button', { name: 'Voice' });
    fireEvent.click(mic);

    expect(onVoiceHoldStart).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('stops dictation from the mic on click while recording', () => {
    const onVoiceHoldStart = vi.fn();
    const onVoiceHoldEnd = vi.fn();

    renderChatInput({
      isRecording: true,
      onVoiceHoldStart,
      onVoiceHoldEnd,
    });

    const stop = screen.getByRole('button', { name: 'Stop dictation' });
    fireEvent.click(stop);

    expect(onVoiceHoldStart).not.toHaveBeenCalled();
    expect(onVoiceHoldEnd).toHaveBeenCalledTimes(1);
  });

  it('turns the whole composer input area into a voice waveform while recording', () => {
    const onVoiceHoldEnd = vi.fn();

    renderChatInput({
      isRecording: true,
      onVoiceHoldEnd,
    });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('0:00')).toBeInTheDocument();

    const sendVoice = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(sendVoice);

    expect(onVoiceHoldEnd).toHaveBeenCalledTimes(1);
  });
});
