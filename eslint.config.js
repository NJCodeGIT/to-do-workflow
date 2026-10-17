import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  { ignores: ['**/dist/', '**/coverage/', 'work/', '.claude/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['server/**/*.ts', '*.js', 'client/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  prettier,
);
