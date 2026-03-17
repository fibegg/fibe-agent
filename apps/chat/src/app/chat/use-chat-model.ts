import { useCallback, useRef, useState } from 'react';

const MODEL_DEBOUNCE_MS = 500;

type SendFn = (payload: Record<string, unknown>) => void;

export function useChatModel(sendRef: React.MutableRefObject<SendFn | (() => void)>) {
  const [currentModel, setCurrentModel] = useState('');
  const modelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleModelSelect = useCallback((model: string) => {
    setCurrentModel(model);
    sendRef.current({ action: 'set_model', model });
  }, [sendRef]);

  const handleModelInputChange = useCallback(
    (value: string) => {
      setCurrentModel(value);
      if (modelDebounceRef.current) clearTimeout(modelDebounceRef.current);
      modelDebounceRef.current = setTimeout(() => {
        modelDebounceRef.current = null;
        sendRef.current({ action: 'set_model', model: value.trim() });
      }, MODEL_DEBOUNCE_MS);
    },
    [sendRef]
  );

  return {
    currentModel,
    setCurrentModel,
    handleModelSelect,
    handleModelInputChange,
  };
}
