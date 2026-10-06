// @ts-check
// 방해 금지 시간대(순수 함수). 'HH:MM' 두 개로 정하고, 끝이 시작보다 이르면 자정을 넘긴다(23:00~07:00).

/** @param {string} value */
const toMinutes = value => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[1]) < 24 && Number(match[2]) < 60 ? minutes : null;
};

/**
 * @param {{ enabled?: boolean, start?: string, end?: string } | null | undefined} setting
 * @param {Date} now 사용자 기기의 현지 시각으로 본다
 */
export function isInQuietHours(setting, now) {
  if (!setting?.enabled) return false;
  const start = toMinutes(setting.start ?? '');
  const end = toMinutes(setting.end ?? '');
  if (start == null || end == null || start === end) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
