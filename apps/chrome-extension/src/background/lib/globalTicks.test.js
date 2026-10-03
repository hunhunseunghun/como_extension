import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toGlobalSnapshot, toGlobalTick } from './globalTicks.js';

const fields = { last: '110', open: '100', high: '120', low: '90', quoteVolume: '5000' };

test('스냅샷은 바이낸스 24hrTicker 형태로 맞춘다', () => {
  const snapshot = toGlobalSnapshot('BTCUSDT', fields);
  assert.equal(snapshot.lastPrice, '110');
  assert.equal(snapshot.priceChange, '10.00000000');
  assert.equal(snapshot.priceChangePercent, '10.000');
});

test('틱의 b는 직전 가격보다 오르거나 같으면 현재가, 내리면 0이다', () => {
  assert.equal(toGlobalTick('BTCUSDT', fields, { c: '105' }).b, '110');
  assert.equal(toGlobalTick('BTCUSDT', fields, { c: '115' }).b, '0');
  // 직전 가격이 없으면 방향을 알 수 없어 0이다.
  assert.equal(toGlobalTick('BTCUSDT', fields).b, '0');
});

test('시가가 0이면 등락률은 0이다', () => {
  assert.equal(toGlobalTick('X', { ...fields, open: '0' }).P, '0');
});
