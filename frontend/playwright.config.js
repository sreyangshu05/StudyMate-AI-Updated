import { defineConfig } from 'playwright/test';

// End-to-end browser tests.
//
// Global setup boots the REAL backend (real createApp + real HTTP server,
// with a deterministic stub AI provider so Q&A/quiz are stable) and serves the
// PRODUCTION build of the frontend (dist-e2e, VITE_API_BASE_URL=/api) behind a
// same-origin /api proxy — mirroring the nginx deployment topology. The spec
// then drives real browser flows against that stack.
//
// Run: cd frontend && bun run test:e2e
// (dist-e2e is produced by the pretest:e2e build step; browsers installed via
//  `bunx playwright install chromium`).

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.js',
  outputDir: './e2e/results',
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_FRONTEND_URL || 'http://127.0.0.1:4173',
    headless: true,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
