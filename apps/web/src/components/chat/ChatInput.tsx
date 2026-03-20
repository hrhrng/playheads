/**
 * ChatInput - Message input component with auto-resize
 * Enhanced with provider badge, voice/send dual button, and attachment upload.
 * @module components/chat/ChatInput
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { useAutoResizeTextarea } from '../../hooks/useChatHelpers';
import type { ProviderType } from '../../providers/types';
import { detectPlaylistUrl, PLATFORM_COLORS, type DetectedPlaylistUrl } from '../../utils/playlistUrl';
import { API_BASE } from '../../config/api';

/** Playlist info returned by backend /playlist/extract endpoint. */
export interface PlaylistInfo {
  name: string;
  platform: string;
  description?: string;
  artwork_url?: string;
  track_count: number;
  tracks: Array<{ name: string; artist: string; album?: string }>;
}

type PlaylistChipState =
  | { status: "idle" }
  | { status: "loading"; detected: DetectedPlaylistUrl }
  | { status: "loaded"; detected: DetectedPlaylistUrl; info: PlaylistInfo }
  | { status: "error"; detected: DetectedPlaylistUrl; message: string };

/** Small colored dot representing a music platform. */
const PlatformDot = ({ platform, size = 14 }: { platform: string; size?: number }) => (
  <span
    className={`inline-block rounded-full shrink-0 ${PLATFORM_COLORS[platform] || "bg-gray-400"}`}
    style={{ width: size, height: size }}
  />
);

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
  /** Short press voice button — start ASR */
  onVoiceShortPress?: () => void;
  /** Long press voice button — start voice conversation mode */
  onVoiceLongPress?: () => void;
  /** Whether voice is currently listening */
  isListening?: boolean;
  /** Callback when files are attached */
  onAttach?: (files: File[]) => void;
  /** Currently attached files */
  attachments?: File[];
  /** Remove an attachment by index */
  onRemoveAttachment?: (index: number) => void;
  /** Called when a playlist URL is resolved (or null when cleared) */
  onPlaylistResolved?: (info: PlaylistInfo | null) => void;
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
  onVoiceShortPress,
  onVoiceLongPress,
  isListening = false,
  onAttach,
  attachments = [],
  onRemoveAttachment,
  onPlaylistResolved,
}: ChatInputProps): React.JSX.Element => {
  const textareaRef = useAutoResizeTextarea(input);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLongPress, setIsLongPress] = useState(false);

  // ── Playlist URL detection chip ──
  const [playlistChip, setPlaylistChip] = useState<PlaylistChipState>({ status: "idle" });
  const fetchController = useRef<AbortController | null>(null);

  useEffect(() => {
    const detected = detectPlaylistUrl(input);

    if (!detected) {
      if (playlistChip.status !== "idle") {
        setPlaylistChip({ status: "idle" });
        onPlaylistResolved?.(null);
      }
      return;
    }

    // Same URL already being processed or loaded — skip
    if (playlistChip.status !== "idle" && "detected" in playlistChip && playlistChip.detected.url === detected.url) {
      return;
    }

    // Cancel previous in-flight request
    fetchController.current?.abort();
    const controller = new AbortController();
    fetchController.current = controller;

    setPlaylistChip({ status: "loading", detected });
    onPlaylistResolved?.(null);

    fetch(`${API_BASE}/playlist/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: detected.url }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }
        return res.json() as Promise<PlaylistInfo>;
      })
      .then((info) => {
        if (controller.signal.aborted) return;
        setPlaylistChip({ status: "loaded", detected, info });
        onPlaylistResolved?.(info);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setPlaylistChip({ status: "error", detected, message: String(e) });
        onPlaylistResolved?.(null);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const dismissChip = useCallback(() => {
    fetchController.current?.abort();
    setPlaylistChip({ status: "idle" });
    onPlaylistResolved?.(null);
  }, [onPlaylistResolved]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const getPlaceholder = (): string => {
    if (isDJSpeaking) return 'Push to Interrupt...';
    if (isPlaying) return 'Ask the DJ...';
    return 'Start a vibe...';
  };

  const hasInput = input.trim().length > 0;

  // Voice button handlers (long press detection)
  const handleVoicePointerDown = useCallback(() => {
    setIsLongPress(false);
    longPressTimer.current = setTimeout(() => {
      setIsLongPress(true);
      onVoiceLongPress?.();
    }, 500);
  }, [onVoiceLongPress]);

  const handleVoicePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!isLongPress) {
      onVoiceShortPress?.();
    }
  }, [isLongPress, onVoiceShortPress]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0 && onAttach) {
      onAttach(files);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [onAttach]);

  return (
    <div className="max-w-xl mx-auto">
      {/* Attachment Preview */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-2 px-2 flex-wrap">
          {attachments.map((file, index) => (
            <div key={index} className="relative group">
              {file.type.startsWith('image/') ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="w-16 h-16 object-cover rounded-xl border border-gray-200"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex flex-col items-center justify-center p-1">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 10l12-3" />
                  </svg>
                  <span className="text-[8px] text-gray-400 truncate w-full text-center mt-1">{file.name}</span>
                </div>
              )}
              {onRemoveAttachment && (
                <button
                  onClick={() => onRemoveAttachment(index)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-gray-800 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Playlist URL Chip */}
      {playlistChip.status !== "idle" && (
        <div className="flex gap-2 mb-2 px-2">
          <div className="inline-flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1.5 text-xs max-w-xs">
            <PlatformDot platform={playlistChip.detected.platform} />
            {playlistChip.status === "loading" && (
              <span className="text-gray-400 animate-pulse">
                {playlistChip.detected.displayName} loading...
              </span>
            )}
            {playlistChip.status === "loaded" && (
              <span className="text-gray-700 font-medium truncate">
                {playlistChip.detected.displayName} · {playlistChip.info.name}
                <span className="text-gray-400 ml-1">({playlistChip.info.track_count})</span>
              </span>
            )}
            {playlistChip.status === "error" && (
              <span className="text-red-400 truncate">{playlistChip.message}</span>
            )}
            <button
              onClick={dismissChip}
              className="text-gray-400 hover:text-gray-600 ml-0.5 shrink-0 leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="bg-gemini-bg rounded-2xl p-2 pl-3 pr-2 flex items-center gap-2 group focus-within:bg-white focus-within:shadow-md transition-all border border-transparent focus-within:border-gemini-border">
        {/* Attachment Button */}
        {onAttach && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
              title="Attach image or audio"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </>
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={getPlaceholder()}
          className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-gemini-text placeholder-gray-400 text-sm resize-none py-2.5 max-h-32 no-scrollbar"
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
          /* Send button */
          <button
            onClick={onSend}
            disabled={isLoading}
            className={`p-2 rounded-full transition-all shrink-0 ${
              isLoading
                ? 'bg-gray-300 text-white animate-pulse'
                : 'bg-gray-800 text-white hover:bg-black'
            }`}
          >
            {isLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            )}
          </button>
        ) : (
          /* Voice button */
          <button
            onPointerDown={handleVoicePointerDown}
            onPointerUp={handleVoicePointerUp}
            onPointerLeave={() => {
              if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
              }
            }}
            disabled={isLoading}
            className={`p-2 rounded-full transition-all shrink-0 ${
              isListening
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-gray-200 text-gray-400 hover:bg-gray-300 hover:text-gray-600'
            }`}
            title="Tap to dictate, hold for voice mode"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
