import type { Page, Worker } from '@playwright/test';
import { expect, rows, test } from './fixtures';

// 3.5.0: 알림 기록함·차트 보조지표·김프 차익 계산기·보유 자산 기간별 손익·빗썸 공지 열기.
// 경제 일정(선택 권한)은 권한을 넣은 krwExchanges.spec에서 본다.

type Captured = { id: string; title?: string; message?: string };
const errors: string[] = [];
let worker: Worker;

const setStorage = (page: Page, values: Record<string, unknown>) => page.evaluate(values => chrome.storage.local.set(values), values);
const getStorage = (page: Page, key: string) => page.evaluate(key => chrome.storage.local.get(key).then(result => result[key]), key);
const popover = (page: Page) => page.locator('[data-radix-popper-content-wrapper]');

test.describe.serial('3.5.0 새 기능 (실시간 거래소 API)', () => {
  test.beforeAll(async ({ extContext, popup }) => {
    [worker] = extContext.serviceWorkers();
    popup.on('pageerror', error => errors.push(error.message));
    worker.on('console', message => message.type() === 'error' && errors.push(message.text()));
    // OS 알림 대신 만들어진 알림을 모은다.
    await worker.evaluate(() => {
      const target = self as unknown as { __captured: Captured[] };
      target.__captured = [];
      (chrome.notifications as unknown as { create: (id: string, options: Captured) => void }).create = (id, options) =>
        target.__captured.push({ id, title: options?.title, message: options?.message });
    });
    await setStorage(popup, { onboardingPending: false });
    await popup.reload();
    await expect(rows(popup).nth(5)).toBeVisible();
  });

  test('알림 기록함: 울린 알림이 쌓이고, 종 아이콘에 새 알림 점이 뜨며, 누르면 거래 화면을 연다', async ({ popup, extContext }) => {
    await setStorage(popup, { alertHistory: [], alertHistorySeenAt: Date.now() });
    await expect(popup.getByTestId('alert-unread')).toHaveCount(0);
    await setStorage(popup, {
      alertRules: [{ id: 'hist', type: 'change', exchange: 'upbit', market: 'KRW-BTC', threshold: 0.0001 }],
      alertRuleState: {},
    });
    await expect.poll(async () => ((await getStorage(popup, 'alertHistory')) as Captured[] | undefined)?.length ?? 0, { timeout: 40_000 }).toBeGreaterThan(0);
    await setStorage(popup, { alertRules: [], alertRuleState: {} });
    await expect(popup.getByTestId('alert-unread')).toBeVisible();

    await popup.locator('button:has(svg.lucide-bell)').click();
    await popover(popup).getByRole('tab', { name: '기록' }).click();
    const entry = popover(popup).getByTestId('alert-entry').first();
    await expect(entry).toContainText('KRW-BTC');
    await expect(entry).toContainText('24시간 변동');
    await expect(popup.getByTestId('alert-unread')).toHaveCount(0);
    await popup.screenshot({ path: test.info().outputPath('alert-history.png') });

    const [tab] = await Promise.all([extContext.waitForEvent('page'), entry.click()]);
    await expect.poll(() => tab.url()).toContain('upbit.com/exchange?code=CRIX.UPBIT.KRW-BTC');
    await tab.close();
    await popover(popup).getByRole('button', { name: '모두 지우기' }).click();
    await expect(popover(popup).getByTestId('alert-entry')).toHaveCount(0);
    await popup.keyboard.press('Escape');
  });

  test('빗썸 공지 알림을 누르면 빗썸 공지 페이지를 연다', async ({ popup, extContext }) => {
    const [tab] = await Promise.all([
      extContext.waitForEvent('page'),
      popup.evaluate(() => chrome.runtime.sendMessage({ action: 'openAlertTarget', id: 'notice:bithumb:1655185' })),
    ]);
    await expect.poll(() => tab.url()).toContain('feed.bithumb.com/notice/1655185');
    await tab.close();
  });

  test('차트 보조지표: MA·BB·RSI를 켜고 끄면 저장되고, RSI는 아래 칸을 만든다', async ({ popup }) => {
    await setStorage(popup, { chartIndicators: { ma: false, bb: false, rsi: false } });
    await rows(popup).first().locator('svg.lucide-chart-candlestick').click();
    const toolbar = popup.getByTestId('chart-indicators');
    await expect(toolbar).toBeVisible({ timeout: 20_000 });
    const canvases = () => popup.locator('.chart-container canvas').count();
    // 버튼은 데이터가 오면 바로 뜨고, 캔버스는 차트 라이브러리를 불러온 뒤 생긴다.
    await expect.poll(canvases, { timeout: 15_000 }).toBeGreaterThan(0);
    const before = await canvases();
    for (const name of ['MA', 'BB', 'RSI']) {
      await toolbar.getByRole('button', { name }).click();
      await expect(toolbar.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    }
    await expect.poll(() => getStorage(popup, 'chartIndicators')).toEqual({ ma: true, bb: true, rsi: true });
    // RSI 칸(pane)이 생기면 캔버스가 늘어난다.
    await expect.poll(canvases).toBeGreaterThan(before);
    await popup.screenshot({ path: test.info().outputPath('chart-indicators.png') });
    // 차트를 닫았다가 다시 열어도 켜 둔 지표(RSI 칸)를 그린다(캐시로 같은 데이터가 와도).
    const withRsi = await canvases();
    await popup.keyboard.press('Escape');
    await rows(popup).first().locator('svg.lucide-chart-candlestick').click();
    await expect(toolbar.getByRole('button', { name: 'RSI' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(canvases, { timeout: 15_000 }).toBe(withRsi);
    await toolbar.getByRole('button', { name: 'RSI' }).click();
    await expect.poll(canvases).toBe(before);
    await popup.keyboard.press('Escape');
    await setStorage(popup, { chartIndicators: { ma: false, bb: false, rsi: false } });
  });

  test('김프 차익 계산기: 실시간 가격으로 테더 기준 김프와 예상 손익을 계산한다', async ({ popup }) => {
    await popup.getByRole('button', { name: '시장 인사이트' }).click();
    const content = popover(popup);
    await content.getByRole('tab', { name: '차익' }).click();
    const panel = content.getByTestId('arbitrage');
    await expect(panel).toContainText(/김프 \(테더 시세 기준\)\s*[+-]\d+\.\d{2}%/, { timeout: 20_000 });
    const profit = panel.getByTestId('arb-profit');
    await expect(profit).toContainText(/₩/);
    const toKorea = await profit.innerText();
    await panel.getByLabel('옮기는 방향').selectOption('toGlobal');
    await expect(profit).not.toHaveText(toKorea);
    // 출금 수수료를 크게 넣으면 손해가 커진다.
    await panel.getByLabel('출금 수수료 (코인 개수)').fill('100');
    await expect(profit).toContainText('-');
    await popup.screenshot({ path: test.info().outputPath('arbitrage.png') });
    await panel.getByLabel('코인 (예: BTC)').fill('NOPECOIN');
    await expect(panel).toContainText('가격이 없어요');
    await popup.keyboard.press('Escape');
  });

  test('보유 자산 기간별 손익: 지난 기록과 비교해 1·7·30일 손익을 보여 주고 오늘 칸을 기록한다', async ({ popup }) => {
    const day = (offset: number) => new Date(Date.now() + 9 * 3_600_000 - offset * 86_400_000).toISOString().slice(0, 10);
    // 평단 1억 원 BTC 0.01개(원금 100만 원). 1일 전·8일 전·31일 전 기록(통화별 원래 금액)을 넣어 둔다.
    await setStorage(popup, {
      portfolio: [{ id: 'h', exchange: 'upbit', market: 'KRW-BTC', quantity: 0.01, avgPrice: 100_000_000 }],
      portfolioHistory: [
        { d: day(31), v: { KRW: 900_000 }, c: { KRW: 1_000_000 } },
        { d: day(8), v: { KRW: 1_000_000 }, c: { KRW: 1_000_000 } },
        { d: day(1), v: { KRW: 1_100_000 }, c: { KRW: 1_000_000 } },
      ],
    });
    await popup.reload();
    await expect(rows(popup).nth(5)).toBeVisible();
    await popup.getByRole('button', { name: '보유 자산' }).click();
    const history = popover(popup).getByTestId('portfolio-history');
    await expect(history).toBeVisible({ timeout: 15_000 });
    for (const label of ['1일', '7일', '30일']) await expect(history).toContainText(label);
    await expect(history).toContainText(/[+-]\d+\.\d%/);
    await expect(history.getByTestId('history-line')).toBeVisible();
    await popup.screenshot({ path: test.info().outputPath('portfolio-history.png') });
    // 화면에 보인 합계로 오늘 칸을 기록한다.
    await expect
      .poll(async () => ((await getStorage(popup, 'portfolioHistory')) as { d: string }[]).map(item => item.d), { timeout: 10_000 })
      .toContain(day(0));
    await popup.keyboard.press('Escape');
    await setStorage(popup, { portfolio: [], portfolioHistory: [] });
  });

  test('백그라운드도 1시간마다 보유 자산 평가금액을 기록한다', async ({ popup }) => {
    await setStorage(popup, {
      portfolio: [{ id: 'b', exchange: 'upbit', market: 'KRW-BTC', quantity: 0.01, avgPrice: 100_000_000 }],
      portfolioHistory: [],
    });
    await worker.evaluate(() => chrome.alarms.create('portfolioSnapshot', { when: Date.now() + 100 }));
    await expect
      .poll(async () => ((await getStorage(popup, 'portfolioHistory')) as { v: { KRW?: number } }[] | undefined)?.[0]?.v?.KRW ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(100_000);
    await worker.evaluate(() => chrome.alarms.create('portfolioSnapshot', { periodInMinutes: 60 }));
    await setStorage(popup, { portfolio: [], portfolioHistory: [] });
  });

  test('런타임 에러가 없다', async () => {
    expect(errors).toEqual([]);
  });
});
