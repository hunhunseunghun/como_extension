import { defineConfig } from '@playwright/test';

// 빌드된 확장(dist)을 Chromium에 로드해 실제 거래소 API로 검증한다. 먼저 `pnpm build`가 필요하다.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  outputDir: './e2e/.results',
});
