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

const PROPS = ['--accent', '--accent-2', '--blob-a', '--blob-b', '--blob-c', '--blob-d', '--has-mood'] as const;

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
 * Build 4 blob colours from the palette. Each cluster gets darkened so the
 * page surface stays calmer than the album cover itself (the blobs sit
 * behind glass chrome).
 */
function buildBlobs(palette: any): RGB[] {
  const base =
    palette?.DarkVibrant?.rgb ||
    palette?.DarkMuted?.rgb ||
    palette?.Vibrant?.rgb || [60, 40, 30];
  const accent = palette?.Vibrant?.rgb || palette?.LightVibrant?.rgb || base;
  const muted = palette?.Muted?.rgb || palette?.DarkMuted?.rgb || base;
  const dark = palette?.DarkMuted?.rgb || palette?.DarkVibrant?.rgb || base;
  return [
    darken(accent, 0.55),
    darken(muted, 0.45),
    darken(dark, 0.35),
    darken(base, 0.50),
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

        const blobs = buildBlobs(palette);
        const root = document.documentElement;
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
