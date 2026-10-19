import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Fresh SQLite file per run, removed afterwards. The secret is a throwaway test value.
const dbPath = join(tmpdir(), `todo-e2e-${process.pid}.db`);
process.on('exit', () => {
  for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(dbPath + suffix, { force: true });
});

const CLIENT_URL = 'http://localhost:5173';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: CLIENT_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional: use an already-installed Chromium (e.g. a cloud sandbox) instead of the
        // one `npx playwright install chromium` downloads.
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: 'npm run migrate && npm run dev',
    url: CLIENT_URL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_PATH: dbPath,
      JWT_SECRET: 'e2e-only-secret-not-for-real-use-0123456789',
      PORT: '3001',
    },
  },
});
