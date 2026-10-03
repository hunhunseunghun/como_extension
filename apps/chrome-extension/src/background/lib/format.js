// @ts-check
// 백그라운드 표시용 포맷(순수 함수)

/**
 * 툴바 배지는 4글자 안팎만 보이므로 가격을 짧게 줄인다. 예: 113,900,000 → 114M, 0.0123 → .012
 * @param {number} price
 */
export function formatBadgePrice(price) {
  for (const [unit, size] of /** @type {const} */ ([
    ['B', 1e9],
    ['M', 1e6],
    ['K', 1e3],
  ])) {
    if (price >= size) {
      const value = price / size;
      return `${value >= 10 ? Math.round(value) : value.toFixed(1)}${unit}`;
    }
  }
  if (price >= 100) return price.toFixed(0);
  if (price >= 10) return price.toFixed(1);
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.001) return price.toFixed(3).slice(1);
  return price.toExponential(0);
}

/** @param {number} value */
export const formatPercent = value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

/**
 * 'yyyymmdd'에서 days일 전 날짜를 같은 형식으로 돌려준다(KST 날짜 문자열 기준, 시간대 변환 없음).
 * @param {string} yyyymmdd
 * @param {number} days
 */
export function shiftDate(yyyymmdd, days) {
  const date = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8) - days));
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}
