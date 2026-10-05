// @ts-check
// 김치 프리미엄 계산(순수 함수): KRW 마켓 가격 vs (바이낸스 USDT 가격 × USD/KRW 환율). USDT≈USD로 본다.

/** @typedef {Record<string, Record<string, { currentPrice?: number, volume?: number }>>} AllTickers */

// 같은 기호의 다른 코인이거나 바이낸스에서 사실상 거래가 끊긴 코인은 김프가 수백~수만 %로 나와 뺀다.
// 실제 김프가 ±50%를 넘는 일은 드물고, 바이낸스 24시간 거래대금이 10만 달러 미만이면 가격이 멈춰 있기 쉽다.
export const MAX_KIMCHI_PREMIUM = 50;
export const MIN_BINANCE_VOLUME_USD = 100_000;

// 원화 마켓이 있는 거래소
export const KRW_EXCHANGES = ['upbit', 'bithumb', 'coinone', 'digitalx'];

/**
 * @param {AllTickers} allTickers 거래소 → 마켓 → 시세
 * @param {number | null} usdRate USD/KRW 환율
 */
export function computeKimchiPremium(allTickers, usdRate) {
  if (!usdRate) return { rate: usdRate, items: {} };

  /** @type {Record<string, { exchange: string, market: string, coin: string, premium: number, krwPrice: number, usdtPrice: number }>} */
  const items = {};
  for (const krwExchange of KRW_EXCHANGES) {
    const krwTickers = allTickers[krwExchange];
    if (!krwTickers) continue;
    for (const market in krwTickers) {
      if (!market.startsWith('KRW-')) continue;
      const coin = market.slice(4);
      if (coin === 'USDT' || coin === 'USDC') continue;
      const krwPrice = krwTickers[market]?.currentPrice;
      const binance = allTickers.binance?.[`${coin}USDT`];
      const usdtPrice = binance?.currentPrice;
      if (!krwPrice || !usdtPrice) continue;
      if (binance.volume !== undefined && binance.volume < MIN_BINANCE_VOLUME_USD) continue;
      const premium = (krwPrice / (usdtPrice * usdRate) - 1) * 100;
      if (Math.abs(premium) > MAX_KIMCHI_PREMIUM) continue;
      items[`${krwExchange}:${market}`] = {
        exchange: krwExchange,
        market,
        coin,
        premium,
        krwPrice,
        usdtPrice,
      };
    }
  }
  // 테더 프리미엄: 원화로 산 USDT가 실제 달러 환율보다 얼마나 비싼지. 김프의 기준선으로 많이 본다.
  /** @type {Record<string, number>} */
  const tether = {};
  for (const krwExchange of KRW_EXCHANGES) {
    const price = allTickers[krwExchange]?.['KRW-USDT']?.currentPrice;
    if (price) tether[krwExchange] = (price / usdRate - 1) * 100;
  }
  return { rate: usdRate, items, tether };
}
