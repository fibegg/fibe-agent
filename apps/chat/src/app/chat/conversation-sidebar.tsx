import { memo, useCallback, useRef, useState } from 'react';
import { MessageSquare, Plus, Trash2, Edit3, Check, X, Search, Link2, ChevronDown, ChevronRight } from 'lucide-react';
import type { ConversationMeta } from './use-conversations';
import { useT } from '../i18n';
import {
  INPUT_SEARCH,
  SEARCH_ICON_POSITION,
  CLEAR_BUTTON_POSITION,
  SEARCH_ROW_WRAPPER,
} from '../ui-classes';

interface ConversationSidebarProps {
  conversations: ConversationMeta[];
  activeId: string;
  loading: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

function timeAgo(iso: string, t: ReturnType<typeof useT>): string {
  const ms = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(ms / 60000);
  if (m < 1) return t('conversation.justNow');
  if (m < 60) return t('conversation.minutesAgo', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('conversation.hoursAgo', { count: h });
  const d = Math.floor(h / 24);
  return t('conversation.daysAgo', { count: d });
}

const ConversationItem = memo(function ConversationItem({
  conv,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  conv: ConversationMeta;
  isActive: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isProtected = conv.id === 'default' || conv.id === 'inbox';

  const startEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(conv.title);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 50);
  }, [conv.title]);

  const commitEdit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== conv.title) onRename(trimmed);
    setEditing(false);
  }, [draft, conv.title, onRename]);

  const cancelEdit = useCallback(() => {
    setDraft(conv.title);
    setEditing(false);
  }, [conv.title]);

  const handleShare = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const url = new URL(window.location.href);
    url.searchParams.set('c', conv.id);
    const shareUrl = url.toString();
    if (navigator.share) {
      void navigator.share({ title: conv.title, url: shareUrl }).catch(() => { /* user cancelled */ });
    } else {
      void navigator.clipboard.writeText(shareUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  }, [conv.id, conv.title]);

  return (
    <div
      onClick={onSelect}
      className={`group relative flex items-start gap-2.5 rounded-lg px-3 py-2.5 cursor-pointer transition-all duration-150
        ${isActive
          ? 'bg-violet-500/15 border border-violet-500/30 text-foreground'
          : 'hover:bg-muted/50 border border-transparent text-muted-foreground hover:text-foreground'
        }`}
    >
      <div className="relative mt-0.5 shrink-0">
        <MessageSquare className={`h-3.5 w-3.5 ${isActive ? 'text-violet-400' : 'text-muted-foreground/50'}`} />
        {conv.isProcessing && (
          <span className="absolute -right-1 -top-1 size-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.75)]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
              className="w-full rounded bg-background/80 px-1.5 py-0.5 text-xs text-foreground outline-none ring-1 ring-violet-500/40"
              autoFocus
            />
            <button onClick={commitEdit} className="shrink-0 text-green-400 hover:text-green-300 transition-colors">
              <Check className="h-3 w-3" />
            </button>
            <button onClick={cancelEdit} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <p className="truncate text-xs font-medium leading-tight">{conv.title}</p>
        )}
        <p className="mt-0.5 text-[10px] text-muted-foreground/50">{timeAgo(conv.lastMessageAt, t)}</p>
      </div>

      {/* Action buttons — visible on hover / active */}
      {!editing && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden items-center gap-1 group-hover:flex">
          <button
            onClick={handleShare}
            className="rounded p-0.5 text-muted-foreground/60 hover:text-violet-400 transition-colors"
            title={copied ? t('common.copied') : t('conversation.shareLink')}
            aria-label={copied ? t('common.copied') : t('conversation.shareLink')}
          >
            {copied
              ? <Check className="h-3 w-3 text-green-400" />
              : <Link2 className="h-3 w-3" />}
          </button>
          {!isProtected && (
            <>
              <button
                onClick={startEdit}
                className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground transition-colors"
                title={t('conversation.rename')}
                aria-label={t('conversation.rename')}
              >
                <Edit3 className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="rounded p-0.5 text-muted-foreground/60 hover:text-red-400 transition-colors"
                title={t('conversation.delete')}
                aria-label={t('conversation.delete')}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export const ConversationSidebar = memo(function ConversationSidebar({
  conversations,
  activeId,
  loading,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  collapsed = false,
  onCollapsedChange,
}: ConversationSidebarProps) {
  const t = useT();
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const toggleLabel = collapsed ? t('conversation.expand') : t('conversation.collapse');

  const filtered = searchQuery.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header + New Chat */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30 shrink-0">
        <button
          type="button"
          onClick={() => onCollapsedChange?.(!collapsed)}
          className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-violet-500/10 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          {collapsed ? (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
          ) : (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
          )}
          <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {t('conversation.title')}
          </span>
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-1 rounded-md bg-violet-500/15 border border-violet-500/25 px-2 py-1 text-[10px] font-medium text-violet-400 hover:bg-violet-500/25 transition-colors"
          title={t('conversation.newChat')}
          aria-label={t('conversation.newChat')}
          id="conversation-sidebar-new-btn"
        >
          <Plus className="h-3 w-3" />
          {t('conversation.new')}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Search */}
          {conversations.length > 0 && (
            <div className="px-2 pt-2 shrink-0">
              <div className={SEARCH_ROW_WRAPPER}>
                <Search className={SEARCH_ICON_POSITION} aria-hidden />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('conversation.searchPlaceholder')}
                  className={INPUT_SEARCH}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className={CLEAR_BUTTON_POSITION}
                    aria-label={t('conversation.clearSearch')}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* List */}
          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-0.5">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-xs text-muted-foreground/50 animate-pulse">{t('common.loading')}</span>
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 px-4 text-center">
                <div className="rounded-full bg-violet-500/10 border border-violet-500/20 p-3">
                  <MessageSquare className="h-5 w-5 text-violet-400/60" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground/70">{t('conversation.emptyTitle')}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{t('conversation.emptyDescription')}</p>
                </div>
                <button
                  type="button"
                  onClick={onCreate}
                  className="flex items-center gap-1.5 rounded-md bg-violet-500/20 border border-violet-500/30 px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-violet-500/30 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  {t('conversation.newConversation')}
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <span className="text-xs text-muted-foreground/50">{t('conversation.noMatches')}</span>
              </div>
            ) : (
              filtered.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={conv.id === activeId}
                  onSelect={() => onSelect(conv.id)}
                  onRename={(title) => onRename(conv.id, title)}
                  onDelete={() => onDelete(conv.id)}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
});
