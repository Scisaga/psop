import { defineConfig } from '@playwright/test';

// Keep local preview readiness requests out of a host-configured HTTP proxy.
process.env.NO_PROXY = [process.env.NO_PROXY, '127.0.0.1', 'localhost', '::1'].filter(Boolean).join(',');

export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8780',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1600, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:8780',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
