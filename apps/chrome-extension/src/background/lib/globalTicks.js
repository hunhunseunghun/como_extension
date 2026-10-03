// @ts-check
// 해외 거래소 시세를 바이낸스 24hrTicker(스냅샷)·웹소켓 필드 형태로 맞춘다(순수 함수).

/** @typedef {{ last: string | number, open: string | number, high: string | number, low: string | number, quoteVolume: string | number }} TickFields */

/**
 * 팝업은 c <= b 이면 BID(상승색)로 표시하므로 직전 가격 대비 방향으로 b를 채운다.
 * @param {string} symbol
 * @param {TickFields} fields
 * @param {{ c?: string, lastPrice?: string } | undefined} [prev]
 */
export function toGlobalTick(symbol, { last, open, high, low, quoteVolume }, prev) {
  const close = Number(last);
  const openPrice = Number(open);
  const change = close - openPrice;
  // REST 응답과 같은 소수 8자리 문자열로 맞춰 부동소수점 오차가 표시되지 않게 한다.
  const priceChange = change.toFixed(8);
  const prevPrice = Number(prev?.c ?? prev?.lastPrice);
  return {
    s: symbol,
    c: String(last),
    o: String(open),
    h: String(high),
    l: String(low),
    q: String(quoteVolume),
    p: priceChange,
    priceChange,
    P: openPrice ? ((change / openPrice) * 100).toFixed(3) : '0',
    b: Number.isFinite(prevPrice) && close >= prevPrice ? String(last) : '0',
  };
}

/**
 * @param {string} symbol
 * @param {TickFields} fields
 */
export function toGlobalSnapshot(symbol, { last, open, high, low, quoteVolume }) {
  const close = Number(last);
  const openPrice = Number(open);
  const change = close - openPrice;
  return {
    symbol,
    market: symbol,
    lastPrice: String(last),
    openPrice: String(open),
    highPrice: String(high),
    lowPrice: String(low),
    quoteVolume: String(quoteVolume),
    priceChange: change.toFixed(8),
    priceChangePercent: openPrice ? ((change / openPrice) * 100).toFixed(3) : '0',
  };
}
