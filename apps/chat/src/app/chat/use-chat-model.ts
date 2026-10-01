import { useCallback, useEffect, useRef, useState } from 'react';

const MODEL_DEBOUNCE_MS = 500;

type SendFn = (payload: Record<string, unknown>) => void;

export function useChatModel(sendRef: React.MutableRefObject<SendFn | (() => void)>) {
  const [currentModel, setCurrentModel] = useState('');
  const modelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingInput = useCallback(() => {
    if (modelDebounceRef.current) clearTimeout(modelDebounceRef.current);
    modelDebounceRef.current = null;
  }, []);

  useEffect(() => cancelPendingInput, [cancelPendingInput]);

  const handleModelSelect = useCallback((model: string) => {
    cancelPendingInput();
    setCurrentModel(model);
    sendRef.current({ action: 'set_model', model });
  }, [sendRef, cancelPendingInput]);

  const handleModelInputChange = useCallback(
    (value: string) => {
      setCurrentModel(value);
      cancelPendingInput();
      modelDebounceRef.current = setTimeout(() => {
        modelDebounceRef.current = null;
        sendRef.current({ action: 'set_model', model: value.trim() });
      }, MODEL_DEBOUNCE_MS);
    },
    [sendRef, cancelPendingInput]
  );

  return {
    currentModel,
    setCurrentModel,
    handleModelSelect,
    handleModelInputChange,
  };
}
