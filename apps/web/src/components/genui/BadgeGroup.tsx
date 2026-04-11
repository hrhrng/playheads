/**
 * BadgeGroup — cluster of tag/label badges (dark theme).
 */
interface BadgeGroupProps {
  type?: string;
  badges: { label: string; color?: string | null }[];
}

const DEFAULT_COLORS = [
  'bg-blue-500/20 text-blue-300',
  'bg-purple-500/20 text-purple-300',
  'bg-emerald-500/20 text-emerald-300',
  'bg-amber-500/20 text-amber-300',
  'bg-rose-500/20 text-rose-300',
  'bg-cyan-500/20 text-cyan-300',
];

export function BadgeGroup({ badges }: BadgeGroupProps) {
  return (
    <div className="flex flex-wrap gap-1.5 animate-genui-slide-in">
      {badges.map((badge, i) => (
        <span
          key={`${badge.label}-${i}`}
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
            badge.color ? '' : DEFAULT_COLORS[i % DEFAULT_COLORS.length]
          }`}
          style={badge.color ? { backgroundColor: `${badge.color}30`, color: badge.color } : undefined}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}
