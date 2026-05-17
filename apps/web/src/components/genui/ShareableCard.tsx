/**
 * ShareableCard — wraps GenUI content with a capture region and save button.
 * Uses modern-screenshot for pixel-perfect capture.
 */
import { useRef, useState, useCallback, type ReactNode } from 'react';

interface ShareableCardProps {
  children: ReactNode;
}

export function ShareableCard({ children }: ShareableCardProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleSave = useCallback(async () => {
    const el = captureRef.current;
    if (!el || isExporting) return;

    setIsExporting(true);
    try {
      const { domToPng } = await import('modern-screenshot');

      const target = el.querySelector('[data-capture]') as HTMLElement || el;
      el.classList.add('genui-export-mode');

      const dataUrl = await domToPng(target, {
        scale: 2,
        fetch: { requestInit: { mode: 'cors' } },
      });

      el.classList.remove('genui-export-mode');

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `playheads-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('[GenUI] Screenshot failed:', e);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  return (
    <div className="w-full max-w-[calc(100vw-48px)] animate-genui-slide-in">
      <div className="rounded-sheet glass overflow-hidden">
        <div
          ref={captureRef}
          style={{ background: 'rgb(var(--page))' }}
        >
          <div className="p-4">
            {children}
          </div>
          <div className="px-4 pb-3 pt-1 flex items-center justify-between hairline-t">
            <span className="text-[10px] text-ink-4 uppercase tracking-widest font-semibold">
              Playheads
            </span>
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-2 pr-1">
        <button
          onClick={handleSave}
          disabled={isExporting}
          className="flex items-center gap-1.5 text-[11px] text-ink-3 hover:text-ink transition-colors disabled:opacity-50"
        >
          {isExporting ? (
            <span className="animate-pulse">Saving...</span>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Save Image
            </>
          )}
        </button>
      </div>
    </div>
  );
}
