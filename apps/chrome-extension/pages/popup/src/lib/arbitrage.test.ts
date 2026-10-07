import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arbitrage } from './arbitrage.ts';

const base = { amountKrw: 1_000_000, usdtKrw: 1_400, krwFee: 0, globalFee: 0, withdrawFee: 0 };

test('김프 5%면 수수료 없이 해외 → 국내로 5% 남는다', () => {
  const result = arbitrage({ ...base, direction: 'toKorea', krwPrice: 1_470, usdtPrice: 1 })!;
  assert.ok(Math.abs(result.premium - 5) < 1e-9);
  assert.ok(Math.abs(result.profitRate - 5) < 1e-9);
  // 같은 김프에서 반대로 보내면 손해
  assert.ok(arbitrage({ ...base, direction: 'toGlobal', krwPrice: 1_470, usdtPrice: 1 })!.profit < 0);
});

test('역프 -5%면 국내 → 해외가 남는다', () => {
  const result = arbitrage({ ...base, direction: 'toGlobal', krwPrice: 1_330, usdtPrice: 1 })!;
  assert.ok(Math.abs(result.premium - -5) < 1e-9);
  assert.ok(result.profitRate > 5);
});

test('수수료와 출금 수수료를 뺀다', () => {
  const noFee = arbitrage({ ...base, direction: 'toKorea', krwPrice: 1_470, usdtPrice: 1 })!;
  const withFee = arbitrage({ ...base, direction: 'toKorea', krwPrice: 1_470, usdtPrice: 1, krwFee: 0.0005, globalFee: 0.001, withdrawFee: 10 })!;
  assert.ok(withFee.profit < noFee.profit);
  // 테더를 살 때도 국내 수수료: 100만 × (1-0.0005) ÷ 1,400 → 코인 × (1-0.001) - 10개를 1,470 × (1-0.0005)에 판다
  const coins = ((1_000_000 * 0.9995) / 1_400) * 0.999 - 10;
  assert.ok(Math.abs(withFee.finalKrw - coins * 1_470 * 0.9995) < 1e-6);
  assert.equal(arbitrage({ ...base, direction: 'toKorea', krwPrice: 0, usdtPrice: 1 }), null);
});

test('역방향도 테더를 원화로 팔 때 국내 수수료를 뺀다', () => {
  const result = arbitrage({ ...base, direction: 'toGlobal', krwPrice: 1_400, usdtPrice: 1, krwFee: 0.001, globalFee: 0, withdrawFee: 0 })!;
  // 원화로 코인 살 때 0.1%, 테더를 원화로 팔 때 0.1% → 약 -0.2%
  assert.ok(Math.abs(result.profitRate - ((1 - 0.001) * (1 - 0.001) - 1) * 100) < 1e-9);
});
