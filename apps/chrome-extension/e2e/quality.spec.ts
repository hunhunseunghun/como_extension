import type { Page } from '@playwright/test';
import { expect, rows, test } from './fixtures';

// 품질 개선: 로고 내장, 첫 화면 번들에서 뺀 팝오버, 탭 넘침, 차트 글 요약, 즐겨찾기 되돌리기, 휴대폰 너비(Firefox Android).

const errors: string[] = [];
const remoteLogos: string[] = [];
const setStorage = (page: Page, values: Record<string, unknown>) => page.evaluate(values => chrome.storage.local.set(values), values);
const popover = (page: Page) => page.locator('[data-radix-popper-content-wrapper]');

test.describe.serial('품질 개선', () => {
  test.beforeAll(async ({ popup }) => {
    popup.on('pageerror', error => errors.push(error.message));
    popup.on('request', request => request.url().includes('coin-images.coingecko.com/markets') && remoteLogos.push(request.url()));
    await setStorage(popup, { onboardingPending: false, language: 'ko', favoriteCoins: {} });
    await popup.reload();
    await expect(rows(popup).nth(5)).toBeVisible();
  });

  test('거래소 로고를 확장 안의 파일로 그리고 외부 이미지 서버에 요청하지 않는다', async ({ popup }) => {
    await popup.getByRole('button', { name: '업비트' }).first().click();
    const menu = popup.getByRole('menu');
    await expect(menu.locator('img').first()).toBeVisible();
    const sources = await menu.locator('img').evaluateAll(images => images.map(image => (image as HTMLImageElement).src));
    expect(sources.length).toBeGreaterThan(5);
    for (const src of sources) expect(src).toMatch(/^chrome-extension:\/\/.+\.png$/);
    // 모든 로고가 실제로 읽혔다(깨진 이미지 없음).
    expect(await menu.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await popup.keyboard.press('Escape');
    expect(remoteLogos).toEqual([]);
  });

  test('나중에 불러오는 툴바 팝오버도 바로 열린다', async ({ popup }) => {
    for (const name of ['시장 인사이트', 'DEX·밈코인', '설정']) {
      await popup.getByRole('button', { name }).first().click();
      await expect(popover(popup)).toBeVisible();
      await popup.keyboard.press('Escape');
      await expect(popover(popup)).toHaveCount(0);
    }
  });

  test('알림·인사이트 탭 이름이 10개 언어 모두 칸을 넘치지 않는다', async ({ popup }) => {
    test.slow();
    const overflow: string[] = [];
    for (const language of ['ko', 'en', 'es', 'pt', 'vi', 'tr', 'id', 'ja', 'zh', 'hi']) {
      await setStorage(popup, { language });
      await popup.reload();
      await expect(rows(popup).first()).toBeVisible();
      for (const icon of ['bell', 'activity']) {
        await popup.locator(`button:has(svg.lucide-${icon})`).first().click();
        const tablist = popover(popup).getByRole('tablist').first();
        await expect(tablist).toBeVisible();
        const over = await tablist.evaluate(list =>
          [...list.querySelectorAll('[role=tab]')]
            .filter(tab => tab.scrollWidth > tab.clientWidth + 1 || list.scrollWidth > list.clientWidth + 1)
            .map(tab => tab.textContent || tab.getAttribute('aria-label')),
        );
        overflow.push(...over.map(label => `${language}/${icon}: ${label}`));
        await popup.keyboard.press('Escape');
      }
    }
    expect(overflow).toEqual([]);
    await setStorage(popup, { language: 'ko' });
    await popup.reload();
    await expect(rows(popup).first()).toBeVisible();
  });

  test('알림 기록 탭은 아이콘이지만 이름으로 찾을 수 있다', async ({ popup }) => {
    await popup.locator('button:has(svg.lucide-bell)').first().click();
    const history = popover(popup).getByRole('tab', { name: '기록' });
    await expect(history).toBeVisible();
    await expect(history).toHaveAttribute('title', '기록');
    await popup.keyboard.press('Escape');
  });

  test('차트는 화면 낭독기용으로 마지막 가격·구간 등락·고가·저가를 글로 준다', async ({ popup }) => {
    await rows(popup).first().locator('[aria-label^="차트 열기"], [role=button][aria-expanded]').first().click();
    const chart = popup.getByRole('img', { name: /차트: 마지막 .+, 이 구간 [+-]\d+\.\d{2}%, 최고 .+, 최저 .+/ });
    await expect(chart).toBeAttached({ timeout: 20_000 });
    // 지표 버튼 글자는 디자인 토큰(text-cap, 11px)을 쓴다.
    const fontSize = await popup.getByTestId('chart-indicators').getByRole('button').first().evaluate(button => getComputedStyle(button).fontSize);
    expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(11);
    await popup.keyboard.press('Escape');
  });

  test('어느 줄에서 차트를 열어도 팝업(420×430) 밖으로 나가지 않는다(좁은·넓은 화면)', async ({ popup }) => {
    const outside: string[] = [];
    const check = async (mode: string, width: number, height: number) => {
      const icons = popup.locator('tbody tr svg.lucide-chart-candlestick');
      const count = Math.min(await icons.count(), 8);
      for (let i = 0; i < count; i++) {
        const icon = icons.nth(i);
        if (!(await icon.isVisible())) continue;
        await icon.click();
        await expect(popup.getByTestId('chart-indicators')).toBeVisible({ timeout: 20_000 });
        const box = (await popup.locator('.tooltip').boundingBox())!;
        if (box.x < 0 || box.y < 0 || box.x + box.width > width || box.y + box.height > height)
          outside.push(`${mode} 줄${i}: ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}`);
        const scroll = await popup.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
        if (scroll[0] > width || scroll[1] > height) outside.push(`${mode} 줄${i}: 페이지 스크롤 ${scroll.join('×')}`);
        await popup.keyboard.press('Escape');
      }
    };
    await check('좁은', 420, 430);
    await popup.locator('button:has(svg.lucide-maximize)').click();
    await popup.setViewportSize({ width: 800, height: 600 });
    await expect(popup.locator('thead')).toContainText('ATH대비');
    await check('넓은', 800, 600);
    await popup.locator('button:has(svg.lucide-minimize)').click();
    await popup.setViewportSize({ width: 420, height: 430 });
    expect(outside).toEqual([]);
  });

  test('별을 잘못 눌러도 아래 안내에서 되돌릴 수 있다', async ({ popup }) => {
    const firstName = async () => (await rows(popup).first().locator('a').first().innerText()).trim();
    const target = rows(popup).nth(3);
    const name = (await target.locator('a').first().innerText()).trim();
    await target.getByRole('button', { name: '즐겨찾기 상단 고정' }).click();
    const undo = popup.getByTestId('favorite-undo');
    await expect(undo).toContainText('즐겨찾기에 추가했어요');
    await expect.poll(firstName).toBe(name);
    await undo.getByRole('button', { name: '되돌리기' }).click();
    await expect(undo).toHaveCount(0);
    await expect.poll(firstName).not.toBe(name);
    await expect
      .poll(() => popup.evaluate(() => chrome.storage.local.get('favoriteCoins').then(result => Object.values(result.favoriteCoins ?? {}).flat().length)))
      .toBe(0);
    // 아무것도 안 하면 4초 뒤 사라진다.
    await rows(popup).nth(2).getByRole('button', { name: '즐겨찾기 상단 고정' }).click();
    await expect(undo).toBeVisible();
    await expect(undo).toHaveCount(0, { timeout: 6000 });
    await setStorage(popup, { favoriteCoins: {} });
    await popup.reload();
    await expect(rows(popup).first()).toBeVisible();
  });

  test('휴대폰 너비(Firefox Android는 팝업을 전체 화면으로 연다)에서도 가로 스크롤 없이 그린다', async ({ extContext, extensionId }) => {
    const popup = await extContext.newPage();
    const cdp = await extContext.newCDPSession(popup);
    await cdp.send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0',
    });
    await popup.setViewportSize({ width: 360, height: 740 });
    await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
    // 즐겨찾기 하나를 두고 연다: 차트 열이 빠져도 이름 칸에 24시간 미니 차트가 붙어야 한다.
    await setStorage(popup, { favoriteCoins: { upbit: ['KRW-BTC'] } });
    await popup.reload();
    await expect(rows(popup).nth(5)).toBeVisible();
    const pinned = rows(popup).first();
    await expect(pinned.getByTestId('compact-sparkline').getByTestId('sparkline')).toBeVisible({ timeout: 20_000 });
    await expect(rows(popup).nth(3).getByTestId('compact-sparkline')).toHaveCount(0);
    // 행 높이는 그대로(표 가상 스크롤이 48px 행을 가정한다).
    expect((await pinned.boundingBox())!.height).toBeLessThanOrEqual(50);
    const sizes = await popup.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
    // 가격·거래대금이 칸에 잘리지 않는다(좁은 화면은 차트 열을 빼고 자리를 준다). 말줄임(…)을 쓰는 이름 칸은 뺀다.
    await expect(popup.locator('thead')).not.toContainText('1일');
    const clipped = await popup.locator('tbody td').evaluateAll(cells =>
      cells.filter(cell =>
        [...cell.querySelectorAll('*')].some(
          el => el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis',
        ),
      ).length,
    );
    expect(clipped).toBe(0);
    // 툴바 팝오버도 화면 안에 들어온다.
    await popup.getByRole('button', { name: '시장 인사이트' }).click();
    const box = await popover(popup).locator('> *').first().boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    await popup.keyboard.press('Escape');
    // 표가 화면 높이를 채운다(고정 430px 팝업 높이가 아님).
    expect((await popup.locator('main').boundingBox())!.height).toBeGreaterThan(600);
    await setStorage(popup, { favoriteCoins: {} });
    await popup.close();
  });

  test('공유 카드 오른쪽 아래에 스토어 검색 안내를 그린다', async ({ popup }) => {
    await popup.evaluate(() => {
      const texts: string[] = [];
      (window as unknown as { __cardTexts: string[] }).__cardTexts = texts;
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text: string, ...rest: [number, number, number?]) {
        texts.push(text);
        return original.call(this, text, ...rest);
      };
    });
    await popup.getByRole('button', { name: '시장 인사이트' }).click();
    await popover(popup).getByTestId('share-card').click();
    await expect(popover(popup).getByTestId('share-card')).toContainText(/복사됨|저장됨/);
    const texts = await popup.evaluate(() => (window as unknown as { __cardTexts: string[] }).__cardTexts);
    expect(texts).toContain('COMO · Crypto Price Tracker');
    expect(texts).toContain('Chrome·웨일 스토어에서 ‘COMO 코인’ 검색');
    await popup.keyboard.press('Escape');
  });

  test('지난번에 연 뒤로 알림을 받았으면 두 번째 열 때 리뷰를 부탁한다', async ({ popup }) => {
    const now = Date.now();
    await setStorage(popup, { usageStats: { firstOpenAt: now - 3600_000, opens: 1, lastOpenAt: now - 3600_000 }, alertFiredAt: now - 60_000 });
    await popup.reload();
    await expect(popup.getByTestId('review-prompt')).toBeVisible();
    // '나중에'를 누르면 닫히고 14일 동안 다시 묻지 않는다.
    await popup.getByRole('button', { name: '나중에' }).click();
    await expect(popup.getByTestId('review-prompt')).toHaveCount(0);
    const stats = await popup.evaluate(() => chrome.storage.local.get('usageStats').then(r => r.usageStats));
    expect(stats.dismissals).toBe(1);
    expect(stats.nextPromptAt).toBeGreaterThan(now + 13 * 86_400_000);
    await popup.reload();
    await expect(rows(popup).nth(3)).toBeVisible();
    await expect(popup.getByTestId('review-prompt')).toHaveCount(0);
    await setStorage(popup, { usageStats: { firstOpenAt: now, opens: 1, reviewed: true } });
  });

  test('런타임 에러가 없다', async () => {
    expect(errors).toEqual([]);
  });
});
