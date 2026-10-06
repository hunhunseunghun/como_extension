import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  averageAfterBuy,
  breakEvenPrice,
  estimateCryptoTax,
  netProfit,
  quantityForTargetAverage,
} from './portfolioCalc.ts';

test('물타기 뒤 평균 단가', () => {
  assert.deepEqual(averageAfterBuy(10, 100, 50, 10), { quantity: 20, avgPrice: 75 });
  assert.equal(averageAfterBuy(0, 0, 0, 1), null);
});

test('목표 평단에 필요한 추가 매수 수량', () => {
  // 10개 @100, 50원에 사서 평단 75 → 10개
  assert.equal(quantityForTargetAverage(10, 100, 50, 75), 10);
  // 목표가 매수가보다 낮으면 불가능
  assert.equal(quantityForTargetAverage(10, 100, 50, 40), null);
  // 불타기(평단 올리기)도 계산한다
  assert.equal(quantityForTargetAverage(10, 50, 100, 75), 10);
});

test('수수료를 반영한 손익분기 매도가와 순손익', () => {
  assert.ok(Math.abs(breakEvenPrice(100, 0.0005)! - 100.10005) < 1e-6);
  assert.equal(breakEvenPrice(100, 1), null);
  assert.ok(Math.abs(netProfit(1, 100, breakEvenPrice(100, 0.0005)!, 0.0005)) < 1e-9);
});

test('2027 과세: 의제취득가와 250만 원 공제, 22%', () => {
  // 평단 1,000만, 12/31 시가 2,000만, 현재 3,000만, 1개 → 이익 1,000만(의제취득가 기준), 공제 후 750만, 세금 165만
  const result = estimateCryptoTax([{ quantity: 1, avgPrice: 10_000_000, price: 30_000_000, baselinePrice: 20_000_000 }]);
  assert.equal(result.gain, 10_000_000);
  assert.equal(result.shielded, 10_000_000);
  assert.equal(result.taxable, 7_500_000);
  assert.equal(result.tax, 1_650_000);
  // 12/31 시가가 평단보다 낮으면 실제 취득가를 쓴다. 손실과 이익은 합산한다.
  const mixed = estimateCryptoTax([
    { quantity: 1, avgPrice: 5_000_000, price: 9_000_000, baselinePrice: 4_000_000 },
    { quantity: 2, avgPrice: 1_000_000, price: 500_000, baselinePrice: null },
  ]);
  assert.equal(mixed.gain, 3_000_000);
  assert.equal(mixed.taxable, 500_000);
  assert.equal(mixed.tax, 110_000);
  assert.equal(estimateCryptoTax([]).tax, 0);
});
