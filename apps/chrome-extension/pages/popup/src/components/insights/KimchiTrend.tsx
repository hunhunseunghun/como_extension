import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import { Segmented } from '@/components/ui/segmented';

// 백그라운드가 10분마다 남기는 BTC 김프·테더 프리미엄 기록(최대 7일)
type Point = { t: number; upbit: number | null; bithumb: number | null; tether: number | null };
type Range = '1d' | '7d';
type Series = 'upbit' | 'tether';

const WIDTH = 280;
const HEIGHT = 56;
const RANGE_MS: Record<Range, number> = { '1d': 86_400_000, '7d': 7 * 86_400_000 };

const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

export const KimchiTrend = () => {
  const { t } = useI18n();
  const [history, setHistory] = useState<Point[]>([]);
  const [range, setRange] = useState<Range>('1d');
  const [series, setSeries] = useState<Series>('upbit');

  useEffect(() => {
    chrome.storage.local.get('kimchiHistory', result => setHistory((result?.kimchiHistory as Point[]) ?? []));
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.kimchiHistory) setHistory(changes.kimchiHistory.newValue ?? []);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const points = useMemo(() => {
    const since = Date.now() - RANGE_MS[range];
    return history
      .filter(point => point.t >= since && point[series] != null)
      .map(point => ({ t: point.t, value: point[series] as number }));
  }, [history, range, series]);

  const chart = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map(point => point.value);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const span = max - min || 1;
    const start = points[0].t;
    const duration = points[points.length - 1].t - start || 1;
    const x = (time: number) => ((time - start) / duration) * WIDTH;
    const y = (value: number) => HEIGHT - ((value - min) / span) * HEIGHT;
    return {
      path: points.map((point, index) => `${index ? 'L' : 'M'}${x(point.t).toFixed(1)},${y(point.value).toFixed(1)}`).join(''),
      zeroY: y(0),
      min: Math.min(...values),
      max: Math.max(...values),
      last: values[values.length - 1],
    };
  }, [points]);

  return (
    <div className="mb-2" data-testid="kimchi-trend">
      <div className="flex items-center justify-between mb-1 gap-1">
        <span className="font-semibold">{t('kimchiTrend')}</span>
        <div className="flex gap-1">
          <Segmented
            value={series}
            onChange={setSeries}
            options={[
              { value: 'upbit', label: 'BTC', ariaLabel: t('kimchiTrendBtc') },
              { value: 'tether', label: 'USDT', ariaLabel: t('kimchiTrendTether') },
            ]}
          />
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: '1d', label: '24h' },
              { value: '7d', label: '7d' },
            ]}
          />
        </div>
      </div>
      <div className="rounded-md border border-tile-border bg-tile px-2 py-1.5">
        {chart ? (
          <>
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-14" preserveAspectRatio="none" role="img" aria-label={t('kimchiTrend')}>
              <line x1="0" x2={WIDTH} y1={chart.zeroY} y2={chart.zeroY} className="stroke-stroke-weak" strokeDasharray="3 3" />
              <path d={chart.path} fill="none" strokeWidth="1.5" className={chart.last >= 0 ? 'stroke-up' : 'stroke-down'} vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="num flex justify-between text-cap-s text-fg-subtle">
              <span>
                {t('low')} {formatPercent(chart.min)}
              </span>
              <span className={`font-semibold ${chart.last >= 0 ? 'text-up' : 'text-down'}`}>{formatPercent(chart.last)}</span>
              <span>
                {t('high')} {formatPercent(chart.max)}
              </span>
            </div>
          </>
        ) : (
          <div className="py-3 text-center text-cap-s text-fg-faint">{t('kimchiTrendEmpty')}</div>
        )}
      </div>
    </div>
  );
};
