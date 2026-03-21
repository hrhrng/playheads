/**
 * ChatFlow - Bottom sheet overlay showing full chat conversation.
 *
 * Slides up from the bottom as a half-screen sheet when entering Chat mode.
 * Supports pull-down gesture to dismiss, and click on backdrop to close.
 *
 * @module components/ChatFlow
 */

import { useEffect, useRef, useState } from 'react';
import { useDrag } from '@use-gesture/react';
import { MessageList } from './chat/MessageList';
import { ChatInput } from './chat/ChatInput';
import type { Message } from '../types/chat';

interface ChatFlowProps {
  messages: Message[];
  isLoading: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isDJSpeaking: boolean;
  isPlaying: boolean;
  isVisible: boolean;
  onClose: () => void;
}

const DESKTOP_THRESHOLD = 120;
const MOBILE_THRESHOLD = 80;

function getThreshold() {
  return window.innerWidth < 768 ? MOBILE_THRESHOLD : DESKTOP_THRESHOLD;
}

function dampen(dy: number): number {
  return Math.sign(dy) * Math.min(Math.abs(dy) * 0.4, 200);
}

export const ChatFlow = ({
  messages,
  isLoading,
  input,
  onInputChange,
  onSend,
  isDJSpeaking,
  isPlaying,
  isVisible,
  onClose,
}: ChatFlowProps) => {
  const endRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Auto-scroll to bottom when messages change or becomes visible
  useEffect(() => {
    if (isVisible && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isVisible]);

  // Pull-down to dismiss gesture (on the handle area)
  const bind = useDrag(
    ({ down, movement: [, my] }) => {
      // Only allow downward drag
      if (my < 0) {
        setDragY(0);
        return;
      }

      if (down) {
        setIsDragging(true);
        setDragY(dampen(my));
      } else {
        setIsDragging(false);
        const threshold = getThreshold();
        if (my > threshold) {
          onClose();
        }
        setDragY(0);
      }
    },
    {
      axis: 'y',
      filterTaps: true,
      from: [0, 0],
    }
  );

  // Sheet transform: when dragging, follow finger; otherwise CSS handles open/close
  const sheetTransform = isDragging ? `translateY(${dragY}px)` : undefined;
  const sheetTransition = isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        className={`absolute inset-0 z-30 transition-opacity duration-400 ${
          isVisible
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(0, 0, 0, 0.15)' }}
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-40 flex flex-col rounded-t-2xl overflow-hidden ${
          isVisible
            ? 'translate-y-0'
            : 'translate-y-full'
        }`}
        style={{
          height: '65%',
          maxHeight: 'calc(100% - 80px)',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.08)',
          transform: sheetTransform,
          transition: sheetTransition,
          willChange: isDragging ? 'transform' : 'auto',
        }}
      >
        {/* Drag handle */}
        <div
          {...bind()}
          className="flex flex-col items-center pt-3 pb-1 cursor-grab active:cursor-grabbing shrink-0"
          style={{ touchAction: 'none' }}
        >
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-center pb-2 shrink-0">
          <span className="text-[10px] text-gray-400 uppercase tracking-widest">
            Conversation
          </span>
        </div>

        {/* Message list - scrollable */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4 min-h-0">
          <div className="max-w-xl mx-auto">
            <MessageList messages={messages} isLoading={isLoading} />
            <div ref={endRef} />
          </div>
        </div>

        {/* ChatInput pinned at bottom */}
        <div className="px-4 md:px-6 pb-4 md:pb-5 pt-2 shrink-0" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <div className="max-w-xl mx-auto">
            <ChatInput
              input={input}
              isLoading={isLoading}
              isDJSpeaking={isDJSpeaking}
              isPlaying={isPlaying}
              onInputChange={onInputChange}
              onSend={onSend}
            />
          </div>
        </div>
      </div>
    </>
  );
};
