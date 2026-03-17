import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api-url';
import { API_PATHS } from '../api-paths';
import type { ChatMessage } from './message-list';

export function useChatInitialData(authenticated: boolean) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  const loadMessages = useCallback(async () => {
    try {
      const res = await apiRequest(API_PATHS.MESSAGES);
      if (res.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      const data = (await res.json()) as ChatMessage[];
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      setMessages([]);
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

  useEffect(() => {
    if (authenticated) {
      loadMessages();
      loadModelOptions();
    }
  }, [authenticated, loadMessages, loadModelOptions]);

  return { messages, setMessages, modelOptions, loadMessages };
}
