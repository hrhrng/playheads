/**
 * Timeline — horizontal scrollable timeline with era nodes,
 * connecting line, and content sections.
 */
import { renderNode } from './GenUIRenderer';
import type { TimelineNode } from '../../types/genui';

export function Timeline({ items }: TimelineNode) {
  return (
    <div className="overflow-x-auto no-scrollbar -mx-1 px-1 pb-2">
      <div className="flex items-start min-w-max">
        {items.map((item, i) => (
          <div
            key={`era-${i}`}
            className="flex flex-col items-center animate-genui-slide-in"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            {/* Timeline connector + dot */}
            <div className="flex items-center w-full px-2">
              {/* Left line */}
              <div className={`h-[2px] flex-1 ${i === 0 ? 'bg-transparent' : 'bg-gray-300'}`} />
              {/* Dot */}
              <div className="relative">
                <div className="w-3 h-3 rounded-full bg-gray-800 ring-4 ring-white shadow-sm z-10" />
              </div>
              {/* Right line */}
              <div className={`h-[2px] flex-1 ${i === items.length - 1 ? 'bg-transparent' : 'bg-gray-300'}`} />
            </div>

            {/* Year label */}
            <div className="mt-2 text-center">
              <span className="text-[11px] font-bold text-gray-900 tabular-nums">{item.year}</span>
            </div>

            {/* Era name */}
            <div className="mt-0.5 text-center px-3">
              <span className="text-[11px] font-medium text-gray-600">{item.label}</span>
            </div>

            {/* Description */}
            {item.description && (
              <p className="mt-1 text-[10px] text-gray-400 text-center px-3 max-w-[200px] line-clamp-2">
                {item.description}
              </p>
            )}

            {/* Content below */}
            <div className="mt-3 px-2">
              <div className="flex gap-3 pb-1">
                {item.children.map((child, ci) => (
                  <div key={`era-${i}-child-${ci}`} className="shrink-0">
                    {renderNode(child, `era-${i}-child-${ci}`)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
