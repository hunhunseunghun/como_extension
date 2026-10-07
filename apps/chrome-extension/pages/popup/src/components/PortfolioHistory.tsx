import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { convertFiat, formatFiat, useMarket } from '@/lib/market';
import { kstDate, periodChange, sumIn, upsertSnapshot, type Amounts, type PortfolioSnapshot, type Quote } from '@/lib/portfolioCalc';

const HISTORY_KEY = 'portfolioHistory';
const PERIODS = [1, 7, 30] as const;
const pnlColor = (value: number) => (value > 0 ? 'text-up' : value < 0 ? 'text-down' : '');

// 지금 보유 자산의 통화별 평가금액·원금(가격이 하나라도 없으면 null)
type Props = { amounts: { v: Amounts; c: Amounts } | null };

// 보유 자산 기간별 손익(1일·7일·30일)과 30일 추이. 통화별 원래 금액으로 기록하고, 비교할 때만 지금 환율로 화면 통화로 바꾼다.
export const PortfolioHistory = ({ amounts }: Props) => {
  const { t, currency } = useI18n();
  const market = useMarket();
  const locale = t('numberLocale');
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const toDisplay = (amount: number, quote: Quote) => convertFiat(amount, quote, currency, market);

  useEffect(() => {
    chrome.storage.local.get(HISTORY_KEY, result => setHistory((result?.[HISTORY_KEY] as PortfolioSnapshot[]) ?? []));
  }, []);

  // 화면에 보이는 합계로 오늘 칸을 갱신한다. 값이 조금씩 바뀔 때마다 쓰지 않도록 반올림한 값이 바뀔 때만 쓴다.
  const signature = amounts ? JSON.stringify([amounts.v, amounts.c], (_, value) => (typeof value === 'number' ? Math.round(value) : value)) : null;
  useEffect(() => {
    if (!amounts) return;
    const timer = setTimeout(() => {
      chrome.storage.local.get(HISTORY_KEY, result => {
        const next = upsertSnapshot((result?.[HISTORY_KEY] as PortfolioSnapshot[]) ?? [], { d: kstDate(Date.now()), ...amounts });
        chrome.storage.local.set({ [HISTORY_KEY]: next });
        setHistory(next);
      });
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (!amounts || !(sumIn(amounts.v, toDisplay) ?? 0)) return null;
  const today = kstDate(Date.now());
  const last30 = history.filter(item => item.d >= kstDate(Date.now() - 30 * 86_400_000) && item.d !== today);
  const series = [...last30, { d: today, ...amounts }]
    .map(item => sumIn(item.v, toDisplay))
    .filter((value): value is number => value != null);

  return (
    <div className="mt-1 border-t border-tile-border pt-1" data-testid="portfolio-history">
      <div className="flex items-center gap-2">
        {PERIODS.map(days => {
          const change = periodChange(history, today, days, amounts, toDisplay);
          return (
            <div key={days} className="flex-1 min-w-0" title={change ? t('historyFrom').replace('{date}', change.from) : t('historyNotYet')}>
              <div className="text-cap-xs text-fg-subtle">{t('historyDays').replace('{n}', String(days))}</div>
              {change ? (
                <div className={`num text-cap-s font-medium ${pnlColor(change.change)}`}>
                  <div>
                    {change.rate >= 0 ? '+' : ''}
                    {change.rate.toFixed(1)}%
                  </div>
                  <div className="truncate text-cap-xs font-normal">{formatFiat(change.change, currency, locale)}</div>
                </div>
              ) : (
                <div className="text-cap-s text-fg-faint">-</div>
              )}
            </div>
          );
        })}
        {series.length >= 2 && <HistoryLine values={series} />}
      </div>
      {history.length < 2 && <div className="text-cap-xs text-fg-faint">{t('historyCollecting')}</div>}
    </div>
  );
};

const HistoryLine = ({ values, width = 56, height = 22 }: { values: number[]; width?: number; height?: number }) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => `${((index / (values.length - 1)) * width).toFixed(1)},${(height - 1 - ((value - min) / range) * (height - 2)).toFixed(1)}`)
    .join(' ');
  const rising = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} className={`shrink-0 ${rising ? 'text-up' : 'text-down'}`} aria-hidden data-testid="history-line">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
};
