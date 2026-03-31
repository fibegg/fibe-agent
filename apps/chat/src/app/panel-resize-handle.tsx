import type { PointerEvent as ReactPointerEvent } from 'react';

interface PanelResizeHandleProps {
  side: 'left' | 'right';
  isDragging?: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  ariaLabel?: string;
}

/**
 * A thin vertical drag handle placed between a side panel and the main content.
 * - side="left"  → placed on the right edge of the left panel
 * - side="right" → placed on the left edge of the right panel
 */
export function PanelResizeHandle({
  side,
  isDragging = false,
  onPointerDown,
  ariaLabel,
}: PanelResizeHandleProps) {
  const label =
    ariaLabel ??
    (side === 'left' ? 'Resize left panel' : 'Resize right panel');

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={onPointerDown}
      data-dragging={isDragging ? 'true' : undefined}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [side === 'left' ? 'right' : 'left']: 0,
        width: '8px',
        cursor: 'col-resize',
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {/* Visual accent line */}
      <div
        aria-hidden
        style={{
          width: '2px',
          height: isDragging ? '100%' : '40px',
          borderRadius: '9999px',
          transition: isDragging
            ? 'none'
            : 'height 0.2s ease, opacity 0.2s ease, background-color 0.2s ease',
          backgroundColor: isDragging
            ? 'rgba(139, 92, 246, 0.9)'
            : 'rgba(139, 92, 246, 0)',
          boxShadow: isDragging
            ? '0 0 8px rgba(139, 92, 246, 0.6)'
            : '0 0 0px rgba(139, 92, 246, 0)',
        }}
        className="panel-resize-line"
      />

      <style>{`
        [role="separator"][aria-orientation="vertical"]:hover .panel-resize-line {
          background-color: rgba(139, 92, 246, 0.6) !important;
          height: 60px !important;
          box-shadow: 0 0 6px rgba(139, 92, 246, 0.4) !important;
        }
        [role="separator"][aria-orientation="vertical"][data-dragging="true"] .panel-resize-line {
          background-color: rgba(139, 92, 246, 0.9) !important;
          height: 100% !important;
          box-shadow: 0 0 8px rgba(139, 92, 246, 0.6) !important;
        }
      `}</style>
    </div>
  );
}
