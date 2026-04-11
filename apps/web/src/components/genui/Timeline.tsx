/**
 * Timeline — vertical timeline era node (self-contained).
 *
 * Each era renders its own dot + connecting line, so it works
 * without a wrapper container — just stack eras inside a Section.
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
    <div className="relative pl-7 pb-6 last:pb-0 animate-genui-slide-in">
      {/* Dot */}
      <div className="absolute left-0 top-1 w-3 h-3 rounded-full bg-gray-800 ring-[3px] ring-white shadow-sm z-10" />
      {/* Connecting line (hidden on last child via CSS) */}
      <div className="absolute left-[5px] top-4 bottom-0 w-[2px] bg-gray-200 [.last\:pb-0>&]:hidden" />

      {/* Year + label */}
      <div className="mb-2.5">
        <span className="text-[13px] font-bold text-gray-900 tabular-nums">{year}</span>
        <span className="text-[12px] font-medium text-gray-500 ml-2">{label}</span>
        {description && (
          <p className="mt-0.5 text-[11px] text-gray-400">{description}</p>
        )}
      </div>
      {/* Album cards / content */}
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}

export const Timeline = { Era };
