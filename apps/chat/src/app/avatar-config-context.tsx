import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadAvatarConfig, type AvatarConfig } from './chat/chat-avatar';

const AvatarConfigContext = createContext<AvatarConfig>({
  userAvatarUrl: undefined,
  assistantAvatarUrl: undefined,
});

export function AvatarConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AvatarConfig>({
    userAvatarUrl: undefined,
    assistantAvatarUrl: undefined,
  });

  useEffect(() => {
    loadAvatarConfig().then(setConfig).catch(() => {/* keep defaults */});
  }, []);

  return (
    <AvatarConfigContext.Provider value={config}>
      {children}
    </AvatarConfigContext.Provider>
  );
}

export function useAvatarConfig(): AvatarConfig {
  return useContext(AvatarConfigContext);
}
