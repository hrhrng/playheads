/**
 * ChatInput - Message input component with auto-resize
 * Enhanced with provider badge, voice/send dual button, and attachment upload.
 * @module components/chat/ChatInput
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAutoResizeTextarea } from '../../hooks/useChatHelpers';
import type { ProviderType } from '../../providers/types';

const VOICE_BARS = [18, 34, 52, 70, 84, 90, 88, 86, 84, 82, 82, 82, 84, 88, 90, 88, 82, 70, 54, 36, 22];

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface ChatInputProps {
  /** Current input value */
  input: string;
  /** Whether a message is currently loading */
  isLoading: boolean;
  /** Whether the DJ is currently speaking */
  isDJSpeaking: boolean;
  /** Whether music is currently playing */
  isPlaying: boolean;
  /** Callback when input changes */
  onInputChange: (value: string) => void;
  /** Callback to send the message */
  onSend: () => void;
  /** Active music provider type */
  activeProvider?: ProviderType;
  /** Mic: start dictation recording. */
  onVoiceHoldStart?: () => void;
  /** Mic: stop recording and trigger upload/transcribe. */
  onVoiceHoldEnd?: () => void;
  /** True while the user is recording dictation. */
  isRecording?: boolean;
  /** True after release while the transcript round-trip is in flight. */
  isTranscribing?: boolean;
  /** Callback when files are attached. Required — every host of ChatInput
   *  needs to ferry attachments somewhere (either into the current chat or
   *  via route state into a forked chat). Making it required keeps the +
   *  button from disappearing when a caller forgets to wire it up. */
  onAttach: (files: File[]) => void;
  /** Currently attached files. */
  attachments: File[];
  /** Remove an attachment by index. */
  onRemoveAttachment: (index: number) => void;
  /** Collapsed "pill" mode — shows only placeholder hint, whole capsule is
   *  a tap target firing `onActivate`. Used in feed mode; in chat/transcript
   *  mode pass collapsed=false to expose the full composer. */
  collapsed?: boolean;
  /** Fired when the user taps the collapsed pill. */
  onActivate?: () => void;
}

/**
 * ChatInput - message input with provider badge, voice/send toggle, and attachments
 */
export const ChatInput = ({
  input,
  isLoading,
  isDJSpeaking,
  isPlaying,
  onInputChange,
  onSend,
  activeProvider,
  onVoiceHoldStart,
  onVoiceHoldEnd,
  isRecording = false,
  isTranscribing = false,
  onAttach,
  attachments,
  onRemoveAttachment,
  collapsed = false,
  onActivate,
}: ChatInputProps): React.JSX.Element => {
  const { t } = useTranslation();
  const textareaRef = useAutoResizeTextarea(input);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const getPlaceholder = (): string => {
    if (isDJSpeaking) return t('chatInput.pushToInterrupt');
    if (isPlaying) return t('chatInput.askDJ');
    return t('chatInput.startVibe');
  };

  // Auto-focus the textarea when we transition from pill to composer
  // (user just tapped the pill — they want to type immediately, like
  // tapping the search bar on iOS).
  const wasCollapsedRef = useRef(collapsed);
  useEffect(() => {
    if (wasCollapsedRef.current && !collapsed) {
      // Wait one tick so the textarea is mounted/visible.
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
    wasCollapsedRef.current = collapsed;
  }, [collapsed, textareaRef]);

  // Voice button — click once to start dictation, click again to stop and
  // send the recorded blob to the transcription endpoint.
  const handleVoiceClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isRecording) onVoiceHoldEnd?.();
    else onVoiceHoldStart?.();
  }, [isRecording, onVoiceHoldEnd, onVoiceHoldStart]);

  const handleCollapsedKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate?.();
    }
  }, [onActivate]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onAttach(files);
    // Reset input so the same file can be selected again
    e.target.value = '';
  }, [onAttach]);

  useEffect(() => {
    if (!isRecording) return;

    const startedAt = Date.now();
    setRecordingElapsed(0);

    const interval = window.setInterval(() => {
      setRecordingElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 250);

    return () => window.clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording && !isTranscribing) {
      setRecordingElapsed(0);
    }
  }, [isRecording, isTranscribing]);

  const voiceInputRow = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isLoading || isTranscribing}
        className="w-11 h-11 flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-chip transition-colors shrink-0"
        title={t('chatInput.uploadImage')}
        aria-label={t('chatInput.uploadImage')}
      >
        <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
        </svg>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="relative flex min-w-0 flex-1 items-center gap-4 py-2" aria-label={t('chatInput.stopDictation')}>
        <div className="h-px min-w-8 flex-1 border-t border-dashed border-ink/25" aria-hidden />
        <div className="flex h-9 shrink-0 items-center gap-[3px]" aria-hidden>
          {VOICE_BARS.map((height, index) => (
            <span
              key={index}
              className="w-[3px] rounded-full bg-ink"
              style={{
                height: `${height}%`,
                animation: isRecording
                  ? `music-bar ${0.64 + (index % 5) * 0.08}s ease-in-out ${index * 0.025}s infinite`
                  : undefined,
              }}
            />
          ))}
        </div>
        <span className="w-11 shrink-0 text-center text-[15px] tabular-nums text-ink-2">
          {formatElapsed(recordingElapsed)}
        </span>
      </div>

      <button
        type="button"
        onClick={handleVoiceClick}
        disabled={isLoading || isTranscribing}
        className="w-11 h-11 flex items-center justify-center rounded-full bg-chip-2 text-ink hover:bg-chip-hover transition-colors shrink-0 touch-none select-none"
        title={t('chatInput.stopDictation')}
        aria-label={t('chatInput.stopDictation')}
      >
        {isTranscribing ? (
          <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        ) : (
          <span className="w-3 h-3 rounded-[3px] bg-current" aria-hidden />
        )}
      </button>

      <button
        type="button"
        onClick={handleVoiceClick}
        disabled={isLoading || isTranscribing}
        className="w-11 h-11 flex items-center justify-center rounded-full bg-ink text-page hover:bg-accent transition-colors shrink-0 touch-none select-none"
        title={t('chatInput.send')}
        aria-label={t('chatInput.send')}
      >
        <svg className="w-[20px] h-[20px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6" />
        </svg>
      </button>
    </div>
  );

  if (collapsed && !isRecording && !isTranscribing) {
    // Mirror the composer's full layout (+ on left, mic on right, text
    // in middle) so the capsule looks structurally identical before /
    // after activation — only the textarea ↔ static hint text swaps.
    // Same outer padding (py-2.5 px-2) and same button geometry (w-11
    // h-11) so capsule height/width don't budge on transition.
    return (
      <div className="max-w-xl mx-auto">
        <div
          role="button"
          tabIndex={0}
          onClick={onActivate}
          onKeyDown={handleCollapsedKeyDown}
          className="w-full glass rounded-full py-2.5 px-2 hover:bg-ink/5 transition-colors text-left font-sans"
          aria-label={t('chatInput.askDJ')}
        >
          <div className="flex items-center gap-2">
            {/* + (attach) — decorative; mirrors composer position */}
            <div className="w-11 h-11 flex items-center justify-center rounded-full text-ink-2 shrink-0" aria-hidden>
              <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
              </svg>
            </div>

            {/* hint text */}
            <span className="flex-1 text-[15px] text-ink-3 truncate py-2">
              {getPlaceholder()}
            </span>

            {/* Voice (mic) — real dictation target even in collapsed feed mode. */}
            <button
              type="button"
              onClick={handleVoiceClick}
              disabled={isLoading || isTranscribing}
              className={`w-11 h-11 flex items-center justify-center rounded-full transition-all shrink-0 touch-none select-none ${
                isRecording
                  ? 'bg-accent text-page animate-pulse scale-110'
                  : isTranscribing
                    ? 'bg-chip-2 text-ink-2'
                    : 'bg-chip-2 text-ink-2 hover:bg-chip-hover hover:text-ink'
              }`}
              title={isRecording ? t('chatInput.stopDictation') : t('chatInput.voiceTip')}
              aria-label={isRecording ? t('chatInput.stopDictation') : t('chatInput.voice')}
            >
              {isRecording ? (
                <span className="w-3 h-3 rounded-[3px] bg-current" aria-hidden />
              ) : (
                <svg className="w-[20px] h-[20px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasInput = input.trim().length > 0;

  return (
    <div className="max-w-xl mx-auto">
      <div className="glass rounded-full py-2.5 px-2 flex flex-col gap-2 transition-all focus-within:bg-ink/10">
        {/* Attachment Preview — inside the pill, stacks above the input row
            so the pill grows to accommodate them. */}
        {attachments.length > 0 && (
          <div className="flex gap-2 px-2 pt-1 flex-wrap">
            {attachments.map((file, index) => (
              <div key={index} className="relative group">
                {file.type.startsWith('image/') ? (
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="w-16 h-16 object-cover rounded-card hairline"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-card hairline bg-chip flex flex-col items-center justify-center p-1">
                    <svg className="w-5 h-5 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 10l12-3" />
                    </svg>
                    <span className="text-[8px] text-ink-3 truncate w-full text-center mt-1">{file.name}</span>
                  </div>
                )}
                <button
                  onClick={() => onRemoveAttachment(index)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-ink text-page rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

      {isRecording || isTranscribing ? voiceInputRow : (
      <div className="flex items-center gap-2">
        {/* Attachment Button — plus icon, image upload. Naked (no chip
            fill) — only the right-side action button carries fill.
            Always rendered: `onAttach` is required, so the button is
            present in every host (chat, new-chat, playlist composer). */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-11 h-11 flex items-center justify-center rounded-full text-ink-2 hover:text-ink hover:bg-chip transition-colors shrink-0 self-end"
          title={t('chatInput.uploadImage')}
          aria-label={t('chatInput.uploadImage')}
        >
          <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={getPlaceholder()}
          className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-ink placeholder-ink-3 text-[15px] leading-snug resize-none py-2 max-h-32 no-scrollbar font-sans"
          disabled={isLoading}
        />

        {/* Provider Badge */}
        {activeProvider && (
          <div
            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
            title={activeProvider === 'apple-music' ? 'Apple Music' : 'Spotify'}
          >
            {activeProvider === 'apple-music' ? (
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.802.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03c.525-.015 1.05-.04 1.573-.12.797-.118 1.543-.395 2.2-.88.857-.635 1.405-1.48 1.725-2.474.18-.56.272-1.14.326-1.726.033-.36.06-.72.06-1.083V6.124zM17.997 10.07l-.015 5.65c0 .46-.1.903-.31 1.32-.355.705-.907 1.174-1.645 1.4-.31.095-.63.153-.96.177-.48.035-.964-.012-1.412-.24-.9-.46-1.327-1.28-1.144-2.27.105-.575.443-1.006.94-1.316.287-.18.6-.306.928-.398.506-.14 1.02-.26 1.53-.393.228-.06.438-.155.578-.37.094-.148.135-.317.135-.5V8.88c0-.303-.09-.449-.39-.39-.134.027-.27.07-.4.115-.56.19-1.12.385-1.68.573l-3.3 1.127c-.066.02-.132.044-.2.073-.186.08-.268.213-.283.41-.003.048-.005.097-.005.146v6.79c0 .163-.006.327-.03.49-.105.74-.42 1.357-1.05 1.798-.384.27-.81.42-1.266.493-.372.06-.748.065-1.12.015-.904-.123-1.577-.627-1.88-1.49-.172-.49-.146-.993.03-1.485.233-.652.694-1.084 1.312-1.373.336-.157.69-.26 1.055-.337.41-.086.823-.163 1.232-.253.262-.058.504-.165.674-.383.117-.152.165-.33.166-.524V5.793c0-.297.045-.588.15-.868.18-.49.523-.795 1.02-.94.355-.105.72-.175 1.084-.252l3.194-.682c.54-.116 1.082-.23 1.624-.336.27-.053.543-.08.817-.05.387.044.703.208.906.563.104.18.145.38.148.59l.003.22v5.833z" />
                </svg>
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
              </div>
            )}
          </div>
        )}

        {/* Voice/Send Dual Button */}
        {hasInput ? (
          /* Send button — filled circle with accent when ready */
          <button
            onClick={onSend}
            disabled={isLoading}
            className={`w-11 h-11 flex items-center justify-center rounded-full transition-all shrink-0 self-end ${
              isLoading
                ? 'bg-ink/30 text-page animate-pulse'
                : 'bg-accent text-page hover:bg-accent-2'
            }`}
            aria-label={t('chatInput.send')}
          >
            {isLoading ? (
              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-[20px] h-[20px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6" />
              </svg>
            )}
          </button>
        ) : (
          /* Voice button — click-to-dictate. Three visual states:
             idle (chip), recording (accent + pulse), transcribing (spinner). */
          <div className="shrink-0 self-end flex items-center gap-2">
            {isRecording && (
              <span className="hidden sm:inline-flex h-8 items-center rounded-full bg-chip px-3 text-[13px] text-ink-2 hairline">
                {t('chatInput.stopDictation')}
              </span>
            )}
            <button
              type="button"
              onClick={handleVoiceClick}
              disabled={isLoading || isTranscribing}
              className={`w-11 h-11 flex items-center justify-center rounded-full transition-all shrink-0 touch-none select-none ${
                isRecording
                  ? 'bg-ink text-page'
                  : isTranscribing
                    ? 'bg-chip-2 text-ink-2'
                    : 'bg-chip-2 text-ink-2 hover:bg-chip-hover hover:text-ink'
              }`}
              title={isRecording ? t('chatInput.stopDictation') : t('chatInput.voiceTip')}
              aria-label={isRecording ? t('chatInput.stopDictation') : t('chatInput.voice')}
            >
              {isTranscribing ? (
                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : isRecording ? (
                <span className="w-3 h-3 rounded-[3px] bg-current" aria-hidden />
              ) : (
                <svg className="w-[20px] h-[20px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
                </svg>
              )}
            </button>
          </div>
        )}
        </div>
      )}
      </div>
    </div>
  );
};
