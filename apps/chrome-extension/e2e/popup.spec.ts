import { expect, expectLiveUpdates, rows, switchExchange, test, totalCount } from './fixtures';

const errors: string[] = [];

test.describe.serial('COMO 팝업 (실시간 거래소 API)', () => {
  test.beforeAll(async ({ extContext: context, popup }) => {
    popup.on('pageerror', error => errors.push(error.message));
    context.serviceWorkers().forEach(worker => {
      worker.on('console', message => message.type() === 'error' && errors.push(message.text()));
    });
  });

  test('업비트 시세가 로드되고 실시간으로 갱신된다', async ({ popup }) => {
    await expect(rows(popup).nth(5)).toBeVisible();
    await expectLiveUpdates(popup);
    const rate = await popup.locator('span:has(> span:text-is(" KRW"))').first().innerText();
    expect(Number.parseFloat(rate)).toBeGreaterThan(0);
  });

  test('빗썸 전체 종목이 로드된다 (414 회귀)', async ({ popup }) => {
    await switchExchange(popup, '업비트', '빗썸');
    await expect(rows(popup).nth(5)).toBeVisible();
    await expect.poll(() => totalCount(popup)).toBeGreaterThan(300);
    await expectLiveUpdates(popup);
  });

  for (const [from, to] of [
    ['빗썸', '바이낸스'],
    ['바이낸스', '바이비트'],
    ['바이비트', 'OKX'],
  ] as const) {
    test(`${to} 시세가 로드되고 실시간으로 갱신된다`, async ({ popup }) => {
      await switchExchange(popup, from, to);
      await expect(rows(popup).nth(5)).toBeVisible();
      await expect.poll(() => totalCount(popup)).toBeGreaterThan(100);
      await expectLiveUpdates(popup);
      // 한국어(KRW 표시)에서는 USDT 가격 아래 원화 환산값을 보여준다.
      await expect(
        popup
          .locator('tbody')
          .getByText(/₩[\d,]+/)
          .first(),
      ).toBeVisible();
      await popup.screenshot({ path: test.info().outputPath(`${to}.png`) });
    });
  }

  test('다시 열면 마지막 거래소를 유지한다', async ({ popup }) => {
    await popup.reload();
    await expect(popup.getByRole('button', { name: 'OKX' }).first()).toBeVisible();
    await switchExchange(popup, 'OKX', '업비트');
    await expect(rows(popup).nth(5)).toBeVisible();
  });

  test('지정가 알림 팝오버에 전체 종목이 로드된다', async ({ popup }) => {
    await popup.locator('button:has(svg.lucide-bell)').click();
    const content = popup.locator('[data-radix-popper-content-wrapper]');
    await expect(content).toContainText('알림 추가');
    await expect(content).toContainText('KRW-BTC');
    await popup.keyboard.press('Escape');
  });

  test('보유 자산을 등록하면 평가금액과 손익을 계산한다', async ({ popup }) => {
    await popup.getByRole('button', { name: '보유 자산' }).click();
    const content = popup.locator('[data-radix-popper-content-wrapper]');
    await expect(content).toContainText('등록된 보유 코인이 없습니다.');

    // 업비트 BTC: 평균가를 비우면 현재가로 등록된다.
    await content.getByPlaceholder('KRW-BTC').fill('KRW-BTC');
    await content.getByPlaceholder('수량').fill('0.01');
    await expect(content.getByTitle('평균가')).not.toHaveAttribute('placeholder', '평균가');
    await content.getByRole('button', { name: '추가' }).click();
    await expect(content.getByTestId('holding')).toHaveCount(1);

    // 바이낸스 ETH: 평균가 1달러로 등록하면 큰 수익이 나야 한다.
    await content.getByTitle('바이낸스').click();
    await content.getByPlaceholder('BTCUSDT').fill('ETHUSDT');
    await content.getByPlaceholder('수량').fill('2');
    await content.getByTitle('평균가').fill('1');
    await content.getByRole('button', { name: '추가' }).click();
    await expect(content.getByTestId('holding')).toHaveCount(2);
    await expect(content.getByTestId('holding').nth(1)).toContainText('+');

    const total = content.getByTestId('portfolio-total');
    await expect(total).toContainText('₩');
    await popup.screenshot({ path: test.info().outputPath('portfolio-krw.png') });
    await content.getByRole('button', { name: 'USD', exact: true }).click();
    await expect(total).toContainText('$');
    await content.getByRole('button', { name: 'KRW', exact: true }).click();

    // 다시 열어도 저장돼 있어야 한다.
    await popup.reload();
    await popup.getByRole('button', { name: '보유 자산' }).click();
    await expect(popup.getByTestId('holding')).toHaveCount(2);
    for (let i = 0; i < 2; i++) await popup.getByRole('button', { name: '삭제' }).first().click();
    await expect(popup.getByTestId('holding')).toHaveCount(0);
    await popup.keyboard.press('Escape');
  });

  test('와이드 모드에서 김프를 표시한다', async ({ popup }) => {
    await popup.locator('button:has(svg.lucide-maximize)').click();
    await popup.setViewportSize({ width: 800, height: 600 });
    await expect(popup.locator('span:text-is("김프")').locator('..')).toContainText(/BTC[\s\S]*%/);
  });

  test('영어로 전환하면 UI와 숫자 단위가 바뀌고 다시 열어도 유지된다', async ({ popup }) => {
    await popup.getByRole('button', { name: '언어' }).click();
    await expect(popup.locator('thead')).toContainText('Price');
    await expect(popup.locator('thead')).toContainText('Volume');
    await expect(popup.getByRole('button', { name: 'Upbit' }).first()).toBeVisible();
    await expect(popup.locator('span:text-is("K-Prem")')).toBeVisible();
    expect(await popup.locator('tbody').innerText()).not.toMatch(/[억만조]/);

    await popup.reload();
    await expect(popup.locator('thead')).toContainText('Price');
    await expect(popup.locator('button:has(svg.lucide-minimize)')).toBeVisible();
  });

  test('런타임 에러가 없다', async () => {
    expect(errors).toEqual([]);
  });
});
