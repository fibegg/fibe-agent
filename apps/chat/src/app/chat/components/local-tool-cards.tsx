/**
 * Local MCP tool UI components
 *
 * QuestionCard   — inline input card for ask_user_prompt events
 * ConfirmCard    — yes/no confirmation card for confirm_action_prompt events
 * ShowImageCard  — inline image display for show_image events
 * NotifyToast    — transient toast notification for notify events
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, MessageSquare, AlertTriangle, X } from 'lucide-react';

// ─── QuestionCard ─────────────────────────────────────────────────────────────

export interface QuestionCardProps {
  questionId: string;
  question: string;
  placeholder?: string;
  onAnswer: (questionId: string, answer: string) => void;
}

export function QuestionCard({ questionId, question, placeholder, onAnswer }: QuestionCardProps) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    if (!answer.trim() || submitted) return;
    setSubmitted(true);
    onAnswer(questionId, answer.trim());
  }, [answer, questionId, onAnswer, submitted]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div
      className="my-3 flex gap-2 sm:gap-3"
      role="region"
      aria-label="Agent question"
      id={`question-card-${questionId}`}
    >
      <div className="flex-shrink-0 flex items-start">
        <div className="flex size-7 sm:size-8 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 shadow-sm shadow-amber-500/10">
          <MessageSquare className="size-3.5 sm:size-4" aria-hidden />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="rounded-2xl rounded-tl-sm border border-amber-500/30 bg-amber-500/8 px-4 py-3 shadow-sm">
          <p className="text-sm font-medium text-amber-200 mb-2 leading-snug whitespace-pre-wrap">{question}</p>
          {submitted ? (
            <p className="text-xs text-muted-foreground italic flex items-center gap-1">
              <Check className="size-3" aria-hidden />
              Submitted
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                ref={inputRef}
                id={`question-input-${questionId}`}
                className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40 resize-none"
                placeholder={placeholder ?? 'Type your answer…'}
                rows={2}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Your answer"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!answer.trim()}
                className="self-end rounded-lg px-4 py-1.5 text-sm font-medium bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400"
                aria-label="Submit answer"
              >
                Submit
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ConfirmCard ──────────────────────────────────────────────────────────────

export interface ConfirmCardProps {
  questionId: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (questionId: string, confirmed: boolean) => void;
}

export function ConfirmCard({
  questionId,
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  onConfirm,
}: ConfirmCardProps) {
  const [decided, setDecided] = useState<boolean | null>(null);

  const decide = useCallback(
    (confirmed: boolean) => {
      if (decided !== null) return;
      setDecided(confirmed);
      onConfirm(questionId, confirmed);
    },
    [decided, questionId, onConfirm],
  );

  return (
    <div
      className="my-3 flex gap-2 sm:gap-3"
      role="region"
      aria-label="Agent confirmation"
      id={`confirm-card-${questionId}`}
    >
      <div className="flex-shrink-0 flex items-start">
        <div className="flex size-7 sm:size-8 items-center justify-center rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 shadow-sm shadow-rose-500/10">
          <AlertTriangle className="size-3.5 sm:size-4" aria-hidden />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="rounded-2xl rounded-tl-sm border border-rose-500/30 bg-rose-500/8 px-4 py-3 shadow-sm">
          <p className="text-sm font-medium text-rose-200 mb-3 leading-snug whitespace-pre-wrap">{message}</p>
          {decided !== null ? (
            <p className="text-xs text-muted-foreground italic flex items-center gap-1">
              <Check className="size-3" aria-hidden />
              {decided ? confirmLabel : cancelLabel}
            </p>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => decide(true)}
                className="rounded-lg px-4 py-1.5 text-sm font-medium bg-rose-500 text-white hover:bg-rose-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-400"
                aria-label={confirmLabel}
              >
                {confirmLabel}
              </button>
              <button
                type="button"
                onClick={() => decide(false)}
                className="rounded-lg px-4 py-1.5 text-sm font-medium border border-border bg-background/60 text-foreground hover:bg-muted/60 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                aria-label={cancelLabel}
              >
                {cancelLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ShowImageCard ────────────────────────────────────────────────────────────

export interface ShowImageCardProps {
  url?: string | null;
  base64?: string | null;
  mimeType?: string;
  caption?: string;
}

export function ShowImageCard({ url, base64, mimeType = 'image/png', caption }: ShowImageCardProps) {
  const src = url ?? (base64 ? `data:${mimeType};base64,${base64}` : null);
  if (!src) return null;

  return (
    <div className="my-3 flex gap-2 sm:gap-3">
      <div className="flex-shrink-0 size-7 sm:size-8" aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="rounded-2xl rounded-tl-sm border border-border bg-background/40 px-4 py-3 inline-flex flex-col gap-2 max-w-sm">
          <img
            src={src}
            alt={caption ?? 'Agent image'}
            className="max-w-full max-h-72 rounded-lg object-contain bg-black/10"
            loading="lazy"
          />
          {caption && (
            <p className="text-xs text-muted-foreground leading-snug">{caption}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── NotifyToast ──────────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<string, string> = {
  info: 'bg-sky-500/15 border-sky-500/40 text-sky-300',
  success: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  warning: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
  error: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
};

export interface NotifyToastProps {
  id: string;
  message: string;
  level?: string;
  onDismiss: (id: string) => void;
}

export function NotifyToast({ id, message, level = 'info', onDismiss }: NotifyToastProps) {
  const style = LEVEL_STYLES[level] ?? LEVEL_STYLES['info'];

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), 6000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2 fade-in duration-200 ${style}`}
      id={`notify-toast-${id}`}
    >
      <span className="flex-1 min-w-0 leading-snug">{message}</span>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
        aria-label="Dismiss notification"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

// ─── Toast container ──────────────────────────────────────────────────────────

export interface ToastItem {
  id: string;
  message: string;
  level: string;
}

export interface NotifyToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function NotifyToastContainer({ toasts, onDismiss }: NotifyToastContainerProps) {
  if (!toasts.length) return null;

  return (
    <div
      className="fixed bottom-24 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <NotifyToast
          key={t.id}
          id={t.id}
          message={t.message}
          level={t.level}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}
