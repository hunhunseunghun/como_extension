// @ts-check
// 여러 모듈이 함께 쓰는 상태

/**
 * 시세 한 종목. 거래소마다 필드가 조금씩 달라 공통으로 쓰는 것만 적는다.
 * @typedef {{ currentPrice?: number, changeRate?: number, volume?: number, [field: string]: any }} Ticker
 */

/**
 * 거래소별 최신 시세: { [exchange]: { [market]: ticker } }
 * @type {Record<string, Record<string, Ticker>>}
 */
export const allExchangesTickers = {
  upbit: {},
  bithumb: {},
  binance: {},
  bybit: {},
  okx: {},
  coinbase: {},
  bitget: {},
  kraken: {},
  coindcx: {},
  coinone: {},
  digitalx: {},
};

// 조용한 모드(배지를 비우고 알림 소리를 끔). 배지 쪽이 저장소에서 읽어 바꾸고, 알림 쪽이 읽는다.
export const uiState = { quietMode: false };

/**
 * 바이낸스 선물 미결제약정(기호 → { usd, change1h, change24h }). 롱숏 비율과 함께 5분마다 받고(market.js), OI 알림 규칙이 읽는다.
 * @type {Map<string, { usd: number | null, change1h: number | null, change24h: number | null }>}
 */
export const openInterest = new Map();
