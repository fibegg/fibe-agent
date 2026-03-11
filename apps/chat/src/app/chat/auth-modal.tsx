import { useState } from 'react';
import type { AuthModalState } from './use-chat-websocket';

interface AuthModalProps {
  open: boolean;
  authModal: AuthModalState;
  onClose: () => void;
  onSubmitCode: (code: string) => void;
}

export function AuthModal({ open, authModal, onClose, onSubmitCode }: AuthModalProps) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const showUrl = authModal.authUrl && !authModal.isManualToken;
  const isDeviceCode = Boolean(authModal.deviceCode && !authModal.isManualToken);
  const codeLabel = authModal.isManualToken
    ? 'Paste Claude Code OAuth Token'
    : isDeviceCode
      ? 'One-time device code'
      : 'Paste authorization code';
  const codeValue = isDeviceCode ? (authModal.deviceCode ?? '') : code;
  const readOnly = isDeviceCode;
  const showSubmit = !isDeviceCode;

  const handleSubmit = () => {
    const value = codeValue.trim();
    if (!value && !readOnly) return;
    setSubmitting(true);
    onSubmitCode(value);
    setCode('');
    setSubmitting(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card/95 dark:bg-slate-900/95 backdrop-blur-xl border border-violet-500/20 rounded-2xl shadow-[0_0_40px_rgba(139,92,246,0.15)] overflow-hidden w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border/50 bg-gradient-to-br from-violet-500/5 to-transparent">
          <h3 className="text-base sm:text-lg font-semibold text-card-foreground flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <KeyIcon className="size-4 text-violet-400" />
            </span>
            Connect to Provider
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="size-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-violet-500/10 transition-colors"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="p-4 sm:p-5 space-y-4">
          {showUrl && (
            <div className="space-y-2">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Please follow the link below to authorize the AI assistant.
              </p>
              <a
                href={authModal.authUrl ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-sm font-medium shadow-lg shadow-violet-500/30 transition-opacity"
              >
                <ExternalIcon className="size-3.5" />
                Open Authentication URL
              </a>
            </div>
          )}
          {showUrl && (authModal.deviceCode || authModal.isManualToken) && (
            <div className="border-t border-border/50 pt-4" />
          )}
          <div className="space-y-2">
            <label htmlFor="auth-code" className="block text-xs sm:text-sm font-medium text-foreground">
              {codeLabel}
            </label>
            <input
              id="auth-code"
              type="text"
              value={codeValue}
              readOnly={readOnly}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste code here..."
              className="w-full px-3 py-2.5 rounded-xl bg-background/50 border border-border focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 text-foreground placeholder-muted-foreground outline-none transition-shadow"
            />
            {showSubmit && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-sm font-medium shadow-lg shadow-violet-500/20 disabled:opacity-50 transition-opacity"
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}
