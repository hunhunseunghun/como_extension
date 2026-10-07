import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useStoredFlag } from '@/hooks/useStoredFlag';
import { useI18n } from '@/i18n';
import type { NewsItem } from '@/lib/indicators';
import { NEWS_FEEDS, parseRss } from '@/lib/news';

type TrendingCoin = {
  id: string;
  symbol: string;
  name: string;
  thumb: string;
  rank: number | null;
  change24h: number | null;
};
type Emission = { name: string; emission7d: number; emission30d: number };

// 뉴스 피드는 차트 급등락 표시와 함께 쓴다(lib/news). 언락 데이터도 처음 쓸 때 권한을 받는다(manifest optional_host_permissions).
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
        <Button variant="soft" className="h-control w-full text-cap-s hover:cursor-pointer" onClick={request}>
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

// 경제 일정(미국 고영향 지표). 백그라운드가 1시간마다 받아 두고(econEvents), 켜 두면 발표 30분 전에 알린다.
const ECON_ORIGIN = 'https://nfs.faireconomy.media/*';
type EconEvent = { id: string; title: string; time: number; country: string; forecast: string; previous: string };

const EconCalendar = () => {
  const { t } = useI18n();
  const locale = t('numberLocale');
  const [granted, request] = usePermission(ECON_ORIGIN);
  const [events, setEvents] = useState<EconEvent[] | null>(null);
  const [alerts, setAlerts] = useStoredFlag('econAlerts');

  useEffect(() => {
    if (!granted) return;
    const load = () =>
      chrome.storage.local.get('econEvents', result => {
        const stored = result?.econEvents as { events: EconEvent[]; updatedAt: number } | undefined;
        setEvents(stored?.events ?? []);
        // 처음 켰거나 오래됐으면 지금 받아 온다.
        if (!stored || Date.now() - stored.updatedAt > 60 * 60_000) chrome.runtime.sendMessage({ action: 'refreshEcon' });
      });
    load();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.econEvents) load();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [granted]);

  const now = Date.now();
  const upcoming = (events ?? []).filter(item => item.time > now - 60 * 60_000).slice(0, 6);
  const when = (time: number) =>
    new Date(time).toLocaleString(locale, { weekday: 'short', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <section className="border-t pt-2" data-testid="econ-calendar">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold">{t('econCalendar')}</span>
        <span className="text-cap-s text-fg-faint">ForexFactory</span>
      </div>
      {granted === false && (
        <Button variant="soft" className="h-control w-full text-cap-s hover:cursor-pointer" onClick={request}>
          {t('allowEcon')}
        </Button>
      )}
      {granted && (
        <>
          {upcoming.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-2 py-0.5" data-testid="econ-event">
              <span className="min-w-0 truncate">
                {item.title}
                {(item.forecast || item.previous) && (
                  <span className="ml-1 text-cap-s text-fg-faint">
                    {[item.forecast && `F ${item.forecast}`, item.previous && `P ${item.previous}`].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              <span className={`num shrink-0 text-cap-s ${item.time < now ? 'text-fg-faint line-through' : 'text-fg-subtle'}`}>
                {when(item.time)}
              </span>
            </div>
          ))}
          {events && !upcoming.length && <div className="text-fg-faint">{t('econEmpty')}</div>}
          <label className="mt-1 flex items-center justify-between gap-2 text-cap-s text-fg-subtle">
            <span>{t('econAlerts')}</span>
            <Switch aria-label={t('econAlerts')} checked={alerts} onCheckedChange={setAlerts} />
          </label>
          <div className="text-cap-s text-fg-faint mt-0.5">{t('econHint')}</div>
        </>
      )}
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
        <Button variant="soft" className="h-control w-full text-cap-s hover:cursor-pointer" onClick={request}>
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
    <EconCalendar />
    <Unlocks />
  </div>
);
