/**
 * Stat — key metric display (dark theme).
 */
interface StatProps {
  type?: string;
  value: string;
  label: string;
}

export function Stat({ value, label }: StatProps) {
  return (
    <div className="text-center px-4 py-3 animate-genui-card-in">
      <p className="text-2xl font-bold text-white/90 tabular-nums">{value}</p>
      <p className="text-[11px] text-white/40 mt-1 uppercase tracking-wider">{label}</p>
    </div>
  );
}
