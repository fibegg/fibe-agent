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
  remove: (id: string) => Promise<void>;
  switchTo: (id: string) => void;
  refresh: () => void;
}

const ACTIVE_CONV_KEY = 'fibe:activeConversationId';
const DEFAULT_CONVERSATION_ID = 'default';

export function getActiveConversationId(): string {
  return localStorage.getItem(ACTIVE_CONV_KEY) || 'default';
}

function setActiveConversationId(id: string): void {
  localStorage.setItem(ACTIVE_CONV_KEY, id);
}

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string>(getActiveConversationId);
  const mountedRef = useRef(true);

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
      // If stored activeId no longer exists, fall back to first or 'default'
      if (!data.some((c) => c.id === getActiveConversationId())) {
        const fallback = data.find((c) => c.id === DEFAULT_CONVERSATION_ID)?.id ?? data[0]?.id ?? DEFAULT_CONVERSATION_ID;
        setActiveConversationId(fallback);
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
      body: JSON.stringify({ title: 'New chat' }),
    });
    const conv = await res.json() as ConversationMeta;
    setActiveConversationId(conv.id);
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

  const remove = useCallback(async (id: string): Promise<void> => {
    await apiRequest(`/api/conversations/${id}`, { method: 'DELETE' });
    // If deleting active, switch to newest remaining
    if (id === getActiveConversationId()) {
      const remaining = conversations.filter((c) => c.id !== id);
      const next = remaining.find((c) => c.id === DEFAULT_CONVERSATION_ID)?.id ?? remaining[0]?.id ?? DEFAULT_CONVERSATION_ID;
      setActiveConversationId(next);
      setActiveId(next);
    }
    await refresh();
  }, [conversations, refresh]);

  const switchTo = useCallback((id: string): void => {
    setActiveConversationId(id);
    setActiveId(id);
  }, []);

  return { conversations, loading, activeId, create, rename, remove, switchTo, refresh };
}
