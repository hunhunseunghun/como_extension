// @ts-check
// 미결제약정(OI)과 알트코인 시즌 지수(순수 함수).

/**
 * 바이낸스 openInterestHist(오래된 것부터) → 현재 OI와 처음 대비 변화율.
 * 변화율은 계약 수량(sumOpenInterest)으로 구한다. 달러 가치는 가격만 움직여도 바뀐다.
 * @param {unknown} list
 */
export function openInterestChange(list) {
  if (!Array.isArray(list) || list.length < 2) return null;
  const first = Number(list[0]?.sumOpenInterest);
  const last = Number(list[list.length - 1]?.sumOpenInterest);
  const usd = Number(list[list.length - 1]?.sumOpenInterestValue);
  if (!(first > 0) || !(last > 0)) return null;
  return { usd: Number.isFinite(usd) ? usd : null, change: ((last - first) / first) * 100 };
}

// 시즌 지수에서 뺄 코인: 스테이블코인, 다른 코인을 감싼 토큰, 거래소 토큰처럼 가격이 다른 자산에 묶인 것
const STABLE_SYMBOLS = new Set([
  'USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDE', 'PYUSD', 'USDS', 'USD1', 'BUSD', 'USDD', 'FRAX', 'RLUSD', 'USDG', 'USDF', 'USDX', 'GHO', 'EURC', 'XAUT', 'PAXG', 'BUIDL', 'USYC', 'USTB', 'SUSDE', 'SUSDS',
]);
const DERIVED_NAME = /wrapped|staked|bridged|restaked|liquid staking|tokenized/i;

/**
 * CoinGecko /coins/markets(시가총액 순) → 시즌 지수 후보(BTC 제외, 스테이블·래핑 토큰 제외) 기호.
 * @param {unknown} markets
 * @param {number} limit
 */
export function altseasonCandidates(markets, limit = 50) {
  if (!Array.isArray(markets)) return [];
  /** @type {string[]} */
  const symbols = [];
  for (const coin of markets) {
    const symbol = String(coin?.symbol ?? '').toUpperCase();
    if (!symbol || symbol === 'BTC' || STABLE_SYMBOLS.has(symbol)) continue;
    if (DERIVED_NAME.test(`${coin?.name ?? ''} ${coin?.id ?? ''}`)) continue;
    // 1달러 근처에 붙은 이름 모를 스테이블코인
    if (Math.abs(Number(coin?.current_price) - 1) < 0.02) continue;
    if (!symbols.includes(symbol)) symbols.push(symbol);
    if (symbols.length >= limit) break;
  }
  return symbols;
}

/**
 * 알트코인 시즌 지수: 후보 중 같은 기간 BTC보다 많이 오른 코인의 비율(0~100).
 * 75 이상이면 알트코인 시즌, 25 이하면 비트코인 시즌으로 본다.
 * @param {number} btcReturn
 * @param {number[]} altReturns
 */
export function altseasonIndex(btcReturn, altReturns) {
  const valid = altReturns.filter(Number.isFinite);
  if (!Number.isFinite(btcReturn) || valid.length < 10) return null;
  const beating = valid.filter(value => value > btcReturn).length;
  return Math.round((beating / valid.length) * 100);
}

/**
 * 바이낸스 일봉(klines) → 처음 종가 대비 마지막 종가 수익률(%).
 * @param {unknown} klines
 */
export function klineReturn(klines) {
  if (!Array.isArray(klines) || klines.length < 2) return NaN;
  const first = Number(klines[0]?.[4]);
  const last = Number(klines[klines.length - 1]?.[4]);
  return first > 0 && last > 0 ? ((last - first) / first) * 100 : NaN;
}
