/**
 * ChatFlow - Glassmorphic overlay showing full chat conversation.
 *
 * Slides up from the bottom when entering Chat mode.
 * Supports pull-down gesture to dismiss, and click on top area to close.
 *
 * @module components/ChatFlow
 */

import { useEffect, useRef, useState, useCallback } from 'react';
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
  const [mounted, setMounted] = useState(false);

  // Animation: mount → slide up
  useEffect(() => {
    if (isVisible) {
      // Force a frame to allow the initial translateY(100%) to render
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setMounted(true);
        });
      });
    } else {
      setMounted(false);
    }
  }, [isVisible]);

  // Auto-scroll to bottom when messages change
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

  if (!isVisible && !mounted) return null;

  const translateY = !mounted
    ? 'translateY(100%)'
    : isDragging
      ? `translateY(${dragY}px)`
      : 'translateY(0)';

  const transition = isDragging
    ? 'none'
    : !mounted && !isVisible
      ? 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
      : 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col rounded-t-3xl md:rounded-3xl overflow-hidden"
      style={{
        background: 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        transform: translateY,
        transition,
        willChange: isDragging ? 'transform' : 'auto',
      }}
    >
      {/* Drag handle */}
      <div
        {...bind()}
        className="flex flex-col items-center pt-3 pb-2 cursor-grab active:cursor-grabbing shrink-0"
        style={{ touchAction: 'none' }}
      >
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>

      {/* Clickable top area to close */}
      <button
        onClick={onClose}
        className="h-8 w-full flex items-center justify-center text-[10px] text-gray-400 uppercase tracking-widest hover:text-gray-500 transition-colors shrink-0"
      >
        Back to Player
      </button>

      {/* Message list - scrollable */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
        <div className="max-w-xl mx-auto">
          <MessageList messages={messages} isLoading={isLoading} />
          <div ref={endRef} />
        </div>
      </div>

      {/* ChatInput pinned at bottom */}
      <div className="px-4 md:px-6 pb-4 md:pb-5 pt-2 shrink-0 pb-[env(safe-area-inset-bottom)]">
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
  );
};
