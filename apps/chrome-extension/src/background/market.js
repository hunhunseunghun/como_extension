// @ts-check
// 주기적으로 받는 시장 데이터: 환율·시장 지표·입출금 상태·코인 시장(ATH·알트 시즌)·파생(펀딩비·롱숏·OI·청산)·트렌딩. index.js에서 나눔.
import { altseasonCandidates, altseasonIndex, klineReturn, openInterestChange } from './lib/derivatives.js';
import { fetchJson } from './net.js';
import { openInterest } from './state.js';
import { loadUpbitWalletStatus } from './account.js';

const deps = {
  /** 연결된 화면(팝업·사이드 패널)이 있으면 그 포트, 없으면 null. @type {() => { postMessage: (message: unknown) => void } | null} */
  getPort: () => null,
};
/** @param {Partial<typeof deps>} values */
export function configureMarket(values) {
  Object.assign(deps, values);
}

// 주기적으로 받아오는 부가 데이터(법정화폐 환율, 시장 지표). 팝업이 연결되면 마지막 값을 바로 보낸다.
const POLL_RETRY_MS = 2 * 60_000;
/** @typedef {{ postMessage: (message: unknown) => void }} Port */
export class PolledData {
  /**
   * @param {string} type 팝업에 보내는 메시지 종류
   * @param {number} intervalMs
   * @param {() => Promise<any>} load 값이 없으면(null) 실패로 본다
   */
  constructor(type, intervalMs, load) {
    this.type = type;
    this.intervalMs = intervalMs;
    this.load = load;
    /** @type {any} */
    this.value = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.retryTimer = null;
  }

  async refresh() {
    try {
      const value = await this.load();
      if (value) {
        this.value = value;
        this.post(deps.getPort());
        return;
      }
    } catch (error) {
      console.warn(error);
    }
    // 아직 한 번도 받지 못했는데 실패하면(요청 한도 429 등) 다음 주기(최대 1시간)까지 비워 두지 않고 2분 뒤 다시 받는다.
    if (!this.value && this.intervalMs > POLL_RETRY_MS && !this.retryTimer) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.refresh();
      }, POLL_RETRY_MS);
    }
  }

  start() {
    this.refresh();
    setInterval(() => this.refresh(), this.intervalMs);
  }

  /** @param {Port | null} port */
  post(port) {
    if (port && this.value) port.postMessage({ type: this.type, data: this.value });
  }
}

/**
 * Promise.allSettled 결과에서 값만 꺼낸다(실패면 undefined).
 * @template T
 * @param {PromiseSettledResult<T>} result
 */
const fulfilled = result => (result.status === 'fulfilled' ? result.value : undefined);

/** @typedef {Record<string, { deposit: boolean, withdraw: boolean }>} BlockedWallets */

export const polledData = [
  // 입출금이 멈춘 코인. 빗썸만 공개 API로 준다(업비트는 인증이 필요하다). 멈춘 코인만 보내 메시지를 작게 둔다.
  // 업비트는 인증이 필요해 거래소 계정 연동(읽기 전용 키)을 한 사용자에게만 보여 준다.
  new PolledData('walletStatus', 10 * 60 * 1000, async () => {
    const [bithumbResult, upbitResult] = await Promise.allSettled([
      fetchJson('https://api.bithumb.com/public/assetsstatus/ALL'),
      loadUpbitWalletStatus(),
    ]);
    /** @type {{ bithumb?: BlockedWallets, upbit?: BlockedWallets }} */
    const result = {};
    const { status, data } = fulfilled(bithumbResult) ?? {};
    if (status === '0000' && data) {
      /** @type {BlockedWallets} */
      const bithumb = {};
      for (const [coin, { deposit_status: deposit, withdrawal_status: withdraw }] of Object.entries(data)) {
        if (deposit !== 1 || withdraw !== 1) bithumb[coin] = { deposit: deposit === 1, withdraw: withdraw === 1 };
      }
      result.bithumb = bithumb;
    }
    const upbit = fulfilled(upbitResult);
    if (upbit) result.upbit = upbit;
    // 한쪽 조회가 잠깐 실패해도 직전 값을 지워 경고 표시가 사라지지 않게 한다.
    const previous = polledData.find(data => data.type === 'walletStatus')?.value;
    if (!result.bithumb && previous?.bithumb) result.bithumb = previous.bithumb;
    if (!result.upbit && previous?.upbit && upbitResult.status === 'rejected') result.upbit = previous.upbit;
    return Object.keys(result).length ? result : null;
  }),
  // USD 기준 166개 법정화폐 환율
  new PolledData('fiatRates', 6 * 60 * 60 * 1000, async () => {
    const data = await fetchJson('https://open.er-api.com/v6/latest/USD');
    return data?.result === 'success' ? data.rates : null;
  }),
  // 공포·탐욕 지수, BTC 도미넌스, BTC 펀딩비. 하나가 실패해도 나머지는 보낸다.
  new PolledData('marketStats', 5 * 60 * 1000, async () => {
    const [fearGreed, global, funding] = await Promise.allSettled([
      fetchJson('https://api.alternative.me/fng/'),
      fetchJson('https://api.coingecko.com/api/v3/global'),
      fetchJson('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT'),
    ]);
    const fng = fulfilled(fearGreed)?.data?.[0];
    return {
      fearGreed: fng ? { value: Number(fng.value), classification: fng.value_classification } : null,
      btcDominance: fulfilled(global)?.data?.market_cap_percentage?.btc ?? null,
      fundingRate: fulfilled(funding)?.lastFundingRate != null ? Number(fulfilled(funding).lastFundingRate) : null,
    };
  }),
];

// 코인 시장 데이터(1시간마다): 시가총액 상위 500개의 역대 최고가(ATH) 대비 하락률과 알트코인 시즌 지수.
// 시즌 지수 = 시가총액 상위 알트코인 50개(스테이블·래핑 토큰 제외) 중 90일 동안 BTC보다 많이 오른 비율. 12시간마다 다시 계산한다.
const ALTSEASON_KEY = 'altseason';
const ALTSEASON_REFRESH_MS = 12 * 60 * 60_000;
const ALTSEASON_DAYS = 90;
/** @param {unknown[]} markets CoinGecko /coins/markets */
async function computeAltseason(markets) {
  const stored = (await chrome.storage.local.get(ALTSEASON_KEY))[ALTSEASON_KEY];
  if (stored && Date.now() - stored.updatedAt < ALTSEASON_REFRESH_MS) return stored;
  const klines = /** @param {string} symbol */ symbol =>
    fetchJson(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=${ALTSEASON_DAYS + 1}`).then(klineReturn, () => NaN);
  // 바이낸스에 없는 코인이 있어 넉넉히 고른 뒤 수익률을 구한 앞의 50개만 쓴다.
  const candidates = altseasonCandidates(markets, 65);
  const [btc, ...alts] = await Promise.all([klines('BTC'), ...candidates.map(klines)]);
  const returns = alts.filter(Number.isFinite).slice(0, 50);
  const value = altseasonIndex(btc, returns);
  if (value == null) return stored ?? null;
  const result = { value, count: returns.length, days: ALTSEASON_DAYS, updatedAt: Date.now() };
  await chrome.storage.local.set({ [ALTSEASON_KEY]: result });
  return result;
}
export const coinMarket = new PolledData('coinMarket', 60 * 60_000, async () => {
  const pages = await Promise.all(
    [1, 2].map(page => fetchJson(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`)),
  );
  const markets = pages.flat();
  // 같은 기호가 여럿이면 시가총액이 큰(먼저 나온) 코인을 쓴다.
  /** @type {Record<string, { change: number, price: number, date: string }>} */
  const ath = {};
  for (const coin of markets) {
    const symbol = String(coin?.symbol ?? '').toUpperCase();
    if (symbol && !(symbol in ath) && Number.isFinite(coin.ath_change_percentage)) {
      ath[symbol] = { change: coin.ath_change_percentage, price: coin.ath, date: coin.ath_date };
    }
  }
  const altseason = await computeAltseason(markets).catch(error => {
    console.warn(error);
    return null;
  });
  return { ath, altseason };
});
polledData.push(coinMarket);

// 파생 지표: 바이낸스 USDT 무기한 선물의 펀딩비 순위(1분마다)와 강제 청산 스트림(최근 1시간 누적).
const FUNDING_LIST_SIZE = 5;
export const derivatives = new PolledData('derivatives', 60 * 1000, async () => {
  const list = await fetchJson('https://fapi.binance.com/fapi/v1/premiumIndex');
  const rates = /** @type {any[]} */ (list)
    .filter(item => item.symbol.endsWith('USDT') && item.lastFundingRate !== '')
    .map(item => ({ symbol: item.symbol, rate: Number(item.lastFundingRate), nextFundingTime: item.nextFundingTime }))
    .filter(item => Number.isFinite(item.rate))
    .sort((a, b) => b.rate - a.rate);
  return { highest: rates.slice(0, FUNDING_LIST_SIZE), lowest: rates.slice(-FUNDING_LIST_SIZE).reverse(), updatedAt: Date.now() };
});
derivatives.post = () => {}; // 팝업이 열 때 메시지로 받아 간다.

// 롱숏 비율(바이낸스 선물, 5분 단위): 전체 계정 중 롱 비율과 상위 트레이더 포지션 중 롱 비율. 5분마다 받는다.
const LONG_SHORT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
export const longShort = new PolledData('longShort', 5 * 60 * 1000, async () => {
  /**
   * @param {string} path
   * @param {string} symbol
   */
  const query = (path, symbol) => fetchJson(`https://fapi.binance.com/futures/data/${path}?symbol=${symbol}&period=5m&limit=1`);
  const items = await Promise.all(
    LONG_SHORT_SYMBOLS.map(async symbol => {
      /**
       * @param {string} period
       * @param {number} limit
       */
      const oiHistory = (period, limit) =>
        fetchJson(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`);
      const [accounts, top, oiHour, oiDay] = await Promise.allSettled([
        query('globalLongShortAccountRatio', symbol),
        query('topLongShortPositionRatio', symbol),
        // 미결제약정: 5분 단위 13개(1시간), 1시간 단위 25개(24시간)
        oiHistory('5m', 13),
        oiHistory('1h', 25),
      ]);
      const hour = openInterestChange(fulfilled(oiHour));
      const day = openInterestChange(fulfilled(oiDay));
      const oi = { usd: hour?.usd ?? day?.usd ?? null, change1h: hour?.change ?? null, change24h: day?.change ?? null };
      if (oi.usd != null) openInterest.set(symbol, oi);
      const account = fulfilled(accounts)?.[0];
      const topAccount = fulfilled(top)?.[0];
      if (!account) return null;
      return {
        symbol,
        longAccount: Number(account.longAccount),
        topLong: topAccount ? Number(topAccount.longAccount) : null,
        openInterest: oi.usd != null ? oi : null,
      };
    }),
  );
  const list = items.filter(Boolean);
  return list.length ? { items: list, updatedAt: Date.now() } : null;
});
longShort.post = () => {};

const LIQUIDATION_WINDOW = 60 * 60 * 1000;
/** @type {{ symbol: string, side: 'long' | 'short', usd: number, price: number, time: number }[]} */
export const liquidations = [];
/** @type {WebSocket | null} */
let liquidationSocket = null;
export function connectLiquidations() {
  // 심볼마다 1초에 최대 1건(가장 큰 청산)만 오는 스냅샷 스트림이라 가볍다.
  // 예전 /ws 경로는 연결은 되지만 메시지를 보내지 않는다. 시장 데이터 스트림은 /market/ws를 쓴다.
  const socket = new WebSocket('wss://fstream.binance.com/market/ws/!forceOrder@arr');
  liquidationSocket = socket;
  socket.onmessage = event => {
    try {
      const order = JSON.parse(event.data)?.o;
      if (!order) return;
      const usd = Number(order.ap) * Number(order.z || order.q);
      if (!Number.isFinite(usd)) return;
      // 매도 체결 = 롱 포지션 청산, 매수 체결 = 숏 포지션 청산
      liquidations.push({ symbol: order.s, side: order.S === 'SELL' ? 'long' : 'short', usd, price: Number(order.ap), time: order.T });
      const cutoff = Date.now() - LIQUIDATION_WINDOW;
      while (liquidations.length && liquidations[0].time < cutoff) liquidations.shift();
      if (liquidations.length > 5000) liquidations.splice(0, liquidations.length - 5000);
    } catch (error) {
      console.warn(error);
    }
  };
  socket.onclose = () => setTimeout(connectLiquidations, 5000);
  socket.onerror = () => liquidationSocket?.close();
}

const startedAt = Date.now();
export function summarizeLiquidations() {
  const cutoff = Date.now() - LIQUIDATION_WINDOW;
  const recent = liquidations.filter(item => item.time >= cutoff);
  const sum = /** @param {'long' | 'short'} side */ side => recent.filter(item => item.side === side).reduce((total, item) => total + item.usd, 0);
  return {
    longUsd: sum('long'),
    shortUsd: sum('short'),
    count: recent.length,
    largest: [...recent].sort((a, b) => b.usd - a.usd).slice(0, 5),
    // 서비스 워커가 시작한 지 1시간이 안 됐으면 그만큼만 모은 값이다.
    windowMs: Math.min(LIQUIDATION_WINDOW, Date.now() - startedAt),
  };
}

// 트렌딩 코인: CoinGecko 검색 상위(10분마다)
export const trending = new PolledData('trending', 10 * 60 * 1000, async () => {
  const data = await fetchJson('https://api.coingecko.com/api/v3/search/trending');
  return /** @type {{ item: any }[]} */ (data?.coins ?? []).slice(0, 10).map(({ item }) => ({
    id: item.id,
    symbol: item.symbol,
    name: item.name,
    thumb: item.thumb,
    rank: item.market_cap_rank,
    change24h: item.data?.price_change_percentage_24h?.usd ?? null,
  }));
});
trending.post = () => {};
