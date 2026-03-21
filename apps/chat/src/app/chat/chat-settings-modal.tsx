import { useEffect, useState } from 'react';
import { Key, Loader2, LogOut, X } from 'lucide-react';
import { apiRequest } from '../api-url';
import { API_PATHS } from '@shared/api-paths';
import { ThemeToggle } from '../theme-toggle';
import { CHAT_STATES } from './chat-state';
import type { ChatState } from './chat-state';
import { shouldHideThemeSwitch } from '../embed-config';
import {
  BUTTON_DESTRUCTIVE_GHOST,
  BUTTON_OUTLINE_ACCENT,
  MODAL_CARD,
  MODAL_OVERLAY_DARK,
  SETTINGS_CLOSE_BUTTON,
} from '../ui-classes';

interface InitStatusResponse {
  state: 'disabled' | 'pending' | 'running' | 'done' | 'failed';
  output?: string;
  error?: string;
  finishedAt?: string;
  systemPrompt?: string;
}

export interface ChatSettingsModalProps {
  open: boolean;
  onClose: () => void;
  state: ChatState;
  onStartAuth: () => void;
  onReauthenticate: () => void;
  onLogout: () => void;
}

export function ChatSettingsModal({
  open,
  onClose,
  state,
  onStartAuth,
  onReauthenticate,
  onLogout,
}: ChatSettingsModalProps) {
  const [initStatus, setInitStatus] = useState<InitStatusResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiRequest(API_PATHS.INIT_STATUS)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: InitStatusResponse | null) => {
        if (!cancelled && data) setInitStatus(data);
      })
      .catch(() => {
        if (!cancelled) setInitStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const handleAuthClick = () => {
    onClose();
    state === CHAT_STATES.UNAUTHENTICATED ? onStartAuth() : onReauthenticate();
  };

  const handleLogoutClick = () => {
    onClose();
    onLogout();
  };

  return (
    <>
      <div className={MODAL_OVERLAY_DARK} aria-hidden onClick={onClose} />
      <div
        className={`fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 ${MODAL_CARD}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <h2 id="settings-dialog-title" className="text-lg font-semibold text-foreground">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={SETTINGS_CLOSE_BUTTON}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {!shouldHideThemeSwitch() && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-foreground">Dark mode</span>
              <ThemeToggle />
            </div>
          )}
          {(state === CHAT_STATES.UNAUTHENTICATED || state === CHAT_STATES.AUTHENTICATED) && (
            <button
              type="button"
              onClick={handleAuthClick}
              className={BUTTON_OUTLINE_ACCENT}
            >
              <Key className="size-4" />
              {state === CHAT_STATES.UNAUTHENTICATED ? 'Start Auth' : 'Re-authenticate'}
            </button>
          )}
          {(state === CHAT_STATES.AUTHENTICATED || state === CHAT_STATES.AWAITING_RESPONSE) && (
            <button
              type="button"
              onClick={handleLogoutClick}
              className={BUTTON_DESTRUCTIVE_GHOST}
            >
              <LogOut className="size-4" />
              Logout
            </button>
          )}
          {initStatus && (
            <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-foreground">Post-init script</span>
                {initStatus.state === 'running' && (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                )}
                <span className="text-muted-foreground">
                  {initStatus.state === 'disabled' && 'Not configured'}
                  {initStatus.state === 'pending' && 'Pending'}
                  {initStatus.state === 'running' && 'Running…'}
                  {initStatus.state === 'done' && 'Done'}
                  {initStatus.state === 'failed' && 'Failed'}
                </span>
              </div>
              {(initStatus.error || (initStatus.output && initStatus.output.trim())) && (
                <pre className="mt-2 max-h-24 overflow-auto break-all rounded bg-background/50 p-2 text-xs text-muted-foreground">
                  {initStatus.error}
                  {initStatus.error && initStatus.output?.trim() ? '\n\n' : ''}
                  {initStatus.output?.trim()}
                </pre>
              )}
            </div>
          )}
          {initStatus && (
            <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="font-medium text-foreground">SYSTEM_PROMPT</span>
                {!initStatus.systemPrompt && (
                  <span className="text-muted-foreground">Not configured</span>
                )}
              </div>
              {initStatus.systemPrompt && (
                <pre className="mt-2 max-h-24 overflow-auto break-words rounded bg-background/50 p-2 text-xs text-muted-foreground whitespace-pre-wrap">
                  {initStatus.systemPrompt}
                </pre>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground pt-2">v{__APP_VERSION__}</p>
        </div>
      </div>
    </>
  );
}
