// @ts-check
// 업비트 시장경보(순수 함수): market/all?isDetails=true의 주의 사유·유의 지정을 정리하고 새로 붙은 것을 고른다.

// 업비트가 정한 주의 사유 5가지
export const CAUTION_REASONS = [
  'PRICE_FLUCTUATIONS',
  'TRADING_VOLUME_SOARING',
  'DEPOSIT_AMOUNT_SOARING',
  'GLOBAL_PRICE_DIFFERENCES',
  'CONCENTRATION_OF_SMALL_ACCOUNTS',
];

/**
 * 원화 마켓만 → { 'KRW-XXX': ['WARNING'?, ...주의 사유] }. 아무것도 없으면 빠진다.
 * @param {unknown} markets
 */
export function summarizeMarketEvents(markets) {
  /** @type {Record<string, string[]>} */
  const result = {};
  if (!Array.isArray(markets)) return result;
  for (const item of markets) {
    if (!item?.market?.startsWith('KRW-')) continue;
    const caution = item.market_event?.caution ?? {};
    const flags = CAUTION_REASONS.filter(reason => caution[reason] === true);
    if (item.market_event?.warning === true) flags.unshift('WARNING');
    if (flags.length) result[item.market] = flags;
  }
  return result;
}

/**
 * 지난번보다 새로 붙은 경보. 처음(previous 없음)에는 기준만 잡는다.
 * @param {Record<string, string[]> | null | undefined} previous
 * @param {Record<string, string[]>} current
 * @param {(market: string) => boolean} [include] 알릴 마켓(즐겨찾기·보유 코인만 등)
 */
export function diffMarketEvents(previous, current, include = () => true) {
  if (!previous) return [];
  return Object.entries(current)
    .filter(([market]) => include(market))
    .map(([market, flags]) => ({ market, added: flags.filter(flag => !(previous[market] ?? []).includes(flag)) }))
    .filter(item => item.added.length);
}
