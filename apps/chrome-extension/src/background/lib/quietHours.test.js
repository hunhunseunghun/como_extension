import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInQuietHours } from './quietHours.js';

const at = (h, m = 0) => new Date(2026, 9, 6, h, m);

test('자정을 넘기는 시간대(23:00~07:00)', () => {
  const setting = { enabled: true, start: '23:00', end: '07:00' };
  assert.equal(isInQuietHours(setting, at(23)), true);
  assert.equal(isInQuietHours(setting, at(3, 30)), true);
  assert.equal(isInQuietHours(setting, at(6, 59)), true);
  assert.equal(isInQuietHours(setting, at(7)), false);
  assert.equal(isInQuietHours(setting, at(22, 59)), false);
});

test('같은 날 안의 시간대(09:00~18:00)', () => {
  const setting = { enabled: true, start: '09:00', end: '18:00' };
  assert.equal(isInQuietHours(setting, at(9)), true);
  assert.equal(isInQuietHours(setting, at(18)), false);
  assert.equal(isInQuietHours(setting, at(8, 59)), false);
});

test('꺼져 있거나 값이 잘못됐으면 방해 금지가 아니다', () => {
  assert.equal(isInQuietHours({ enabled: false, start: '00:00', end: '23:59' }, at(12)), false);
  assert.equal(isInQuietHours({ enabled: true, start: '25:00', end: '07:00' }, at(1)), false);
  assert.equal(isInQuietHours({ enabled: true, start: '07:00', end: '07:00' }, at(7)), false);
  assert.equal(isInQuietHours(null, at(1)), false);
});
