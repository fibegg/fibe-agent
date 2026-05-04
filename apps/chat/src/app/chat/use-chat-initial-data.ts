import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api-url';
import { API_PATHS, API_PATH_CONVERSATION_MESSAGES } from '@shared/api-paths';
import type { ChatListItem } from './message-list';

function messagesPathForConversation(conversationId: string): string {
  return conversationId === 'default'
    ? API_PATHS.MESSAGES
    : API_PATH_CONVERSATION_MESSAGES(conversationId);
}

export function useChatInitialData(authenticated: boolean, conversationId = 'default') {
  const navigate = useNavigate();
  const [messages, setMessagesState] = useState<ChatListItem[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [messagesLoadError, setMessagesLoadError] = useState(false);
  const [agentProvider, setAgentProvider] = useState<string | null>(null);
  const loadSeqRef = useRef(0);
  const messageCacheRef = useRef(new Map<string, ChatListItem[]>());

  const setMessages = useCallback((value: SetStateAction<ChatListItem[]>) => {
    setMessagesState((prev) => {
      const next = typeof value === 'function'
        ? (value as (prevState: ChatListItem[]) => ChatListItem[])(prev)
        : value;
      messageCacheRef.current.set(conversationId, next);
      return next;
    });
  }, [conversationId]);

  const loadMessages = useCallback(async () => {
    const loadSeq = loadSeqRef.current + 1;
    loadSeqRef.current = loadSeq;
    setMessagesState(messageCacheRef.current.get(conversationId) ?? []);
    setMessagesLoaded(false);
    setMessagesLoadError(false);

    try {
      const res = await apiRequest(messagesPathForConversation(conversationId));
      if (res.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load messages: ${res.status}`);
      }
      const data = (await res.json()) as ChatListItem[];
      if (loadSeq !== loadSeqRef.current) return;
      const next = Array.isArray(data) ? data : [];
      messageCacheRef.current.set(conversationId, next);
      setMessagesState(next);
      setMessagesLoadError(false);
      setMessagesLoaded(true);
    } catch {
      if (loadSeq !== loadSeqRef.current) return;
      setMessagesState(messageCacheRef.current.get(conversationId) ?? []);
      setMessagesLoadError(true);
      setMessagesLoaded(true);
    }
  }, [conversationId, navigate]);

  const loadModelOptions = useCallback(async () => {
    try {
      const res = await apiRequest(API_PATHS.MODEL_OPTIONS);
      if (res.status === 401) return;
      const data = (await res.json()) as string[];
      setModelOptions(Array.isArray(data) ? data : []);
    } catch {
      setModelOptions([]);
    }
  }, []);

  const refreshModelOptions = useCallback(async () => {
    setRefreshingModels(true);
    try {
      const res = await apiRequest(API_PATHS.REFRESH_MODEL_OPTIONS, { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as string[];
        setModelOptions(Array.isArray(data) ? data : []);
      }
    } catch {
      // Silently fail — keep existing options
    } finally {
      setRefreshingModels(false);
    }
  }, []);

  const loadRuntimeConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/runtime-config');
      if (res.ok) {
        const data = await res.json() as { agentProvider: string | null };
        setAgentProvider(data.agentProvider);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    loadRuntimeConfig();
  }, [loadRuntimeConfig]);

  useEffect(() => {
    if (authenticated) {
      loadMessages();
      loadModelOptions();
    }
  }, [authenticated, loadMessages, loadModelOptions]);

  return { messages, setMessages, messagesLoaded, messagesLoadError, modelOptions, refreshingModels, loadMessages, refreshModelOptions, agentProvider };
}
