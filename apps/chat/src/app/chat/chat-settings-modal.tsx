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
import { ActivityTypeFilters } from '../activity-review-panel';
import { usePersistedTypeFilter } from '../use-persisted-type-filter';

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
  const [typeFilter, setTypeFilter] = usePersistedTypeFilter();

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
        className={`fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 ${MODAL_CARD} max-h-[85vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
          <h2 id="settings-dialog-title" className="text-base font-semibold text-foreground tracking-[-0.01em]">
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
        <div className="px-5 py-4 space-y-4 overflow-y-auto min-h-0">
          {!shouldHideThemeSwitch() && (
            <div className="flex items-center justify-between py-1">
              <span className="text-sm font-medium text-foreground">Dark mode</span>
              <ThemeToggle />
            </div>
          )}
          <div className="space-y-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity Filter</span>
            <ActivityTypeFilters
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
            />
          </div>
          {(state === CHAT_STATES.UNAUTHENTICATED || state === CHAT_STATES.AUTHENTICATED || state === CHAT_STATES.AWAITING_RESPONSE) && (
            <div className="border-t border-border/30 pt-4 space-y-2.5">
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
            </div>
          )}
          {initStatus && (
            <div className="border-t border-border/30 pt-4 space-y-3">
              <div className="rounded-lg border border-border/40 bg-muted/20 px-3.5 py-2.5">
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
                  <pre className="mt-2 max-h-24 overflow-auto break-all rounded-md bg-background/60 p-2.5 text-xs text-muted-foreground">
                    {initStatus.error}
                    {initStatus.error && initStatus.output?.trim() ? '\n\n' : ''}
                    {initStatus.output?.trim()}
                  </pre>
                )}
              </div>
              <div className="rounded-lg border border-border/40 bg-muted/20 px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="font-medium text-foreground">SYSTEM_PROMPT</span>
                  {!initStatus.systemPrompt && (
                    <span className="text-muted-foreground">Not configured</span>
                  )}
                </div>
                {initStatus.systemPrompt && (
                  <pre className="mt-2 max-h-24 overflow-auto break-words rounded-md bg-background/60 p-2.5 text-xs text-muted-foreground whitespace-pre-wrap">
                    {initStatus.systemPrompt}
                  </pre>
                )}
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground/70 pt-1 text-center">v{__APP_VERSION__}</p>
        </div>
      </div>
    </>
  );
}
