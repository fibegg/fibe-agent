import {
  getTypeFilterLabel,
  ACTIVITY_TYPE_FILTERS,
} from './activity-review-utils';

export interface ActivityTypeFiltersProps {
  typeFilter: string[];
  onTypeFilterChange: (filter: string[]) => void;
}

export function ActivityTypeFilters({ typeFilter, onTypeFilterChange }: ActivityTypeFiltersProps) {
  const isAllActive = typeFilter.length === 0;
  const filters = [
    { key: '__all', label: 'All', active: isAllActive },
    ...ACTIVITY_TYPE_FILTERS.map((key) => ({
      key,
      label: getTypeFilterLabel(key),
      active: typeFilter.includes(key),
    })),
  ];
  const activeStates = filters.map((filter) => filter.active);

  const toggleFilter = (key: string) => {
    if (typeFilter.includes(key)) {
      onTypeFilterChange(typeFilter.filter((f) => f !== key));
    } else {
      onTypeFilterChange([...typeFilter, key]);
    }
  };

  const activeRadiusClass = (index: number) => {
    const previousActive = activeStates[index - 1] ?? false;
    const nextActive = activeStates[index + 1] ?? false;
    if (previousActive && nextActive) return 'rounded-none';
    if (previousActive) return 'rounded-l-none rounded-r-md';
    if (nextActive) return 'rounded-l-md rounded-r-none';
    return 'rounded-md';
  };

  const buttonClass = (active: boolean, index: number) =>
    `h-8 shrink-0 px-3 text-[11px] font-medium transition-colors ${
      active
        ? `bg-primary text-primary-foreground shadow-none ${activeRadiusClass(index)}`
        : 'rounded-md text-muted-foreground hover:bg-background/70 hover:text-foreground'
    }`;

  return (
    <div className="overflow-x-auto pb-1 -mb-1">
      <div
        className="inline-flex min-w-full rounded-lg border border-border/50 bg-muted/20 p-1"
        role="group"
        aria-label="Activity filter"
      >
        <button
          type="button"
          onClick={() => onTypeFilterChange([])}
          aria-pressed={isAllActive}
          className={buttonClass(isAllActive, 0)}
        >
          All
        </button>
        {filters.slice(1).map((filter, offset) => {
          const index = offset + 1;
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => toggleFilter(filter.key)}
              aria-pressed={filter.active}
              className={buttonClass(filter.active, index)}
            >
              {filter.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
