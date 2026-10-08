// @ts-check
// 김치 프리미엄(실시간 환율)·김프 추이 기록·거래소 간 가격 차이. index.js에서 나눔.
import { computeKimchiPremium as computeKimchiPremiumFrom } from './lib/kimchi.js';
import { allExchangesTickers } from './state.js';
import { fetchJson } from './net.js';
import { polledData } from './market.js';

const deps = {
  /** 고시 환율(USD→KRW). 실시간 환율을 못 받았을 때 쓴다. @type {() => number | null} */
  officialUsdKrw: () => null,
};
/** @param {Partial<typeof deps>} values */
export function configurePremium(values) {
  Object.assign(deps, values);
}

// 김치 프리미엄: KRW 마켓 가격 vs (Binance USDT 가격 × USD/KRW 환율).
// USDT≈USD 가정. 두 페어가 모두 살아있고 환율이 있을 때만 산출.
// 김프는 장중 실시간 환율로 계산한다. 수출입은행 고시 환율은 하루 한 번(고시 전에는 전날 값)이라 장중에 0.5~1%p 어긋난다.
// 표시용 환율(exchangeRateUSD)은 화면 안내대로 고시 환율을 그대로 쓴다.
const LIVE_FX_INTERVAL = 5 * 60_000;
/** @type {number | null} */
let liveUsdKrw = null;
async function refreshLiveUsdKrw() {
  try {
    const response = await fetch(
      'https://m.stock.naver.com/front-api/marketIndex/productDetail?category=exchange&reutersCode=FX_USDKRW',
      { headers: { Accept: 'application/json' } },
    );
    const json = await response.json();
    const rate = Number(json?.result?.calcPrice ?? String(json?.result?.closePrice ?? '').replace(/,/g, ''));
    if (Number.isFinite(rate) && rate > 0) liveUsdKrw = rate;
  } catch (error) {
    console.warn(error);
  }
}
refreshLiveUsdKrw();
setInterval(refreshLiveUsdKrw, LIVE_FX_INTERVAL);

// 김프 추이: 10분마다 BTC 김프(업비트·빗썸)와 테더 프리미엄을 7일치 기록한다.
// 화면이 닫혀 소켓을 끊어 둔 동안에도 이어지도록 웹소켓 대신 REST로 가격을 받는다.
const KIMCHI_HISTORY_KEY = 'kimchiHistory';
const KIMCHI_HISTORY_MAX = 7 * 24 * 6;

async function recordKimchiHistory() {
  try {
    if (!liveUsdKrw) await refreshLiveUsdKrw();
    const usdRate = liveUsdKrw || deps.officialUsdKrw();
    if (!usdRate) return;
    const [upbit, bithumb, binance] = await Promise.all([
      fetchJson('https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-USDT'),
      fetchJson('https://api.bithumb.com/v1/ticker?markets=KRW-BTC'),
      fetchJson('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'),
    ]);
    const btcUsdt = Number(binance?.price);
    if (!btcUsdt) return;
    /**
     * @param {any} list 업비트·빗썸 /v1/ticker 응답
     * @param {string} market
     * @returns {number | undefined}
     */
    const price = (list, market) => list?.find?.((/** @type {any} */ item) => item.market === market)?.trade_price;
    const premium = /** @param {number | undefined} krw */ krw => (krw ? Number(((krw / (btcUsdt * usdRate) - 1) * 100).toFixed(3)) : null);
    const usdtKrw = price(upbit, 'KRW-USDT');
    const point = {
      t: Date.now(),
      upbit: premium(price(upbit, 'KRW-BTC')),
      bithumb: premium(price(bithumb, 'KRW-BTC')),
      tether: usdtKrw ? Number(((usdtKrw / usdRate - 1) * 100).toFixed(3)) : null,
    };
    const history = (await chrome.storage.local.get(KIMCHI_HISTORY_KEY))[KIMCHI_HISTORY_KEY] ?? [];
    await chrome.storage.local.set({ [KIMCHI_HISTORY_KEY]: [...history, point].slice(-KIMCHI_HISTORY_MAX) });
  } catch (error) {
    console.warn(error);
  }
}
chrome.alarms.create('kimchiHistory', { periodInMinutes: 10 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'kimchiHistory') recordKimchiHistory();
});
// 서비스 워커가 오래 쉬었다 깨어났으면 바로 한 점을 남긴다.
chrome.storage.local.get(KIMCHI_HISTORY_KEY).then(result => {
  const last = result[KIMCHI_HISTORY_KEY]?.at(-1);
  // 시작 직후에는 거래소 시세 스냅샷 요청이 몰려 있어 잠시 뒤에 남긴다.
  if (!last || Date.now() - last.t > 10 * 60_000) setTimeout(recordKimchiHistory, 30_000);
});

export function computeKimchiPremium() {
  return computeKimchiPremiumFrom(allExchangesTickers, liveUsdKrw || deps.officialUsdKrw());
}

// 거래소 간 가격 차이: 같은 코인을 USD로 환산해 가장 싼 곳과 비싼 곳의 차이를 구한다.
// 원화 마켓은 환율로 환산하므로 김치 프리미엄도 함께 반영된다(includeKrw=false면 제외).
const MAX_SPREAD = 30; // 이보다 크면 같은 티커의 다른 코인이거나 거래가 끊긴 마켓일 가능성이 높다.
const MIN_SPREAD_VOLUME_USD = 100_000; // 24시간 거래대금이 이보다 적은 마켓은 시세가 오래됐을 수 있어 뺀다.

export function computeSpreads({ includeKrw = true, limit = 30 } = {}) {
  const usdRate = deps.officialUsdKrw();
  /** @type {Record<string, { exchange: string, market: string, price: number, usdPrice: number }[]>} */
  const byCoin = {};
  for (const [exchange, tickers] of Object.entries(allExchangesTickers)) {
    for (const [market, ticker] of Object.entries(tickers)) {
      const price = ticker.currentPrice;
      if (!price) continue;
      let coin = null;
      let usdPrice = null;
      if (market.startsWith('KRW-')) {
        if (!includeKrw || !usdRate) continue;
        coin = market.slice(4);
        usdPrice = price / usdRate;
      } else if (market.endsWith('USDT')) {
        coin = market.slice(0, -4);
        usdPrice = price;
      } else if ((exchange === 'coinbase' || exchange === 'kraken') && market.endsWith('USD')) {
        coin = market.slice(0, -3);
        usdPrice = price;
      } else if (market.endsWith('INR')) {
        const inrRate = polledData.find(data => data.type === 'fiatRates')?.value?.INR;
        if (!inrRate) continue;
        coin = market.slice(0, -3);
        usdPrice = price / inrRate;
      }
      if (!coin || usdPrice == null || coin === 'USDT' || coin === 'USDC') continue;
      const volumeUsd = (ticker.volume ?? 0) * (usdPrice / price);
      if (volumeUsd < MIN_SPREAD_VOLUME_USD) continue;
      (byCoin[coin] ??= []).push({ exchange, market, price, usdPrice });
    }
  }

  const items = [];
  for (const [coin, quotes] of Object.entries(byCoin)) {
    if (quotes.length < 2) continue;
    let low = quotes[0];
    let high = quotes[0];
    for (const quote of quotes) {
      if (quote.usdPrice < low.usdPrice) low = quote;
      if (quote.usdPrice > high.usdPrice) high = quote;
    }
    if (low.exchange === high.exchange) continue;
    const spread = ((high.usdPrice - low.usdPrice) / low.usdPrice) * 100;
    if (spread > 0 && spread <= MAX_SPREAD) items.push({ coin, spread, low, high, exchanges: quotes.length });
  }
  items.sort((a, b) => b.spread - a.spread);
  return { usdRate, items: items.slice(0, limit) };
}
