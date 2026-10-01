import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EXCHANGES } from '@/constants/exchanges';
import { useI18n } from '@/i18n';
import { formatFiat, useMarket } from '@/lib/market';
import type { ExchangePlatform } from '@/types';

type SpreadQuote = { exchange: ExchangePlatform; market: string; price: number; usdPrice: number };
type SpreadItem = { coin: string; spread: number; low: SpreadQuote; high: SpreadQuote; exchanges: number };

const REFRESH_INTERVAL = 3000;

// 공포·탐욕 지수 구간별 색 (0 극도의 공포 ~ 100 극도의 탐욕)
const fearGreedColor = (value: number) =>
  value < 25 ? 'bg-red-500' : value < 45 ? 'bg-orange-400' : value <= 55 ? 'bg-yellow-400' : value <= 75 ? 'bg-lime-500' : 'bg-green-600';

export const InsightsPopover = () => {
  const { t } = useI18n();
  const { marketStats } = useMarket();
  const [isOpen, setIsOpen] = useState(false);
  const [includeKrw, setIncludeKrw] = useState(true);
  const [spreads, setSpreads] = useState<SpreadItem[]>([]);
  const locale = t('numberLocale');

  useEffect(() => {
    if (!isOpen) return;
    let isUnmounted = false;
    const load = () =>
      chrome.runtime.sendMessage({ action: 'getSpreads', includeKrw }, (response?: { items: SpreadItem[] }) => {
        if (isUnmounted || chrome.runtime.lastError || !response) return;
        setSpreads(response.items);
      });
    load();
    const intervalId = setInterval(load, REFRESH_INTERVAL);
    return () => {
      isUnmounted = true;
      clearInterval(intervalId);
    };
  }, [isOpen, includeKrw]);

  const fearGreed = marketStats?.fearGreed;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="relative group">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('insights')}
            className="relative w-6 h-6 p-0 hover:cursor-pointer hover:bg-accent">
            <Activity strokeWidth={2} className="size-3.5 p-0" />
          </Button>
          <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white font-semibold bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-[50]">
            {t('insights')}
          </span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2 text-[11px] bg-background dark:bg-background border border-neutral-200 dark:border-neutral-800">
        <div className="font-semibold mb-1">{t('marketSentiment')}</div>
        <div className="grid grid-cols-3 gap-1 mb-2" data-testid="market-stats">
          <div className="rounded-md border p-1">
            <div className="text-[10px] text-neutral-500">{t('fearGreed')}</div>
            {fearGreed ? (
              <div className="flex items-center gap-1 font-semibold">
                <span className={`inline-block size-2 rounded-full ${fearGreedColor(fearGreed.value)}`} />
                {fearGreed.value}
                <span className="text-[9px] font-normal text-neutral-500 truncate">{fearGreed.classification}</span>
              </div>
            ) : (
              <div>-</div>
            )}
          </div>
          <div className="rounded-md border p-1">
            <div className="text-[10px] text-neutral-500">{t('btcDominance')}</div>
            <div className="font-semibold">
              {marketStats?.btcDominance != null ? `${marketStats.btcDominance.toFixed(1)}%` : '-'}
            </div>
          </div>
          <div className="rounded-md border p-1">
            <div className="text-[10px] text-neutral-500">{t('fundingRate')}</div>
            <div
              className={`font-semibold ${marketStats?.fundingRate != null ? (marketStats.fundingRate >= 0 ? 'text-up' : 'text-down') : ''}`}>
              {marketStats?.fundingRate != null ? `${(marketStats.fundingRate * 100).toFixed(4)}%` : '-'}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold">{t('spreads')}</span>
          <label className="flex items-center gap-1 text-[10px] text-neutral-500 hover:cursor-pointer">
            <input
              type="checkbox"
              checked={includeKrw}
              onChange={event => setIncludeKrw(event.target.checked)}
              className="hover:cursor-pointer"
            />
            {t('includeKrw')}
          </label>
        </div>
        <div className="text-[10px] text-neutral-400 mb-1">{t('spreadsHint')}</div>
        <div className="max-h-56 overflow-y-auto" data-testid="spreads">
          {!spreads.length && <div className="text-neutral-400 py-2">{t('noSpreads')}</div>}
          {spreads.map(({ coin, spread, low, high, exchanges }) => (
            <div key={coin} className="flex items-center gap-1 py-1 border-b last:border-b-0" data-testid="spread">
              <div className="w-14 font-semibold truncate">
                {coin}
                <div className="text-[9px] font-normal text-neutral-400">×{exchanges}</div>
              </div>
              <div className="flex-1 flex items-center gap-1 text-[10px]">
                <img src={EXCHANGES[low.exchange]?.logo} title={t(EXCHANGES[low.exchange].labelKey)} className="size-3" />
                <span>{formatFiat(low.usdPrice, 'USD', locale)}</span>
                <span className="text-neutral-400">→</span>
                <img src={EXCHANGES[high.exchange]?.logo} title={t(EXCHANGES[high.exchange].labelKey)} className="size-3" />
                <span>{formatFiat(high.usdPrice, 'USD', locale)}</span>
              </div>
              <div className="w-12 text-right font-semibold text-up">{spread.toFixed(2)}%</div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
