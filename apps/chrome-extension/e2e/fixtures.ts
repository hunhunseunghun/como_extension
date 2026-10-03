import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 기본은 빌드 결과(dist). COMO_EXTENSION_PATH로 압축을 푼 배포 zip 등을 검증할 수 있다.
const EXTENSION_PATH =
  process.env.COMO_EXTENSION_PATH ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

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

// 거래대금 순으로 정렬해 가장 활발한 종목을 위에 두고, 일정 시간 동안 표 내용이 바뀌는지로 실시간 갱신을 확인한다.
export const expectLiveUpdates = async (page: Page, ms = 20_000) => {
  const volumeHeader = page.locator('thead th').last().locator('div').first();
  const firstVolume = () => page.locator('tbody tr').first().locator('td').last().innerText();
  // 오름차순 → 내림차순 순서로 바뀐다.
  for (let i = 0; i < 2; i++) await volumeHeader.click();
  await expect.poll(async () => (await firstVolume()).length).toBeGreaterThan(0);
  const tbody = () => page.locator('tbody').innerText();
  const changes = async (timeout: number) => {
    const before = await tbody();
    await expect.poll(tbody, { timeout, intervals: [500] }).not.toBe(before);
  };
  try {
    await changes(ms / 2);
    return;
  } catch {
    // 거래대금 상위가 주식 토큰이면 주말에 가격이 멈춘다. 늘 거래되는 BTC·ETH로 좁혀 다시 본다.
    // 주말에는 거래소에 따라 BTC도 수십 초씩 같은 값에 머물러 두 종목을 차례로 본다.
  }
  const search = page.getByPlaceholder(/BTC/).first();
  for (const [index, coin] of ['BTC', 'ETH'].entries()) {
    await search.fill(coin);
    try {
      await changes(ms);
      break;
    } catch (error) {
      if (index === 1) throw error;
    }
  }
  await search.fill('');
};

export const totalCount = async (page: Page) =>
  Number((await page.locator('span:text-is("Total") + span').first().innerText()).trim());
