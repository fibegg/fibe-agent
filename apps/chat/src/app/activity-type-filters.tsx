import {
  getTypeFilterLabel,
  ACTIVITY_TYPE_FILTERS,
  BADGE_ACTIVE_STYLES,
  BADGE_INACTIVE_STYLES,
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

  return (
    <div className="px-3 py-3 flex flex-wrap gap-2 shrink-0 border-b border-border/50">
      <button
        type="button"
        onClick={() => onTypeFilterChange([])}
        className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors border ${
          isAllActive
            ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
            : 'bg-muted/50 text-muted-foreground border-border/50 hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/30'
        }`}
      >
        All
      </button>
      {ACTIVITY_TYPE_FILTERS.map((filterKey) => {
        const label = getTypeFilterLabel(filterKey);
        const isActive = typeFilter.includes(filterKey);
        const activeStyle = BADGE_ACTIVE_STYLES[filterKey] ?? 'bg-violet-500/20 text-violet-300 border-violet-500/40';
        const inactiveStyle = BADGE_INACTIVE_STYLES[filterKey] ?? 'hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/30';
        return (
          <button
            key={filterKey}
            type="button"
            onClick={() => toggleFilter(filterKey)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors border ${
              isActive ? activeStyle : `bg-muted/50 text-muted-foreground border-border/50 ${inactiveStyle}`
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
