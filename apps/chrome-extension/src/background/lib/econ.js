// @ts-check
// 경제 일정(순수 함수): ForexFactory 주간 일정에서 미국 고영향 지표만 남기고, 곧 발표될 것을 고른다.

/** @typedef {{ id: string, title: string, time: number, country: string, forecast: string, previous: string }} EconEvent */

/** @param {string} text */
const hash = text => {
  let value = 0;
  for (let i = 0; i < text.length; i++) value = (value * 31 + text.charCodeAt(i)) | 0;
  return (value >>> 0).toString(36);
};

/**
 * @param {unknown} list ff_calendar_thisweek.json
 * @param {string[]} [countries]
 * @returns {EconEvent[]}
 */
export function parseEconCalendar(list, countries = ['USD']) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(item => item?.impact === 'High' && countries.includes(item?.country))
    .map(item => {
      const time = Date.parse(item.date);
      return {
        id: hash(`${item.title}|${item.date}`),
        title: String(item.title ?? ''),
        time,
        country: String(item.country),
        forecast: String(item.forecast ?? ''),
        previous: String(item.previous ?? ''),
      };
    })
    .filter(item => Number.isFinite(item.time) && item.title)
    .sort((a, b) => a.time - b.time);
}

/**
 * 지금부터 leadMs 안에 발표되고 아직 알리지 않은 일정
 * @param {EconEvent[]} events
 * @param {number} now
 * @param {number} leadMs
 * @param {string[]} alerted
 */
export function upcomingEvents(events, now, leadMs, alerted) {
  return events.filter(item => item.time > now && item.time - now <= leadMs && !alerted.includes(item.id));
}
