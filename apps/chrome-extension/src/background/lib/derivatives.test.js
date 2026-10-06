import { test } from 'node:test';
import assert from 'node:assert/strict';
import { altseasonCandidates, altseasonIndex, klineReturn, openInterestChange } from './derivatives.js';

test('OI 변화율은 계약 수량으로 구하고, 현재 달러 가치를 함께 준다', () => {
  const change = openInterestChange([
    { sumOpenInterest: '100', sumOpenInterestValue: '8000000' },
    { sumOpenInterest: '103', sumOpenInterestValue: '8100000' },
    { sumOpenInterest: '105', sumOpenInterestValue: '8200000' },
  ]);
  assert.equal(change.usd, 8_200_000);
  assert.ok(Math.abs(change.change - 5) < 1e-9);
  assert.equal(openInterestChange([{ sumOpenInterest: '1' }]), null);
  assert.equal(openInterestChange({ code: -1 }), null);
});

test('시즌 지수 후보에서 BTC·스테이블코인·래핑 토큰을 뺀다', () => {
  const markets = [
    { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 85000 },
    { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 3000 },
    { id: 'tether', symbol: 'usdt', name: 'Tether', current_price: 1 },
    { id: 'lido-staked-ether', symbol: 'steth', name: 'Lido Staked Ether', current_price: 3000 },
    { id: 'wrapped-bitcoin', symbol: 'wbtc', name: 'Wrapped Bitcoin', current_price: 85000 },
    { id: 'some-dollar', symbol: 'sdx', name: 'Some Dollar', current_price: 1.001 },
    { id: 'solana', symbol: 'sol', name: 'Solana', current_price: 150 },
    { id: 'solana-dup', symbol: 'sol', name: 'Other Sol', current_price: 2 },
  ];
  assert.deepEqual(altseasonCandidates(markets), ['ETH', 'SOL']);
  assert.deepEqual(altseasonCandidates(markets, 1), ['ETH']);
});

test('지수는 BTC보다 많이 오른 비율이고, 후보가 10개 미만이면 내지 않는다', () => {
  const alts = [10, 20, 30, 40, 50, -5, -10, 0, 5, 15, NaN];
  assert.equal(altseasonIndex(12, alts), 50);
  assert.equal(altseasonIndex(12, alts.slice(0, 5)), null);
  assert.equal(altseasonIndex(NaN, alts), null);
});

test('일봉 수익률은 첫 종가 대비 마지막 종가', () => {
  assert.equal(klineReturn([[0, 0, 0, 0, '100'], [0, 0, 0, 0, '150']]), 50);
  assert.ok(Number.isNaN(klineReturn([])));
});
