/**
 * Tests for click-to-dictate voice input.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceInput } from '../useVoiceInput';

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static isTypeSupported = vi.fn(() => true);

  state: RecordingState = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void | Promise<void>) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? 'audio/webm';
    MockMediaRecorder.instances.push(this);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) });
    void this.onstop?.();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.restoreAllMocks();
  MockMediaRecorder.instances = [];
  MockMediaRecorder.isTypeSupported.mockReturnValue(true);
  vi.stubGlobal('MediaRecorder', MockMediaRecorder);
});

describe('useVoiceInput', () => {
  it('honors stop while microphone permission is still resolving', async () => {
    const streamReady = deferred<MediaStream>();
    const stopTrack = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn(() => streamReady.promise);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'hello world' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      useVoiceInput({
        lang: 'en',
        onTranscript,
      }),
    );

    await act(async () => {
      const start = result.current.startHold();
      result.current.endHold();
      streamReady.resolve(stream);
      await start;
    });

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('hello world'));
    expect(MockMediaRecorder.instances[0]?.state).toBe('inactive');
    expect(stopTrack).toHaveBeenCalled();
  });
});
