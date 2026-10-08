// 리뷰 요청을 띄울지(순수 함수). 평점 수가 스토어 순위·신뢰에 바로 영향을 줘서, 만족했을 순간에 한 번씩 부탁한다.
//   - 지난번에 연 뒤로 알림을 받았고(지정가·급등락 등), 두 번 이상 써 본 사용자
//   - 다섯 번 이상 열고 이틀이 지난 사용자
// '나중에'는 14일 뒤 다시 묻고, 세 번 거절하면 더 묻지 않는다. 한 번 별점 페이지를 열었으면 다시 묻지 않는다.

export const DAY = 24 * 60 * 60 * 1000;
export const LATER_DAYS = 14;
export const MAX_DISMISSALS = 3;

export type UsageStats = {
  firstOpenAt: number;
  opens: number;
  lastOpenAt?: number;
  nextPromptAt?: number;
  reviewed?: boolean;
  dismissals?: number;
};

/** 이번에 연 것을 반영한 사용 기록 */
export const recordOpen = (stats: UsageStats | undefined, now: number): UsageStats => {
  const base = stats ?? { firstOpenAt: now, opens: 0 };
  return { ...base, opens: base.opens + 1, lastOpenAt: now };
};

/**
 * @param previous 이번에 열기 전 기록(처음이면 undefined)
 * @param current recordOpen으로 이번 열기까지 반영한 기록
 * @param alertFiredAt 마지막으로 알림이 울린 시각
 */
export const shouldAskReview = (
  previous: UsageStats | undefined,
  current: UsageStats,
  alertFiredAt: number | undefined,
  now: number,
): boolean => {
  if (current.reviewed || (current.dismissals ?? 0) >= MAX_DISMISSALS) return false;
  if (current.nextPromptAt && now < current.nextPromptAt) return false;
  const alertSinceLastOpen = !!alertFiredAt && alertFiredAt > (previous?.lastOpenAt ?? 0);
  if (alertSinceLastOpen && current.opens >= 2) return true;
  return current.opens >= 5 && now - current.firstOpenAt >= 2 * DAY;
};

/** '나중에'를 눌렀을 때 */
export const dismissReview = (stats: UsageStats, now: number): UsageStats => ({
  ...stats,
  dismissals: (stats.dismissals ?? 0) + 1,
  nextPromptAt: now + LATER_DAYS * DAY,
});
