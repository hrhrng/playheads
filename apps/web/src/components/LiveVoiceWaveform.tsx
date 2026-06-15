/**
 * LiveVoiceWaveform - filtered live microphone visualizer for dictation.
 *
 * Uses the recorder's MediaStream directly, analyzes the human voice band,
 * applies a noise gate plus attack/release smoothing, and renders to canvas
 * so the composer gets a stable waveform instead of jittery DOM bars.
 */

import { useEffect, useRef } from 'react';

interface LiveVoiceWaveformProps {
  mediaRecorder: MediaRecorder | null;
  active: boolean;
  processing?: boolean;
  className?: string;
}

const FFT_SIZE = 2048;
const MIN_DB = -88;
const MAX_DB = -12;
const ANALYSER_SMOOTHING = 0.86;
const NOISE_GATE = 0.07;

function parseRgbTriplet(value: string): [number, number, number] {
  const parts = value.trim().split(/\s+/).map((part) => Number.parseInt(part, 10));
  if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
    return [parts[0], parts[1], parts[2]];
  }
  return [216, 207, 191];
}

function rgba(rgb: [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function LiveVoiceWaveform({
  mediaRecorder,
  active,
  processing = false,
  className,
}: LiveVoiceWaveformProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelsRef = useRef<number[]>([]);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let raf = 0;
    let disposed = false;
    let audioContext: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let frequencyData: Uint8Array<ArrayBuffer> | null = null;

    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (active && mediaRecorder?.stream && AudioContextCtor) {
      try {
        audioContext = new AudioContextCtor();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.minDecibels = MIN_DB;
        analyser.maxDecibels = MAX_DB;
        analyser.smoothingTimeConstant = ANALYSER_SMOOTHING;
        source = audioContext.createMediaStreamSource(mediaRecorder.stream);
        source.connect(analyser);
        frequencyData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      } catch {
        audioContext = null;
        source = null;
        analyser = null;
        frequencyData = null;
      }
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width: rect.width, height: rect.height };
    };

    const readTargets = (count: number): number[] => {
      if (!analyser || !frequencyData || !audioContext) {
        if (!processing) return Array.from({ length: count }, () => 0);

        phaseRef.current += 0.11;
        return Array.from({ length: count }, (_, index) => {
          const wave = Math.sin(phaseRef.current + index * 0.38) * 0.5 + 0.5;
          return 0.08 + wave * 0.22;
        });
      }

      analyser.getByteFrequencyData(frequencyData);
      const binHz = audioContext.sampleRate / analyser.fftSize;
      const minBin = Math.max(2, Math.floor(90 / binHz));
      const maxBin = Math.min(frequencyData.length - 1, Math.ceil(4200 / binHz));
      const ratio = maxBin / minBin;

      return Array.from({ length: count }, (_, index) => {
        const start = Math.floor(minBin * Math.pow(ratio, index / count));
        const end = Math.max(start + 1, Math.floor(minBin * Math.pow(ratio, (index + 1) / count)));
        let sum = 0;
        let samples = 0;
        for (let bin = start; bin < Math.min(end, frequencyData.length); bin += 1) {
          sum += frequencyData[bin];
          samples += 1;
        }
        const raw = samples > 0 ? sum / samples / 255 : 0;
        if (raw < NOISE_GATE) return 0;
        return Math.min(1, Math.pow((raw - NOISE_GATE) / (1 - NOISE_GATE), 0.58) * 1.35);
      });
    };

    const draw = () => {
      if (disposed) return;

      const { width, height } = resize();
      const styles = getComputedStyle(document.documentElement);
      const ink = parseRgbTriplet(styles.getPropertyValue('--ink'));
      const barWidth = width < 380 ? 2 : 3;
      const gap = width < 380 ? 2 : 2.5;
      const count = Math.max(28, Math.floor(width / (barWidth + gap)));
      const totalWidth = count * barWidth + (count - 1) * gap;
      const startX = (width - totalWidth) / 2;
      const midY = height / 2;
      const radius = barWidth / 2;

      if (levelsRef.current.length !== count) {
        levelsRef.current = Array.from({ length: count }, () => 0);
      }

      const targets = readTargets(count);
      const levels = levelsRef.current;
      for (let i = 0; i < count; i += 1) {
        const target = targets[i] ?? 0;
        const coefficient = target > levels[i] ? 0.42 : 0.14;
        levels[i] += (target - levels[i]) * coefficient;
      }

      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < count; i += 1) {
        const level = levels[i];
        const h = Math.max(2, level * (height - 4));
        const x = startX + i * (barWidth + gap);
        const y = midY - h / 2;
        ctx.fillStyle = rgba(ink, level > 0.015 ? 0.98 : 0.28);
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, h, radius);
        ctx.fill();
      }

      raf = window.requestAnimationFrame(draw);
    };

    draw();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(raf);
      source?.disconnect();
      void audioContext?.close().catch(() => undefined);
    };
  }, [active, mediaRecorder, processing]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden
    />
  );
}
