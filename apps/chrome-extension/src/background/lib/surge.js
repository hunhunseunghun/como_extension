// @ts-check
// 단기 급등락(1·5·15분): 최근 가격 표본에서 창 안의 최저·최고가와 현재가를 비교한다(순수 함수).
// 창 시작가 대신 최저·최고가를 쓰면 창 중간에 시작한 급등도 놓치지 않는다.

/** @typedef {{ t: number, p: number }} Sample */

// 가장 긴 창(15분)보다 조금 더 보관한다.
export const SAMPLE_KEEP_MS = 16 * 60_000;

/**
 * 표본을 더하고 오래된 것을 지운다. 같은 배열을 고쳐 돌려준다.
 * @param {Sample[]} samples
 * @param {number} now
 * @param {number} price
 */
export function addSample(samples, now, price) {
  if (!(price > 0)) return samples;
  samples.push({ t: now, p: price });
  const cutoff = now - SAMPLE_KEEP_MS;
  while (samples.length && samples[0].t < cutoff) samples.shift();
  return samples;
}

/**
 * 창 안에서 최저가 대비 상승률과 최고가 대비 하락률(%). 표본이 둘 미만이면 null.
 * @param {Sample[]} samples
 * @param {number} now
 * @param {number} windowMs
 */
export function surgeMove(samples, now, windowMs) {
  const recent = samples.filter(sample => sample.t >= now - windowMs);
  if (recent.length < 2) return null;
  const current = recent[recent.length - 1].p;
  let low = Infinity;
  let high = -Infinity;
  for (const { p } of recent) {
    if (p < low) low = p;
    if (p > high) high = p;
  }
  return { up: ((current - low) / low) * 100, down: ((current - high) / high) * 100 };
}

/**
 * 규칙이 지금 울려야 하면 그 변동률(%)을, 아니면 null을 돌려준다.
 * 한 번 울리면 창 길이만큼 쉰다(같은 급등을 10초마다 알리지 않도록).
 * @param {{ window: number, threshold: number, direction?: 'up' | 'down' | 'both' }} rule window: 분
 * @param {Sample[]} samples
 * @param {number} now
 * @param {number | undefined} firedAt 마지막으로 울린 시각
 */
export function evaluateSurge(rule, samples, now, firedAt) {
  const windowMs = rule.window * 60_000;
  if (firedAt && now - firedAt < windowMs) return null;
  const move = surgeMove(samples, now, windowMs);
  if (!move) return null;
  const direction = rule.direction ?? 'both';
  if (direction !== 'down' && move.up >= rule.threshold) return move.up;
  if (direction !== 'up' && -move.down >= rule.threshold) return move.down;
  return null;
}
