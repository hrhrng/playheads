/**
 * GenUIContainer — top-level wrapper for GenUI visuals.
 *
 * Renders a card with:
 * - Gradient hero header (title + subtitle)
 * - GenUI node tree
 * - Share/download footer
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
  const [gradFrom, gradTo] = gradient || ['#1a1a2e', '#16213e'];

  const handleDownload = useCallback(async () => {
    const el = captureRef.current;
    if (!el || isExporting) return;

    setIsExporting(true);
    try {
      // Dynamic import to keep bundle small
      const { default: html2canvas } = await import('html2canvas');

      // Add export class for styling overrides
      el.classList.add('genui-export-mode');

      const canvas = await html2canvas(el, {
        useCORS: true,
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
      });

      el.classList.remove('genui-export-mode');

      // Download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.png`;
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
          className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm"
        >
          {/* Hero header */}
          <div
            className="px-5 py-5"
            style={{
              background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})`,
            }}
          >
            <h2 className="text-lg font-bold text-white leading-tight">{title}</h2>
            {subtitle && (
              <p className="text-[13px] text-white/70 mt-1">{subtitle}</p>
            )}
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            <GenUIRenderer sections={sections} />
          </div>

          {/* Footer with share button */}
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
              Playheads
            </span>
            <button
              onClick={handleDownload}
              disabled={isExporting}
              className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
            >
              {isExporting ? (
                <span className="animate-pulse">Exporting...</span>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download Image
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </GenUIActionsProvider>
  );
}
