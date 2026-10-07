import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kstDate, portfolioValueUsd, upsertSnapshot } from './portfolioHistory.js';

test('원화·달러·루피 보유분을 USD로 합친다', () => {
  const holdings = [
    { exchange: 'upbit', market: 'KRW-BTC', quantity: 0.01, avgPrice: 100_000_000 },
    { exchange: 'binance', market: 'ETHUSDT', quantity: 1, avgPrice: 2_000 },
    { exchange: 'coindcx', market: 'BTCINR', quantity: 0.001, avgPrice: 7_000_000 },
  ];
  const prices = { 'upbit:KRW-BTC': 140_000_000, 'binance:ETHUSDT': 3_000, 'coindcx:BTCINR': 8_000_000 };
  const result = portfolioValueUsd(holdings, (ex, market) => prices[`${ex}:${market}`], { KRW: 1_400, INR: 80 });
  assert.ok(Math.abs(result.v - (1_000 + 3_000 + 100)) < 1e-9);
  assert.ok(Math.abs(result.c - (714.2857142857143 + 2_000 + 87.5)) < 1e-6);
  // 가격이나 환율이 하나라도 없으면 기록하지 않는다
  assert.equal(portfolioValueUsd(holdings, () => undefined, { KRW: 1_400, INR: 80 }), null);
  assert.equal(portfolioValueUsd(holdings, (ex, market) => prices[`${ex}:${market}`], { KRW: 1_400 }), null);
  assert.equal(portfolioValueUsd([], () => 1, {}), null);
});

test('하루 한 칸, 날짜순, 최대 400일', () => {
  assert.equal(kstDate(Date.parse('2026-10-06T15:00:00Z')), '2026-10-07');
  let history = [];
  for (let day = 0; day < 405; day++) history = upsertSnapshot(history, { d: kstDate(day * 86_400_000), v: day, c: 0 });
  assert.equal(history.length, 400);
  history = upsertSnapshot(history, { d: history.at(-1).d, v: -1, c: 0 });
  assert.equal(history.length, 400);
  assert.equal(history.at(-1).v, -1);
});
