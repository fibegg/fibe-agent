import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  Check,
  DatabaseZap,
  Download,
  Key,
  Loader2,
  LogOut,
  MessageSquareText,
  RefreshCcw,
  ServerCog,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
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
import { ActivityTypeFilters } from '../activity-type-filters';
import { usePersistedTypeFilter } from '../use-persisted-type-filter';
import { RightDrawer } from '../right-drawer';
import { RawProviderActivityDrawerContent } from './raw-provider-activity-drawer';
import { LocaleSelector } from '../locale-selector';
import { useT } from '../i18n';
import { setUiEffectsEnabled } from '../ui-effects';
import { useUiEffectsEnabled } from '../use-ui-effects';

interface InitStatusResponse {
  state: 'disabled' | 'pending' | 'running' | 'done' | 'failed';
  output?: string;
  error?: string;
  finishedAt?: string;
  systemPrompt?: string;
}

interface FibeSyncSettings {
  messages: boolean;
  activity: boolean;
  rawProviders: boolean;
  rawProviderCapture: boolean;
}

export interface ChatSettingsModalProps {
  open: boolean;
  onClose: () => void;
  state: ChatState;
  isStandalone?: boolean;
  onStartAuth: () => void;
  onReauthenticate: () => void;
  onLogout: () => void;
  onResetConversation?: () => void;
  simplicateMode?: boolean;
  onSimplicateModeChange?: (enabled: boolean) => void;
}

function ResetConversationButton({ onReset }: { onReset: () => void }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelConfirm = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setConfirming(false);
  }, []);

  const requestConfirm = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirming(true);
    timerRef.current = setTimeout(cancelConfirm, 8000);
  }, [cancelConfirm]);

  const confirmReset = useCallback(() => {
    cancelConfirm();
    onReset();
  }, [cancelConfirm, onReset]);

  useEffect(() => cancelConfirm, [cancelConfirm]);

  if (confirming) {
    return (
      <div
        className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2"
        role="group"
        aria-label={t('settings.confirmReset')}
      >
        <span className="min-w-0 truncate text-sm font-medium text-rose-200">{t('settings.resetQuestion')}</span>
        <button
          type="button"
          onClick={cancelConfirm}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border/60 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
          aria-label={t('settings.cancelReset')}
        >
          <X className="size-3.5" aria-hidden />
          {t('common.cancel')}
        </button>
        <button
          id="reset-conversation-confirm-btn"
          type="button"
          onClick={confirmReset}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-rose-500 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
          aria-label={t('settings.confirmReset')}
        >
          <Check className="size-3.5" aria-hidden />
          {t('common.confirm')}
        </button>
      </div>
    );
  }

  return (
    <button
      id="reset-conversation-btn"
      type="button"
      onClick={requestConfirm}
      className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
      title={t('settings.resetTitle')}
      aria-label={t('settings.resetTitle')}
      aria-expanded={false}
    >
      <RefreshCcw className="size-4" aria-hidden />
      {t('settings.reset')}
    </button>
  );
}

function SettingsSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'border-primary/60 bg-primary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' : 'border-muted-foreground/50 bg-background/80'
      }`}
    >
      <span
        className={`pointer-events-none absolute left-0.5 top-1/2 size-5 -translate-y-1/2 rounded-full border shadow-sm transition-transform ${
          checked ? 'translate-x-5 border-white/70 bg-white' : 'translate-x-0 border-muted-foreground/50 bg-muted-foreground'
        }`}
      />
    </button>
  );
}

function FibeSyncRow({
  label,
  icon,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/35 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
          {icon}
        </span>
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
      </div>
      <SettingsSwitch
        checked={checked}
        disabled={disabled}
        label={label}
        onChange={onChange}
      />
    </div>
  );
}

export function ChatSettingsModal({
  open,
  onClose,
  state,
  isStandalone = true,
  onStartAuth,
  onReauthenticate,
  onLogout,
  onResetConversation,
  simplicateMode = false,
  onSimplicateModeChange,
}: ChatSettingsModalProps) {
  const t = useT();
  const [initStatus, setInitStatus] = useState<InitStatusResponse | null>(null);
  const [syncSettings, setSyncSettings] = useState<FibeSyncSettings | null>(null);
  const [syncSaving, setSyncSaving] = useState(false);
  const [rawDrawerOpen, setRawDrawerOpen] = useState(false);
  const [typeFilter, setTypeFilter] = usePersistedTypeFilter();
  const uiEffectsEnabled = useUiEffectsEnabled();

  useEffect(() => {
    if (!open || !isStandalone) {
      if (!isStandalone) setInitStatus(null);
      return;
    }
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
  }, [open, isStandalone]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiRequest(API_PATHS.FIBE_SYNC_SETTINGS)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: FibeSyncSettings | null) => {
        if (!cancelled && data) setSyncSettings(data);
      })
      .catch(() => {
        if (!cancelled) setSyncSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const updateSyncSetting = (key: keyof FibeSyncSettings, value: boolean) => {
    if (!syncSettings) return;
    const next = { ...syncSettings, [key]: value };
    setSyncSettings(next);
    setSyncSaving(true);
    apiRequest(API_PATHS.FIBE_SYNC_SETTINGS, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to save sync setting'))))
      .then((data: FibeSyncSettings) => setSyncSettings(data))
      .catch(() => setSyncSettings(syncSettings))
      .finally(() => setSyncSaving(false));
  };

  const handleAuthClick = () => {
    onClose();
    state === CHAT_STATES.UNAUTHENTICATED ? onStartAuth() : onReauthenticate();
  };

  const handleLogoutClick = () => {
    onClose();
    onLogout();
  };

  const handleExportData = () => {
    apiRequest('/data-privacy/export')
      .then((r) => r.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fibe_agent_data_export.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch((err) => console.error('Export failed', err));
  };

  const handleDeleteData = () => {
    if (!window.confirm(t('settings.deleteConfirm'))) {
      return;
    }
    apiRequest('/data-privacy', { method: 'DELETE' })
      .then((r) => {
        if (r.ok) window.location.reload();
      })
      .catch((err) => console.error('Delete failed', err));
  };

  return (
    <>
      <div className={MODAL_OVERLAY_DARK} aria-hidden onClick={onClose} />
      <div
        className={`fixed top-1/2 left-1/2 z-50 h-[80vh] w-[calc(100vw-24px)] max-w-5xl -translate-x-1/2 -translate-y-1/2 sm:w-[80vw] ${MODAL_CARD} flex flex-col`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
          <h2 id="settings-dialog-title" className="text-base font-semibold text-foreground tracking-[-0.01em]">
            {t('settings.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={SETTINGS_CLOSE_BUTTON}
            aria-label={t('common.close')}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto min-h-0">
          {!shouldHideThemeSwitch() && (
            <div className="flex items-center justify-between py-1">
              <span className="text-sm font-medium text-foreground">{t('theme.darkMode')}</span>
              <ThemeToggle />
            </div>
          )}
          <LocaleSelector variant="row" />
          <div className="space-y-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('settings.activityFilter')}</span>
            <ActivityTypeFilters
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
            />
          </div>
          <div className="space-y-2.5 border-t border-border/30 pt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('settings.interface')}</span>
            {onSimplicateModeChange && !simplicateMode && (
              <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/35 px-3 py-2">
                <span className="truncate text-sm font-medium text-foreground">{t('header.simplicate')}</span>
                <SettingsSwitch
                  checked={simplicateMode}
                  label={t('header.simplicate')}
                  onChange={onSimplicateModeChange}
                />
              </div>
            )}
            <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/35 px-3 py-2">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-foreground">{t('settings.uiEffects')}</span>
                <span className="text-xs text-muted-foreground">{t('settings.uiEffectsDescription')}</span>
              </span>
              <SettingsSwitch
                checked={uiEffectsEnabled}
                label={t('settings.uiEffects')}
                onChange={setUiEffectsEnabled}
              />
            </div>
          </div>
          <div className="space-y-2.5 border-t border-border/30 pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('settings.fibeSync')}</span>
              {syncSaving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label={t('common.saving')} />}
            </div>
            <div className="grid gap-2 rounded-lg border border-border/40 bg-muted/15 p-2.5 sm:grid-cols-2">
              {([
                ['messages', t('settings.sync.messages'), <MessageSquareText key="messages" className="size-3.5" />],
                ['activity', t('settings.sync.activity'), <Activity key="activity" className="size-3.5" />],
                ['rawProviders', t('settings.sync.rawProviders'), <DatabaseZap key="rawProviders" className="size-3.5" />],
                ['rawProviderCapture', t('settings.sync.rawProviderCapture'), <ShieldCheck key="rawProviderCapture" className="size-3.5" />],
              ] as const).map(([key, label, icon]) => (
                <FibeSyncRow
                  key={key}
                  label={label}
                  icon={icon}
                  checked={syncSettings?.[key] ?? false}
                  disabled={!syncSettings}
                  onChange={(checked) => updateSyncSetting(key, checked)}
                />
              ))}
              <button
                type="button"
                onClick={() => setRawDrawerOpen(true)}
                className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 sm:col-span-2"
              >
                <ServerCog className="size-4" />
                {t('settings.sync.viewRaw')}
              </button>
            </div>
          </div>
          {onResetConversation && state !== CHAT_STATES.AWAITING_RESPONSE && (
            <div className="space-y-2.5 border-t border-border/30 pt-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('settings.conversation')}</span>
              <ResetConversationButton onReset={onResetConversation} />
            </div>
          )}
          {isStandalone && (
            <div className="space-y-2.5 border-t border-border/30 pt-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('settings.dataPrivacy')}</span>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleExportData}
                  className={BUTTON_OUTLINE_ACCENT}
                >
                  <Download className="size-4" />
                  {t('settings.exportData')}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteData}
                  className={BUTTON_DESTRUCTIVE_GHOST}
                >
                  <Trash2 className="size-4" />
                  {t('settings.deleteData')}
                </button>
              </div>
            </div>
          )}
          {isStandalone && (state === CHAT_STATES.UNAUTHENTICATED || state === CHAT_STATES.AUTHENTICATED || state === CHAT_STATES.AWAITING_RESPONSE) && (
            <div className="border-t border-border/30 pt-4 space-y-2.5">
              {(state === CHAT_STATES.UNAUTHENTICATED || state === CHAT_STATES.AUTHENTICATED) && (
                <button
                  type="button"
                  onClick={handleAuthClick}
                  className={BUTTON_OUTLINE_ACCENT}
                >
                  <Key className="size-4" />
                  {state === CHAT_STATES.UNAUTHENTICATED ? t('header.startAuth') : t('settings.reauthenticate')}
                </button>
              )}
              {(state === CHAT_STATES.AUTHENTICATED || state === CHAT_STATES.AWAITING_RESPONSE) && (
                <button
                  type="button"
                  onClick={handleLogoutClick}
                  className={BUTTON_DESTRUCTIVE_GHOST}
                >
                  <LogOut className="size-4" />
                  {t('settings.logout')}
                </button>
              )}
            </div>
          )}
          {isStandalone && initStatus && (
            <div className="border-t border-border/30 pt-4 space-y-3">
              <div className="rounded-lg border border-border/40 bg-muted/20 px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{t('settings.postInit')}</span>
                  {initStatus.state === 'running' && (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                  )}
                  <span className="text-muted-foreground">
                    {initStatus.state === 'disabled' && t('settings.notConfigured')}
                    {initStatus.state === 'pending' && t('settings.pending')}
                    {initStatus.state === 'running' && t('settings.running')}
                    {initStatus.state === 'done' && t('settings.done')}
                    {initStatus.state === 'failed' && t('settings.failed')}
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
                  <span className="font-medium text-foreground">{t('settings.systemPrompt')}</span>
                  {!initStatus.systemPrompt && (
                    <span className="text-muted-foreground">{t('settings.notConfigured')}</span>
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
      <RightDrawer
        open={rawDrawerOpen}
        onClose={() => setRawDrawerOpen(false)}
        title={t('settings.rawProviderActivity')}
        icon={<ServerCog className="size-4" />}
        width="min(92vw, 760px)"
      >
        <RawProviderActivityDrawerContent open={rawDrawerOpen} />
      </RightDrawer>
    </>
  );
}
