import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EXCHANGES } from '@/constants/exchanges';
import { useI18n } from '@/i18n';
import { formatFiat, useMarket } from '@/lib/market';
import type { ExchangePlatform } from '@/types';
import { DerivativesPanel } from '@/components/insights/DerivativesPanel';
import { TrendsPanel } from '@/components/insights/TrendsPanel';
import { KimchiTrend } from '@/components/insights/KimchiTrend';
import { ShareButton } from '@/components/ShareButton';
import { HoverHint } from '@/components/ui/hoverHint';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';

type InsightsTab = 'overview' | 'derivatives' | 'trends';

type SpreadQuote = { exchange: ExchangePlatform; market: string; price: number; usdPrice: number };
type SpreadItem = { coin: string; spread: number; low: SpreadQuote; high: SpreadQuote; exchanges: number };

const REFRESH_INTERVAL = 3000;

// 공포·탐욕 지수 구간별 색 (0 극도의 공포 ~ 100 극도의 탐욕)
const fearGreedColor = (value: number) =>
  value < 25
    ? 'bg-sentiment-1'
    : value < 45
      ? 'bg-sentiment-2'
      : value <= 55
        ? 'bg-sentiment-3'
        : value <= 75
          ? 'bg-sentiment-4'
          : 'bg-sentiment-5';

export const InsightsPopover = () => {
  const { t } = useI18n();
  const { marketStats } = useMarket();
  const [isOpen, setIsOpen] = useState(false);
  const [includeKrw, setIncludeKrw] = useState(true);
  const [spreads, setSpreads] = useState<SpreadItem[]>([]);
  const [tab, setTab] = useState<InsightsTab>('overview');
  const locale = t('numberLocale');

  useEffect(() => {
    if (!isOpen || tab !== 'overview') return;
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
  }, [isOpen, includeKrw, tab]);

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
          <HoverHint>
            {t('insights')}
          </HoverHint>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2 text-cap bg-background border border-stroke-weak">
        <Segmented
          variant="tabs"
          fill
          className="mb-2"
          value={tab}
          onChange={setTab}
          options={(
            [
              ['overview', 'insightsOverview'],
              ['derivatives', 'insightsDerivatives'],
              ['trends', 'insightsTrends'],
            ] as const
          ).map(([value, label]) => ({ value, label: t(label) }))}
        />
        {tab === 'derivatives' && <DerivativesPanel />}
        {tab === 'trends' && <TrendsPanel />}
        {tab === 'overview' && (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold">{t('marketSentiment')}</span>
              <ShareButton
                disabled={!fearGreed}
                build={() => ({
                  title: t('shareMarketTitle'),
                  headline: `${fearGreed?.value ?? '-'} ${fearGreed?.classification ?? ''}`,
                  lines: [
                    { label: t('fearGreed'), value: String(fearGreed?.value ?? '-') },
                    {
                      label: t('btcDominance'),
                      value: marketStats?.btcDominance != null ? `${marketStats.btcDominance.toFixed(1)}%` : '-',
                    },
                    {
                      label: t('fundingRate'),
                      value: marketStats?.fundingRate != null ? `${(marketStats.fundingRate * 100).toFixed(4)}%` : '-',
                      tone: (marketStats?.fundingRate ?? 0) >= 0 ? 'up' : 'down',
                    },
                  ],
                })}
              />
            </div>
            <div className="grid grid-cols-3 gap-1 mb-2" data-testid="market-stats">
              <div className="rounded-md border border-tile-border bg-tile px-2 py-1.5">
                <div className="text-cap-s text-fg-subtle">{t('fearGreed')}</div>
                {fearGreed ? (
                  <div className="flex items-center gap-1 font-semibold">
                    <span className={`inline-block size-2 rounded-full ${fearGreedColor(fearGreed.value)}`} />
                    {fearGreed.value}
                    <span className="text-cap-xs font-normal text-fg-subtle truncate">{fearGreed.classification}</span>
                  </div>
                ) : (
                  <div>-</div>
                )}
              </div>
              <div className="rounded-md border border-tile-border bg-tile px-2 py-1.5">
                <div className="text-cap-s text-fg-subtle">{t('btcDominance')}</div>
                <div className="num font-semibold">
                  {marketStats?.btcDominance != null ? `${marketStats.btcDominance.toFixed(1)}%` : '-'}
                </div>
              </div>
              <div className="rounded-md border border-tile-border bg-tile px-2 py-1.5">
                <div className="text-cap-s text-fg-subtle">{t('fundingRate')}</div>
                <div
                  className={`num font-semibold ${marketStats?.fundingRate != null ? (marketStats.fundingRate >= 0 ? 'text-up' : 'text-down') : ''}`}>
                  {marketStats?.fundingRate != null ? `${(marketStats.fundingRate * 100).toFixed(4)}%` : '-'}
                </div>
              </div>
            </div>

            <KimchiTrend />

            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold">{t('spreads')}</span>
              <label className="flex items-center gap-1.5 text-cap-s text-fg-subtle hover:cursor-pointer">
                {t('includeKrw')}
                <Switch checked={includeKrw} onCheckedChange={setIncludeKrw} />
              </label>
            </div>
            <div className="text-cap-s text-fg-faint mb-1">{t('spreadsHint')}</div>
            <div className="max-h-56 overflow-y-auto" data-testid="spreads">
              {!spreads.length && <div className="text-fg-faint py-2">{t('noSpreads')}</div>}
              {spreads.map(({ coin, spread, low, high, exchanges }) => (
                <div key={coin} className="flex items-center gap-1 py-1 border-b last:border-b-0" data-testid="spread">
                  <div className="w-14 font-semibold truncate">
                    {coin}
                    <div className="text-cap-xs font-normal text-fg-faint">×{exchanges}</div>
                  </div>
                  <div className="flex-1 flex items-center gap-1 text-cap-s">
                    <img
                      src={EXCHANGES[low.exchange]?.logo}
                      title={t(EXCHANGES[low.exchange].labelKey)}
                      className="size-3"
                    />
                    <span>{formatFiat(low.usdPrice, 'USD', locale)}</span>
                    <span className="text-fg-faint">→</span>
                    <img
                      src={EXCHANGES[high.exchange]?.logo}
                      title={t(EXCHANGES[high.exchange].labelKey)}
                      className="size-3"
                    />
                    <span>{formatFiat(high.usdPrice, 'USD', locale)}</span>
                  </div>
                  <div className="num w-12 text-right font-semibold text-fg-emphasis">{spread.toFixed(2)}%</div>
                </div>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};
