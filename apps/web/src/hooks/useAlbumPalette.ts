/**
 * useAlbumPalette — extracts a palette from a track's artwork and pipes it
 * into CSS custom properties on `<html>`. Drives the mood-aware accent +
 * background blobs that mirror iOS BlurredMoodBackground.
 *
 * Strategy:
 * - Vibrant.from(url).getPalette() → swatches keyed by Vibrant / DarkMuted / …
 * - Pick a contrast-safe `--accent` (Vibrant fallback chain) and 4 darker
 *   blob colours for the radial-gradient bg.
 * - Apply via documentElement.style so a single CSS transition on body
 *   handles the fade between tracks.
 * - When `artworkUrl` is null/empty we reset the props, so the neutral
 *   empty-state look comes back automatically.
 *
 * The 25 MB Vibrant chunk is dynamic-imported so the empty/idle UI never
 * pays for it.
 */
import { useEffect, useRef } from 'react';

type RGB = [number, number, number];

const PROPS = [
  '--page', '--ink',
  '--accent', '--accent-2',
  '--blob-a', '--blob-b', '--blob-c', '--blob-d',
  '--has-mood',
] as const;

/** Perceived luminance (Rec. 601). 0..255. */
function luma(rgb: number[]): number {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

/** Pick the swatch with the highest pixel population — represents the
 * dominant tone of the cover and is what Apple Music keys its
 * light/dark backdrop off. */
function pickDominant(palette: any): number[] | null {
  const swatches = Object.values(palette).filter(Boolean) as { rgb: number[]; population: number }[];
  if (!swatches.length) return null;
  swatches.sort((a, b) => b.population - a.population);
  return swatches[0].rgb;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toRgbTuple(rgb: number[]): string {
  return `${clamp(rgb[0])} ${clamp(rgb[1])} ${clamp(rgb[2])}`;
}

/** Mix `c` toward black by `amt` (0..1). Used to deepen swatches into blob bg. */
function darken(rgb: number[], amt: number): RGB {
  return [
    clamp(rgb[0] * (1 - amt)),
    clamp(rgb[1] * (1 - amt)),
    clamp(rgb[2] * (1 - amt)),
  ];
}

/** Mix `c` toward white by `amt` (0..1). Used for the light-mode blob halo. */
function lighten(rgb: number[], amt: number): RGB {
  return [
    clamp(rgb[0] + (255 - rgb[0]) * amt),
    clamp(rgb[1] + (255 - rgb[1]) * amt),
    clamp(rgb[2] + (255 - rgb[2]) * amt),
  ];
}

/**
 * Sub-pick the best accent: prefer Vibrant, fall back through LightVibrant /
 * Muted / DarkVibrant. iOS uses c1 (brightest mood colour) for accents — this
 * mirrors that priority order.
 */
function pickAccent(palette: any): number[] | null {
  return (
    palette?.Vibrant?.rgb ||
    palette?.LightVibrant?.rgb ||
    palette?.Muted?.rgb ||
    palette?.DarkVibrant?.rgb ||
    null
  );
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
 * Build 4 blob colours from the palette.
 *
 * Dark page → lighten the swatches a touch so they read as a coloured
 * halo on the deep brown surface.
 * Light page → darken the swatches significantly so they show up as a
 * tinted wash on the cream paper instead of disappearing into white.
 */
function buildBlobs(palette: any, isLight: boolean): RGB[] {
  const accent = palette?.Vibrant?.rgb || palette?.LightVibrant?.rgb || [60, 40, 30];
  const muted = palette?.Muted?.rgb || palette?.LightMuted?.rgb || accent;
  const dark = palette?.DarkMuted?.rgb || palette?.DarkVibrant?.rgb || accent;
  const base = palette?.DarkVibrant?.rgb || palette?.DarkMuted?.rgb || accent;

  if (isLight) {
    return [
      darken(accent, 0.30),
      darken(muted, 0.25),
      darken(dark, 0.10),
      darken(base, 0.20),
    ];
  }
  // Dark page — keep swatches saturated, lighten gently so the glow reads.
  return [
    lighten(darken(accent, 0.35), 0.05),
    lighten(darken(muted, 0.30), 0.05),
    darken(dark, 0.20),
    darken(base, 0.35),
  ];
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
        const palette = await Vibrant.from(sampleUrl).getPalette();
        if (cancelled || lastUrlRef.current !== sampleUrl) return;

        const accent = pickAccent(palette);
        const accent2 = pickSecondary(palette);
        if (!accent) return;

        // Apple Music keys its Now Playing backdrop off the cover's
        // dominant luminance: dark covers → black-grey wash, bright
        // covers → white-grey wash. Mirror that here so the page surface
        // flips between iOS pageBg (#0B0906) and a warm cream paper.
        const dominant = pickDominant(palette) || accent;
        const isLight = luma(dominant) > 150;

        const root = document.documentElement;
        if (isLight) {
          // Light-mode page: warm cream paper + dark ink. Blobs use
          // *darkened* swatches so they read on the lighter surface
          // instead of washing it white.
          root.style.setProperty('--page', '245 240 232');
          root.style.setProperty('--ink', '30 20 10');
        } else {
          // Dark-mode page: iOS pageBg + pageInk. Blobs use lightly
          // *lightened* swatches so they glow on the dark surface.
          root.style.setProperty('--page', '11 9 6');
          root.style.setProperty('--ink', '216 207 191');
        }

        const blobs = buildBlobs(palette, isLight);
        root.style.setProperty('--accent', toRgbTuple(accent));
        if (accent2) root.style.setProperty('--accent-2', toRgbTuple(accent2));
        root.style.setProperty('--blob-a', toRgbTuple(blobs[0]));
        root.style.setProperty('--blob-b', toRgbTuple(blobs[1]));
        root.style.setProperty('--blob-c', toRgbTuple(blobs[2]));
        root.style.setProperty('--blob-d', toRgbTuple(blobs[3]));
        root.style.setProperty('--has-mood', '1');
      } catch (e) {
        // Cross-origin or decode failure — Apple Music artwork should be
        // CORS-friendly, but if not we silently fall back to the neutral
        // empty-state colours. Logging once for debugging.
        console.warn('[useAlbumPalette] extract failed:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artworkUrl]);
}
