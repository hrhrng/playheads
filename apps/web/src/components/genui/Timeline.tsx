/**
 * Timeline — vertical timeline era node (self-contained).
 * Each era renders its own dot + connecting line.
 * The line is hidden on the last child via parent CSS.
 */
import type { ReactNode } from 'react';

interface TimelineEraProps {
  year: string;
  label: string;
  description?: string;
  children?: ReactNode;
}

function Era({ year, label, description, children }: TimelineEraProps) {
  return (
    <div className="genui-era relative pl-7 pb-6 animate-genui-slide-in">
      {/* Dot — mood accent */}
      <div className="absolute left-0 top-1 w-3 h-3 rounded-full bg-accent ring-[3px] ring-page shadow-sm z-10" />
      {/* Connecting line — hidden on last era via parent CSS */}
      <div className="genui-era-line absolute left-[5px] top-4 bottom-0 w-[2px] bg-rule" />

      {/* Year + label */}
      <div className="mb-2.5">
        <span className="text-[13px] font-display font-semibold text-ink tabular-nums">{year}</span>
        <span className="text-[12px] font-medium text-ink-3 ml-2">{label}</span>
        {description && (
          <p className="mt-0.5 text-[11px] text-ink-3">{description}</p>
        )}
      </div>
      {/* Content */}
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}

export const Timeline = { Era };
