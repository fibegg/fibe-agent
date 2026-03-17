import { Key, LogOut, X } from 'lucide-react';
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
          <p className="text-xs text-muted-foreground pt-2">v{__APP_VERSION__}</p>
        </div>
      </div>
    </>
  );
}
