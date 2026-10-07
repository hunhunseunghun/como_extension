// @ts-check
// 보유 자산 일별 기록(순수 함수). 팝업(lib/portfolioCalc.ts)과 같은 형식
// { d: 'YYYY-MM-DD'(한국 시각), v: 통화별 평가금액, c: 통화별 원금 }. 환율로 바꾸지 않고 원래 통화로 남긴다.

export const HISTORY_MAX_DAYS = 400;

/** @param {number} time */
export const kstDate = time => new Date(time + 9 * 3_600_000).toISOString().slice(0, 10);

/**
 * @param {{ d: string }[]} history
 * @param {{ d: string }} snapshot
 */
export const upsertSnapshot = (history, snapshot) =>
  [...history.filter(item => item.d !== snapshot.d), snapshot].sort((a, b) => a.d.localeCompare(b.d)).slice(-HISTORY_MAX_DAYS);

/** @param {string} market */
const quoteOf = market => (market.startsWith('KRW-') ? 'KRW' : market.endsWith('INR') ? 'INR' : 'USD');

/**
 * 보유 자산의 통화별 평가금액·원금. 가격이 하나라도 없으면 null(빈 값으로 기록을 망치지 않는다).
 * @param {{ exchange: string, market: string, quantity: number, avgPrice: number }[]} holdings
 * @param {(exchange: string, market: string) => number | undefined} priceOf
 */
export function portfolioAmounts(holdings, priceOf) {
  if (!holdings.length) return null;
  /** @type {Record<string, number>} */
  const v = {};
  /** @type {Record<string, number>} */
  const c = {};
  for (const holding of holdings) {
    const price = priceOf(holding.exchange, holding.market);
    if (!(price && price > 0)) return null;
    const quote = quoteOf(holding.market);
    v[quote] = (v[quote] ?? 0) + price * holding.quantity;
    c[quote] = (c[quote] ?? 0) + holding.avgPrice * holding.quantity;
  }
  return { v, c };
}
