import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEconCalendar, upcomingEvents } from './econ.js';

const sample = [
  { title: 'FOMC Meeting Minutes', country: 'USD', date: '2026-10-08T03:00:00+09:00', impact: 'High', forecast: '', previous: '' },
  { title: 'CPI m/m', country: 'USD', date: '2026-10-07T21:30:00+09:00', impact: 'High', forecast: '0.3%', previous: '0.4%' },
  { title: 'Retail Sales', country: 'USD', date: '2026-10-09T21:30:00+09:00', impact: 'Medium', forecast: '', previous: '' },
  { title: 'ECB Rate', country: 'EUR', date: '2026-10-08T20:15:00+09:00', impact: 'High', forecast: '', previous: '' },
  { title: 'Broken', country: 'USD', date: 'not a date', impact: 'High' },
];

test('미국 고영향 일정만 시간순으로 남긴다', () => {
  const events = parseEconCalendar(sample);
  assert.deepEqual(events.map(item => item.title), ['CPI m/m', 'FOMC Meeting Minutes']);
  assert.equal(events[0].forecast, '0.3%');
  assert.equal(events[0].time, Date.parse('2026-10-07T21:30:00+09:00'));
  // 같은 일정은 늘 같은 id
  assert.equal(parseEconCalendar(sample)[0].id, events[0].id);
  assert.deepEqual(parseEconCalendar({}), []);
});

test('곧 발표될 일정 중 아직 알리지 않은 것만', () => {
  const events = parseEconCalendar(sample);
  const cpi = events[0];
  const now = cpi.time - 20 * 60_000;
  assert.deepEqual(upcomingEvents(events, now, 30 * 60_000, []).map(item => item.title), ['CPI m/m']);
  assert.deepEqual(upcomingEvents(events, now, 30 * 60_000, [cpi.id]), []);
  assert.deepEqual(upcomingEvents(events, now, 10 * 60_000, []), []);
  // 이미 발표된 일정은 빼고
  assert.deepEqual(upcomingEvents(events, cpi.time + 1, 30 * 60_000, []), []);
});
