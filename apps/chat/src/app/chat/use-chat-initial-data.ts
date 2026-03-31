import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api-url';
import { API_PATHS } from '@shared/api-paths';
import type { ChatMessage } from './message-list';

export function useChatInitialData(authenticated: boolean) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);

  const loadMessages = useCallback(async () => {
    try {
      const res = await apiRequest(API_PATHS.MESSAGES);
      if (res.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      const data = (await res.json()) as ChatMessage[];
      setMessages(Array.isArray(data) ? data : []);
      setMessagesLoaded(true);
    } catch {
      setMessages([]);
      setMessagesLoaded(true);
    }
  }, [navigate]);

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

  useEffect(() => {
    if (authenticated) {
      loadMessages();
      loadModelOptions();
    }
  }, [authenticated, loadMessages, loadModelOptions]);

  return { messages, setMessages, messagesLoaded, modelOptions, refreshingModels, loadMessages, refreshModelOptions };
}
