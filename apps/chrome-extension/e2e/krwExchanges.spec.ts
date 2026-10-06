import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { expectLiveUpdates, rows, switchExchange, totalCount } from './fixtures';

// 코인원·디지털엑스는 선택 권한이라 테스트 브라우저에서는 권한 창을 누를 수 없다.
// 빌드 결과를 복사해 두 거래소 주소를 기본 권한으로 옮긴 확장으로 시세 흐름을 검증한다.
const DIST =
  process.env.COMO_EXTENSION_PATH ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

let context: BrowserContext;
let popup: Page;
const errors: string[] = [];

test.describe.serial('코인원·디지털엑스 (권한을 받은 상태)', () => {
  test.beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'como-krw-'));
    fs.cpSync(DIST, dir, { recursive: true });
    const manifestPath = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    // 빗썸 공지(feed-api)도 선택 권한이라 함께 옮겨 공지 흐름을 본다.
    const optional = ['https://api.coinone.co.kr/*', 'https://api.digitalx.miraeasset.com/*', 'https://feed-api.bithumb.com/*'];
    manifest.host_permissions.push(...optional);
    manifest.optional_host_permissions = manifest.optional_host_permissions.filter((o: string) => !optional.includes(o));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      locale: 'ko-KR',
      viewport: { width: 420, height: 430 },
      args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
    });
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    worker.on('console', message => message.type() === 'error' && errors.push(message.text()));
    const extensionId = worker.url().split('/')[2];
    popup = await context.newPage();
    popup.on('pageerror', error => errors.push(error.message));
    // 첫 실행 안내는 건너뛴다.
    await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
    await popup.evaluate(() => chrome.storage.local.set({ onboardingPending: false }));
    await popup.reload();
    await expect(rows(popup).nth(5)).toBeVisible();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  for (const [from, to, tradeHost] of [
    ['업비트', '코인원', 'coinone.co.kr'],
    ['코인원', '디지털엑스', 'digitalx.miraeasset.com'],
  ] as const) {
    test(`${to} 원화 마켓이 한글 이름·김프와 함께 실시간으로 갱신된다`, async () => {
      test.slow();
      await switchExchange(popup, from, to);
      await expect(rows(popup).nth(5)).toBeVisible();
      await expect.poll(() => totalCount(popup)).toBeGreaterThan(100);
      // 업비트·빗썸 마켓 정보에서 빌려 온 한글 이름
      await popup.getByPlaceholder(/BTC/).first().fill('비트코인');
      const btc = rows(popup).filter({ has: popup.locator(`a[href*="${tradeHost}"]`) }).first();
      await expect(btc).toContainText('비트코인');
      await popup.getByPlaceholder(/BTC/).first().fill('');
      // 디지털엑스는 거래가 뜸해 20초 동안 표가 그대로일 수 있어 더 오래 본다.
      await expectLiveUpdates(popup, to === '디지털엑스' ? 60_000 : 20_000);

      // 와이드 화면에서는 김프 열을 보여 준다.
      await popup.locator('button:has(svg.lucide-maximize)').click();
      await popup.setViewportSize({ width: 800, height: 600 });
      await expect(popup.locator('thead')).toContainText('김프');
      // 김프 열(5번째 칸)에 값이 채워진다. 거래대금 1위는 BTC 같은 큰 코인이라 바이낸스에도 있다.
      const kimchiCells = popup.locator('tbody tr').locator('td:nth-child(5)').filter({ hasText: /^[+-]\d+\.\d{2}%/ });
      await expect.poll(() => kimchiCells.count(), { timeout: 30_000 }).toBeGreaterThan(3);
      await popup.screenshot({ path: test.info().outputPath(`${to}-wide.png`) });
      await popup.locator('button:has(svg.lucide-minimize)').click();
      await popup.setViewportSize({ width: 420, height: 430 });

      // 차트가 열린다.
      await rows(popup).first().locator('svg.lucide-chart-candlestick').click();
      await expect(popup.locator('.tooltip canvas').first()).toBeVisible({ timeout: 15_000 });
      await popup.mouse.click(5, 5);
    });
  }

  test('지정가 알림을 코인원 종목에도 걸 수 있다(백그라운드 시세 저장소)', async () => {
    const tickers = (await popup.evaluate(() => chrome.runtime.sendMessage({ action: 'getAllExchangesTickers' }))) as {
      exchange: string;
      market: string;
      currentPrice: number;
    }[];
    expect(tickers.filter(t => t.exchange === 'coinone' && t.currentPrice > 0).length).toBeGreaterThan(100);
    expect(tickers.filter(t => t.exchange === 'digitalx' && t.currentPrice > 0).length).toBeGreaterThan(100);
  });

  test('빗썸 거래 공지: 켜면 기준을 잡고, 새 공지를 알린다(권한을 받은 상태)', async () => {
    const [worker] = context.serviceWorkers();
    const created = await worker.evaluate(async () => {
      const list: { id: string; message?: string }[] = [];
      const original = chrome.notifications.create;
      (chrome.notifications as unknown as { create: (id: string, o: { message?: string }) => void }).create = (id, o) =>
        list.push({ id, message: o?.message });
      await chrome.storage.local.set({ bithumbNoticeAlerts: true });
      // 켜자마자 기준 번호를 잡는다.
      let lastId;
      for (let i = 0; i < 50 && lastId == null; i++) {
        await new Promise(r => setTimeout(r, 200));
        lastId = (await chrome.storage.local.get('lastBithumbNoticeId')).lastBithumbNoticeId;
      }
      if (lastId == null) return { lastId, list };
      // 가장 최근 공지를 아직 못 본 것처럼 기준을 하나 내리고 확인을 돌린다.
      await chrome.storage.local.set({ lastBithumbNoticeId: lastId - 1 });
      await chrome.alarms.create('noticeCheck', { when: Date.now() + 100 });
      for (let i = 0; i < 50 && !list.length; i++) await new Promise(r => setTimeout(r, 200));
      chrome.notifications.create = original;
      await chrome.storage.local.set({ bithumbNoticeAlerts: false });
      await chrome.alarms.create('noticeCheck', { periodInMinutes: 2 });
      return { lastId, list };
    });
    expect(created.lastId).toEqual(expect.any(Number));
    expect(created.list.map(item => item.id)).toContain(`notice:bithumb:${created.lastId}`);
    expect(created.list[0].message).toMatch(/^BITHUMB · /);
  });

  test('런타임 에러가 없다', async () => {
    await switchExchange(popup, '디지털엑스', '업비트');
    expect(errors).toEqual([]);
  });
});
