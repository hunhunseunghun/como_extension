import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';

type TrendingCoin = {
  id: string;
  symbol: string;
  name: string;
  thumb: string;
  rank: number | null;
  change24h: number | null;
};
type NewsItem = { title: string; link: string; time: number };
type Emission = { name: string; emission7d: number; emission30d: number };

// 뉴스·언락 데이터는 처음 쓸 때 사용자에게 권한을 받아 가져온다(manifest optional_host_permissions).
const NEWS_FEEDS = {
  ko: { origin: 'https://www.blockmedia.co.kr/*', url: 'https://www.blockmedia.co.kr/feed', source: 'Blockmedia' },
  global: {
    origin: 'https://www.coindesk.com/*',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss',
    source: 'CoinDesk',
  },
};
const EMISSIONS = {
  origin: 'https://defillama-datasets.llama.fi/*',
  url: 'https://defillama-datasets.llama.fi/emissionsBreakdown',
};

const compactUsd = (value: number, locale: string) =>
  `$${new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`;

const relativeTime = (time: number, locale: string) => {
  const minutes = Math.round((time - Date.now()) / 60000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, 'hour');
  return format.format(Math.round(hours / 24), 'day');
};

const parseRss = (xml: string): NewsItem[] =>
  [...new DOMParser().parseFromString(xml, 'text/xml').querySelectorAll('item')].slice(0, 8).map(item => ({
    title: item.querySelector('title')?.textContent?.trim() ?? '',
    link: item.querySelector('link')?.textContent?.trim() ?? '',
    time: Date.parse(item.querySelector('pubDate')?.textContent ?? '') || 0,
  }));

const usePermission = (origin: string) => {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    chrome.permissions.contains({ origins: [origin] }, setGranted);
  }, [origin]);
  // 권한 요청은 사용자 클릭 안에서만 할 수 있다.
  const request = () => chrome.permissions.request({ origins: [origin] }, setGranted);
  return [granted, request] as const;
};

// 피드에서 온 주소는 http(s)만 연다.
const openTab = (url: string) => {
  if (url.startsWith('https://') || url.startsWith('http://')) chrome.tabs.create({ url });
};

const Trending = () => {
  const { t } = useI18n();
  const [coins, setCoins] = useState<TrendingCoin[]>([]);
  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'getTrending' }, (response?: TrendingCoin[]) => {
      if (!chrome.runtime.lastError && Array.isArray(response)) setCoins(response);
    });
  }, []);
  return (
    <section>
      <div className="font-semibold mb-1">{t('trendingCoins')}</div>
      <div className="grid grid-cols-2 gap-x-3" data-testid="trending">
        {coins.map(coin => (
          <button
            key={coin.id}
            type="button"
            className="flex items-center gap-1 py-0.5 min-w-0 text-left hover:cursor-pointer hover:underline"
            onClick={() => openTab(`https://www.coingecko.com/coins/${coin.id}`)}>
            <img src={coin.thumb} className="size-3.5 rounded-full" />
            <span className="font-medium truncate">{coin.symbol}</span>
            {coin.change24h != null && (
              <span className={`num ml-auto ${coin.change24h >= 0 ? 'text-up' : 'text-down'}`}>
                {coin.change24h >= 0 ? '+' : ''}
                {coin.change24h.toFixed(1)}%
              </span>
            )}
          </button>
        ))}
        {!coins.length && <div className="text-fg-faint">-</div>}
      </div>
      <div className="text-cap-s text-fg-faint mt-0.5">CoinGecko</div>
    </section>
  );
};

const News = () => {
  const { t, language } = useI18n();
  const locale = t('numberLocale');
  const feed = language === 'ko' ? NEWS_FEEDS.ko : NEWS_FEEDS.global;
  const [granted, request] = usePermission(feed.origin);
  const [items, setItems] = useState<NewsItem[] | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(feed.url);
      setItems(parseRss(await response.text()));
    } catch (error) {
      console.warn(error);
      setItems([]);
    }
  }, [feed.url]);

  useEffect(() => {
    if (granted) load();
  }, [granted, load]);

  return (
    <section className="border-t pt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold">{t('news')}</span>
        <span className="text-cap-s text-fg-faint">{feed.source}</span>
      </div>
      {granted === false && (
        <Button variant="outline" className="h-6 w-full text-cap-s hover:cursor-pointer" onClick={request}>
          {t('allowNews')}
        </Button>
      )}
      {granted &&
        (items ?? []).map(item => (
          <button
            key={item.link}
            type="button"
            className="block w-full py-0.5 text-left hover:cursor-pointer hover:underline"
            onClick={() => openTab(item.link)}
            data-testid="news-item">
            <span className="line-clamp-1">{item.title}</span>
            {item.time > 0 && <span className="text-cap-s text-fg-faint">{relativeTime(item.time, locale)}</span>}
          </button>
        ))}
      {granted && items?.length === 0 && <div className="text-fg-faint">-</div>}
    </section>
  );
};

const Unlocks = () => {
  const { t } = useI18n();
  const locale = t('numberLocale');
  const [granted, request] = usePermission(EMISSIONS.origin);
  const [items, setItems] = useState<Emission[] | null>(null);

  useEffect(() => {
    if (!granted) return;
    fetch(EMISSIONS.url)
      .then(response => response.json())
      .then((data: Record<string, Emission>) =>
        // 비트코인처럼 채굴로만 늘어나는 자산도 섞여 있다. 7일 규모 순으로 상위만 보여 준다.
        setItems(
          Object.values(data)
            .filter(item => item.emission7d > 0)
            .sort((a, b) => b.emission7d - a.emission7d)
            .slice(0, 6),
        ),
      )
      .catch(error => {
        console.warn(error);
        setItems([]);
      });
  }, [granted]);

  return (
    <section className="border-t pt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold">{t('unlocks')}</span>
        <span className="text-cap-s text-fg-faint">DefiLlama</span>
      </div>
      {granted === false && (
        <Button variant="outline" className="h-6 w-full text-cap-s hover:cursor-pointer" onClick={request}>
          {t('allowUnlocks')}
        </Button>
      )}
      {granted && (
        <>
          <div className="flex justify-between text-cap-s text-fg-subtle">
            <span />
            <span className="flex gap-3">
              <span className="w-12 text-right">7d</span>
              <span className="w-12 text-right">30d</span>
            </span>
          </div>
          {(items ?? []).map(item => (
            <div key={item.name} className="flex justify-between py-0.5">
              <span className="truncate">{item.name}</span>
              <span className="flex gap-3 num">
                <span className="w-12 text-right">{compactUsd(item.emission7d, locale)}</span>
                <span className="w-12 text-right">{compactUsd(item.emission30d, locale)}</span>
              </span>
            </div>
          ))}
          <div className="text-cap-s text-fg-faint mt-0.5">{t('unlocksHint')}</div>
        </>
      )}
    </section>
  );
};

export const TrendsPanel = () => (
  <div className="flex flex-col gap-2">
    <Trending />
    <News />
    <Unlocks />
  </div>
);
