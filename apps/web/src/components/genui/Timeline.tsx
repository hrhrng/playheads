/**
 * Timeline — horizontal scrollable timeline with era nodes.
 *
 * Works with json-render: TimelineEra components are rendered as children.
 * The Timeline.Era sub-component provides individual era styling.
 */
import { Children, type ReactNode } from 'react';

interface TimelineEraProps {
  year: string;
  label: string;
  description?: string;
  children?: ReactNode;
}

/**
 * Individual era node with connector, dot, labels, and content.
 */
function Era({ year, label, description, children }: TimelineEraProps) {
  return (
    <div className="flex flex-col items-center min-w-[160px] animate-genui-slide-in">
      {/* Year + label */}
      <div className="text-center mb-3">
        <span className="text-xs font-bold text-white/90 tabular-nums">{year}</span>
        <div className="mt-0.5">
          <span className="text-[11px] font-medium text-white/50">{label}</span>
        </div>
        {description && (
          <p className="mt-1 text-[10px] text-white/30 max-w-[180px] line-clamp-2">
            {description}
          </p>
        )}
      </div>

      {/* Content — album cards etc */}
      <div className="flex gap-3 pb-1">
        {children}
      </div>
    </div>
  );
}

interface TimelineContainerProps {
  children?: ReactNode;
}

/**
 * Horizontal scrollable timeline container.
 * Renders a connecting line between era nodes.
 */
function TimelineContainer({ children }: TimelineContainerProps) {
  const count = Children.count(children);

  return (
    <div className="overflow-x-auto no-scrollbar -mx-1 px-1 pb-2">
      {/* Timeline line */}
      <div className="relative">
        {/* Connecting line behind the dots */}
        <div className="flex items-start min-w-max">
          {Children.map(children, (child, i) => (
            <div key={i} className="flex flex-col items-center">
              {/* Dot + connector */}
              <div className="flex items-center w-full px-4 mb-2">
                <div className={`h-[2px] flex-1 ${i === 0 ? 'bg-transparent' : 'bg-white/20'}`} />
                <div className="w-2.5 h-2.5 rounded-full bg-white/80 ring-[3px] ring-white/10 shadow-sm z-10 shrink-0" />
                <div className={`h-[2px] flex-1 ${i === count - 1 ? 'bg-transparent' : 'bg-white/20'}`} />
              </div>
              {/* Era content */}
              {child}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const Timeline = Object.assign(TimelineContainer, { Era });
