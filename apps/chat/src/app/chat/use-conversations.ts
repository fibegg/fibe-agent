import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api-url';

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
  readonly?: boolean;
  system?: boolean;
  hiddenWhenEmpty?: boolean;
  messageCount?: number;
  isProcessing?: boolean;
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
const AUTO_TITLE_MAX_LEN = 60;

export function getActiveConversationId(): string {
  return (
    readUrlConversationId() ??
    readStoredConversationId() ??
    DEFAULT_CONVERSATION_ID
  );
}

function readStoredConversationId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CONV_KEY) || null;
  } catch {
    return null;
  }
}

function setActiveConversationId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_CONV_KEY, id);
  } catch {
    // Storage may be unavailable in private or embedded contexts.
  }
}

function readUrlConversationId(): string | null {
  try {
    const id = new URLSearchParams(window.location.search)
      .get(URL_PARAM)
      ?.trim();
    return id || null;
  } catch {
    return null;
  }
}

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
    // URL history may be unavailable in embedded contexts.
  }
}

function deriveTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return DEFAULT_TITLE;
  return clean.length <= AUTO_TITLE_MAX_LEN
    ? clean
    : `${clean.slice(0, AUTO_TITLE_MAX_LEN - 1)}…`;
}

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string>(() =>
    getActiveConversationId(),
  );
  const activeIdRef = useRef(activeId);
  const mountedRef = useRef(true);
  const autoTitledRef = useRef(new Set<string>());

  const applyActiveConversation = useCallback((id: string): void => {
    activeIdRef.current = id;
    setActiveConversationId(id);
    pushUrlConversationId(id);
    setActiveId(id);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await apiRequest('/api/conversations');
      if (!res.ok || !mountedRef.current) return;
      const parsed = (await res.json()) as ConversationMeta[];
      const data = Array.isArray(parsed) ? parsed : [];
      setConversations(data);
      // A bookmarked conversation may have been deleted.
      const currentId = activeIdRef.current || getActiveConversationId();
      if (!data.some((c) => c.id === currentId)) {
        const fallback =
          data.find((c) => c.id === DEFAULT_CONVERSATION_ID)?.id ??
          data[0]?.id ??
          DEFAULT_CONVERSATION_ID;
        applyActiveConversation(fallback);
      } else {
        applyActiveConversation(currentId);
      }
    } catch {
      // Keep the last known conversation list when refresh fails.
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [applyActiveConversation]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onPopState = () => {
      applyActiveConversation(getActiveConversationId());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyActiveConversation]);

  const create = useCallback(async (): Promise<string> => {
    const res = await apiRequest('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: DEFAULT_TITLE }),
    });
    const conv = (await res.json()) as ConversationMeta;
    applyActiveConversation(conv.id);
    await refresh();
    return conv.id;
  }, [applyActiveConversation, refresh]);

  const rename = useCallback(
    async (id: string, title: string): Promise<void> => {
      await apiRequest(`/api/conversations/${id}/title`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      await refresh();
    },
    [refresh],
  );

  /** Auto-renames the default title without blocking message delivery. */
  const autoTitle = useCallback(
    (id: string, firstMessage: string): void => {
      if (autoTitledRef.current.has(id)) return;
      const conv = conversations.find((c) => c.id === id);
      if (conv && conv.title !== DEFAULT_TITLE) return;
      autoTitledRef.current.add(id);
      const title = deriveTitle(firstMessage);
      if (!title || title === DEFAULT_TITLE) return;
      void apiRequest(`/api/conversations/${id}/title`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
        .then(() => {
          if (mountedRef.current) void refresh();
        })
        .catch(() => {
          // Title updates must not block message delivery.
        });
    },
    [conversations, refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await apiRequest(`/api/conversations/${id}`, { method: 'DELETE' });
      autoTitledRef.current.delete(id);
      if (id === activeIdRef.current) {
        applyActiveConversation(DEFAULT_CONVERSATION_ID);
      }
      await refresh();
    },
    [applyActiveConversation, refresh],
  );

  const switchTo = useCallback(
    (id: string): void => {
      applyActiveConversation(id);
    },
    [applyActiveConversation],
  );

  return {
    conversations,
    loading,
    activeId,
    create,
    rename,
    autoTitle,
    remove,
    switchTo,
    refresh,
  };
}
