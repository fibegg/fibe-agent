import { useCallback, useRef, useState } from 'react';

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionResultEvent) => void) | null;
}

interface SpeechRecognitionResultEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

const getSpeechRecognitionCtor = () =>
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

export interface VoiceRecorderResult {
  blob: Blob;
  transcript: string;
}

export interface UseVoiceRecorderReturn {
  isRecording: boolean;
  recordingTimeSec: number;
  liveText: string;
  error: string | null;
  isSupported: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<VoiceRecorderResult | null>;
}

function getSupportedMimeType(): string {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTimeSec, setRecordingTimeSec] = useState(0);
  const [liveText, setLiveText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const transcriptRef = useRef<string[]>([]);

  const isSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const startRecording = useCallback(async () => {
    setError(null);
    setRecordingTimeSec(0);
    setLiveText('');
    transcriptRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(100);

      const SpeechRecognitionCtor = getSpeechRecognitionCtor();
      if (SpeechRecognitionCtor) {
        const recognition = new SpeechRecognitionCtor() as SpeechRecognitionInstance;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-US';
        recognition.onresult = (e: SpeechRecognitionResultEvent) => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; ++i) {
            if (e.results[i].isFinal) {
              const finalPiece = e.results[i][0].transcript.trim();
              if (finalPiece.length > 0) {
                transcriptRef.current.push(finalPiece);
              }
            } else {
              interim += e.results[i][0].transcript;
            }
          }
          const currentFinal = transcriptRef.current.filter(Boolean).join(' ');
          setLiveText((currentFinal + ' ' + interim).trim());
        };
        recognition.start();
        recognitionRef.current = recognition;
      }

      const RECORDING_TICK_MS = 1000;
      timerRef.current = setInterval(() => {
        setRecordingTimeSec((s) => s + 1);
      }, RECORDING_TICK_MS);

      setIsRecording(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const stopRecording = useCallback((): Promise<VoiceRecorderResult | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      const stream = streamRef.current;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      }

      stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        setIsRecording(false);
        setRecordingTimeSec(0);
        resolve(null);
        return;
      }

      mediaRecorder.onstop = () => {
        mediaRecorderRef.current = null;
        setIsRecording(false);
        setRecordingTimeSec(0);
        setLiveText('');

        const transcript = transcriptRef.current.filter(Boolean).join(' ').trim();
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type: chunksRef.current[0].type || 'audio/webm' })
            : new Blob([], { type: 'audio/webm' });

        resolve({ blob, transcript });
      };

      mediaRecorder.stop();
    });
  }, []);

  return {
    isRecording,
    recordingTimeSec,
    liveText,
    error,
    isSupported: !!isSupported,
    startRecording,
    stopRecording,
  };
}
