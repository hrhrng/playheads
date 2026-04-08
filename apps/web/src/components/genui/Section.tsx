/**
 * Section — titled group of content with optional subtitle.
 */
import { renderNode } from './GenUIRenderer';
import type { SectionNode } from '../../types/genui';

export function Section({ title, subtitle, children }: SectionNode) {
  return (
    <div className="space-y-3 animate-genui-slide-in">
      {(title || subtitle) && (
        <div>
          {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
          {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className="space-y-2">
        {children.map((child, i) => renderNode(child, `section-${i}`))}
      </div>
    </div>
  );
}
