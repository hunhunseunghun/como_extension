// 차트 보조지표와 급등락 봉 고르기(순수 함수). node --experimental-strip-types로 단위 테스트한다.

export type Candle = { time: number; open: number; high: number; low: number; close: number };
export type Point = { time: number; value: number };

// 단순 이동평균. 앞의 period-1개 봉은 값이 없다.
export const sma = (candles: Candle[], period: number): Point[] => {
  const out: Point[] = [];
  let sum = 0;
  candles.forEach((candle, index) => {
    sum += candle.close;
    if (index >= period) sum -= candles[index - period].close;
    if (index >= period - 1) out.push({ time: candle.time, value: sum / period });
  });
  return out;
};

// 볼린저밴드: 이동평균 ± k × 표준편차(모집단)
export const bollinger = (candles: Candle[], period = 20, k = 2) => {
  const upper: Point[] = [];
  const lower: Point[] = [];
  for (let index = period - 1; index < candles.length; index++) {
    const window = candles.slice(index - period + 1, index + 1).map(candle => candle.close);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const deviation = Math.sqrt(window.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    upper.push({ time: candles[index].time, value: mean + k * deviation });
    lower.push({ time: candles[index].time, value: mean - k * deviation });
  }
  return { upper, lower };
};

// RSI(와일더 평활). 앞의 period개 봉은 값이 없다.
export const rsi = (candles: Candle[], period = 14): Point[] => {
  if (candles.length <= period) return [];
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index++) {
    const change = candles[index].close - candles[index - 1].close;
    if (change > 0) gain += change;
    else loss -= change;
  }
  gain /= period;
  loss /= period;
  const value = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  const out: Point[] = [{ time: candles[period].time, value: value() }];
  for (let index = period + 1; index < candles.length; index++) {
    const change = candles[index].close - candles[index - 1].close;
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
    out.push({ time: candles[index].time, value: value() });
  }
  return out;
};

export type BigMove = { time: number; change: number };

// 급등락 봉: 시가 대비 종가 변동률이 평소(표준편차)의 2.5배를 넘고 minPercent 이상인 봉 중 큰 것부터 limit개.
export const bigMoves = (candles: Candle[], limit = 3, minPercent = 1): BigMove[] => {
  if (candles.length < 10) return [];
  const changes = candles.map(candle => ({ time: candle.time, change: ((candle.close - candle.open) / candle.open) * 100 }));
  const mean = changes.reduce((a, b) => a + b.change, 0) / changes.length;
  const deviation = Math.sqrt(changes.reduce((a, b) => a + (b.change - mean) ** 2, 0) / changes.length);
  const threshold = Math.max(minPercent, 2.5 * deviation);
  return changes
    .filter(item => Number.isFinite(item.change) && Math.abs(item.change) >= threshold)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, limit)
    .sort((a, b) => a.time - b.time);
};

// 차트 기간(봉 하나)의 길이(초)
export const timeframeSeconds = (timeframe: string) => {
  const match = /^(\d+)m$/.exec(timeframe);
  if (match) return Number(match[1]) * 60;
  if (timeframe === '1d') return 86_400;
  if (timeframe === '1w') return 7 * 86_400;
  if (timeframe === '1M') return 30 * 86_400;
  return 3600;
};

export type NewsItem = { title: string; link: string; time: number };

// 급등락 봉 시각 근처의 뉴스: 봉 시작 1개 봉 전 ~ 2개 봉 뒤. 코인 이름(기호·한글·영문)이 들어간 기사만 고른다.
// marketWide(비트코인)일 때만 이름이 없는 시장 기사도 보여 준다. 다른 코인에 상관없는 기사를 붙이면 원인처럼 읽힌다.
// 'ETH'가 'ETHENA'에 걸리지 않도록 영문 기호·이름은 단어 경계로 찾는다.
export const newsNear = (news: NewsItem[], move: BigMove, intervalSeconds: number, keywords: string[], marketWide = false) => {
  const from = (move.time - intervalSeconds) * 1000;
  const to = (move.time + 2 * intervalSeconds) * 1000;
  const inWindow = news.filter(item => item.time >= from && item.time <= to);
  const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = keywords
    .filter(word => word && word.length >= 2)
    .map(word => (/^[ -~]+$/.test(word) ? new RegExp(`(^|[^a-z0-9])${escape(word.toLowerCase())}($|[^a-z0-9])`) : new RegExp(escape(word.toLowerCase()))));
  const matched = inWindow.filter(item => patterns.some(pattern => pattern.test(item.title.toLowerCase())));
  return (matched.length || !marketWide ? matched : inWindow).sort((a, b) => b.time - a.time);
};
