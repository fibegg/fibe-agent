/**
 * Shared control buttons used in both the desktop top-row and mobile search-row
 * of the ChatHeader, as well as in MoreActionsMenu.
 */
import { Command, FolderOpen, GitCompareArrows, TerminalSquare } from 'lucide-react';
import { useT } from '../i18n';
import { PlaygroundSelector } from './playground-selector';
import type { ChatHeaderProps } from './chat-header';

// ─── Icon ────────────────────────────────────────────────────────────────────

export const StarkGlassesIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {/* Bridge */}
    <path d="M10 11h4" fill="none" strokeWidth="2" />
    {/* Left lens (angular aviator style) */}
    <path d="M10 11l-1.5 4.5H3.5L2 11h8z" />
    {/* Right lens (angular aviator style) */}
    <path d="M14 11l1.5 4.5h5l1.5-4.5h-8z" />
    {/* Left arm */}
    <path d="M2 11V9c0-1 .5-2 1.5-2h1" fill="none" strokeWidth="1.5" />
    {/* Right arm */}
    <path d="M22 11V9c0-1-.5-2-1.5-2h-1" fill="none" strokeWidth="1.5" />
    {/* Glass reflection lines */}
    <path d="M5 11l-1.5 2" fill="none" stroke="black" strokeWidth="1" strokeOpacity="0.3" />
    <path d="M16 11l-1.5 2" fill="none" stroke="black" strokeWidth="1" strokeOpacity="0.3" />
  </svg>
);

// ─── PlaygroundSelectorSlot ───────────────────────────────────────────────────

/** Shared prop-forwarding helper — avoids repeating the 13-prop spread twice. */
export function PlaygroundSelectorSlot({
  props,
  className,
  variant = 'icon',
}: {
  props: ChatHeaderProps;
  className?: string;
  variant?: 'icon' | 'menu';
}) {
  if (!props.onPlaygroundOpen || !props.onPlaygroundLink) {
    return null;
  }

  return (
    <div className={className}>
      <PlaygroundSelector
        entries={props.playgroundEntries ?? []}
        loading={props.playgroundLoading ?? false}
        error={props.playgroundError ?? null}
        currentLink={props.playgroundCurrentLink ?? null}
        linking={props.playgroundLinking ?? false}
        unlinking={props.playgroundUnlinking ?? false}
        onOpen={props.onPlaygroundOpen}
        onLink={props.onPlaygroundLink}
        onUnlink={props.onPlaygroundUnlink}
        onLinked={props.onPlaygroundLinked}
        onUnlinked={props.onPlaygroundUnlinked}
        visible={true}
        variant={variant}
      />
    </div>
  );
}

// ─── Toggle buttons ───────────────────────────────────────────────────────────

/** Commands toggle button, shared between the desktop top-row and the mobile search-row. */
export function CliButton({
  open,
  onToggle,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  className: string;
}) {
  const t = useT();
  const label = open ? t('header.closeCommands') : t('header.commands');
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${className} rounded-md flex items-center justify-center transition-colors shrink-0 ${
        open
          ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
          : 'text-muted-foreground hover:bg-blue-500/10 hover:text-blue-300'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={open}
    >
      <Command className="size-4" />
    </button>
  );
}

/** Diff toggle button, shared between the desktop top-row and the mobile search-row. */
export function DiffButton({
  open,
  onToggle,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  className: string;
}) {
  const t = useT();
  const label = t('header.gitDiff');
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${className} rounded-md flex items-center justify-center transition-colors shrink-0 ${
        open
          ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
          : 'text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-300'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={open}
    >
      <GitCompareArrows className="size-4" />
    </button>
  );
}

/** Terminal toggle button, shared between the desktop top-row and the mobile search-row. */
export function TerminalButton({
  open,
  onToggle,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  className: string;
}) {
  const t = useT();
  const label = open ? t('header.closeTerminal') : t('header.openTerminal');
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${className} rounded-md flex items-center justify-center transition-colors shrink-0 ${
        open
          ? 'bg-primary/20 text-primary hover:bg-primary/30'
          : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={open}
    >
      <TerminalSquare className="size-4" />
    </button>
  );
}

/** Open-file-browser button. Used only inside MoreActionsMenu but extracted for symmetry. */
export function FileBrowserButton({
  onClick,
}: {
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-amber-300 sm:size-9"
      title={t('header.files')}
      aria-label={t('header.files')}
    >
      <FolderOpen className="size-4" />
    </button>
  );
}
