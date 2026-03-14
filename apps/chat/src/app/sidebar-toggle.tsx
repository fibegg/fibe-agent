import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';

interface SidebarToggleProps {
  isCollapsed: boolean;
  onClick: () => void;
  side: 'left' | 'right';
  ariaLabel: string;
}

export function SidebarToggle({
  isCollapsed,
  onClick,
  side,
  ariaLabel,
}: SidebarToggleProps) {
  const [showPulse, setShowPulse] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowPulse(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  const isLeft = side === 'left';
  const positionClass = isLeft ? '-right-4' : '-left-4';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`sidebar-toggle absolute top-1/2 -translate-y-1/2 z-50
        ${positionClass}
        size-8 md:size-9 lg:size-8
        rounded-full
        bg-card/90 backdrop-blur-md
        hover:bg-card
        active:scale-95
        flex items-center justify-center
        transition-all duration-300 ease-out
        hover:scale-105
        group
        touch-manipulation
        ${showPulse ? 'animate-pulse' : ''}
      `}
      aria-label={ariaLabel}
    >
      <div
        className="absolute inset-0 rounded-full bg-violet-400 opacity-0 group-hover:opacity-10 transition-opacity duration-300"
        aria-hidden
      />
      <div className="relative z-10">
        {isLeft ? (
          isCollapsed ? (
            <ChevronRight className="size-4 text-muted-foreground group-hover:text-violet-500 transition-all group-hover:translate-x-0.5" />
          ) : (
            <ChevronLeft className="size-4 text-muted-foreground group-hover:text-violet-500 transition-all group-hover:-translate-x-0.5" />
          )
        ) : (
          isCollapsed ? (
            <ChevronLeft className="size-4 text-muted-foreground group-hover:text-violet-500 transition-all group-hover:-translate-x-0.5" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground group-hover:text-violet-500 transition-all group-hover:translate-x-0.5" />
          )
        )}
      </div>
      <div
        className="hidden md:block absolute top-1/2 -translate-y-1/2 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 px-3 py-1.5 bg-popover border border-border text-foreground text-xs rounded-md shadow-lg z-20"
        style={{
          [isLeft ? 'right' : 'left']: '100%',
          [isLeft ? 'marginRight' : 'marginLeft']: '0.5rem',
        }}
        aria-hidden
      >
        {isCollapsed ? 'Expand' : 'Collapse'}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0 h-0 border-4 border-transparent"
          style={{
            [isLeft ? 'left' : 'right']: '100%',
            borderLeftColor: isLeft ? 'transparent' : 'var(--popover)',
            borderRightColor: isLeft ? 'var(--popover)' : 'transparent',
          }}
        />
      </div>
    </button>
  );
}
