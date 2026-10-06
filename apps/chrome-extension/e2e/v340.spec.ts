import type { Page, Worker } from '@playwright/test';
import { expect, rows, test } from './fixtures';

// 3.4.0: 단기 급등락·방해 금지·업비트 시장경보·빗썸 공지·대량 체결·OI·ATH·알트시즌·계산기·과세 미리보기.
// 실제 거래소 API로 검증한다. 알림은 서비스 워커의 chrome.notifications.create를 가로채 만들어진 것을 모은다.

type Captured = { id: string; title?: string; message?: string };
const errors: string[] = [];
let worker: Worker;

const captured = () => worker.evaluate(() => (self as unknown as { __captured: Captured[] }).__captured);
const clearCaptured = () => worker.evaluate(() => ((self as unknown as { __captured: Captured[] }).__captured.length = 0));
const waitForNotification = async (match: RegExp, timeout = 40_000) => {
  await expect.poll(async () => (await captured()).some(item => match.test(item.id)), { timeout, intervals: [500] }).toBe(true);
  return (await captured()).find(item => match.test(item.id))!;
};
const setStorage = (page: Page, values: Record<string, unknown>) =>
  page.evaluate(values => chrome.storage.local.set(values), values);
const popover = (page: Page) => page.locator('[data-radix-popper-content-wrapper]');

test.describe.serial('3.4.0 새 기능 (실시간 거래소 API)', () => {
  test.beforeAll(async ({ extContext, popup }) => {
    [worker] = extContext.serviceWorkers();
    popup.on('pageerror', error => errors.push(error.message));
    worker.on('console', message => message.type() === 'error' && errors.push(message.text()));
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

  test('단기 급등락: 1분 규칙을 화면에서 등록하면 그 안의 움직임으로 알린다', async ({ popup }) => {
    await popup.locator('button:has(svg.lucide-bell)').click();
    const content = popover(popup);
    await content.getByRole('tab', { name: '변동률' }).click();
    const change = content.getByTestId('alert-rules-change');
    await change.getByTitle('바이낸스').click();
    await change.getByPlaceholder('BTCUSDT').fill('BTCUSDT');
    await change.getByLabel('기간').selectOption('1');
    await expect(change).toContainText('최저가에서 기준만큼');
    // BTC는 1분 안에 0.001%(약 1달러)는 거의 늘 움직인다.
    await change.getByLabel('변동률 기준 (%)').fill('0.001');
    await change.getByRole('button', { name: '추가' }).click();
    await expect(change.getByTestId('alert-rule')).toContainText('1분');
    const [rule] = (await popup.evaluate(() => chrome.storage.local.get('alertRules'))).alertRules;
    expect(rule).toMatchObject({ type: 'change', exchange: 'binance', market: 'BTCUSDT', window: 1, threshold: 0.001 });
    await popup.screenshot({ path: test.info().outputPath('surge-rule.png') });
    await popup.keyboard.press('Escape');

    const notification = await waitForNotification(new RegExp(`^binance:BTCUSDT:rule-${rule.id}$`), 60_000);
    expect(notification.message).toMatch(/1분 급(등|락) ≥ 0.001%/);
    // 한 번 울리면 1분 동안 쉰다.
    const count = (await captured()).filter(item => item.id.includes(rule.id)).length;
    await popup.waitForTimeout(25_000);
    expect((await captured()).filter(item => item.id.includes(rule.id)).length).toBe(count);
    await setStorage(popup, { alertRules: [], alertRuleState: {} });
  });

  test('방해 금지 시간에는 알림을 모아 두고, 끝나면 요약해 알린다', async ({ popup }) => {
    // 화면에서 켜면 시간 입력이 나타난다.
    await popup.getByRole('button', { name: '설정', exact: true }).click();
    await popover(popup).getByRole('switch', { name: '방해 금지 시간' }).click();
    await expect(popover(popup).getByTestId('quiet-hours')).toBeVisible();
    await expect.poll(async () => (await popup.evaluate(() => chrome.storage.local.get('quietHours'))).quietHours?.enabled).toBe(true);
    await popup.keyboard.press('Escape');

    // 지금을 포함하는 시간대로 바꾸고 변동률 알림을 울린다.
    const now = new Date();
    const hhmm = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    await setStorage(popup, {
      quietHours: { enabled: true, start: hhmm(new Date(now.getTime() - 60 * 60_000)), end: hhmm(new Date(now.getTime() + 60 * 60_000)) },
      quietHoursMissed: [],
    });
    await clearCaptured();
    await setStorage(popup, {
      alertRules: [{ id: 'quiet', type: 'change', exchange: 'upbit', market: 'KRW-BTC', threshold: 0.0001 }],
      alertRuleState: {},
    });
    await expect
      .poll(async () => (await popup.evaluate(() => chrome.storage.local.get('quietHoursMissed'))).quietHoursMissed?.length ?? 0, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    expect((await captured()).some(item => item.id.includes('rule-quiet'))).toBe(false);

    // 끝나면 다음 확인(5분 알람)에서 한 번에 알린다. 알람을 바로 돌린다.
    await setStorage(popup, { alertRules: [], alertRuleState: {}, quietHours: { enabled: false, start: '23:00', end: '07:00' } });
    await worker.evaluate(() => chrome.alarms.create('quietHoursSummary', { when: Date.now() + 100 }));
    const summary = await waitForNotification(/^quiet-hours-summary$/, 10_000);
    expect(summary.title).toMatch(/방해 금지 시간 동안 알림 \d+건/);
    expect(summary.message).toContain('KRW-BTC');
    await worker.evaluate(() => chrome.alarms.create('quietHoursSummary', { periodInMinutes: 5 }));
  });

  test('업비트 시장경보: 사유를 아이콘에 보여 주고, 새로 붙은 경보를 알린다', async ({ popup }) => {
    // 주의 아이콘에 마우스를 올리면 사유가 보인다(업비트에 주의 종목이 하나도 없으면 건너뛴다).
    const caution = popup.getByTestId('caution-icon').first();
    if (await caution.count()) await expect(caution).toHaveAttribute('title', /주의: /);

    await popup.getByRole('button', { name: '설정', exact: true }).click();
    await popover(popup).getByLabel('업비트 시장경보 알림').selectOption('all');
    await popup.keyboard.press('Escape');
    await expect
      .poll(async () => Object.keys((await popup.evaluate(() => chrome.storage.local.get('upbitMarketEvents'))).upbitMarketEvents ?? {}).length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    // 처음에는 기준만 잡고 알리지 않는다.
    expect((await captured()).some(item => item.id.includes(':warning-'))).toBe(false);

    // 한 종목의 경보가 아직 없던 것처럼 기준을 바꾸고 확인을 돌리면 그 종목을 알린다.
    const market = await popup.evaluate(async () => {
      const { upbitMarketEvents } = await chrome.storage.local.get('upbitMarketEvents');
      const [first] = Object.keys(upbitMarketEvents);
      delete upbitMarketEvents[first];
      await chrome.storage.local.set({ upbitMarketEvents });
      return first;
    });
    await worker.evaluate(() => chrome.alarms.create('noticeCheck', { when: Date.now() + 100 }));
    const notification = await waitForNotification(new RegExp(`^upbit:${market}:warning-`), 20_000);
    expect(notification.title).toContain('업비트 시장경보');
    expect(notification.message).toMatch(/유의 종목 지정|가격 급등락|거래량 급등|입금량 급등|글로벌 시세 차이|소수 계정/);
    await setStorage(popup, { marketWarningAlerts: 'off' });
  });

  test('빗썸 거래 공지: 선택 권한이 없으면 켜져 있어도 공지를 받지 않는다', async ({ popup }) => {
    // 권한 창은 테스트 브라우저에서 누를 수 없다. 받은 상태의 흐름은 krwExchanges.spec에서 본다.
    await popup.getByRole('button', { name: '설정', exact: true }).click();
    await expect(popover(popup).getByRole('switch', { name: '빗썸 거래 공지 알림' })).not.toBeChecked();
    await popup.keyboard.press('Escape');
    await setStorage(popup, { bithumbNoticeAlerts: true });
    await worker.evaluate(() => chrome.alarms.create('noticeCheck', { when: Date.now() + 100 }));
    await popup.waitForTimeout(3000);
    expect((await popup.evaluate(() => chrome.storage.local.get('lastBithumbNoticeId'))).lastBithumbNoticeId).toBeUndefined();
    await setStorage(popup, { bithumbNoticeAlerts: false });
  });

  test('대량 체결: 바이낸스 BTC 규칙을 등록하면 체결 스트림으로 알리고 최근 목록을 보여 준다', async ({ popup }) => {
    await popup.locator('button:has(svg.lucide-bell)').click();
    const content = popover(popup);
    await content.getByRole('tab', { name: '고래·OI' }).click();
    const flow = content.getByTestId('alert-rules-flow');
    await flow.getByTitle('바이낸스').click();
    await expect(flow.getByLabel('마켓 코드')).toHaveValue('BTCUSDT');
    // 10달러 이상이면 거의 모든 체결이 해당된다.
    await flow.getByLabel('체결 금액 기준').fill('10');
    await flow.getByRole('button', { name: '추가' }).first().click();
    await expect(flow.getByTestId('alert-rule')).toContainText('BTCUSDT');
    const [rule] = (await popup.evaluate(() => chrome.storage.local.get('alertRules'))).alertRules;
    expect(rule).toMatchObject({ type: 'whale', exchange: 'binance', market: 'BTCUSDT', minAmount: 10 });

    const notification = await waitForNotification(new RegExp(`^binance:BTCUSDT:rule-${rule.id}-`), 30_000);
    expect(notification.message).toMatch(/^대량 (매수|매도) 체결 @ /);
    await expect(flow.getByTestId('whale-feed')).toContainText('BTCUSDT', { timeout: 10_000 });
    await popup.screenshot({ path: test.info().outputPath('whale-feed.png') });

    // 같은 규칙은 30초에 한 번만 알린다.
    const count = (await captured()).filter(item => item.id.includes(rule.id)).length;
    await popup.waitForTimeout(10_000);
    expect((await captured()).filter(item => item.id.includes(rule.id)).length).toBe(count);
    await flow.getByTestId('alert-rule').getByRole('button').click();
    await popup.keyboard.press('Escape');
  });

  test('OI: 선물 탭에 미결제약정을 보여 주고, 규칙을 넘으면 알린다', async ({ popup }) => {
    await popup.getByRole('button', { name: '시장 인사이트' }).click();
    const content = popover(popup);
    await content.getByRole('tab', { name: '선물' }).click();
    const oi = content.getByTestId('open-interest');
    // 한국어는 억 단위로 줄인다($80.8억 = 80억 8천만 달러).
    await expect(oi).toContainText(/BTC\s*\$[\d.]+(B|억)/, { timeout: 30_000 });
    await expect(oi).not.toContainText('-0.0%');
    await expect(oi).toContainText(/[+-]\d+\.\d%/);
    await popup.screenshot({ path: test.info().outputPath('open-interest.png') });
    await popup.keyboard.press('Escape');

    await clearCaptured();
    await setStorage(popup, { alertRules: [{ id: 'oi', type: 'oi', symbol: 'BTCUSDT', threshold: 0.00001 }], alertRuleState: {} });
    const notification = await waitForNotification(/^binance:BTCUSDT:rule-oi$/, 20_000);
    expect(notification.title).toMatch(/^BTC OI [+-]\d+\.\d{2}% · BINANCE$/);
    expect(notification.message).toContain('미결제약정 1시간');
    await setStorage(popup, { alertRules: [], alertRuleState: {} });
  });

  test('ATH 대비 열(넓은 화면)과 알트코인 시즌 지수', async ({ popup }) => {
    await popup.getByRole('button', { name: '시장 인사이트' }).click();
    // 앞 테스트에서 고른 선물 탭이 남아 있다.
    await popover(popup).getByRole('tab', { name: '개요' }).click();
    const altseason = popover(popup).getByTestId('altseason');
    // 알트코인 50여 개의 90일 일봉을 받아 계산하므로 처음에는 조금 걸린다.
    await expect(altseason).toContainText(/\d+\s*(알트 시즌|비트코인 시즌|중립)/, { timeout: 60_000 });
    await expect(altseason).toHaveAttribute('title', /알트코인 \d+개 중 90일/);
    await popup.keyboard.press('Escape');

    await popup.locator('button:has(svg.lucide-maximize)').click();
    await popup.setViewportSize({ width: 800, height: 600 });
    await expect(popup.locator('thead')).toContainText('ATH대비');
    const firstAth = popup.getByTestId('ath-cell').first();
    await expect(firstAth).toContainText(/-\d+\.\d%/, { timeout: 30_000 });
    await popup.screenshot({ path: test.info().outputPath('ath-column.png') });
    await popup.locator('button:has(svg.lucide-minimize)').click();
    await popup.setViewportSize({ width: 420, height: 430 });
    await expect(popup.locator('thead')).not.toContainText('ATH대비');
  });

  test('계산기: 물타기 평단·목표 평단 수량·수수료 반영 손익분기', async ({ popup }) => {
    await setStorage(popup, {
      portfolio: [{ id: 'calc', exchange: 'upbit', market: 'KRW-BTC', quantity: 1, avgPrice: 100_000_000 }],
    });
    // 보유 자산은 화면을 열 때 읽는다.
    await popup.reload();
    await expect(rows(popup).nth(5)).toBeVisible();
    await popup.getByRole('button', { name: '보유 자산' }).click();
    const calc = popover(popup).getByTestId('calculator');
    await calc.getByLabel('추가 매수가').fill('50000000');
    await calc.getByLabel('추가 매수 수량').fill('1');
    await expect(calc.getByTestId('calc-new-average')).toContainText('₩75,000,000 × 2');
    await calc.getByLabel('목표 평단').fill('80000000');
    // 1 × (1억 − 8천만) ÷ (8천만 − 5천만) = 0.6667개
    await expect(calc.getByTestId('calc-needed')).toContainText('0.66666667');
    await calc.getByLabel('목표 평단').fill('40000000');
    await expect(calc.getByTestId('calc-needed')).toContainText('사이여야');
    // 업비트 기본 수수료 0.05% → 1억 × 1.0005 ÷ 0.9995
    await expect(calc.getByLabel('수수료 (%, 사고팔 때 각각)')).toHaveValue('0.05');
    await expect(calc.getByTestId('calc-break-even')).toContainText('₩100,100,050');
    await expect(calc.getByTestId('calc-net')).toContainText('₩');
    await popup.screenshot({ path: test.info().outputPath('calculator.png') });
  });

  test('2027 세금 미리보기: 의제취득가·기본공제·예상 세금과 안내 문구', async ({ popup }) => {
    const content = popover(popup);
    await content.getByRole('tab', { name: '2027 세금' }).click();
    const tax = content.getByTestId('tax-preview');
    // 평단 1억 BTC, 12월 31일 전에는 지금 가격을 그날 가격으로 본다 → 산 값으로 쳐 주는 가격은 max(1억, 현재가)
    await expect(tax).toContainText('지금 가격을 그날 가격으로');
    await expect(tax).toContainText('산 값으로 쳐 주는 가격');
    await expect(tax).toContainText('기본공제(연간)₩2,500,000');
    await expect(tax.getByTestId('tax-estimate')).toContainText('₩0');
    await expect(tax).toContainText('참고용 추정');
    await popup.screenshot({ path: test.info().outputPath('tax-preview.png') });
    await popup.keyboard.press('Escape');
    await setStorage(popup, { portfolio: [] });
  });

  test('런타임 에러가 없다', async () => {
    expect(errors).toEqual([]);
  });
});
