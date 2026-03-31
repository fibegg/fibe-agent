import { type ReactNode } from 'react';
import { MAIN_CONTENT_MIN_WIDTH_PX } from '../layout-constants';

export interface ChatLayoutProps {
  isDragOver?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;

  dragOverlay?: ReactNode;
  modals?: ReactNode;
  mobileSidebar?: ReactNode;
  mobileActivity?: ReactNode;
  leftPanel?: ReactNode;
  rightPanel?: ReactNode;
  /** Disables text selection across the whole layout while a panel is being resized. */
  isPanelResizing?: boolean;
  children: ReactNode;
}

export function ChatLayout({
  isDragOver,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  dragOverlay,
  modals,
  mobileSidebar,
  mobileActivity,
  leftPanel,
  rightPanel,
  isPanelResizing = false,
  children,
}: ChatLayoutProps) {
  return (
    <div
      className={`flex h-dvh w-full min-h-0 overflow-hidden bg-gradient-to-br from-background via-background to-violet-950/10 relative ${isDragOver ? 'ring-2 ring-inset ring-violet-500 ring-offset-2 ring-offset-background' : ''}`}
      style={isPanelResizing ? { userSelect: 'none', cursor: 'col-resize' } : undefined}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragOver && dragOverlay}
      {modals}
      
      {mobileSidebar}
      {mobileActivity}
      
      {leftPanel}
      
      <main
        className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent"
        style={{
          minWidth: MAIN_CONTENT_MIN_WIDTH_PX,
          // Isolate this subtree during resize so the browser doesn't need to
          // reflow text content when sibling panel widths change.
          contain: isPanelResizing ? 'layout style' : undefined,
        }}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden w-full">
          {children}
        </div>
      </main>
      
      {rightPanel}
    </div>
  );
}
