import { en, type TranslationKey } from './en';
import { uk } from './uk';

export const LOCALES = ['en', 'uk'] as const;
export type Locale = (typeof LOCALES)[number];
export type { TranslationKey };
export type TranslationTable = Readonly<Record<TranslationKey, string>>;

export interface LocaleOption {
  flag: string;
  labelKey: TranslationKey;
  shortLabel: string;
}

export const LOCALE_OPTIONS: Record<Locale, LocaleOption> = {
  en: { flag: '🇬🇧', labelKey: 'common.english', shortLabel: 'EN' },
  uk: { flag: '🇺🇦', labelKey: 'common.ukrainian', shortLabel: 'УКР' },
};

export const TRANSLATIONS: Record<Locale, TranslationTable> = { en, uk };
