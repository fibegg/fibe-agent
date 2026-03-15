/**
 * Shared Tailwind class strings to avoid long inline class lists and keep styling consistent.
 * Use these constants instead of repeating the same class combinations across components.
 */

export const INPUT =
  'rounded-md border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:focus:ring-primary/30';
export const INPUT_BG = 'bg-input-background dark:bg-input/30';
export const INPUT_FOCUS_BORDER = 'focus:border-violet-500 dark:focus:border-primary';

export const INPUT_SEARCH =
  'h-8 w-full pl-8 pr-8 text-xs rounded-md ' + INPUT_BG + ' border border-border ' + INPUT_FOCUS_BORDER + ' ' + INPUT;

export const INPUT_SM =
  'w-28 sm:w-32 h-7 sm:h-8 px-2.5 rounded-md text-[10px] sm:text-xs ' +
  INPUT_BG +
  ' backdrop-blur-sm border border-border-subtle ' +
  INPUT +
  ' focus:border-violet-500/50 dark:focus:border-primary focus:ring-2 focus:ring-violet-500/20 dark:focus:ring-primary/30';

export const BUTTON_ICON_MUTED =
  'rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground';
export const BUTTON_ICON_ACCENT =
  'rounded-md flex items-center justify-center text-violet-400 hover:bg-violet-500/10 transition-colors';
export const BUTTON_ICON_ACCENT_SM =
  'size-7 sm:size-8 flex items-center justify-center rounded-md text-violet-400 hover:bg-violet-500/10 transition-colors';

export const BUTTON_GHOST_ACCENT =
  'rounded-md px-2 py-1.5 h-7 text-xs text-muted-foreground hover:bg-violet-500/10 hover:text-violet-400 disabled:opacity-50 flex items-center gap-1.5';

export const SEARCH_ICON_POSITION = 'absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none';
export const CLEAR_BUTTON_POSITION = 'absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground';

export const FLEX_ROW_CENTER = 'flex items-center gap-2 min-w-0';
export const FLEX_ROW_CENTER_WRAP = 'flex items-center justify-between gap-2 flex-wrap min-w-0';

export const ACTIVITY_BLOCK_BASE = 'px-3 py-2.5 flex flex-col gap-1.5';
export const ACTIVITY_BLOCK_VARIANTS = {
  stream_start: 'rounded-lg border border-blue-500/30 bg-blue-500/10',
  reasoning: 'rounded-lg border border-violet-500/30 bg-violet-500/10',
  step: 'rounded-lg border border-zinc-500/20 bg-zinc-500/10',
  tool_call: 'rounded-lg border border-amber-500/30 bg-amber-500/10',
  file_created: 'rounded-lg border border-green-500/30 bg-green-500/10',
  task_complete: 'rounded-lg border border-green-500/30 bg-green-500/10',
  default: 'rounded-lg border border-violet-500/20 bg-violet-500/5',
} as const;

export const ACTIVITY_ICON_COLOR: Record<string, string> = {
  file_created: 'text-green-500',
  tool_call: 'text-amber-500',
  stream_start: 'text-blue-400',
  default: 'text-violet-400',
};

export const ACTIVITY_LABEL = 'text-[10px] font-semibold uppercase tracking-wide text-foreground/90 truncate';
export const ACTIVITY_TIMESTAMP = 'text-[9px] text-muted-foreground shrink-0';
export const ACTIVITY_BODY = 'text-xs text-foreground/90 break-words';
export const ACTIVITY_MONO = 'text-xs text-foreground/90 whitespace-pre-wrap font-mono leading-relaxed break-words';

export const BADGE_CARD = 'shrink-0 text-xs bg-card/50 backdrop-blur-sm border border-border/50 h-auto py-1 px-2 rounded-md truncate max-w-[120px]';

export const AVATAR_USER =
  'size-7 sm:size-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-white';
export const AVATAR_ASSISTANT =
  'size-7 sm:size-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center relative text-white';

export const BUBBLE_ASSISTANT =
  'rounded-2xl rounded-tl-sm bg-card/60 backdrop-blur-md border border-border/50 shadow-lg text-card-foreground';
export const BUBBLE_TYPING = 'rounded-2xl rounded-tl-sm bg-card border border-border text-card-foreground';
export const BUBBLE_USER =
  'rounded-2xl rounded-tr-sm bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-lg shadow-violet-500/20';

export const PROSE_MESSAGE = 'markdown-body prose prose-sm max-w-none dark:prose-invert text-sm sm:text-[14px]';

export const SIDEBAR_PANEL =
  'relative h-full flex flex-col flex-shrink-0 bg-gradient-to-br from-background via-background to-purple-950/5 border-l border-violet-500/20 transition-all duration-300';
export const SIDEBAR_HEADER = 'p-4 border-b border-violet-500/20 shrink-0';
export const CARD_HEADER = 'px-4 pt-4 pb-[11px] border-b border-border/50 bg-card/40 backdrop-blur-xl shrink-0';

export const MODAL_OVERLAY = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/50 backdrop-blur-sm';
export const MODAL_OVERLAY_DARK = 'fixed inset-0 z-50 bg-black/50';
export const MODAL_OVERLAY_CENTER =
  'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm';

export const LOGO_ICON_BOX =
  'size-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30 shrink-0';

export const SESSION_STATS_PANEL =
  'rounded-lg border border-violet-500/20 bg-violet-500/5 overflow-hidden shrink-0';
export const SESSION_STATS_HEADING =
  'flex items-center gap-1.5 text-xs font-semibold px-3 py-2 text-violet-300 border-b border-violet-500/20';

export const MODEL_OPTION_SELECTED = 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow shadow-violet-500/20';
export const MODEL_OPTION_UNSELECTED =
  'bg-input-bg border border-border-subtle text-muted-foreground hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/30';

export const TREE_NODE_SELECTED = 'bg-violet-500/10 text-violet-400';
export const TREE_NODE_BASE =
  'w-full flex items-center gap-1.5 px-2 py-1 text-left text-xs rounded-md cursor-pointer transition-all focus:outline-none focus:ring-1 focus:ring-violet-500/30';

export const CLOSE_BUTTON_SIZE = 'size-8';

export const SETTINGS_CLOSE_BUTTON =
  'size-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-violet-400 hover:bg-violet-500/10';
export const MODAL_CARD =
  'rounded-xl bg-gradient-to-br from-card via-card to-violet-950/5 border border-violet-500/20 shadow-[0_0_50px_rgba(139,92,246,0.2)] overflow-hidden';
export const BUTTON_OUTLINE_ACCENT =
  'rounded-lg border border-violet-500/20 text-sm font-medium text-foreground hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/30 transition-colors flex items-center gap-2 w-full px-4 py-2.5';
export const BUTTON_DESTRUCTIVE_GHOST =
  'rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 text-sm font-medium transition-colors flex items-center gap-2 w-full px-4 py-2.5';
export const INPUT_ROUNDED =
  'rounded-xl bg-input-background dark:bg-input/30 border border-border text-foreground placeholder-muted-foreground focus:border-violet-500 dark:focus:border-primary focus:ring-2 focus:ring-violet-500/20 dark:focus:ring-primary/30 outline-none transition-shadow w-full px-3 py-2.5';
export const BUTTON_PRIMARY_ROUNDED =
  'rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-sm font-medium shadow-lg shadow-violet-500/30 transition-opacity flex items-center gap-2 px-4 py-2.5';
