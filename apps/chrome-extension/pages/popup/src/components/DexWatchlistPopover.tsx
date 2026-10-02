import { useEffect, useState } from 'react';
import { Search, Sprout, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/i18n';
import { formatFiat } from '@/lib/market';

// DexScreener 공개 API (키 없음, 분당 300회). 거래소 상장 전 DEX·밈코인을 컨트랙트 주소로 추적한다.
const API = 'https://api.dexscreener.com/latest/dex';
const STORAGE_KEY = 'dexWatchlist';
const REFRESH_INTERVAL = 10_000;
const MAX_PAIRS_PER_REQUEST = 30;

type DexPair = {
  chainId: string;
  dexId: string;
  pairAddress: string;
  url: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { symbol: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  info?: { imageUrl?: string };
};
type WatchItem = { chainId: string; pairAddress: string; symbol: string };

const compactUsd = (value: number | undefined, locale: string) =>
  value == null
    ? '-'
    : value.toLocaleString(locale, {
        style: 'currency',
        currency: 'USD',
        currencyDisplay: 'narrowSymbol',
        notation: 'compact',
        maximumFractionDigits: 1,
      });

const fetchPairs = async (items: WatchItem[]) => {
  const byChain: Record<string, string[]> = {};
  items.forEach(({ chainId, pairAddress }) => (byChain[chainId] ??= []).push(pairAddress));
  const requests = Object.entries(byChain).flatMap(([chainId, addresses]) => {
    const chunks = [];
    for (let i = 0; i < addresses.length; i += MAX_PAIRS_PER_REQUEST) {
      chunks.push(addresses.slice(i, i + MAX_PAIRS_PER_REQUEST));
    }
    return chunks.map(chunk => fetch(`${API}/pairs/${chainId}/${chunk.join(',')}`).then(response => response.json()));
  });
  const responses = await Promise.all(requests);
  return responses.flatMap(response => (response?.pairs ?? []) as DexPair[]);
};

const PairRow = ({ pair, action }: { pair: DexPair; action: React.ReactNode }) => {
  const { t } = useI18n();
  const locale = t('numberLocale');
  const change = pair.priceChange?.h24;
  return (
    <div className="flex items-center gap-1 py-1 border-b last:border-b-0" data-testid="dex-pair">
      {pair.info?.imageUrl ? (
        <img src={pair.info.imageUrl} className="size-4 rounded-full" />
      ) : (
        <span className="size-4 rounded-full bg-neutral-weak-pressed" />
      )}
      <a href={pair.url} target="_blank" className="flex-1 min-w-0 hover:text-fg-faint">
        <div className="font-semibold truncate">
          {pair.baseToken.symbol}
          <span className="font-normal text-fg-faint">/{pair.quoteToken.symbol}</span>
        </div>
        <div className="text-cap-xs text-fg-faint truncate">
          {pair.chainId} · {pair.dexId} · {t('liquidity')} {compactUsd(pair.liquidity?.usd, locale)}
        </div>
      </a>
      <div className="text-right">
        <div>{pair.priceUsd ? formatFiat(Number(pair.priceUsd), 'USD', locale) : '-'}</div>
        <div className={`text-cap-s ${change == null ? '' : change >= 0 ? 'text-up' : 'text-down'}`}>
          {change == null ? '-' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`}
        </div>
      </div>
      {action}
    </div>
  );
};

export const DexWatchlistPopover = () => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [pairs, setPairs] = useState<Record<string, DexPair>>({});
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DexPair[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, result => {
      if (Array.isArray(result?.[STORAGE_KEY])) setWatchlist(result[STORAGE_KEY]);
    });
  }, []);

  useEffect(() => {
    if (!isOpen || !watchlist.length) return;
    let isUnmounted = false;
    const load = () =>
      fetchPairs(watchlist)
        .then(list => {
          if (!isUnmounted) setPairs(Object.fromEntries(list.map(pair => [pair.pairAddress.toLowerCase(), pair])));
        })
        .catch(() => {});
    load();
    const intervalId = setInterval(load, REFRESH_INTERVAL);
    return () => {
      isUnmounted = true;
      clearInterval(intervalId);
    };
  }, [isOpen, watchlist]);

  const saveWatchlist = (next: WatchItem[]) => {
    setWatchlist(next);
    chrome.storage.local.set({ [STORAGE_KEY]: next });
  };

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setIsSearching(true);
    try {
      const response = await fetch(`${API}/search?q=${encodeURIComponent(q)}`).then(r => r.json());
      // 유동성이 큰 페어부터 보여 사칭·스캠 토큰이 위에 오지 않게 한다.
      const list = ((response?.pairs ?? []) as DexPair[])
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
        .slice(0, 8);
      setResults(list);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const addPair = (pair: DexPair) => {
    if (watchlist.some(item => item.pairAddress.toLowerCase() === pair.pairAddress.toLowerCase())) return;
    setPairs(prev => ({ ...prev, [pair.pairAddress.toLowerCase()]: pair }));
    saveWatchlist([...watchlist, { chainId: pair.chainId, pairAddress: pair.pairAddress, symbol: pair.baseToken.symbol }]);
    setResults([]);
    setQuery('');
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="relative group">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('dexWatchlist')}
            className="relative w-6 h-6 p-0 hover:cursor-pointer hover:bg-accent">
            <Sprout strokeWidth={2} className="size-3.5 p-0" />
          </Button>
          <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-body-s text-white font-semibold bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-[50]">
            {t('dexWatchlist')}
          </span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2 text-cap bg-background border border-stroke-weak">
        <div className="font-semibold mb-1">{t('dexWatchlist')}</div>
        <form
          className="flex gap-1 mb-1"
          onSubmit={event => {
            event.preventDefault();
            search();
          }}>
          <Input
            className="h-6 px-1 text-cap-s"
            placeholder={t('dexSearchPlaceholder')}
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
          <Button type="submit" className="h-6 px-2 hover:cursor-pointer" aria-label={t('search')}>
            <Search className="size-3" />
          </Button>
        </form>

        {isSearching && <div className="text-fg-faint py-1">{t('searching')}</div>}
        {!!results.length && (
          <div className="rounded-md border px-1 mb-2 max-h-40 overflow-y-auto" data-testid="dex-results">
            {results.map(pair => (
              <PairRow
                key={`${pair.chainId}:${pair.pairAddress}`}
                pair={pair}
                action={
                  <Button className="h-5 px-1.5 text-cap-s hover:cursor-pointer" onClick={() => addPair(pair)}>
                    {t('add')}
                  </Button>
                }
              />
            ))}
          </div>
        )}

        <div className="max-h-56 overflow-y-auto" data-testid="dex-watchlist">
          {!watchlist.length && <div className="text-fg-faint py-2">{t('dexEmpty')}</div>}
          {watchlist.map(item => {
            const pair = pairs[item.pairAddress.toLowerCase()];
            const remove = (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('delete')}
                className="h-4 w-4 p-0 hover:bg-transparent hover:cursor-pointer"
                onClick={() => saveWatchlist(watchlist.filter(watched => watched.pairAddress !== item.pairAddress))}>
                <X className="size-3" />
              </Button>
            );
            return pair ? (
              <PairRow key={item.pairAddress} pair={pair} action={remove} />
            ) : (
              <div key={item.pairAddress} className="flex justify-between py-1 text-fg-faint">
                {item.symbol} · {item.chainId}
                {remove}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
