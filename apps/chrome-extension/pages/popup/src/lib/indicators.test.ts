import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bigMoves, bollinger, newsNear, rsi, sma, timeframeSeconds, type Candle } from './indicators.ts';

const candles = (closes: number[], opens?: number[]): Candle[] =>
  closes.map((close, i) => ({ time: i * 60, open: opens?.[i] ?? close, high: close, low: close, close }));

test('이동평균은 기간이 찬 봉부터 나온다', () => {
  assert.deepEqual(sma(candles([1, 2, 3, 4, 5]), 3), [
    { time: 120, value: 2 },
    { time: 180, value: 3 },
    { time: 240, value: 4 },
  ]);
  assert.deepEqual(sma(candles([1, 2]), 3), []);
});

test('볼린저밴드는 평균 ± 2 표준편차', () => {
  const { upper, lower } = bollinger(candles([2, 4, 4, 4, 5, 5, 7, 9]), 8, 2);
  // 평균 5, 표준편차 2
  assert.deepEqual(upper, [{ time: 420, value: 9 }]);
  assert.deepEqual(lower, [{ time: 420, value: 1 }]);
});

test('RSI: 계속 오르면 100, 계속 내리면 0, 같은 폭으로 오르내리면 50 근처', () => {
  assert.equal(rsi(candles([1, 2, 3, 4, 5, 6]), 3).at(-1)!.value, 100);
  assert.equal(rsi(candles([6, 5, 4, 3, 2, 1]), 3).at(-1)!.value, 0);
  const zigzag = rsi(candles([10, 11, 10, 11, 10, 11, 10, 11, 10, 11]), 4).at(-1)!.value;
  assert.ok(zigzag > 40 && zigzag < 70);
  assert.deepEqual(rsi(candles([1, 2]), 3), []);
});

test('급등락 봉은 평소보다 크게 움직인 봉만 시간순으로 고른다', () => {
  const opens = Array.from({ length: 20 }, () => 100);
  const closes = opens.map((_, i) => (i === 5 ? 110 : i === 12 ? 92 : 100.1));
  const moves = bigMoves(candles(closes, opens));
  assert.deepEqual(
    moves.map(move => [move.time, Math.round(move.change)]),
    [
      [300, 10],
      [720, -8],
    ],
  );
  // 다 비슷하게 움직이면 없다.
  assert.deepEqual(bigMoves(candles(opens.map(() => 100.5), opens)), []);
});

test('봉 길이와 근처 뉴스: 코인 이름이 들어간 기사를 먼저', () => {
  assert.equal(timeframeSeconds('15m'), 900);
  assert.equal(timeframeSeconds('1d'), 86_400);
  const news = [
    { title: 'Bitcoin jumps', link: 'a', time: 1_000_000 },
    { title: 'Fed speech', link: 'b', time: 1_030_000 },
    { title: 'Old news', link: 'c', time: 100 },
  ];
  const near = newsNear(news, { time: 1000, change: 3 }, 60, ['BTC', 'bitcoin']);
  assert.deepEqual(near.map(item => item.link), ['a']);
  // 코인 이름이 없으면 그 시간대 기사 전체
  assert.deepEqual(newsNear(news, { time: 1000, change: 3 }, 60, ['XRP']).map(item => item.link), ['b', 'a']);
});
