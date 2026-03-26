import { createPortal } from 'react-dom';

interface SidebarActivityTooltipProps {
  tooltip: {
    rect: { left: number; top: number; height: number };
    content: string;
    variant: string;
  } | null;
}

export function SidebarActivityTooltip({ tooltip }: SidebarActivityTooltipProps) {
  if (!tooltip || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed z-[9999] rounded-lg px-4 py-3 text-sm font-medium bg-popover text-popover-foreground border border-border shadow-lg text-left leading-relaxed ${tooltip.variant === 'reasoning' ? 'min-w-[360px] max-w-[720px] whitespace-normal' : 'min-w-[320px] max-w-[560px] whitespace-pre-line'}`}
      role="tooltip"
      style={{
        left: tooltip.rect.left - 8,
        top: tooltip.rect.top + tooltip.rect.height / 2,
        transform: 'translate(-100%, -50%)',
      }}
    >
      {tooltip.content}
    </div>,
    document.body
  );
}
