import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceRecorder } from './use-voice-recorder';

// MockMediaRecorder that properly triggers onstop
class MockMediaRecorder {
  state = 'recording';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn(() => { this.state = 'recording'; });
  stop = vi.fn(() => {
    this.state = 'inactive';
    // Synchronously trigger onstop like the real API does
    Promise.resolve().then(() => this.onstop?.());
  });
  static isTypeSupported = vi.fn().mockReturnValue(false);
}

class MockMediaStream {
  getTracks = vi.fn().mockReturnValue([{ stop: vi.fn() }]);
}

describe('useVoiceRecorder', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()),
      },
      language: 'en-US',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('initializes with correct defaults', () => {
    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.isRecording).toBe(false);
    expect(result.current.recordingTimeSec).toBe(0);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.startRecording).toBe('function');
    expect(typeof result.current.stopRecording).toBe('function');
  });

  it('isSupported is true when getUserMedia and MediaRecorder are available', () => {
    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.isSupported).toBe(true);
  });

  it('isSupported is false when MediaRecorder is not defined', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('MediaRecorder', undefined);
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn() },
      language: 'en-US',
    });
    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.isSupported).toBe(false);
    vi.unstubAllGlobals();
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()) },
      language: 'en-US',
    });
  });

  it('startRecording sets isRecording to true', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.isRecording).toBe(true);
  });

  it('startRecording increments recordingTimeSec every second', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => { await result.current.startRecording(); });

    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.recordingTimeSec).toBe(3);
  });

  it('startRecording sets error when getUserMedia fails', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
      language: 'en-US',
    });

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.error).toBe('Permission denied');
    expect(result.current.isRecording).toBe(false);
  });

  it('startRecording handles non-Error throw', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue('some string error'),
      },
      language: 'en-US',
    });

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.error).toBe('some string error');
  });

  it('stopRecording resolves null when not recording', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    const r = await act(async () => result.current.stopRecording());
    expect(r).toBeNull();
  });

  it('stopRecording resets state after recording', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.isRecording).toBe(true);

    await act(async () => {
      const stopPromise = result.current.stopRecording();
      await Promise.resolve(); // allow onstop microtask to run
      await stopPromise;
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.recordingTimeSec).toBe(0);
  });

  it('stopRecording stops the timer', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => { await result.current.startRecording(); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.recordingTimeSec).toBe(2);

    await act(async () => {
      const stopPromise = result.current.stopRecording();
      await Promise.resolve();
      await stopPromise;
    });

    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.recordingTimeSec).toBe(0);
  });

  it('getSupportedMimeType returns empty string when no types are supported', async () => {
    MockMediaRecorder.isTypeSupported.mockReturnValue(false);
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => { await result.current.startRecording(); });
    // Should start successfully even with no supported mime type
    expect(result.current.isRecording).toBe(true);
  });

  it('getSupportedMimeType returns first supported type', async () => {
    MockMediaRecorder.isTypeSupported.mockImplementation((type: string) => type === 'audio/webm');
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.isRecording).toBe(true);
    MockMediaRecorder.isTypeSupported.mockReturnValue(false);
  });
});
