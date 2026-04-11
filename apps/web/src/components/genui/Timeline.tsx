/**
 * Timeline — vertical timeline with era nodes.
 * Each era has a dot on a vertical line, labels on the left, content on the right.
 */
import { Children, type ReactNode } from 'react';

interface TimelineEraProps {
  year: string;
  label: string;
  description?: string;
  children?: ReactNode;
}

function Era({ year, label, description, children }: TimelineEraProps) {
  return (
    <div className="animate-genui-slide-in">
      {/* Year + label */}
      <div className="mb-2">
        <span className="text-xs font-bold text-gray-900 tabular-nums">{year}</span>
        <span className="text-[11px] font-medium text-gray-500 ml-2">{label}</span>
        {description && (
          <p className="mt-0.5 text-[10px] text-gray-400 line-clamp-2">{description}</p>
        )}
      </div>
      {/* Album cards / content */}
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}

interface TimelineContainerProps {
  children?: ReactNode;
}

function TimelineContainer({ children }: TimelineContainerProps) {
  const count = Children.count(children);
  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-gray-200" />

      <div className="space-y-6">
        {Children.map(children, (child, i) => (
          <div key={i} className="relative">
            {/* Dot on the line */}
            <div className="absolute -left-6 top-1 w-4 h-4 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-800 ring-[3px] ring-white shadow-sm z-10" />
            </div>
            {/* Era content */}
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

export const Timeline = Object.assign(TimelineContainer, { Era });
