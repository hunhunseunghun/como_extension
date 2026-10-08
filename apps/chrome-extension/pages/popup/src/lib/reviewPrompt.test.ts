import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, dismissReview, LATER_DAYS, MAX_DISMISSALS, recordOpen, shouldAskReview, type UsageStats } from './reviewPrompt.ts';

const now = Date.UTC(2026, 9, 8);

test('처음 연 사용자에게는 묻지 않는다', () => {
  const current = recordOpen(undefined, now);
  assert.equal(shouldAskReview(undefined, current, undefined, now), false);
});

test('지난번에 연 뒤로 알림을 받았으면 두 번째 열 때 묻는다', () => {
  const previous = recordOpen(undefined, now - DAY);
  const current = recordOpen(previous, now);
  assert.equal(shouldAskReview(previous, current, now - 3600_000, now), true);
});

test('알림이 지난번 열기보다 먼저였으면 그것만으로는 묻지 않는다', () => {
  const previous = recordOpen(undefined, now - DAY);
  const current = recordOpen(previous, now);
  assert.equal(shouldAskReview(previous, current, now - 2 * DAY, now), false);
});

test('다섯 번 이상 열고 이틀이 지나면 묻는다(그 전에는 묻지 않는다)', () => {
  const base = { firstOpenAt: now - 3 * DAY, opens: 4, lastOpenAt: now - DAY };
  assert.equal(shouldAskReview(base, recordOpen(base, now), undefined, now), true);
  const fresh = { firstOpenAt: now - DAY, opens: 9, lastOpenAt: now - 3600_000 };
  assert.equal(shouldAskReview(fresh, recordOpen(fresh, now), undefined, now), false);
});

test("'나중에'는 14일 뒤 다시 묻고, 세 번 거절하면 더 묻지 않는다", () => {
  let stats: UsageStats = { firstOpenAt: now - 10 * DAY, opens: 20, lastOpenAt: now - DAY };
  stats = dismissReview(stats, now);
  assert.equal(stats.nextPromptAt, now + LATER_DAYS * DAY);
  assert.equal(shouldAskReview(stats, recordOpen(stats, now + DAY), undefined, now + DAY), false);
  const later = now + (LATER_DAYS + 1) * DAY;
  assert.equal(shouldAskReview(stats, recordOpen(stats, later), undefined, later), true);
  for (let i = 1; i < MAX_DISMISSALS; i++) stats = dismissReview(stats, now);
  const muchLater = now + 100 * DAY;
  assert.equal(shouldAskReview(stats, recordOpen(stats, muchLater), now + 99 * DAY, muchLater), false);
});

test('별점 페이지를 연 사용자에게는 다시 묻지 않는다', () => {
  const stats = { firstOpenAt: now - 10 * DAY, opens: 20, lastOpenAt: now - DAY, reviewed: true };
  assert.equal(shouldAskReview(stats, recordOpen(stats, now), now - 60_000, now), false);
});
