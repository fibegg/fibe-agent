import type { TranslationKey } from '../i18n';

export function getThinkingLines(_lastUserMessage?: string | null): string[] {
  return ['Thinking...'];
}

export function getThinkingLineKeys(
  _lastUserMessage?: string | null,
): TranslationKey[] {
  return ['chat.state.thinking'];
}
