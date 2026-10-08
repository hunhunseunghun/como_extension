// 스토어 등록용 1280x800 스크린샷을 만든다. 먼저 `pnpm build`가 필요하다.
//   node scripts/store-screenshots.mjs [en|ko ...]   → store/screenshots/<lang>/<n>.jpg
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'store', 'screenshots');
const languages = process.argv.slice(2).length ? process.argv.slice(2) : ['en', 'ko'];

const COPY = {
  en: {
    prices: ['Live prices from 11 exchanges', 'Binance, Coinbase, Bybit, OKX, Kraken, Upbit, Bithumb and more — with the kimchi premium for every coin'],
    chart: ['Charts with indicators', 'Moving averages, Bollinger Bands and RSI, plus markers and news on big candles'],
    alerts: ['Alerts you won’t miss', 'Price, surge, kimchi premium, whale trades and trading notices — all kept in your alert history'],
    portfolio: ['Portfolio with live P/L', 'Add holdings and see total value and 1/7/30-day P/L in 15 currencies'],
    insights: ['Market insights', 'Fear & Greed, BTC dominance, altcoin season, kimchi premium trend and arbitrage'],
    labels: { portfolio: 'Portfolio', insights: 'Market insights', alerts: 'Price alerts', history: 'History' },
  },
  ko: {
    prices: ['김프까지 한눈에, 거래소 11곳 실시간 시세', '업비트·빗썸·코인원·바이낸스·코인베이스·바이비트·OKX 등 코인별 김치 프리미엄 표시'],
    chart: ['차트 보조지표와 급등락 봉', '이동평균선·볼린저밴드·RSI, 급등락 시각의 뉴스까지'],
    alerts: ['놓치지 않는 알림', '지정가·급등락·김프·대량 체결·거래 공지, 지난 알림은 알림 기록함에'],
    portfolio: ['보유 자산 손익을 실시간으로', '평가금액과 1·7·30일 손익을 15개 통화로'],
    insights: ['시장 인사이트', '공포·탐욕 지수, BTC 도미넌스, 알트코인 시즌, 김프 추이와 차익 계산'],
    labels: { portfolio: '보유 자산', insights: '시장 인사이트', alerts: '지정가 알림', history: '기록' },
  },
};

// 알림 기록함에 보여 줄 예시(실제 알림과 같은 모양)
const sampleHistory = lang => {
  const now = Date.now();
  const ko = lang === 'ko';
  return [
    { id: 'upbit:KRW-BTC:115000000', title: '115,000,000 KRW-BTC UPBIT', message: ko ? 'KRW-BTC 상향 도달' : 'KRW-BTC reached (rising)', time: now - 4 * 60_000 },
    { id: 'upbit:KRW-SOL:rule-1', title: 'KRW-SOL +3.4% · UPBIT', message: ko ? '1분 급등 ≥ 3%' : '1-min surge ≥ 3%', time: now - 26 * 60_000 },
    { id: 'binance:BTCUSDT:rule-2-1', title: 'BTCUSDT $1.2M · BINANCE', message: ko ? '대량 매수 @ 84,120' : 'Whale buy @ 84,120', time: now - 58 * 60_000 },
    { id: 'upbit:KRW-ETH:rule-3', title: 'ETH +4.12% · UPBIT', message: ko ? '김프 상단 도달 (4%)' : 'Kimchi premium above (4%)', time: now - 2 * 3600_000 },
    { id: 'econ:cpi', title: ko ? '20분 후 발표 · CPI m/m' : 'In 20 min · CPI m/m', message: ko ? '예상 0.3% · 이전 0.4%' : 'Forecast 0.3% · Previous 0.4%', time: now - 5 * 3600_000 },
  ];
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const frameHtml = (title, subtitle, imagePath) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:'Pretendard','Segoe UI',sans-serif;word-break:keep-all}
  body{background:linear-gradient(135deg,#0f172a 0%,#1e293b 55%,#312e81 100%);display:flex;align-items:center;gap:40px;padding:0 48px;box-sizing:border-box;color:#f8fafc}
  .copy{flex:0 0 330px}
  h1{font-size:40px;line-height:1.2;margin:0 0 16px;font-weight:800;letter-spacing:-0.5px}
  p{font-size:19px;line-height:1.5;margin:0;color:#cbd5e1}
  .brand{margin-top:28px;font-size:15px;color:#a5b4fc;font-weight:700;letter-spacing:2px}
  img{width:820px;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.12)}
</style></head><body><div class="copy"><h1>${title}</h1><p>${subtitle}</p><div class="brand">COMO</div></div>
<img src="file:///${imagePath.replaceAll('\\', '/')}"></body></html>`;

for (const language of languages) {
  const copy = COPY[language];
  const outDir = path.join(OUT, language);
  fs.mkdirSync(outDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'como-shots-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    locale: language === 'ko' ? 'ko-KR' : 'en-US',
    viewport: { width: 800, height: 600 },
    deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const popupUrl = `chrome-extension://${worker.url().split('/')[2]}/popup/index.html`;

  const page = await context.newPage();
  await page.goto(popupUrl);
  // 와이드 화면, 언어, 거래소(바이낸스), 데모 보유 자산을 미리 넣는다.
  await page.evaluate(
    ([lang, history]) =>
      new Promise(resolve =>
        chrome.storage.local.set(
          {
            language: lang,
            wideSize: true,
            upDownColors: lang === 'ko' ? 'red-up' : 'green-up',
            activeExchangePlatform: lang === 'ko' ? 'upbit' : 'binance',
            alertHistory: history,
            alertHistorySeenAt: Date.now(),
            onboardingPending: false, // 첫 실행 안내가 화면을 덮지 않게 한다
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
    [language, sampleHistory(language)],
  );
  await page.evaluate(exchange => chrome.runtime.sendMessage({ action: 'changeExchange', exchange }), language === 'ko' ? 'upbit' : 'binance');
  await page.reload();
  await page.locator('tbody tr').nth(8).waitFor({ timeout: 60_000 });
  // 거래대금 순으로 정렬해 대표 코인이 위에 오게 한다.
  const volumeHeader = page.locator('thead th').last().getByRole('button');
  await volumeHeader.click();
  await volumeHeader.click();
  await sleep(4000);

  const shots = [];
  const capture = async (key, open) => {
    if (open) await open();
    await sleep(2500);
    const raw = path.join(outDir, `raw-${key}.png`);
    await page.screenshot({ path: raw });
    if (open) await page.keyboard.press('Escape');
    shots.push([key, raw]);
  };

  const openPopover = label => async () => {
    await page.getByRole('button', { name: label, exact: true }).click();
  };

  await capture('prices');
  await capture('chart', async () => {
    await page.locator('tbody tr').nth(1).locator('svg.lucide-chart-candlestick').first().click();
    const indicators = page.getByTestId('chart-indicators');
    await indicators.waitFor({ timeout: 20_000 });
    await indicators.getByRole('button', { name: 'MA' }).click();
    await indicators.getByRole('button', { name: 'BB' }).click();
  });
  await capture('alerts', async () => {
    await page.locator('button:has(svg.lucide-bell)').first().click();
    await page.locator('[data-radix-popper-content-wrapper]').getByRole('tab', { name: copy.labels.history }).click();
  });
  await capture('portfolio', openPopover(copy.labels.portfolio));
  await capture('insights', openPopover(copy.labels.insights));

  const composer = await context.newPage();
  await composer.setViewportSize({ width: 1280, height: 800 });
  let index = 1;
  for (const [key, raw] of shots) {
    const [title, subtitle] = copy[key];
    const htmlPath = path.join(outDir, `frame-${key}.html`);
    fs.writeFileSync(htmlPath, frameHtml(title, subtitle, raw));
    await composer.goto(`file:///${htmlPath.replaceAll('\\', '/')}`);
    await composer.waitForLoadState('load');
    // 스토어는 알파 채널이 없는 24비트 이미지만 받으므로 JPEG로 저장한다.
    await composer.screenshot({ path: path.join(outDir, `${index}-${key}.jpg`), type: 'jpeg', quality: 92 });
    fs.rmSync(htmlPath);
    fs.rmSync(raw);
    index++;
  }
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(`${language}: ${shots.length} screenshots → ${path.relative(ROOT, outDir)}`);
}
