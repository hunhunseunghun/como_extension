import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePriceAlert } from './priceAlert.js';

const run = (lastPrice, currentPrice, { alertPrice = 100, deadband = 0, triggered = false } = {}) =>
  evaluatePriceAlert({ lastPrice, currentPrice, alertPrice, deadband, triggered });

test('위로 지나면 상향, 아래로 지나면 하향으로 알린다', () => {
  assert.deepEqual(run(99, 101), { notify: true, crossedUp: true, triggered: false });
  assert.deepEqual(run(101, 99), { notify: true, crossedUp: false, triggered: false });
});

test('올라오다 목표가에 딱 닿아도 상향이다(하향으로 잘못 표시되던 문제)', () => {
  assert.equal(run(99, 100).crossedUp, true);
  assert.equal(run(99, 100).notify, true);
});

test('목표가를 지나지 않으면 알리지 않는다', () => {
  assert.equal(run(90, 95).notify, false);
  assert.equal(run(105, 101).notify, false);
});

test('재알림 범위가 있으면 한 번 알린 뒤 범위를 벗어나야 다시 알린다', () => {
  const first = run(99, 101, { deadband: 0.05 });
  assert.deepEqual(first, { notify: true, crossedUp: true, triggered: true });
  // 범위(95~105) 안에서 다시 지나도 조용하다.
  assert.equal(run(101, 99, { deadband: 0.05, triggered: true }).notify, false);
  assert.equal(run(101, 99, { deadband: 0.05, triggered: true }).triggered, true);
  // 범위 밖으로 나가면 다시 무장한다.
  assert.equal(run(99, 94, { deadband: 0.05, triggered: true }).triggered, false);
});
