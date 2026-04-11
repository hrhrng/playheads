/**
 * GenUIContainer — premium top-level wrapper for GenUI visuals.
 *
 * Dark, immersive card with gradient hero, content area, and share footer.
 */
import { useRef, useState, useCallback } from 'react';
import { GenUIRenderer } from './GenUIRenderer';
import { GenUIActionsProvider } from './GenUIContext';
import type { GenUIPayload } from '../../types/genui';
import type { QueueOperations } from '../../hooks/useAgentChatAdapter';

interface GenUIContainerProps {
  data: GenUIPayload;
  queueOps?: QueueOperations | null;
}

export function GenUIContainer({ data, queueOps }: GenUIContainerProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { title, subtitle, gradient, sections } = data;
  const [gradFrom, gradTo] = gradient || ['#0f0f23', '#1a1a3e'];

  const handleDownload = useCallback(async () => {
    const el = captureRef.current;
    if (!el || isExporting) return;

    setIsExporting(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      el.classList.add('genui-export-mode');

      const canvas = await html2canvas(el, {
        useCORS: true,
        scale: 2,
        backgroundColor: '#0f0f23',
        logging: false,
      });

      el.classList.remove('genui-export-mode');

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '-').toLowerCase()}.png`;
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
  }, [title, isExporting]);

  return (
    <GenUIActionsProvider value={queueOps || null}>
      <div className="w-full max-w-[calc(100vw-48px)] animate-genui-slide-in">
        <div
          ref={captureRef}
          className="rounded-2xl overflow-hidden"
          style={{
            background: `linear-gradient(160deg, ${gradFrom}, ${gradTo})`,
          }}
        >
          {/* Hero header */}
          <div className="px-5 pt-6 pb-4">
            <h2 className="text-xl font-bold text-white tracking-tight leading-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm text-white/50 mt-1.5 leading-snug">{subtitle}</p>
            )}
          </div>

          {/* Content area — slightly lighter inner card */}
          <div className="mx-2 mb-2 rounded-xl bg-white/[0.06] backdrop-blur-sm p-4 space-y-4">
            <GenUIRenderer sections={sections} />
          </div>

          {/* Footer */}
          <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-[10px] text-white/25 uppercase tracking-widest font-semibold">
              Playheads
            </span>
            <button
              onClick={handleDownload}
              disabled={isExporting}
              className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
            >
              {isExporting ? (
                <span className="animate-pulse">Exporting...</span>
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
      </div>
    </GenUIActionsProvider>
  );
}
