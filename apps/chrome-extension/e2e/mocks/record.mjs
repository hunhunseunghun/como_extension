// E2E 모의 모드에 쓰는 보조 API 응답을 실제 서버에서 받아 e2e/mocks/data에 저장한다.
// 거래소 시세(REST·웹소켓)는 기록하지 않는다 — 테스트는 그대로 실제 거래소에 붙는다.
//   node e2e/mocks/record.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const get = async (url, type = 'json') => {
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 como-e2e-recorder' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return type === 'json' ? response.json() : response.text();
};
const save = (name, data) => {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  fs.writeFileSync(path.join(DIR, name), text);
  console.log(`${name} ${(text.length / 1024).toFixed(1)}KB`);
};
const pick = (object, keys) => Object.fromEntries(keys.map(key => [key, object?.[key]]));

const MARKET_KEYS = ['id', 'symbol', 'name', 'current_price', 'market_cap', 'ath', 'ath_change_percentage', 'ath_date'];
const markets = [];
for (const page of [1, 2]) {
  const list = await get(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`);
  markets.push(list.map(coin => pick(coin, MARKET_KEYS)));
}
save('coingecko-markets-1.json', markets[0]);
save('coingecko-markets-2.json', markets[1]);
const global = await get('https://api.coingecko.com/api/v3/global');
save('coingecko-global.json', { data: { market_cap_percentage: global.data.market_cap_percentage } });
const trending = await get('https://api.coingecko.com/api/v3/search/trending');
save('coingecko-trending.json', {
  coins: trending.coins.slice(0, 10).map(({ item }) => ({
    item: {
      ...pick(item, ['id', 'symbol', 'name', 'thumb', 'market_cap_rank']),
      data: { price_change_percentage_24h: { usd: item.data?.price_change_percentage_24h?.usd ?? null } },
    },
  })),
});
save('fng.json', await get('https://api.alternative.me/fng/'));
save('fiat.json', await get('https://open.er-api.com/v6/latest/USD'));
const dex = await get('https://api.dexscreener.com/latest/dex/search?q=PEPE');
save('dex-search-pepe.json', {
  pairs: dex.pairs.slice(0, 12).map(pair => ({
    ...pick(pair, ['chainId', 'dexId', 'pairAddress', 'url', 'priceUsd', 'priceChange', 'liquidity', 'volume']),
    baseToken: pair.baseToken,
    quoteToken: { symbol: pair.quoteToken?.symbol },
  })),
});
save('econ.json', { recordedAt: Date.now(), events: await get('https://nfs.faireconomy.media/ff_calendar_thisweek.json') });
save('bithumb-notices.json', await get('https://feed-api.bithumb.com/v1/notices?count=20'));
save(
  'upbit-notices.json',
  await get('https://api-manager.upbit.com/api/v1/announcements?os=web&page=1&per_page=20&category=trade'),
);
// 뉴스 RSS는 기록하지 않는다(기사 원문을 저장소에 두지 않는다). mocks.ts가 가짜 기사를 만든다.
