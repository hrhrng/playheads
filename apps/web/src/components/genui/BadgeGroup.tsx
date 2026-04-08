/**
 * BadgeGroup — cluster of tag/label badges.
 */
import type { BadgeGroupNode } from '../../types/genui';

const DEFAULT_COLORS = [
  'bg-blue-50 text-blue-700',
  'bg-purple-50 text-purple-700',
  'bg-green-50 text-green-700',
  'bg-amber-50 text-amber-700',
  'bg-rose-50 text-rose-700',
  'bg-cyan-50 text-cyan-700',
];

export function BadgeGroup({ badges }: BadgeGroupNode) {
  return (
    <div className="flex flex-wrap gap-1.5 animate-genui-slide-in">
      {badges.map((badge, i) => (
        <span
          key={`${badge.label}-${i}`}
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
            badge.color
              ? '' // custom color: user provides full class
              : DEFAULT_COLORS[i % DEFAULT_COLORS.length]
          }`}
          style={badge.color ? { backgroundColor: `${badge.color}20`, color: badge.color } : undefined}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}
