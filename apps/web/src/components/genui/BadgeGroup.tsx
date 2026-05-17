/**
 * BadgeGroup — cluster of tag/label badges.
 */
interface BadgeGroupProps {
  type?: string;
  badges: { label: string; color?: string | null }[];
}

// iOS treatment: uniform chip + hairline; mood accent drives any per-tag emphasis.
// Per-badge `color` prop still wins via inline style if the agent supplies one.
const DEFAULT_CLASS = 'bg-chip hairline text-ink-2';

export function BadgeGroup({ badges }: BadgeGroupProps) {
  return (
    <div className="flex flex-wrap gap-1.5 animate-genui-slide-in">
      {badges.map((badge, i) => (
        <span
          key={`${badge.label}-${i}`}
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
            badge.color ? '' : DEFAULT_CLASS
          }`}
          style={badge.color ? { backgroundColor: `${badge.color}20`, color: badge.color } : undefined}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}
