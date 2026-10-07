// @ts-check
// 보유 자산 일별 기록(순수 함수). 팝업(lib/portfolioCalc.ts)과 같은 형식 { d: 'YYYY-MM-DD'(한국 시각), v: USD 평가금액, c: USD 원금 }.

export const HISTORY_MAX_DAYS = 400;

/** @param {number} time */
export const kstDate = time => new Date(time + 9 * 3_600_000).toISOString().slice(0, 10);

/**
 * @param {{ d: string, v: number, c: number }[]} history
 * @param {{ d: string, v: number, c: number }} snapshot
 */
export const upsertSnapshot = (history, snapshot) =>
  [...history.filter(item => item.d !== snapshot.d), snapshot].sort((a, b) => a.d.localeCompare(b.d)).slice(-HISTORY_MAX_DAYS);

/** @param {string} market */
const quoteOf = market => (market.startsWith('KRW-') ? 'KRW' : market.endsWith('INR') ? 'INR' : 'USD');

/**
 * 보유 자산의 USD 평가금액·원금. 가격이나 환율이 하나라도 없으면 null(빈 값으로 기록을 망치지 않는다).
 * @param {{ exchange: string, market: string, quantity: number, avgPrice: number }[]} holdings
 * @param {(exchange: string, market: string) => number | undefined} priceOf
 * @param {{ KRW?: number | null, INR?: number | null }} perUsd 1 USD당 원화·루피
 */
export function portfolioValueUsd(holdings, priceOf, perUsd) {
  if (!holdings.length) return null;
  let v = 0;
  let c = 0;
  for (const holding of holdings) {
    const price = priceOf(holding.exchange, holding.market);
    const quote = quoteOf(holding.market);
    const rate = quote === 'USD' ? 1 : perUsd[quote];
    if (!(price && price > 0) || !(rate && rate > 0)) return null;
    v += (price * holding.quantity) / rate;
    c += (holding.avgPrice * holding.quantity) / rate;
  }
  return { v, c };
}
