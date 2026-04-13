/**
 * ShareableCard — wraps GenUI content with a capture region and save button.
 * Generates a shareable PNG via html2canvas.
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
      const { default: html2canvas } = await import('html2canvas');

      // Prefer data-capture element inside the card (e.g. LyricsCard),
      // otherwise capture the whole card
      const target = el.querySelector('[data-capture]') as HTMLElement || el;

      el.classList.add('genui-export-mode');

      const canvas = await html2canvas(target, {
        useCORS: true,
        scale: 2,
        backgroundColor: null,
        logging: false,
      });

      el.classList.remove('genui-export-mode');

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `playheads-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (e) {
      console.error('[GenUI] Screenshot failed:', e);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  return (
    <div className="w-full max-w-[calc(100vw-48px)] animate-genui-slide-in">
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {/* Capture region */}
        <div ref={captureRef} className="bg-white">
          <div className="p-4">
            {children}
          </div>
          {/* Branding footer (included in screenshot) */}
          <div className="px-4 pb-3 pt-1 flex items-center justify-between border-t border-gray-100">
            <span className="text-[10px] text-gray-300 uppercase tracking-widest font-semibold">
              Playheads
            </span>
          </div>
        </div>
      </div>
      {/* Save button (outside capture region) */}
      <div className="flex justify-end mt-2 pr-1">
        <button
          onClick={handleSave}
          disabled={isExporting}
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
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
