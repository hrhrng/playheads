/**
 * Stack — flex container with configurable direction and gap.
 */
import { renderNode } from './GenUIRenderer';
import type { StackNode } from '../../types/genui';

export function Stack({ direction = 'vertical', gap = 3, children }: StackNode) {
  const isHorizontal = direction === 'horizontal';

  return (
    <div
      className={`flex ${isHorizontal ? 'flex-row flex-wrap items-start' : 'flex-col'}`}
      style={{ gap: `${gap * 4}px` }}
    >
      {children.map((child, i) => renderNode(child, `stack-${i}`))}
    </div>
  );
}
