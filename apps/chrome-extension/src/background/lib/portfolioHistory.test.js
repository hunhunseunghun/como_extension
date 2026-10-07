import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kstDate, portfolioAmounts, upsertSnapshot } from './portfolioHistory.js';

test('보유 자산을 통화별 원래 금액으로 합친다(환율을 쓰지 않는다)', () => {
  const holdings = [
    { exchange: 'upbit', market: 'KRW-BTC', quantity: 0.01, avgPrice: 100_000_000 },
    { exchange: 'bithumb', market: 'KRW-ETH', quantity: 1, avgPrice: 3_000_000 },
    { exchange: 'binance', market: 'ETHUSDT', quantity: 1, avgPrice: 2_000 },
    { exchange: 'coindcx', market: 'BTCINR', quantity: 0.001, avgPrice: 7_000_000 },
  ];
  const prices = { 'upbit:KRW-BTC': 140_000_000, 'bithumb:KRW-ETH': 3_500_000, 'binance:ETHUSDT': 3_000, 'coindcx:BTCINR': 8_000_000 };
  assert.deepEqual(portfolioAmounts(holdings, (ex, market) => prices[`${ex}:${market}`]), {
    v: { KRW: 1_400_000 + 3_500_000, USD: 3_000, INR: 8_000 },
    c: { KRW: 1_000_000 + 3_000_000, USD: 2_000, INR: 7_000 },
  });
  // 가격이 하나라도 없으면 기록하지 않는다
  assert.equal(portfolioAmounts(holdings, () => undefined), null);
  assert.equal(portfolioAmounts([], () => 1), null);
});

test('하루 한 칸, 날짜순, 최대 400일', () => {
  assert.equal(kstDate(Date.parse('2026-10-06T15:00:00Z')), '2026-10-07');
  let history = [];
  for (let day = 0; day < 405; day++) history = upsertSnapshot(history, { d: kstDate(day * 86_400_000), v: { USD: day }, c: {} });
  assert.equal(history.length, 400);
  history = upsertSnapshot(history, { d: history.at(-1).d, v: { USD: -1 }, c: {} });
  assert.equal(history.length, 400);
  assert.deepEqual(history.at(-1).v, { USD: -1 });
});
