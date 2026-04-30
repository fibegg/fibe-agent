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

  const toggleFilter = (key: string) => {
    if (typeFilter.includes(key)) {
      onTypeFilterChange(typeFilter.filter((f) => f !== key));
    } else {
      onTypeFilterChange([...typeFilter, key]);
    }
  };

  const buttonClass = (active: boolean) =>
    `h-8 shrink-0 rounded-md px-3 text-[11px] font-medium transition-colors ${
      active
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
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
          className={buttonClass(isAllActive)}
        >
          All
        </button>
        {ACTIVITY_TYPE_FILTERS.map((filterKey) => {
          const label = getTypeFilterLabel(filterKey);
          const isActive = typeFilter.includes(filterKey);
          return (
            <button
              key={filterKey}
              type="button"
              onClick={() => toggleFilter(filterKey)}
              aria-pressed={isActive}
              className={buttonClass(isActive)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
