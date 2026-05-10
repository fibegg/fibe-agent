import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { RIGHT_DRAWER_OVERLAY, RIGHT_DRAWER_PANEL } from './ui-classes';
import { useT } from './i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RightDrawerProps {
  /** Controls whether the drawer is visible. */
  open: boolean;
  /** Called when the user requests the drawer to close (Escape, backdrop, close button). */
  onClose: () => void;
  /** Drawer heading text displayed in the header. */
  title: string;
  /** Optional icon rendered to the left of the title. */
  icon?: ReactNode;
  /** Content rendered inside the scrollable drawer body. */
  children: ReactNode;
  /**
   * Width of the drawer panel.
   * Accepts any valid CSS width value.
   * Defaults to `min(85vw, 520px)`.
   */
  width?: string;
  /** Extra class names applied to the inner panel element. */
  className?: string;
  /**
   * When true, a maximize/restore button is shown in the drawer header so
   * the user can expand the panel to full viewport size.
   * Defaults to false.
   */
  expandable?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * `RightDrawer` — a slide-in panel from the right edge of the screen.
 *
 * Animations are driven entirely by CSS transitions so xterm.js and other
 * heavy children only mount once; the panel stays mounted while `open`
 * remains true and slides out when `open` becomes false.
 *
 * The component fires a `transitionend` callback when it finishes opening so
 * consumers can trigger layout-dependent side effects (e.g. xterm FitAddon).
 */
export function RightDrawer({
  open,
  onClose,
  title,
  icon,
  children,
  width = 'min(85vw, 520px)',
  className = '',
  expandable = false,
}: RightDrawerProps) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Reset expanded state when drawer closes
  useEffect(() => {
    if (!open) setIsExpanded(false);
  }, [open]);

  // ── Escape key ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isExpanded) {
          setIsExpanded(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose, isExpanded]);

  // ── Focus trap — move focus into panel when it opens ────────────────────────
  useEffect(() => {
    if (!open) return;
    // Small delay to let the CSS transition start before stealing focus
    const id = setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      const firstFocusable = el.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }, 60);
    return () => clearTimeout(id);
  }, [open]);

  // ── Scroll-lock on body ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ── Expanded panel style — covers the full viewport ─────────────────────────
  const panelStyle: React.CSSProperties = isExpanded
    ? {
        width: '100vw',
        height: '100vh',
        top: 0,
        right: 0,
        bottom: 0,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1)',
        visibility: open ? 'visible' : 'hidden',
      }
    : {
        width,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1)',
        // Keep in DOM but out of tab order when closed so xterm stays mounted
        visibility: open ? 'visible' : 'hidden',
      };

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        className={RIGHT_DRAWER_OVERLAY}
        aria-hidden
        onClick={onClose}
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 220ms ease-out',
        }}
      />

      {/* ── Sliding panel ─────────────────────────────────────────────────── */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${RIGHT_DRAWER_PANEL} ${className}`}
        style={panelStyle}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div 
          className="flex items-center justify-between px-4 pb-3 border-b border-violet-500/15 shrink-0 bg-background/95 backdrop-blur-sm"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <span className="size-4 text-violet-400 shrink-0 flex items-center justify-center" aria-hidden>
                {icon}
              </span>
            )}
            <span className="text-sm font-semibold text-foreground tracking-tight truncate">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {expandable && (
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors shrink-0"
                aria-label={isExpanded ? t('drawer.restoreTerminal') : t('drawer.expandTerminal')}
                title={isExpanded ? t('drawer.restoreTerminal') : t('drawer.expandTerminal')}
              >
                {isExpanded
                  ? <Minimize2 className="size-3.5" />
                  : <Maximize2 className="size-3.5" />
                }
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors shrink-0 ml-1"
              aria-label={t('drawer.close', { title })}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </>
  );
}

