/// <reference types='vitest' />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootPkg = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../package.json'), 'utf-8')
) as { version: string };

const CHAT_ENV_KEYS = [
  'API_URL',
  'LOCK_CHAT_MODEL',
  'USER_AVATAR_URL',
  'ASSISTANT_AVATAR_URL',
] as const;

function chatEnvDefine() {
  const entries = CHAT_ENV_KEYS.map((key) => [
    `__${key}__`,
    JSON.stringify(process.env[key] ?? ''),
  ]);
  return Object.fromEntries(entries);
}

export default defineConfig(() => ({
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
    ...chatEnvDefine(),
  },
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/chat',
  server: {
    port: 3100,
    host: 'localhost',
    allowedHosts: ['.ngrok-free.dev'],
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'http://localhost:3000', ws: true },
    },
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  plugins: [react()],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-lucide';
          }
          if (id.includes('node_modules/marked')) {
            return 'vendor-markdown';
          }
          if (id.includes('node_modules/prismjs')) {
            return 'vendor-prism';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    name: '@playgrounds.dev/chat',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
