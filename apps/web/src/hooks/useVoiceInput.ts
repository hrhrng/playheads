/**
 * useVoiceInput — click-to-dictate mic that uploads to `/api/transcribe`.
 *
 * UX: click the mic button → start recording (MediaRecorder).
 * click stop → POST the blob + current i18n lang to the gateway,
 * await the transcript, and hand it back via `onTranscript`. The caller
 * decides what to do with the text (append to textarea, replace, etc.).
 *
 * Provider routing happens server-side: zh* goes to Fish Audio, other
 * languages go to ElevenLabs Scribe v1 through the AI Gateway. This hook
 * just passes `lang` along.
 *
 * Mime negotiation: MediaRecorder picks the best codec the browser
 * supports — Chrome → audio/webm;codecs=opus, Safari → audio/mp4 (AAC),
 * Firefox → audio/ogg;codecs=opus. Both Fish and ElevenLabs accept all
 * three formats, so we don't transcode.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const WAVEFORM_BAR_COUNT = 48;
const EMPTY_AUDIO_LEVELS = Array.from({ length: WAVEFORM_BAR_COUNT }, () => 0);

export interface UseVoiceInputOptions {
  /** BCP-47 tag from i18n (e.g. "zh", "en", "ja"). Server routes on this. */
  lang: string;
  /** Called with the final transcript string after upload succeeds. */
  onTranscript: (text: string) => void;
  /** Called when transcription fails — surface to the user as a toast/inline error. */
  onError?: (message: string) => void;
}

export interface UseVoiceInputReturn {
  /** True while dictation is active. */
  isRecording: boolean;
  /** True while the upload/transcribe round-trip is in flight. */
  isTranscribing: boolean;
  /** Live microphone levels, normalized 0..1 for waveform rendering. */
  audioLevels: number[];
  /** Start dictation. */
  startHold: () => Promise<void>;
  /** Stop dictation and upload for transcription. */
  endHold: () => void;
  /** Abort dictation without transcribing. */
  cancelHold: () => void;
}

// Picks the first MIME the browser will actually record. Order is biased
// toward opus (better quality/size at speech bitrates) then falls back to
// whatever the browser will give us. The empty string passes through to
// MediaRecorder defaults.
function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function extFor(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('mpeg')) return 'mp3';
  return 'webm';
}

export function useVoiceInput({
  lang,
  onTranscript,
  onError,
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>(EMPTY_AUDIO_LEVELS);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startingRef = useRef(false);
  const pendingStopRef = useRef<'stop' | 'cancel' | null>(null);
  // Flag flipped by cancelHold so the onstop handler knows to discard
  // instead of upload. Holds across the async stop → ondataavailable →
  // onstop chain that we can't await directly.
  const cancelledRef = useRef(false);

  const stopAudioMeter = useCallback(() => {
    if (audioFrameRef.current !== null) {
      window.cancelAnimationFrame(audioFrameRef.current);
      audioFrameRef.current = null;
    }
    audioSourceRef.current?.disconnect();
    audioSourceRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    void audioContext?.close().catch(() => undefined);
    setAudioLevels(EMPTY_AUDIO_LEVELS);
  }, []);

  const startAudioMeter = useCallback((stream: MediaStream) => {
    stopAudioMeter();

    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.68;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      audioSourceRef.current = source;

      const samples = new Uint8Array(analyser.fftSize);
      const samplesPerBar = Math.floor(samples.length / WAVEFORM_BAR_COUNT);

      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        const next = Array.from({ length: WAVEFORM_BAR_COUNT }, (_, barIndex) => {
          let sum = 0;
          const start = barIndex * samplesPerBar;
          const end = start + samplesPerBar;
          for (let i = start; i < end; i += 1) {
            const centered = (samples[i] - 128) / 128;
            sum += centered * centered;
          }
          const rms = Math.sqrt(sum / samplesPerBar);
          return Math.min(1, Math.pow(rms * 3.2, 0.72));
        });
        setAudioLevels(next);
        audioFrameRef.current = window.requestAnimationFrame(tick);
      };

      tick();
    } catch {
      setAudioLevels(EMPTY_AUDIO_LEVELS);
    }
  }, [stopAudioMeter]);

  // Clean up if the component unmounts mid-recording — don't leave the
  // browser's mic indicator on.
  useEffect(() => {
    return () => {
      stopAudioMeter();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      startingRef.current = false;
      pendingStopRef.current = null;
    };
  }, [stopAudioMeter]);

  const stopRecorder = useCallback((mode: 'stop' | 'cancel') => {
    const rec = recorderRef.current;
    if (!rec) {
      pendingStopRef.current = mode;
      setIsRecording(false);
      stopAudioMeter();
      return;
    }

    pendingStopRef.current = null;
    cancelledRef.current = mode === 'cancel';
    setIsRecording(false);
    if (rec.state === 'recording') {
      rec.stop(); // triggers onstop → upload or discard
    }
  }, [stopAudioMeter]);

  const startHold = useCallback(async () => {
    if (recorderRef.current || startingRef.current) return; // already recording, ignore re-entry
    startingRef.current = true;
    pendingStopRef.current = null;
    cancelledRef.current = false;
    chunksRef.current = [];
    setIsRecording(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      if (pendingStopRef.current === 'cancel') {
        stopAudioMeter();
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        pendingStopRef.current = null;
        startingRef.current = false;
        setIsRecording(false);
        return;
      }

      startAudioMeter(stream);

      const mime = pickMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const recordedMime = recorder.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: recordedMime });
        // Always release the mic before the network call — otherwise the
        // OS indicator stays red while we wait for the transcript.
        stopAudioMeter();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];

        if (cancelledRef.current || blob.size === 0) return;

        setIsTranscribing(true);
        try {
          const fd = new FormData();
          fd.set('audio', blob, `recording.${extFor(recordedMime)}`);
          fd.set('lang', lang);

          const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
          if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`transcribe ${res.status}: ${detail.slice(0, 200)}`);
          }
          const json = (await res.json()) as { text?: string; error?: string };
          if (json.error) throw new Error(json.error);
          const text = (json.text || '').trim();
          if (text) onTranscript(text);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[useVoiceInput] transcribe failed', msg);
          onError?.(msg);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      startingRef.current = false;
      if (pendingStopRef.current) {
        stopRecorder(pendingStopRef.current);
      }
    } catch (err) {
      // getUserMedia rejection (denied permission, no device, http-not-localhost, etc.)
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[useVoiceInput] start failed', msg);
      onError?.(msg);
      stopAudioMeter();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      startingRef.current = false;
      pendingStopRef.current = null;
      setIsRecording(false);
    }
  }, [lang, onTranscript, onError, startAudioMeter, stopAudioMeter, stopRecorder]);

  const endHold = useCallback(() => {
    stopRecorder('stop');
  }, [stopRecorder]);

  const cancelHold = useCallback(() => {
    stopRecorder('cancel');
  }, [stopRecorder]);

  return { isRecording, isTranscribing, audioLevels, startHold, endHold, cancelHold };
}
