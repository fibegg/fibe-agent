import { useState } from 'react';
import type { AuthModalState } from './use-chat-websocket';
import {
  BUTTON_ICON_MUTED,
  BUTTON_PRIMARY_ROUNDED,
  INPUT_ROUNDED,
  MODAL_OVERLAY_CENTER,
} from '../ui-classes';

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
    <div className={MODAL_OVERLAY_CENTER} onClick={onClose}>
      <div
        className="border border-border rounded-2xl shadow-card overflow-hidden w-full max-w-lg"
        style={{ backgroundColor: 'var(--card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-subtle bg-gradient-to-br from-violet-500/5 to-transparent">
          <h3 className="text-base sm:text-lg font-semibold text-card-foreground flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <KeyIcon className="size-4 text-violet-400" />
            </span>
            Connect to Provider
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={`${BUTTON_ICON_MUTED} size-8`}
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
                className={`${BUTTON_PRIMARY_ROUNDED} inline-flex`}
              >
                <ExternalIcon className="size-3.5" />
                Open Authentication URL
              </a>
            </div>
          )}
          {showUrl && (authModal.deviceCode || authModal.isManualToken) && (
            <div className="border-t border-border-subtle pt-4" />
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
              className={INPUT_ROUNDED}
            />
            {showSubmit && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className={`${BUTTON_PRIMARY_ROUNDED} w-full shadow-violet-500/20 disabled:opacity-50`}
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
