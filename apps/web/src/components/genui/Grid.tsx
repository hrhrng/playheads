/**
 * Grid — responsive grid layout.
 */
import { renderNode } from './GenUIRenderer';
import type { GridNode } from '../../types/genui';

const COL_CLASSES: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5',
  6: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6',
};

export function Grid({ columns = 2, children }: GridNode) {
  const colClass = COL_CLASSES[Math.min(Math.max(columns, 1), 6)] || COL_CLASSES[2];

  return (
    <div className={`grid ${colClass} gap-4`}>
      {children.map((child, i) => (
        <div key={`grid-${i}`} className="min-w-0">
          {renderNode(child, `grid-item-${i}`)}
        </div>
      ))}
    </div>
  );
}
