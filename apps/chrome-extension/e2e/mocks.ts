import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Route } from '@playwright/test';

// 모의 모드: 거래소가 아닌 보조 API(CoinGecko·공포탐욕·환율·DEX·공지·경제 일정·뉴스)를 기록해 둔 응답으로 돌려준다.
// 이 API들은 요청 한도(CoinGecko 429)나 그날의 내용에 따라 테스트가 흔들려서 고정한다. 거래소 시세는 그대로 실제 서버를 쓴다.
//   기본: 켜짐. COMO_E2E_LIVE=1이면 끄고 모두 실제 서버에 붙는다.
//   응답 다시 기록: node e2e/mocks/record.mjs
export const MOCK_ENABLED = process.env.COMO_E2E_LIVE !== '1';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mocks', 'data');
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
const json = (name: string) => (route: Route) => route.fulfill({ json: read(name), headers: CORS });
const CORS = { 'access-control-allow-origin': '*' };

const WEEK_MS = 7 * 24 * 60 * 60_000;
// 기록한 주의 일정을 이번 주로 옮긴다(요일·시각은 그대로).
const econ = (route: Route) => {
  const { recordedAt, events } = read('econ.json') as { recordedAt: number; events: { date: string }[] };
  const shift = Math.round((Date.now() - recordedAt) / WEEK_MS) * WEEK_MS;
  const moved = events.map(event => ({ ...event, date: new Date(Date.parse(event.date) + shift).toISOString() }));
  return route.fulfill({ json: moved, headers: CORS });
};

// 급등락 봉 뉴스용 가짜 기사: 최근 하루 동안 1시간 간격으로 비트코인·이더리움·시장 전반 기사.
const NEWS_TOPICS = ['Bitcoin', 'Ethereum', 'Crypto market', 'BTC', 'Solana'];
const rss = (source: string) => (route: Route) => {
  const now = Date.now();
  const items = Array.from({ length: 24 }, (_, i) => {
    const topic = NEWS_TOPICS[i % NEWS_TOPICS.length];
    const time = new Date(now - i * 60 * 60_000).toUTCString();
    return `<item><title>${topic} moves ${i % 2 ? 'higher' : 'lower'} (${source} e2e ${i})</title><link>https://example.com/${source}/${i}</link><pubDate>${time}</pubDate></item>`;
  });
  const body = `<?xml version="1.0"?><rss version="2.0"><channel><title>${source}</title>${items.join('')}</channel></rss>`;
  return route.fulfill({ body, contentType: 'application/rss+xml', headers: CORS });
};

type DexPair = { pairAddress: string };
const dexPairs = (route: Route) => {
  const addresses = new Set(
    decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '')
      .toLowerCase()
      .split(','),
  );
  const { pairs } = read('dex-search-pepe.json') as { pairs: DexPair[] };
  return route.fulfill({ json: { pairs: pairs.filter(pair => addresses.has(pair.pairAddress.toLowerCase())) }, headers: CORS });
};

const ROUTES: [string | RegExp, (route: Route) => unknown][] = [
  [/api\.coingecko\.com\/api\/v3\/coins\/markets.*[?&]page=2/, json('coingecko-markets-2.json')],
  [/api\.coingecko\.com\/api\/v3\/coins\/markets/, json('coingecko-markets-1.json')],
  ['https://api.coingecko.com/api/v3/global', json('coingecko-global.json')],
  ['https://api.coingecko.com/api/v3/search/trending', json('coingecko-trending.json')],
  ['https://api.alternative.me/fng/**', json('fng.json')],
  ['https://open.er-api.com/v6/latest/USD', json('fiat.json')],
  [/api\.dexscreener\.com\/latest\/dex\/search/, json('dex-search-pepe.json')],
  [/api\.dexscreener\.com\/latest\/dex\/pairs\//, dexPairs],
  ['https://nfs.faireconomy.media/ff_calendar_thisweek.json', econ],
  [/feed-api\.bithumb\.com\/v1\/notices/, json('bithumb-notices.json')],
  [/api-manager\.upbit\.com\/api\/v1\/announcements/, json('upbit-notices.json')],
  ['https://www.blockmedia.co.kr/feed', rss('blockmedia')],
  ['https://www.coindesk.com/arc/outboundfeeds/rss', rss('coindesk')],
];

/**
 * 보조 API를 기록한 응답으로 바꾼다. 서비스 워커는 브라우저를 띄우자마자 요청을 보내므로
 * 경로를 건 뒤 서비스 워커를 한 번 멈춰 처음부터 모의 응답을 받게 한다.
 * (chrome.runtime.reload()는 --load-extension으로 올린 확장을 꺼 버려 쓸 수 없다.)
 * 멈춘 워커는 열려 있는 팝업이 다시 깨우고, Playwright의 워커 핸들은 새 워커를 그대로 가리킨다.
 */
export const installMocks = async (context: BrowserContext) => {
  if (!MOCK_ENABLED) return;
  for (const [pattern, handler] of ROUTES) await context.route(pattern, handler);
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  // 실제 응답으로 계산해 저장해 둔 값이 있으면 지워 모의 응답으로 다시 계산하게 한다.
  await worker.evaluate(() => chrome.storage.local.remove(['altseason', 'econEvents']));
  const page = await context.newPage();
  await page.goto(`chrome-extension://${worker.url().split('/')[2]}/popup/index.html`);
  const cdp = await context.newCDPSession(page);
  const restarted = new Promise<void>(resolve => {
    let stopped = false;
    cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
      const status = versions[0]?.runningStatus;
      if (status === 'stopped') stopped = true;
      if (stopped && status === 'running') resolve();
    });
  });
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await restarted;
  await cdp.detach();
  await page.close();
};
