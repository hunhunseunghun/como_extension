import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';

type FundingItem = { symbol: string; rate: number; nextFundingTime: number };
type Liquidation = { symbol: string; side: 'long' | 'short'; usd: number; price: number; time: number };
type OpenInterest = { usd: number | null; change1h: number | null; change24h: number | null };
type LongShortItem = { symbol: string; longAccount: number; topLong: number | null; openInterest?: OpenInterest | null };
type Derivatives = {
  longShort?: { items: LongShortItem[]; updatedAt: number } | null;
  funding: { highest: FundingItem[]; lowest: FundingItem[]; updatedAt: number } | null;
  liquidations: { longUsd: number; shortUsd: number; count: number; largest: Liquidation[]; windowMs: number };
};

const REFRESH_INTERVAL = 3000;

const compactUsd = (value: number, locale: string) =>
  `$${new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`;
// 소수 첫째 자리에서 반올림해 0이 되면 부호 없이 0.0%로 보인다(-0.0% 방지).
const signedPercent = (value: number | null) => {
  if (value == null) return '-';
  const rounded = Math.round(value * 10) / 10 || 0;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`;
};
const fundingPercent = (rate: number) => `${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(4)}%`;

// 왼쪽 롱, 오른쪽 숏 막대. 롱 청산은 하락 쪽 힘이라 청산 막대는 롱을 하락 색으로 칠한다(inverted).
const RatioBar = ({ long, inverted = false }: { long: number; inverted?: boolean }) => (
  <div className="flex h-1.5 overflow-hidden rounded-full bg-neutral-weak" aria-hidden>
    <div className={inverted ? 'bg-down' : 'bg-up'} style={{ width: `${long * 100}%` }} />
    <div className={`${inverted ? 'bg-up' : 'bg-down'} flex-1`} />
  </div>
);

// 바이낸스 USDT 무기한 선물: 펀딩비 상·하위, 롱숏 비율, 최근 1시간 강제 청산(롱·숏).
export const DerivativesPanel = () => {
  const { t } = useI18n();
  const locale = t('numberLocale');
  const [data, setData] = useState<Derivatives | null>(null);

  useEffect(() => {
    let isUnmounted = false;
    const load = () =>
      chrome.runtime.sendMessage({ action: 'getDerivatives' }, (response?: Derivatives) => {
        if (!isUnmounted && !chrome.runtime.lastError && response) setData(response);
      });
    load();
    const intervalId = setInterval(load, REFRESH_INTERVAL);
    return () => {
      isUnmounted = true;
      clearInterval(intervalId);
    };
  }, []);

  const liq = data?.liquidations;
  const total = (liq?.longUsd ?? 0) + (liq?.shortUsd ?? 0);
  const longShare = total ? (liq!.longUsd / total) * 100 : 50;
  const minutes = Math.max(1, Math.round((liq?.windowMs ?? 0) / 60000));

  const fundingList = (title: string, items: FundingItem[] = []) => (
    <div className="flex-1 min-w-0">
      <div className="text-cap-s text-fg-subtle mb-0.5">{title}</div>
      {items.map(item => (
        <div key={item.symbol} className="flex justify-between gap-1 py-0.5">
          <span className="truncate">{item.symbol.replace(/USDT$/, '')}</span>
          <span className={`num ${item.rate >= 0 ? 'text-up' : 'text-down'}`}>{fundingPercent(item.rate)}</span>
        </div>
      ))}
      {!items.length && <div className="text-fg-faint">-</div>}
    </div>
  );

  return (
    <div className="flex flex-col gap-2" data-testid="derivatives">
      <section>
        <div className="font-semibold mb-1">{t('fundingRanking')}</div>
        <div className="flex gap-3">
          {fundingList(t('fundingHighest'), data?.funding?.highest)}
          {fundingList(t('fundingLowest'), data?.funding?.lowest)}
        </div>
        <div className="text-cap-s text-fg-faint mt-1">{t('fundingHint')}</div>
      </section>

      <section className="border-t pt-2" data-testid="long-short">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold">{t('longShortRatio')}</span>
          <span className="text-cap-s text-fg-subtle">{t('longShortLegend')}</span>
        </div>
        {data?.longShort?.items.map(item => (
          <div key={item.symbol} className="flex items-center gap-2 py-0.5">
            <span className="w-8 shrink-0">{item.symbol.replace(/USDT$/, '')}</span>
            <div className="flex-1 min-w-0">
              <RatioBar long={item.longAccount} />
            </div>
            <span className="num w-[74px] shrink-0 text-right text-cap-s">
              <span className="text-up">{(item.longAccount * 100).toFixed(0)}</span>
              <span className="text-fg-faint"> : </span>
              <span className="text-down">{((1 - item.longAccount) * 100).toFixed(0)}</span>
            </span>
            {item.topLong != null && (
              <span className="num w-10 shrink-0 text-right text-cap-s text-fg-subtle" title={t('longShortTopHint')}>
                {(item.topLong * 100).toFixed(0)}%
              </span>
            )}
          </div>
        ))}
        {!data?.longShort?.items.length && <div className="text-fg-faint">-</div>}
        <div className="text-cap-s text-fg-faint mt-1">{t('longShortHint')}</div>
      </section>

      <section className="border-t pt-2" data-testid="open-interest">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold">{t('openInterest')}</span>
          <span className="text-cap-s text-fg-subtle">{t('openInterestLegend')}</span>
        </div>
        {data?.longShort?.items
          .filter(item => item.openInterest)
          .map(({ symbol, openInterest }) => (
            <div key={symbol} className="flex items-center gap-2 py-0.5">
              <span className="w-8 shrink-0">{symbol.replace(/USDT$/, '')}</span>
              <span className="num flex-1">{openInterest!.usd != null ? compactUsd(openInterest!.usd, locale) : '-'}</span>
              {[openInterest!.change1h, openInterest!.change24h].map((value, index) => (
                <span
                  key={index}
                  className={`num w-12 shrink-0 text-right text-cap-s ${value == null ? 'text-fg-faint' : value >= 0 ? 'text-up' : 'text-down'}`}>
                  {signedPercent(value)}
                </span>
              ))}
            </div>
          ))}
        {!data?.longShort?.items.some(item => item.openInterest) && <div className="text-fg-faint">-</div>}
        <div className="text-cap-s text-fg-faint mt-1">{t('openInterestHint')}</div>
      </section>

      <section className="border-t pt-2">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold">{t('liquidations')}</span>
          <span className="text-cap-s text-fg-subtle">
            {t('lastMinutes').replace('{n}', String(minutes))} · {t('liqCount').replace('{n}', String(liq?.count ?? 0))}
          </span>
        </div>
        <div className="flex justify-between text-cap-s mb-0.5">
          <span>
            {t('liqLong')} <b className="num text-down">{compactUsd(liq?.longUsd ?? 0, locale)}</b>
          </span>
          <span>
            {t('liqShort')} <b className="num text-up">{compactUsd(liq?.shortUsd ?? 0, locale)}</b>
          </span>
        </div>
        <RatioBar long={longShare / 100} inverted />
        <div className="mt-1.5">
          {liq?.largest.map(item => (
            <div
              key={`${item.symbol}-${item.time}`}
              className="flex justify-between gap-1 py-0.5"
              data-testid="liquidation">
              <span className="truncate">
                {item.symbol.replace(/USDT$/, '')}{' '}
                <span className={item.side === 'long' ? 'text-down' : 'text-up'}>
                  {item.side === 'long' ? t('liqLong') : t('liqShort')}
                </span>
              </span>
              <span className="num">{compactUsd(item.usd, locale)}</span>
            </div>
          ))}
          {!liq?.largest.length && <div className="text-fg-faint">{t('noLiquidations')}</div>}
        </div>
      </section>
    </div>
  );
};
