export const EFFORT_OPTIONS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export type EffortValue = (typeof EFFORT_OPTIONS)[number];

export const DEFAULT_EFFORT: EffortValue = 'max';

export const EFFORT_LABELS: Record<EffortValue, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X High',
  max: 'Max',
};

export function normalizeEffort(value: unknown): EffortValue | '' {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  return (EFFORT_OPTIONS as readonly string[]).includes(trimmed)
    ? (trimmed as EffortValue)
    : '';
}

export function resolveEffort(
  value: unknown,
  fallback: EffortValue = DEFAULT_EFFORT
): EffortValue {
  return normalizeEffort(value) || fallback;
}
