import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api-url';

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
}

interface UseConversationsResult {
  conversations: ConversationMeta[];
  loading: boolean;
  activeId: string;
  create: () => Promise<string>;
  rename: (id: string, title: string) => Promise<void>;
  autoTitle: (id: string, firstMessage: string) => void;
  remove: (id: string) => Promise<void>;
  switchTo: (id: string) => void;
  refresh: () => void;
}

const ACTIVE_CONV_KEY = 'fibe:activeConversationId';
const DEFAULT_CONVERSATION_ID = 'default';
const DEFAULT_TITLE = 'New chat';
const URL_PARAM = 'c';
/** Max characters to use from the first message as the auto-generated title. */
const AUTO_TITLE_MAX_LEN = 60;

export function getActiveConversationId(): string {
  return localStorage.getItem(ACTIVE_CONV_KEY) || 'default';
}

function setActiveConversationId(id: string): void {
  localStorage.setItem(ACTIVE_CONV_KEY, id);
}

/** Read ?c= from the current URL, returns null if absent. */
function readUrlConversationId(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(URL_PARAM);
  } catch {
    return null;
  }
}

/** Push conversation ID into the URL query without a page reload. */
function pushUrlConversationId(id: string): void {
  try {
    const url = new URL(window.location.href);
    if (id === DEFAULT_CONVERSATION_ID) {
      url.searchParams.delete(URL_PARAM);
    } else {
      url.searchParams.set(URL_PARAM, id);
    }
    window.history.replaceState(null, '', url.toString());
  } catch {
    // ignore in SSR/test environments
  }
}

/** Derive a short title from the first message sent in a conversation. */
function deriveTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return DEFAULT_TITLE;
  return clean.length <= AUTO_TITLE_MAX_LEN ? clean : `${clean.slice(0, AUTO_TITLE_MAX_LEN - 1)}…`;
}

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [loading, setLoading] = useState(true);
  // Initialise from URL param first, then localStorage
  const [activeId, setActiveId] = useState<string>(() => readUrlConversationId() ?? getActiveConversationId());
  const mountedRef = useRef(true);
  /** Track which conversations have already been auto-titled this session. */
  const autoTitledRef = useRef(new Set<string>());

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await apiRequest('/api/conversations');
      if (!res.ok || !mountedRef.current) return;
      const parsed = await res.json() as ConversationMeta[];
      const data = Array.isArray(parsed) ? parsed : [];
      setConversations(data);
      // Validate current active ID — URL param may point to a non-existent conversation
      const currentId = getActiveConversationId();
      if (!data.some((c) => c.id === currentId)) {
        const fallback = data.find((c) => c.id === DEFAULT_CONVERSATION_ID)?.id ?? data[0]?.id ?? DEFAULT_CONVERSATION_ID;
        setActiveConversationId(fallback);
        pushUrlConversationId(fallback);
        setActiveId(fallback);
      }
    } catch {
      // ignore fetch errors
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const create = useCallback(async (): Promise<string> => {
    const res = await apiRequest('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: DEFAULT_TITLE }),
    });
    const conv = await res.json() as ConversationMeta;
    setActiveConversationId(conv.id);
    pushUrlConversationId(conv.id);
    setActiveId(conv.id);
    await refresh();
    return conv.id;
  }, [refresh]);

  const rename = useCallback(async (id: string, title: string): Promise<void> => {
    await apiRequest(`/api/conversations/${id}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    await refresh();
  }, [refresh]);

  /**
   * Auto-rename a conversation after the first message if the title is still
   * the default. Fire-and-forget — no blocking of the send flow.
   */
  const autoTitle = useCallback((id: string, firstMessage: string): void => {
    // Skip if already done this session or if it's the special default conversation.
    if (autoTitledRef.current.has(id)) return;
    // Check current title against default — find the conversation
    const conv = conversations.find((c) => c.id === id);
    if (conv && conv.title !== DEFAULT_TITLE) return; // Already has a custom title
    autoTitledRef.current.add(id);
    const title = deriveTitle(firstMessage);
    if (!title || title === DEFAULT_TITLE) return;
    void apiRequest(`/api/conversations/${id}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).then(() => {
      if (mountedRef.current) void refresh();
    }).catch(() => { /* non-blocking */ });
  }, [conversations, refresh]);

  const remove = useCallback(async (id: string): Promise<void> => {
    await apiRequest(`/api/conversations/${id}`, { method: 'DELETE' });
    autoTitledRef.current.delete(id);
    // If deleting active, switch to newest remaining
    if (id === getActiveConversationId()) {
      const remaining = conversations.filter((c) => c.id !== id);
      const next = remaining.find((c) => c.id === DEFAULT_CONVERSATION_ID)?.id ?? remaining[0]?.id ?? DEFAULT_CONVERSATION_ID;
      setActiveConversationId(next);
      pushUrlConversationId(next);
      setActiveId(next);
    }
    await refresh();
  }, [conversations, refresh]);

  const switchTo = useCallback((id: string): void => {
    setActiveConversationId(id);
    pushUrlConversationId(id);
    setActiveId(id);
  }, []);

  return { conversations, loading, activeId, create, rename, autoTitle, remove, switchTo, refresh };
}
