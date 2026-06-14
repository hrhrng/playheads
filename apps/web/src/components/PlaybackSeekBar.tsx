interface PlaybackSeekBarProps {
  current: number;
  total: number;
  onSeekStart: () => void;
  onSeekChange: (time: number) => void;
  onSeekCommit: (time: number) => void;
  hidden?: boolean;
}

function formatTime(seconds: number): string {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function PlaybackSeekBar({
  current,
  total,
  onSeekStart,
  onSeekChange,
  onSeekCommit,
  hidden = false,
}: PlaybackSeekBarProps): React.JSX.Element {
  const safeTotal = total || 1;
  const progress = Math.min(100, (current / safeTotal) * 100);

  return (
    <div
      aria-label="Playback progress group"
      className={`w-full max-w-sm mx-auto px-2 mt-4 flex items-center gap-3 transition-opacity duration-200 ${hidden ? 'opacity-0 pointer-events-none' : ''}`}
    >
      <span className="text-[11px] font-mono text-ink-3 tabular-nums shrink-0">
        {formatTime(current)}
      </span>
      <div className="relative flex-1 min-w-0 h-5 flex items-center">
        <div className="w-full h-1 bg-ink/15 rounded-full pointer-events-none overflow-hidden">
          <div
            className="h-full bg-ink rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-ink rounded-full shadow pointer-events-none"
          style={{ left: `calc(${progress}% - 5px)` }}
        />
        <input
          aria-label="Seek playback"
          type="range"
          min={0}
          max={total || 1}
          step={0.1}
          value={current}
          onPointerDown={onSeekStart}
          onChange={(e) => onSeekChange(parseFloat(e.target.value))}
          onPointerUp={(e) => onSeekCommit(parseFloat((e.target as HTMLInputElement).value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
      <span className="text-[11px] font-mono text-ink-3 tabular-nums shrink-0">
        {formatTime(total || 0)}
      </span>
    </div>
  );
}
