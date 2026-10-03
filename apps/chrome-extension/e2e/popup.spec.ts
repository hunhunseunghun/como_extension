import { expect, expectLiveUpdates, rows, switchExchange, test, totalCount } from './fixtures';

const errors: string[] = [];

test.describe.serial('COMO 팝업 (실시간 거래소 API)', () => {
  test.beforeAll(async ({ extContext: context, popup }) => {
    popup.on('pageerror', error => errors.push(error.message));
    context.serviceWorkers().forEach(worker => {
      worker.on('console', message => message.type() === 'error' && errors.push(message.text()));
    });
  });

  test('새로 설치하면 첫 실행 안내로 관심 코인과 배지를 고른다', async ({ popup }) => {
    const onboarding = popup.getByTestId('onboarding');
    await expect(onboarding).toBeVisible();
    await onboarding.getByRole('button', { name: '다음' }).click();
    await onboarding.getByRole('button', { name: '다음' }).click();
    await onboarding.getByRole('button', { name: '시작하기' }).click();
    await expect(onboarding).toHaveCount(0);
    const stored = await popup.evaluate(() => chrome.storage.local.get(['favoriteCoins', 'badgeSettings', 'onboardingPending']));
    expect(stored.favoriteCoins.upbit).toEqual(expect.arrayContaining(['KRW-BTC', 'KRW-ETH']));
    expect(stored.badgeSettings).toEqual({ enabled: true, exchange: 'upbit', market: 'KRW-BTC' });
    expect(stored.onboardingPending).toBe(false);
    // 이후 테스트가 고정 행 없이 돌도록 관심 코인을 비운다.
    await popup.evaluate(() => chrome.storage.local.set({ favoriteCoins: {} }));
    await popup.reload();
    await expect(onboarding).toHaveCount(0);
  });

  test('업비트 시세가 로드되고 실시간으로 갱신된다', async ({ popup }) => {
    await expect(rows(popup).nth(5)).toBeVisible();
    await expectLiveUpdates(popup);
    // 새 프로필에서는 환율을 받아오기 전에 팝업이 먼저 열려 잠시 0으로 보인다.
    const rate = popup.locator('span:has(> span:text-is(" KRW"))').first();
    await expect.poll(async () => Number.parseFloat(await rate.innerText()), { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test('툴바 배지에 기본 종목(업비트 BTC) 가격을 표시한다', async ({ extContext }) => {
    const [worker] = extContext.serviceWorkers();
    await expect
      .poll(() => worker.evaluate(() => chrome.action.getBadgeText({})), { timeout: 15_000 })
      .toMatch(/^\d+(\.\d)?M$/);
  });

  test('업비트 원화 마켓이 새로 생기면 신규 상장 알림을 보낸다', async ({ extContext }) => {
    const [worker] = extContext.serviceWorkers();
    const created = await worker.evaluate(async () => {
      const notifications: string[] = [];
      const original = chrome.notifications.create;
      // 실제 알림 대신 만들어진 알림 ID를 모은다.
      (chrome.notifications as unknown as { create: (id: string) => void }).create = id => notifications.push(id);
      // KRW-BTC가 아직 없던 것처럼 기준 목록을 바꿔 두고 비교를 한 번 돌린다.
      const markets: { market: string }[] = await (await fetch('https://api.upbit.com/v1/market/all')).json();
      const known = markets.map(m => m.market).filter(m => m.startsWith('KRW-') && m !== 'KRW-BTC');
      await chrome.storage.local.set({ listingAlerts: true, knownKrwMarkets: { upbit: known } });
      await chrome.alarms.create('listingCheck', { when: Date.now() + 100 });
      for (let i = 0; i < 50 && !notifications.length; i++) await new Promise(r => setTimeout(r, 200));
      chrome.notifications.create = original;
      await chrome.alarms.create('listingCheck', { periodInMinutes: 5 });
      return notifications;
    });
    expect(created).toContain('upbit:KRW-BTC:listing');
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
    ['OKX', 'Coinbase'],
    ['Coinbase', 'Bitget'],
    ['Bitget', 'Kraken'],
    ['Kraken', 'CoinDCX'],
  ] as const) {
    test(`${to} 시세가 로드되고 실시간으로 갱신된다`, async ({ popup }) => {
      await switchExchange(popup, from, to);
      await expect(rows(popup).nth(5)).toBeVisible();
      await expect.poll(() => totalCount(popup)).toBeGreaterThan(100);
      await expectLiveUpdates(popup);
      // 한국어(KRW 표시)에서는 달러 가격 아래 원화 환산값을 보여준다.
      await expect(
        popup
          .locator('tbody')
          .getByText(/₩[\d,.]+/)
          .first(),
      ).toBeVisible();
      await popup.screenshot({ path: test.info().outputPath(`${to}.png`) });

      // 첫 종목 차트가 열린다.
      await popup.locator('tbody tr').first().locator('svg.lucide-chart-candlestick').click();
      await expect(popup.locator('.tooltip canvas').first()).toBeVisible({ timeout: 15_000 });
      await popup.mouse.click(5, 5);
    });
  }

  test('다시 열면 마지막 거래소를 유지한다', async ({ popup }) => {
    await popup.reload();
    await expect(popup.getByRole('button', { name: 'CoinDCX' }).first()).toBeVisible();
    await switchExchange(popup, 'CoinDCX', '업비트');
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
    await expect(content.getByTitle('평균가')).not.toHaveAttribute('placeholder', '평균가');
    await content.getByTitle('평균가').fill('1');
    await content.getByRole('button', { name: '추가' }).click();
    await expect(content.getByTestId('holding')).toHaveCount(2);
    await expect(content.getByTestId('holding').nth(1)).toContainText('+');

    const total = content.getByTestId('portfolio-total');
    await expect(total).toContainText('₩');
    await popup.screenshot({ path: test.info().outputPath('portfolio-krw.png') });
    await content.getByLabel('표시 통화').selectOption('USD');
    await expect(total).toContainText('$');
    await content.getByLabel('표시 통화').selectOption('JPY');
    await expect(total).toContainText(/￥|¥/);
    await content.getByLabel('표시 통화').selectOption('KRW');

    // 다시 열어도 저장돼 있어야 한다.
    await popup.reload();
    await popup.getByRole('button', { name: '보유 자산' }).click();
    await expect(popup.getByTestId('holding')).toHaveCount(2);
    for (let i = 0; i < 2; i++) await popup.getByRole('button', { name: '삭제' }).first().click();
    await expect(popup.getByTestId('holding')).toHaveCount(0);
    await popup.keyboard.press('Escape');
  });

  test('시장 인사이트에 시장 지표와 거래소 간 가격 차이를 보여준다', async ({ popup }) => {
    await popup.getByRole('button', { name: '시장 인사이트' }).click();
    const content = popup.locator('[data-radix-popper-content-wrapper]');
    await expect(content.getByTestId('market-stats')).toContainText(/\d+%/);
    await expect(content.getByTestId('spread').first()).toBeVisible();
    await popup.screenshot({ path: test.info().outputPath('insights.png') });
    await content.getByLabel('원화 거래소 포함').uncheck();
    await expect(content.getByTestId('spread').first()).toBeVisible();
    await popup.keyboard.press('Escape');
  });

  test('DEX 토큰을 검색해 관심 목록에 추가하고 삭제한다', async ({ popup }) => {
    await popup.getByRole('button', { name: 'DEX·밈코인' }).click();
    const content = popup.locator('[data-radix-popper-content-wrapper]');
    await content.getByPlaceholder('심볼 또는 컨트랙트 주소').fill('PEPE');
    await content.getByRole('button', { name: '검색' }).click();
    await expect(content.getByTestId('dex-results').getByTestId('dex-pair').first()).toBeVisible();
    await content.getByTestId('dex-results').getByRole('button', { name: '추가' }).first().click();
    await expect(content.getByTestId('dex-watchlist').getByTestId('dex-pair')).toHaveCount(1);
    await expect(content.getByTestId('dex-watchlist')).toContainText('$');
    await popup.screenshot({ path: test.info().outputPath('dex.png') });
    await content.getByTestId('dex-watchlist').getByRole('button', { name: '삭제' }).click();
    await expect(content.getByTestId('dex-watchlist').getByTestId('dex-pair')).toHaveCount(0);
    await popup.keyboard.press('Escape');
  });

  test('설정: 배지 종목·상승 색을 바꿀 수 있다', async ({ popup, extContext }) => {
    await popup.getByRole('button', { name: '설정', exact: true }).click();
    const content = popup.locator('[data-radix-popper-content-wrapper]');
    await content.getByTitle('바이낸스').click();
    await content.getByPlaceholder('BTCUSDT').fill('ETHUSDT');
    const [worker] = extContext.serviceWorkers();
    await expect
      .poll(() => worker.evaluate(() => chrome.action.getTitle({})), { timeout: 15_000 })
      .toContain('ETHUSDT');

    // 초록 상승으로 바꾸면 html에 green-up이 설정된다.
    await content.getByRole('button', { name: '초록 상승 · 빨강 하락' }).click();
    await expect(popup.locator('html')).toHaveAttribute('data-updown', 'green-up');
    await popup.screenshot({ path: test.info().outputPath('settings.png') });
    await content.getByRole('button', { name: '빨강 상승 · 파랑 하락' }).click();
    await expect(popup.locator('html')).toHaveAttribute('data-updown', 'red-up');
    await popup.keyboard.press('Escape');
  });

  test('와이드 모드에서 김프를 표시한다', async ({ popup }) => {
    await popup.locator('button:has(svg.lucide-maximize)').click();
    await popup.setViewportSize({ width: 800, height: 600 });
    await expect(popup.locator('span:text-is("김프")').locator('..')).toContainText(/BTC[\s\S]*%/);
  });

  test('사이드 패널 화면은 창 크기에 맞춰 그린다', async ({ extContext, extensionId }) => {
    const panel = await extContext.newPage();
    await panel.setViewportSize({ width: 380, height: 900 });
    await panel.goto(`chrome-extension://${extensionId}/popup/index.html?view=sidepanel`);
    await expect(rows(panel).nth(10)).toBeVisible();
    await expect(panel.locator('button:has(svg.lucide-maximize), button:has(svg.lucide-minimize)')).toHaveCount(0);
    await panel.screenshot({ path: test.info().outputPath('sidepanel.png') });
    await panel.close();
  });

  test('사이드 패널을 연 채로 팝업을 열고 닫아도 사이드 패널 시세가 계속 갱신된다', async ({ extContext, extensionId, popup }) => {
    const panel = await extContext.newPage();
    await panel.goto(`chrome-extension://${extensionId}/popup/index.html?view=sidepanel`);
    await expect(rows(panel).nth(5)).toBeVisible();

    // 한쪽에서 거래소를 바꾸면 다른 쪽도 같은 거래소로 맞춰진다.
    await switchExchange(panel, '업비트', '빗썸');
    await expect(popup.getByRole('button', { name: '빗썸' }).first()).toBeVisible();
    await expect(rows(popup).nth(5)).toBeVisible();
    await switchExchange(popup, '빗썸', '업비트');
    await expect(panel.getByRole('button', { name: '업비트' }).first()).toBeVisible();
    await expect(rows(panel).nth(5)).toBeVisible();

    // 팝업을 하나 더 열었다 닫는다.
    const extra = await extContext.newPage();
    await extra.goto(`chrome-extension://${extensionId}/popup/index.html`);
    await expect(rows(extra).nth(5)).toBeVisible();
    await extra.close();

    await expectLiveUpdates(panel);
    await panel.close();
  });

  test('이름이 겹치는 종목도 즐겨찾기할 수 있다', async ({ popup }) => {
    // KRW-BTCX가 즐겨찾기에 있어도 KRW-BTC는 즐겨찾기가 아니다.
    await popup.evaluate(() => chrome.storage.local.set({ favoriteCoins: { upbit: ['KRW-BTCX'] } }));
    await popup.reload();
    const search = popup.getByPlaceholder(/BTC/).first();
    await search.fill('BTC');
    const btcRow = rows(popup).filter({ has: popup.locator('a[href$="CRIX.UPBIT.KRW-BTC"]') });
    await btcRow.locator('svg.lucide-star').click({ timeout: 15_000 });
    await expect
      .poll(async () => (await popup.evaluate(() => chrome.storage.local.get('favoriteCoins'))).favoriteCoins.upbit)
      .toEqual(['KRW-BTCX', 'KRW-BTC']);
    await popup.evaluate(() => chrome.storage.local.set({ favoriteCoins: {} }));
    await popup.reload();
  });

  test('충분히 사용하면 리뷰를 한 번 요청한다', async ({ popup }) => {
    await popup.evaluate(
      () =>
        new Promise<void>(resolve =>
          chrome.storage.local.set({ usageStats: { firstOpenAt: Date.now() - 5 * 86_400_000, opens: 20 } }, resolve),
        ),
    );
    await popup.reload();
    await expect(popup.getByTestId('review-prompt')).toBeVisible();
    await popup.getByRole('button', { name: '나중에' }).click();
    await popup.reload();
    await expect(rows(popup).nth(5)).toBeVisible();
    await expect(popup.getByTestId('review-prompt')).toHaveCount(0);
  });

  test('변동률·김프 알림 규칙을 등록하고 삭제한다', async ({ popup }) => {
    await popup.locator('button:has(svg.lucide-bell)').click();
    const content = popup.locator('[data-radix-popper-content-wrapper]');
    await content.getByRole('tab', { name: '변동률' }).click();
    const change = content.getByTestId('alert-rules-change');
    await expect(change.getByRole('button', { name: '추가' })).toBeEnabled({ timeout: 10_000 });
    await change.getByRole('button', { name: '추가' }).click();
    await expect(change.getByTestId('alert-rule')).toHaveCount(1);
    await expect(change.getByTestId('alert-rule')).toContainText('KRW-BTC');

    await content.getByRole('tab', { name: '김프' }).click();
    const kimchi = content.getByTestId('alert-rules-kimchi');
    await kimchi.getByRole('button', { name: '추가' }).click();
    await expect(kimchi.getByTestId('alert-rule')).toHaveCount(1);
    await expect(kimchi.getByTestId('alert-rule')).toContainText('BTC');

    const rules = await popup.evaluate(() => chrome.storage.local.get('alertRules'));
    expect(rules.alertRules.map((rule: { type: string }) => rule.type)).toEqual(['change', 'kimchi']);
    await kimchi.getByTestId('alert-rule').getByRole('button').click();
    await content.getByRole('tab', { name: '변동률' }).click();
    await change.getByTestId('alert-rule').getByRole('button').click();
    await expect(popup.evaluate(() => chrome.storage.local.get('alertRules'))).resolves.toEqual({ alertRules: [] });
    await popup.keyboard.press('Escape');
  });

  test('변동률 규칙이 기준을 넘으면 백그라운드가 알림을 보낸다', async ({ extContext }) => {
    const [worker] = extContext.serviceWorkers();
    const created = await worker.evaluate(async () => {
      const notifications: string[] = [];
      const original = chrome.notifications.create;
      (chrome.notifications as unknown as { create: (id: string) => void }).create = id => notifications.push(id);
      // 0.0001%면 거의 모든 종목이 넘는다. 10초 주기 확인을 기다린다.
      await chrome.storage.local.set({
        alertRules: [{ id: 'e2e', type: 'change', exchange: 'upbit', market: 'KRW-BTC', threshold: 0.0001 }],
        alertRuleState: {},
      });
      for (let i = 0; i < 75 && !notifications.length; i++) await new Promise(r => setTimeout(r, 200));
      chrome.notifications.create = original;
      await chrome.storage.local.set({ alertRules: [], alertRuleState: {} });
      return notifications;
    });
    expect(created).toEqual(['upbit:KRW-BTC:rule-e2e']);
  });

  test('인사이트 선물·트렌드 탭에 펀딩비·청산·트렌딩 코인을 보여준다', async ({ popup }) => {
    await popup.getByRole('button', { name: '시장 인사이트' }).click();
    const content = popup.locator('[data-radix-popper-content-wrapper]');
    await content.getByRole('tab', { name: '선물' }).click();
    await expect(content.getByTestId('derivatives')).toContainText(/[+-]\d\.\d{4}%/, { timeout: 15_000 });
    await content.getByRole('tab', { name: '트렌드' }).click();
    await expect(content.getByTestId('trending').locator('button').first()).toBeVisible({ timeout: 15_000 });
    await expect(content.getByRole('button', { name: '뉴스 보기 (사이트 접근 허용)' })).toBeVisible();
    await popup.screenshot({ path: test.info().outputPath('insights-trends.png') });
    await content.getByRole('tab', { name: '개요' }).click();
    await content.getByTestId('share-card').click();
    await expect(content.getByTestId('share-card')).toContainText(/복사됨|저장됨/);
    await popup.keyboard.press('Escape');
  });

  test('거래소 계정 연동은 잘못된 키면 오류를 보여주고 키를 지울 수 있다', async ({ popup }) => {
    await popup.getByRole('button', { name: '보유 자산' }).click();
    const sync = popup.locator('[data-radix-popper-content-wrapper]').getByTestId('account-sync');
    await sync.getByRole('button', { name: /거래소 계정 연동/ }).click();
    await sync.getByRole('button', { name: /바이낸스/ }).click();
    await sync.getByPlaceholder('API key').fill('invalid');
    await sync.getByPlaceholder('Secret key').fill('invalid');
    await sync.getByRole('button', { name: '키 저장하고 불러오기' }).click();
    await expect(sync).toContainText('불러오지 못했어요', { timeout: 15_000 });
    await sync.getByRole('button', { name: '키 삭제' }).click();
    await expect(popup.evaluate(() => chrome.storage.local.get('exchangeApiKeys'))).resolves.toEqual({ exchangeApiKeys: {} });
    await popup.keyboard.press('Escape');
  });

  test('디자인 버전을 v1·v2로 바꾸고 다시 열어도 유지된다', async ({ popup }) => {
    await expect(popup.locator('html')).toHaveAttribute('data-ds', 'v2');
    await popup.getByRole('button', { name: '설정', exact: true }).click();
    await popup.locator('[data-radix-popper-content-wrapper]').getByRole('button', { name: '클래식 (v1)' }).click();
    await expect(popup.locator('html')).toHaveAttribute('data-ds', 'v1');
    await popup.reload();
    await expect(popup.locator('html')).toHaveAttribute('data-ds', 'v1');
    await popup.getByRole('button', { name: '설정', exact: true }).click();
    await popup.locator('[data-radix-popper-content-wrapper]').getByRole('button', { name: '새 디자인 (v2)' }).click();
    await expect(popup.locator('html')).toHaveAttribute('data-ds', 'v2');
    await popup.keyboard.press('Escape');
  });

  test('영어로 전환하면 UI와 숫자 단위가 바뀌고 다시 열어도 유지된다', async ({ popup }) => {
    await popup.getByRole('button', { name: '설정', exact: true }).click();
    await popup.locator('[data-radix-popper-content-wrapper]').getByLabel('언어').selectOption('en');
    await popup.keyboard.press('Escape');
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
