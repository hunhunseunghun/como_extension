// 스토어·유튜브용 30초 소개 영상(webm)을 만든다. 먼저 `pnpm build`가 필요하다.
//   node scripts/store-video.mjs [ko|en ...]   → store/video/como-<lang>.webm
// 실제 팝업을 녹화하고 화면 아래에 자막을 얹는다. 시세는 거래소 실제 서버에서 받는다.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'store', 'video');
const languages = process.argv.slice(2).length ? process.argv.slice(2) : ['ko', 'en'];
const SIZE = { width: 800, height: 600 };

const COPY = {
  ko: {
    intro: ['COMO', '비트코인·코인 시세와 김프를 브라우저 툴바에서'],
    prices: '업비트·빗썸·바이낸스 등 거래소 11곳 실시간 시세, 코인마다 김프',
    chart: '차트 보조지표(이동평균선·볼린저밴드·RSI)',
    alerts: '지정가·급등락·김프·대량 체결 알림, 지난 알림은 기록함에',
    portfolio: '보유 자산 평가금액과 1·7·30일 손익',
    insights: '공포·탐욕 지수, BTC 도미넌스, 김프 추이',
    outro: ['무료 · 광고 없음 · 회원가입 없음', 'Chrome·웨일·Edge·Firefox 스토어에서 «COMO» 검색'],
    labels: { portfolio: '보유 자산', insights: '시장 인사이트', history: '기록' },
  },
  en: {
    intro: ['COMO', 'Bitcoin & crypto prices right in your browser toolbar'],
    prices: 'Live prices from 11 exchanges, with the kimchi premium for every coin',
    chart: 'Charts with moving averages, Bollinger Bands and RSI',
    alerts: 'Price, surge and whale alerts — all kept in your alert history',
    portfolio: 'Portfolio value and 1/7/30-day P/L',
    insights: 'Fear & Greed, BTC dominance, altcoin season',
    outro: ['Free · No ads · No account', 'Search «COMO» on the Chrome Web Store, Edge and Firefox add-ons'],
    labels: { portfolio: 'Portfolio', insights: 'Market insights', history: 'History' },
  },
};

const sampleHistory = lang => {
  const now = Date.now();
  const ko = lang === 'ko';
  return [
    { id: 'upbit:KRW-BTC:115000000', title: '115,000,000 KRW-BTC UPBIT', message: ko ? 'KRW-BTC 상향 도달' : 'KRW-BTC reached (rising)', time: now - 4 * 60_000 },
    { id: 'upbit:KRW-SOL:rule-1', title: 'KRW-SOL +3.4% · UPBIT', message: ko ? '1분 급등 ≥ 3%' : '1-min surge ≥ 3%', time: now - 26 * 60_000 },
    { id: 'binance:BTCUSDT:rule-2-1', title: 'BTCUSDT $1.2M · BINANCE', message: ko ? '대량 매수 @ 84,120' : 'Whale buy @ 84,120', time: now - 58 * 60_000 },
    { id: 'upbit:KRW-ETH:rule-3', title: 'ETH +4.12% · UPBIT', message: ko ? '김프 상단 도달 (4%)' : 'Kimchi premium above (4%)', time: now - 2 * 3600_000 },
  ];
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 자막과 시작·끝 화면. 팝업 위에 덮기만 하고 클릭은 막지 않는다.
const overlay = (page, { caption, card }) =>
  page.evaluate(
    ({ caption, card }) => {
      let root = document.getElementById('como-video-overlay');
      if (!root) {
        root = document.createElement('div');
        root.id = 'como-video-overlay';
        root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:Pretendard,"Segoe UI",sans-serif;word-break:keep-all';
        document.body.appendChild(root);
      }
      root.innerHTML = '';
      if (card) {
        root.innerHTML = `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 55%,#312e81 100%);color:#f8fafc;text-align:center;padding:0 60px">
          <div style="font-size:${card[0].length < 8 ? 72 : 40}px;font-weight:800;letter-spacing:1px">${card[0]}</div>
          <div style="font-size:24px;line-height:1.5;color:#cbd5e1">${card[1]}</div></div>`;
      } else if (caption) {
        root.innerHTML = `<div style="position:absolute;left:24px;right:24px;bottom:22px;padding:14px 20px;border-radius:12px;background:rgba(15,23,42,.88);color:#f8fafc;font-size:22px;font-weight:700;line-height:1.4;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.35)">${caption}</div>`;
      }
    },
    { caption, card },
  );

for (const language of languages) {
  const copy = COPY[language];
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'como-video-'));
  const rawDir = fs.mkdtempSync(path.join(os.tmpdir(), 'como-video-raw-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    locale: language === 'ko' ? 'ko-KR' : 'en-US',
    viewport: SIZE,
    deviceScaleFactor: 1,
    recordVideo: { dir: rawDir, size: SIZE },
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const popupUrl = `chrome-extension://${worker.url().split('/')[2]}/popup/index.html`;
  const exchange = language === 'ko' ? 'upbit' : 'binance';

  // 설정은 녹화하지 않는 탭에서 미리 넣는다.
  const setup = await context.newPage();
  await setup.goto(popupUrl);
  await setup.evaluate(
    ([lang, history, ex]) =>
      new Promise(resolve =>
        chrome.storage.local.set(
          {
            language: lang,
            wideSize: true,
            upDownColors: lang === 'ko' ? 'red-up' : 'green-up',
            activeExchangePlatform: ex,
            alertHistory: history,
            alertHistorySeenAt: Date.now(),
            onboardingPending: false,
            portfolio: [
              { id: '1', exchange: 'binance', market: 'BTCUSDT', quantity: 0.25, avgPrice: 62000 },
              { id: '2', exchange: 'coinbase', market: 'ETHUSD', quantity: 3, avgPrice: 2100 },
              { id: '3', exchange: 'bybit', market: 'SOLUSDT', quantity: 40, avgPrice: 120 },
              { id: '4', exchange: 'upbit', market: 'KRW-XRP', quantity: 1500, avgPrice: 700 },
            ],
          },
          resolve,
        ),
      ),
    [language, sampleHistory(language), exchange],
  );
  await setup.evaluate(ex => chrome.runtime.sendMessage({ action: 'changeExchange', exchange: ex }), exchange);
  // 시세가 들어올 때까지 기다렸다가 닫는다(녹화가 빈 표로 시작하지 않게).
  await setup.reload();
  await setup.locator('tbody tr').nth(8).waitFor({ timeout: 60_000 });
  await sleep(3000);

  await setup.close();

  // 페이지마다 영상이 따로 남는다. 이 페이지 것만 쓴다.
  const page = await context.newPage();
  await overlay(page, { card: copy.intro }).catch(() => {});
  await page.goto(popupUrl);
  await overlay(page, { card: copy.intro });
  await page.locator('tbody tr').nth(8).waitFor({ timeout: 60_000 });
  const volumeHeader = page.locator('thead th').last().getByRole('button');
  await volumeHeader.click();
  await volumeHeader.click();
  await sleep(3500);

  // 앞 장면 창을 닫는 순간 자막도 바꿔, 닫힌 화면에 앞 자막이 남지 않게 한다.
  let opened = false;
  const closePrevious = async () => {
    if (opened) await page.keyboard.press('Escape');
    opened = false;
  };
  const scene = async (caption, open, hold = 4500) => {
    await closePrevious();
    await overlay(page, { caption });
    if (open) {
      await open();
      opened = true;
    }
    await sleep(hold);
  };
  const openPopover = label => () => page.getByRole('button', { name: label, exact: true }).click();

  await scene(copy.prices, null, 5000);
  await scene(copy.chart, async () => {
    await page.locator('tbody tr').nth(1).locator('svg.lucide-chart-candlestick').first().click();
    const indicators = page.getByTestId('chart-indicators');
    await indicators.waitFor({ timeout: 20_000 });
    await sleep(800);
    await indicators.getByRole('button', { name: 'MA' }).click();
    await sleep(600);
    await indicators.getByRole('button', { name: 'BB' }).click();
  });
  await scene(copy.alerts, async () => {
    await page.locator('button:has(svg.lucide-bell)').first().click();
    await page.locator('[data-radix-popper-content-wrapper]').getByRole('tab', { name: copy.labels.history }).click();
  });
  await scene(copy.portfolio, openPopover(copy.labels.portfolio));
  await scene(copy.insights, openPopover(copy.labels.insights));
  await closePrevious();
  await overlay(page, { card: copy.outro });
  await sleep(4000);

  const video = page.video();
  await context.close();
  const target = path.join(OUT, `como-${language}.webm`);
  fs.copyFileSync(await video.path(), target);
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(rawDir, { recursive: true, force: true });
  console.log(`${language}: ${path.relative(ROOT, target)}`);
}
