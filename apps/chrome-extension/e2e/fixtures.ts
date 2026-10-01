import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

type Fixtures = { extContext: BrowserContext; extensionId: string; popup: Page };

// 테스트 파일 하나가 같은 브라우저(서비스 워커)를 공유해 거래소 연결을 한 번만 맺는다.
// `--headed`로 실행하면 브라우저 창을 띄우고 동작을 천천히 보여준다.
export const test = base.extend<object, Fixtures>({
  extContext: [
    async ({ headless }, use) => {
      const context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        headless,
        slowMo: headless ? 0 : 250,
        locale: 'ko-KR',
        viewport: { width: 420, height: 430 },
        args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
      });
      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],
  extensionId: [
    async ({ extContext: context }, use) => {
      let [worker] = context.serviceWorkers();
      if (!worker) worker = await context.waitForEvent('serviceworker');
      await use(worker.url().split('/')[2]);
    },
    { scope: 'worker' },
  ],
  popup: [
    async ({ extContext: context, extensionId }, use) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/popup/index.html`);
      await use(page);
      await page.close();
    },
    { scope: 'worker' },
  ],
});

export const expect = test.expect;

export const rows = (page: Page) => page.locator('tbody tr');

export const switchExchange = async (page: Page, from: string, to: string) => {
  await page.getByRole('button', { name: from }).first().click();
  await page.getByRole('menuitem', { name: to }).click();
};

// 거래가 활발한 BTC 마켓만 남겨 두고, 일정 시간 동안 표 내용이 바뀌는지로 실시간 갱신을 확인한다.
export const expectLiveUpdates = async (page: Page, ms = 10_000) => {
  const search = page.getByPlaceholder(/BTC/).first();
  await search.fill('BTC');
  const before = await page.locator('tbody').innerText();
  await expect.poll(() => page.locator('tbody').innerText(), { timeout: ms, intervals: [500] }).not.toBe(before);
  await search.fill('');
};

export const totalCount = async (page: Page) =>
  Number((await page.locator('span:text-is("Total") + span').first().innerText()).trim());
