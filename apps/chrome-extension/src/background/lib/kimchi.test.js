import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeKimchiPremium } from './kimchi.js';

const tickers = {
  upbit: { 'KRW-BTC': { currentPrice: 141_000_000 }, 'KRW-USDT': { currentPrice: 1_414 }, 'KRW-NOPE': { currentPrice: 1 } },
  bithumb: { 'KRW-BTC': { currentPrice: 139_600_000 } },
  coinone: { 'KRW-BTC': { currentPrice: 140_000_000 } },
  binance: { BTCUSDT: { currentPrice: 100_000 } },
};

test('김프는 원화 가격 ÷ (바이낸스 USDT 가격 × 환율) - 1 이다', () => {
  const { items, rate } = computeKimchiPremium(tickers, 1_400);
  assert.equal(rate, 1_400);
  assert.ok(Math.abs(items['upbit:KRW-BTC'].premium - 0.714) < 0.001);
  assert.ok(Math.abs(items['bithumb:KRW-BTC'].premium - -0.286) < 0.001);
  // 코인원·디지털엑스도 같은 방식으로 계산한다.
  assert.ok(Math.abs(items['coinone:KRW-BTC'].premium) < 0.001);
  // 바이낸스에 없는 코인과 스테이블코인은 빠진다.
  assert.equal(items['upbit:KRW-NOPE'], undefined);
  assert.equal(items['upbit:KRW-USDT'], undefined);
});

test('테더 프리미엄은 원화 USDT 가격 ÷ 환율 - 1 이다', () => {
  const { tether } = computeKimchiPremium(tickers, 1_400);
  assert.ok(Math.abs(tether.upbit - 1) < 0.001);
  assert.equal(tether.bithumb, undefined);
});

test('같은 기호의 다른 코인(±50% 초과)과 바이낸스 거래가 거의 없는 코인은 뺀다', () => {
  const { items } = computeKimchiPremium(
    {
      upbit: { 'KRW-DATA': { currentPrice: 281 }, 'KRW-DEAD': { currentPrice: 1_400 }, 'KRW-OK': { currentPrice: 1_420 } },
      binance: {
        DATAUSDT: { currentPrice: 0.0012, volume: 5_000_000 },
        DEADUSDT: { currentPrice: 1, volume: 20_000 },
        OKUSDT: { currentPrice: 1, volume: 5_000_000 },
      },
    },
    1_400,
  );
  assert.equal(items['upbit:KRW-DATA'], undefined);
  assert.equal(items['upbit:KRW-DEAD'], undefined);
  assert.ok(Math.abs(items['upbit:KRW-OK'].premium - 1.4286) < 0.001);
});

test('환율이 없으면 계산하지 않는다', () => {
  assert.deepEqual(computeKimchiPremium(tickers, null), { rate: null, items: {} });
});
