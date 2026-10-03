import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBadgePrice, formatPercent, shiftDate } from './format.js';

test('배지 가격은 4글자 안팎으로 줄인다', () => {
  assert.equal(formatBadgePrice(113_900_000), '114M');
  assert.equal(formatBadgePrice(1_500_000_000), '1.5B');
  assert.equal(formatBadgePrice(84_653), '85K');
  assert.equal(formatBadgePrice(3_641), '3.6K');
  assert.equal(formatBadgePrice(457), '457');
  assert.equal(formatBadgePrice(18.74), '18.7');
  assert.equal(formatBadgePrice(1.5), '1.50');
  assert.equal(formatBadgePrice(0.0123), '.012');
  assert.equal(formatBadgePrice(0.00000512), '5e-6');
});

test('등락률은 부호를 붙인다', () => {
  assert.equal(formatPercent(1.234), '+1.23%');
  assert.equal(formatPercent(-0.5), '-0.50%');
  assert.equal(formatPercent(0), '+0.00%');
});

test('이전 날짜는 날짜 문자열 기준으로 계산한다(월·해 넘김)', () => {
  assert.equal(shiftDate('20261003', 1), '20261002');
  assert.equal(shiftDate('20261001', 1), '20260930');
  assert.equal(shiftDate('20260101', 1), '20251231');
  assert.equal(shiftDate('20240301', 1), '20240229');
});
