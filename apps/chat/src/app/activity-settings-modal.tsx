import { X } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { shouldHideThemeSwitch } from './embed-config';
import { MODAL_CARD, MODAL_OVERLAY_DARK, SETTINGS_CLOSE_BUTTON } from './ui-classes';
import { ActivityTypeFilters } from './activity-type-filters';
import { LocaleSelector } from './locale-selector';
import { useT } from './i18n';

export interface ActivitySettingsModalProps {
  open: boolean;
  onClose: () => void;
  typeFilter?: string[];
  onTypeFilterChange?: (filter: string[]) => void;
}

export function ActivitySettingsModal({ open, onClose, typeFilter, onTypeFilterChange }: ActivitySettingsModalProps) {
  const t = useT();
  if (!open) return null;

  return (
    <>
      <div className={MODAL_OVERLAY_DARK} aria-hidden onClick={onClose} />
      <div
        className={`fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 ${MODAL_CARD}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-settings-dialog-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <h2 id="activity-settings-dialog-title" className="text-lg font-semibold text-foreground">
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
        <div className="p-4 space-y-3">
          {onTypeFilterChange && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-foreground">{t('settings.activityFilter')}</span>
              <ActivityTypeFilters
                typeFilter={typeFilter ?? []}
                onTypeFilterChange={onTypeFilterChange}
              />
            </div>
          )}
          {!shouldHideThemeSwitch() && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-foreground">{t('theme.darkMode')}</span>
              <ThemeToggle />
            </div>
          )}
          <LocaleSelector variant="row" />
          <p className="text-xs text-muted-foreground pt-2">v{__APP_VERSION__}</p>
        </div>
      </div>
    </>
  );
}
