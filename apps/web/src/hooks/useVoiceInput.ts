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
  /** Current recorder, exposed for live waveform visualization. */
  mediaRecorder: MediaRecorder | null;
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
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startingRef = useRef(false);
  const pendingStopRef = useRef<'stop' | 'cancel' | null>(null);
  // Flag flipped by cancelHold so the onstop handler knows to discard
  // instead of upload. Holds across the async stop → ondataavailable →
  // onstop chain that we can't await directly.
  const cancelledRef = useRef(false);

  // Clean up if the component unmounts mid-recording — don't leave the
  // browser's mic indicator on.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setMediaRecorder(null);
      startingRef.current = false;
      pendingStopRef.current = null;
    };
  }, []);

  const stopRecorder = useCallback((mode: 'stop' | 'cancel') => {
    const rec = recorderRef.current;
    if (!rec) {
      pendingStopRef.current = mode;
      setIsRecording(false);
      return;
    }

    pendingStopRef.current = null;
    cancelledRef.current = mode === 'cancel';
    setIsRecording(false);
    if (rec.state === 'recording') {
      rec.stop(); // triggers onstop → upload or discard
    }
  }, []);

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
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        pendingStopRef.current = null;
        startingRef.current = false;
        setIsRecording(false);
        return;
      }

      const mime = pickMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      setMediaRecorder(recorder);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const recordedMime = recorder.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: recordedMime });
        // Always release the mic before the network call — otherwise the
        // OS indicator stays red while we wait for the transcript.
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setMediaRecorder(null);
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
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setMediaRecorder(null);
      startingRef.current = false;
      pendingStopRef.current = null;
      setIsRecording(false);
    }
  }, [lang, onTranscript, onError, stopRecorder]);

  const endHold = useCallback(() => {
    stopRecorder('stop');
  }, [stopRecorder]);

  const cancelHold = useCallback(() => {
    stopRecorder('cancel');
  }, [stopRecorder]);

  return { isRecording, isTranscribing, mediaRecorder, startHold, endHold, cancelHold };
}
