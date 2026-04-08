/**
 * Stat — key metric display with large value and small label.
 */
import type { StatNode } from '../../types/genui';

export function Stat({ value, label }: StatNode) {
  return (
    <div className="text-center px-4 py-3 animate-genui-card-in">
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-[11px] text-gray-500 mt-1 uppercase tracking-wider">{label}</p>
    </div>
  );
}
