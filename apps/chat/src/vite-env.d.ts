/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare const __API_URL__: string;
declare const __LOCK_CHAT_MODEL__: string;


interface ImportMetaEnv {
  [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
