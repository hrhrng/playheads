/**
 * Carousel — horizontal scrollable row of items.
 */
import { renderNode } from './GenUIRenderer';
import type { CarouselNode } from '../../types/genui';

export function Carousel({ children }: CarouselNode) {
  return (
    <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
      <div className="flex gap-3 pb-2">
        {children.map((child, i) => (
          <div key={`carousel-${i}`} className="shrink-0">
            {renderNode(child, `carousel-item-${i}`)}
          </div>
        ))}
      </div>
    </div>
  );
}
