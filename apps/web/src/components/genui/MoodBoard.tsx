/**
 * MoodBoard — mood-based music recommendation card.
 * Shows mood tags + visual atmosphere.
 */
import type { ReactNode } from 'react';

interface MoodBoardProps {
  mood: string;
  description?: string;
  emoji?: string;
  gradient?: string[];
  children?: ReactNode;
}

export function MoodBoard({ mood, description, emoji, gradient, children }: MoodBoardProps) {
  const [from, to] = gradient || ['#667eea', '#764ba2'];

  return (
    <div className="rounded-2xl overflow-hidden animate-genui-slide-in">
      {/* Mood header */}
      <div
        className="px-5 py-6 text-center"
        style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      >
        {emoji && <span className="text-3xl">{emoji}</span>}
        <h3 className="text-lg font-bold text-white mt-2">{mood}</h3>
        {description && (
          <p className="text-sm text-white/60 mt-1 max-w-xs mx-auto">{description}</p>
        )}
      </div>

      {/* Recommendations below */}
      {children && (
        <div className="bg-white p-4">
          <div className="flex flex-wrap gap-3">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
