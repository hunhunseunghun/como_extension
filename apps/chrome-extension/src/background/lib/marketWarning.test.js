import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffMarketEvents, summarizeMarketEvents } from './marketWarning.js';

const caution = (overrides = {}) => ({
  PRICE_FLUCTUATIONS: false,
  TRADING_VOLUME_SOARING: false,
  DEPOSIT_AMOUNT_SOARING: false,
  GLOBAL_PRICE_DIFFERENCES: false,
  CONCENTRATION_OF_SMALL_ACCOUNTS: false,
  ...overrides,
});

test('원화 마켓의 유의 지정과 주의 사유만 남긴다', () => {
  const summary = summarizeMarketEvents([
    { market: 'KRW-CARV', market_event: { warning: false, caution: caution({ TRADING_VOLUME_SOARING: true, DEPOSIT_AMOUNT_SOARING: true }) } },
    { market: 'KRW-BLAST', market_event: { warning: true, caution: caution({ GLOBAL_PRICE_DIFFERENCES: true }) } },
    { market: 'KRW-BTC', market_event: { warning: false, caution: caution() } },
    { market: 'BTC-XYZ', market_event: { warning: true, caution: caution() } },
  ]);
  assert.deepEqual(summary, {
    'KRW-CARV': ['TRADING_VOLUME_SOARING', 'DEPOSIT_AMOUNT_SOARING'],
    'KRW-BLAST': ['WARNING', 'GLOBAL_PRICE_DIFFERENCES'],
  });
  assert.deepEqual(summarizeMarketEvents(null), {});
});

test('새로 붙은 경보만 고르고, 처음에는 알리지 않는다', () => {
  const previous = { 'KRW-CARV': ['TRADING_VOLUME_SOARING'] };
  const current = {
    'KRW-CARV': ['TRADING_VOLUME_SOARING', 'DEPOSIT_AMOUNT_SOARING'],
    'KRW-EUL': ['PRICE_FLUCTUATIONS'],
  };
  assert.deepEqual(diffMarketEvents(previous, current), [
    { market: 'KRW-CARV', added: ['DEPOSIT_AMOUNT_SOARING'] },
    { market: 'KRW-EUL', added: ['PRICE_FLUCTUATIONS'] },
  ]);
  assert.deepEqual(diffMarketEvents(previous, current, market => market === 'KRW-EUL'), [
    { market: 'KRW-EUL', added: ['PRICE_FLUCTUATIONS'] },
  ]);
  assert.deepEqual(diffMarketEvents(undefined, current), []);
  // 풀린 경보는 알리지 않는다.
  assert.deepEqual(diffMarketEvents(current, previous), []);
});
