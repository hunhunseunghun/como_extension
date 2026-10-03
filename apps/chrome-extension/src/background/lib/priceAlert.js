// @ts-check
// 지정가 알림 판정(순수 함수). 백그라운드가 틱마다 부르고, 단위 테스트로 규칙을 고정한다.

/**
 * 알림 가격 하나를 직전 가격 → 지금 가격 변화로 판정한다.
 * - 재알림 범위(deadband)가 0이면 목표가를 지날 때마다 알린다.
 * - 0보다 크면 한 번 알린 뒤(triggered) 목표가 ± 범위 밖으로 벗어나야 다시 알릴 수 있다.
 * @param {{ lastPrice: number, currentPrice: number, alertPrice: number, deadband: number, triggered: boolean }} input
 * @returns {{ notify: boolean, crossedUp: boolean, triggered: boolean }}
 */
export function evaluatePriceAlert({ lastPrice, currentPrice, alertPrice, deadband, triggered }) {
  const crossedUp = lastPrice < alertPrice && currentPrice >= alertPrice;
  const crossedDown = lastPrice > alertPrice && currentPrice <= alertPrice;
  const crossed = crossedUp || crossedDown;
  if (deadband === 0) return { notify: crossed, crossedUp, triggered };
  if (!triggered) return { notify: crossed, crossedUp, triggered: crossed };
  const band = alertPrice * deadband;
  const leftBand = currentPrice <= alertPrice - band || currentPrice >= alertPrice + band;
  return { notify: false, crossedUp, triggered: !leftBand };
}
