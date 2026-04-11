/**
 * Timeline — horizontal scrollable timeline with era nodes.
 * Timeline.Era is used by the json-render registry for each era.
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
    <div className="flex flex-col items-center min-w-[160px] animate-genui-slide-in">
      <div className="text-center mb-3">
        <span className="text-xs font-bold text-gray-900 tabular-nums">{year}</span>
        <div className="mt-0.5">
          <span className="text-[11px] font-medium text-gray-600">{label}</span>
        </div>
        {description && (
          <p className="mt-1 text-[10px] text-gray-400 max-w-[180px] line-clamp-2">{description}</p>
        )}
      </div>
      <div className="flex gap-3 pb-1">{children}</div>
    </div>
  );
}

interface TimelineContainerProps {
  children?: ReactNode;
}

function TimelineContainer({ children }: TimelineContainerProps) {
  const count = Children.count(children);
  return (
    <div className="overflow-x-auto no-scrollbar -mx-1 px-1 pb-2">
      <div className="flex items-start min-w-max">
        {Children.map(children, (child, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="flex items-center w-full px-4 mb-2">
              <div className={`h-[2px] flex-1 ${i === 0 ? 'bg-transparent' : 'bg-gray-200'}`} />
              <div className="w-2.5 h-2.5 rounded-full bg-gray-800 ring-[3px] ring-white shadow-sm z-10 shrink-0" />
              <div className={`h-[2px] flex-1 ${i === count - 1 ? 'bg-transparent' : 'bg-gray-200'}`} />
            </div>
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

export const Timeline = Object.assign(TimelineContainer, { Era });
