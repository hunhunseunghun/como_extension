import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { rows, switchExchange } from './fixtures';
import { installMocks } from './mocks';

// 영어 브라우저에 새로 설치한 사용자. 크라켄은 주소를 막아(응답 없음) 시세가 오지 않는 거래소를 흉내 낸다.
const DIST =
  process.env.COMO_EXTENSION_PATH ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

let context: BrowserContext;
let popup: Page;
const errors: string[] = [];

test.describe.serial('3.5.3 (영어 브라우저 새 설치)', () => {
  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      locale: 'en-US',
      viewport: { width: 420, height: 430 },
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        '--lang=en-US',
        '--host-resolver-rules=MAP api.kraken.com 127.0.0.1, MAP ws.kraken.com 127.0.0.1',
      ],
    });
    await installMocks(context);
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    worker.on('console', message => message.type() === 'error' && errors.push(message.text()));
    const extensionId = worker.url().split('/')[2];
    popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('설치하면 툴바에 고정하는 법을 알려 주는 환영 페이지(영어)를 연다', async () => {
    await expect
      .poll(() => context.pages().map(page => page.url()))
      .toContainEqual(expect.stringContaining('/como_extension/welcome/en/'));
  });

  test('영어 사용자는 바이낸스로 시작한다(첫 실행 안내도 바이낸스를 골라 둔다)', async () => {
    const onboarding = popup.getByTestId('onboarding');
    await expect(onboarding.getByRole('button', { name: 'Binance' })).toHaveAttribute('aria-pressed', 'true');
    await onboarding.getByRole('button', { name: 'Skip' }).click();
    await expect(popup.getByRole('button', { name: 'Binance' }).first()).toBeVisible();
    await expect(rows(popup).nth(5)).toBeVisible();
  });

  test('거래소가 응답하지 않으면 스피너 대신 다시 시도와 다른 거래소를 보여 준다', async () => {
    await switchExchange(popup, 'Binance', 'Kraken');
    const notice = popup.getByTestId('exchange-no-response');
    await expect(notice).toBeVisible({ timeout: 20_000 });
    await expect(notice).toContainText('No response from this exchange yet');

    // 다시 시도하면 잠깐 기다렸다가, 여전히 응답이 없으면 안내를 다시 보여 준다.
    await notice.getByRole('button', { name: 'Retry' }).click();
    await expect(notice).toBeHidden();
    await expect(popup.getByTestId('exchange-no-response')).toBeVisible({ timeout: 20_000 });

    await popup.getByTestId('exchange-no-response').getByRole('button', { name: 'Binance' }).click();
    await expect(rows(popup).nth(5)).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Binance' }).first()).toBeVisible();
  });

  test('런타임 에러가 없다', async () => {
    // 막아 둔 크라켄 연결 실패는 경고(console.warn)로만 남는다.
    expect(errors).toEqual([]);
  });
});
