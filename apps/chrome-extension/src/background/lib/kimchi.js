// @ts-check
// 김치 프리미엄 계산(순수 함수): KRW 마켓 가격 vs (바이낸스 USDT 가격 × USD/KRW 환율). USDT≈USD로 본다.

/** @typedef {Record<string, Record<string, { currentPrice?: number }>>} AllTickers */

/**
 * @param {AllTickers} allTickers 거래소 → 마켓 → 시세
 * @param {number | null} usdRate USD/KRW 환율
 */
export function computeKimchiPremium(allTickers, usdRate) {
  if (!usdRate) return { rate: usdRate, items: {} };

  /** @type {Record<string, { exchange: string, market: string, coin: string, premium: number, krwPrice: number, usdtPrice: number }>} */
  const items = {};
  for (const krwExchange of ['upbit', 'bithumb']) {
    const krwTickers = allTickers[krwExchange];
    if (!krwTickers) continue;
    for (const market in krwTickers) {
      if (!market.startsWith('KRW-')) continue;
      const coin = market.slice(4);
      if (coin === 'USDT' || coin === 'USDC') continue;
      const krwPrice = krwTickers[market]?.currentPrice;
      const usdtPrice = allTickers.binance?.[`${coin}USDT`]?.currentPrice;
      if (!krwPrice || !usdtPrice) continue;
      items[`${krwExchange}:${market}`] = {
        exchange: krwExchange,
        market,
        coin,
        premium: (krwPrice / (usdtPrice * usdRate) - 1) * 100,
        krwPrice,
        usdtPrice,
      };
    }
  }
  // 테더 프리미엄: 원화로 산 USDT가 실제 달러 환율보다 얼마나 비싼지. 김프의 기준선으로 많이 본다.
  /** @type {Record<string, number>} */
  const tether = {};
  for (const krwExchange of ['upbit', 'bithumb']) {
    const price = allTickers[krwExchange]?.['KRW-USDT']?.currentPrice;
    if (price) tether[krwExchange] = (price / usdRate - 1) * 100;
  }
  return { rate: usdRate, items, tether };
}
