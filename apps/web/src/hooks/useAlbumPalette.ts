/**
 * useAlbumPalette — extracts an Apple-Music-style palette from a track's
 * artwork and pipes it into CSS custom properties on <html>.
 *
 * Old strategy was Vibrant-led: pick `Vibrant.rgb` as accent and use it
 * everywhere. Vibrant biases toward the most *saturated* swatch, which
 * on multi-colour covers (Imagine Dragons "Evolve"'s rainbow spectrum
 * is the canonical bad case) consistently surfaces a warm yellow/orange,
 * regardless of what the cover actually feels like.
 *
 * New strategy keys off the cover's **average colour** instead:
 *  - mood base = downsampled mean RGB → drives blob bg tone
 *  - accent    = Vibrant (still useful for buttons that need to pop)
 *  - light/dark = mean luma threshold (already correct)
 *
 * The Vibrant chunk is dynamic-imported so empty/idle UI never pays for it.
 */
import { useEffect, useRef } from 'react';

type RGB = [number, number, number];

interface ImageStats {
  avgLuma: number;
  avgRgb: RGB;
}

const PROPS = [
  '--page', '--ink',
  '--accent', '--accent-2',
  '--blob-a', '--blob-b', '--blob-c', '--blob-d',
  '--has-mood',
] as const;

/**
 * Sample the artwork at 32×32 and return (a) mean Rec.601 luma and
 * (b) mean RGB. Honest pixel stats — black is black, rainbow is
 * grey-brown — so we don't get the Vibrant-style "warm-yellow bias" on
 * multi-colour covers.
 */
function readImageStats(url: string): Promise<ImageStats> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const size = 32;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no 2d context'));
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let r = 0, g = 0, b = 0, luma = 0;
      const count = size * size;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        luma += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      resolve({
        avgLuma: luma / count,
        avgRgb: [r / count, g / count, b / count],
      });
    };
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toRgbTuple(rgb: number[]): string {
  return `${clamp(rgb[0])} ${clamp(rgb[1])} ${clamp(rgb[2])}`;
}

/** Mix `c` toward black by `amt` (0..1). */
function darken(rgb: number[], amt: number): RGB {
  return [
    clamp(rgb[0] * (1 - amt)),
    clamp(rgb[1] * (1 - amt)),
    clamp(rgb[2] * (1 - amt)),
  ];
}

/** Mix `c` toward white by `amt` (0..1). */
function lighten(rgb: number[], amt: number): RGB {
  return [
    clamp(rgb[0] + (255 - rgb[0]) * amt),
    clamp(rgb[1] + (255 - rgb[1]) * amt),
    clamp(rgb[2] + (255 - rgb[2]) * amt),
  ];
}

/** Saturation distance from grey — small values mean "almost grey". */
function saturation(rgb: number[]): number {
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  const min = Math.min(rgb[0], rgb[1], rgb[2]);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * Pick an accent that *pops* but does not overrule the mood base. We
 * prefer Vibrant, but if Vibrant is wildly more saturated than the
 * cover average (the rainbow-spectrum trap), fall back to a Muted /
 * DarkMuted swatch instead — these track the cover's real tone better.
 */
function pickAccent(palette: any, avgRgb: RGB): number[] | null {
  const candidates: number[][] = [
    palette?.Vibrant?.rgb,
    palette?.LightVibrant?.rgb,
    palette?.Muted?.rgb,
    palette?.DarkVibrant?.rgb,
    palette?.DarkMuted?.rgb,
    palette?.LightMuted?.rgb,
  ].filter(Boolean) as number[][];

  if (!candidates.length) return null;

  const avgSat = saturation(avgRgb);
  // If the cover is mostly desaturated (e.g. an inky black cover with
  // a colourful highlight), don't let a single saturated swatch hijack
  // the accent — prefer a swatch closer to the cover's actual feel.
  if (avgSat < 0.15) {
    const calm = candidates.find(c => saturation(c) < 0.5);
    if (calm) return calm;
  }
  return candidates[0];
}

function pickSecondary(palette: any): number[] | null {
  return (
    palette?.DarkVibrant?.rgb ||
    palette?.DarkMuted?.rgb ||
    palette?.Muted?.rgb ||
    null
  );
}

/**
 * Build 4 blob colours from the cover's *average* RGB. Each blob is a
 * subtle shift away from the base (slightly brighter, slightly cooler,
 * slightly warmer) so the mood layer has motion without trapping the
 * eye on a single Vibrant swatch.
 */
function buildBlobs(avgRgb: RGB, isLight: boolean): RGB[] {
  const base = avgRgb;
  // 4 sibling tones around the base mood.
  const a = lighten(base, isLight ? -0.05 : 0.08); // slightly punchier
  const b = darken(base, 0.10);                    // slightly deeper
  const c = lighten([base[0], base[2], base[1]], 0.04); // hue shuffle
  const d = darken([base[2], base[0], base[1]], 0.10);  // hue shuffle

  if (isLight) {
    // Light page — darken so the wash is visible on cream paper.
    return [darken(a, 0.25), darken(b, 0.20), darken(c, 0.15), darken(d, 0.20)];
  }
  // Dark page — gently lift so the wash glows without washing out the bg.
  return [darken(a, 0.30), darken(b, 0.40), darken(c, 0.35), darken(d, 0.45)];
}

function clearVars() {
  const root = document.documentElement;
  for (const prop of PROPS) root.style.removeProperty(prop);
}

export function useAlbumPalette(artworkUrl: string | null | undefined) {
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!artworkUrl) {
      lastUrlRef.current = null;
      clearVars();
      return;
    }

    // Normalize MusicKit template (`{w}x{h}`) to a small sample for speed.
    const sampleUrl = artworkUrl
      .replace('{w}', '128')
      .replace('{h}', '128')
      .replace('{f}', 'jpg');
    if (sampleUrl === lastUrlRef.current) return;
    lastUrlRef.current = sampleUrl;

    let cancelled = false;

    (async () => {
      try {
        const { Vibrant } = await import('node-vibrant/browser');
        const [palette, stats] = await Promise.all([
          Vibrant.from(sampleUrl).getPalette(),
          readImageStats(sampleUrl).catch(() => ({
            avgLuma: 128,
            avgRgb: [128, 128, 128] as RGB,
          })),
        ]);
        if (cancelled || lastUrlRef.current !== sampleUrl) return;

        const accent = pickAccent(palette, stats.avgRgb);
        const accent2 = pickSecondary(palette);
        if (!accent) return;

        // Apple-Music-style: dark cover → dark page, bright cover →
        // cream page. Threshold leans dark so moody covers don't flip.
        const isLight = stats.avgLuma > 140;

        const root = document.documentElement;
        if (isLight) {
          root.style.setProperty('--page', '245 240 232');
          root.style.setProperty('--ink', '30 20 10');
        } else {
          root.style.setProperty('--page', '11 9 6');
          root.style.setProperty('--ink', '216 207 191');
        }

        const blobs = buildBlobs(stats.avgRgb, isLight);
        root.style.setProperty('--accent', toRgbTuple(accent));
        if (accent2) root.style.setProperty('--accent-2', toRgbTuple(accent2));
        root.style.setProperty('--blob-a', toRgbTuple(blobs[0]));
        root.style.setProperty('--blob-b', toRgbTuple(blobs[1]));
        root.style.setProperty('--blob-c', toRgbTuple(blobs[2]));
        root.style.setProperty('--blob-d', toRgbTuple(blobs[3]));
        root.style.setProperty('--has-mood', '1');
      } catch (e) {
        console.warn('[useAlbumPalette] extract failed:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artworkUrl]);
}
