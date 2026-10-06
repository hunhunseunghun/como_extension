// @ts-check
// 거래소 공지(순수 함수): 빗썸 공지 응답을 정리하고, 지난번 확인 이후 새로 올라온 것만 고른다.

// 거래와 상관없는 공지는 알리지 않는다.
const BITHUMB_SKIP_CATEGORIES = ['이벤트', '안내'];

/**
 * 빗썸 /v1/notices 응답 → { id, title, url, category }. 응답에 id가 없어 pc_url 끝의 번호를 쓴다.
 * @param {unknown} data
 */
export function parseBithumbNotices(data) {
  if (!Array.isArray(data)) return [];
  return data
    .map(item => {
      const id = Number(/(\d+)\/?$/.exec(item?.pc_url ?? '')?.[1]);
      const categories = Array.isArray(item?.categories) ? item.categories : [];
      return { id, title: String(item?.title ?? ''), url: String(item?.pc_url ?? ''), category: categories.join(',') };
    })
    .filter(item => Number.isFinite(item.id) && item.title)
    .filter(item => !BITHUMB_SKIP_CATEGORIES.some(skip => item.category.split(',').includes(skip)));
}

/**
 * 처음 켰을 때(lastId 없음)는 기준만 잡고 알리지 않는다. 한 번에 최대 limit개, 오래된 것부터.
 * @template {{ id: number }} T
 * @param {T[]} notices
 * @param {number | null | undefined} lastId
 * @param {number} [limit]
 */
export function pickNewNotices(notices, lastId, limit = 5) {
  if (!notices.length) return { fresh: [], maxId: lastId ?? null };
  const maxId = Math.max(lastId ?? -Infinity, ...notices.map(notice => notice.id));
  if (lastId == null) return { fresh: [], maxId };
  const fresh = notices
    .filter(notice => notice.id > lastId)
    .sort((a, b) => a.id - b.id)
    .slice(-limit);
  return { fresh, maxId };
}
