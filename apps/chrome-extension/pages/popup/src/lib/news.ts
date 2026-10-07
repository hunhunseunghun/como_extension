import type { NewsItem } from '@/lib/indicators';

// 뉴스 피드(선택 권한). 트렌드 탭에서 사용자가 처음 켤 때 권한을 받는다.
export const NEWS_FEEDS = {
  ko: { origin: 'https://www.blockmedia.co.kr/*', url: 'https://www.blockmedia.co.kr/feed', source: 'Blockmedia' },
  global: {
    origin: 'https://www.coindesk.com/*',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss',
    source: 'CoinDesk',
  },
} as const;
export type NewsFeedKey = keyof typeof NEWS_FEEDS;

export const parseRss = (xml: string, limit = 8): NewsItem[] =>
  [...new DOMParser().parseFromString(xml, 'text/xml').querySelectorAll('item')].slice(0, limit).map(item => ({
    title: item.querySelector('title')?.textContent?.trim() ?? '',
    link: item.querySelector('link')?.textContent?.trim() ?? '',
    time: Date.parse(item.querySelector('pubDate')?.textContent ?? '') || 0,
  }));

// 차트 급등락 표시에 쓰는 최근 뉴스. 권한을 받은 피드만 읽고 5분 동안 재사용한다.
const CACHE_MS = 5 * 60_000;
let cache: { at: number; items: NewsItem[]; granted: boolean } | null = null;
// granted: 뉴스 피드를 하나라도 켰는지(없으면 화면이 '뉴스를 켜면 보여요'라고 안내한다)
export const loadGrantedNews = async (): Promise<{ items: NewsItem[]; granted: boolean }> => {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const feeds = Object.values(NEWS_FEEDS);
  let granted = false;
  const lists = await Promise.all(
    feeds.map(async feed => {
      const allowed = await chrome.permissions.contains({ origins: [feed.origin] }).catch(() => false);
      if (!allowed) return [];
      granted = true;
      try {
        const response = await fetch(feed.url);
        return parseRss(await response.text(), 50);
      } catch {
        return [];
      }
    }),
  );
  cache = { at: Date.now(), items: lists.flat(), granted };
  return cache;
};
