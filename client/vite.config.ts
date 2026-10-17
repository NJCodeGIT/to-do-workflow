import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', ''); // root .env, read by config only; not exposed to the bundle
  const apiPort = env.PORT || '3001';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: `http://localhost:${apiPort}` } },
    },
    test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
  };
});
