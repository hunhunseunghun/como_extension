import { useEffect, useState } from 'react';
import { ChartCandlestick } from 'lucide-react';
import { loadChartData } from '@/hooks/useChartData';
import type { ExchangePlatform } from '@/types';

// 즐겨찾기 행의 최근 24시간(1시간 봉 24개) 추이. 차트 아이콘 자리에 그리고, 누르면 원래처럼 큰 차트가 열린다.
const POINTS = 24;
const REFRESH_MS = 5 * 60_000;

type Props = { symbol: string; exchange: ExchangePlatform; width?: number; height?: number };

export const Sparkline = ({ symbol, exchange, width = 40, height = 16 }: Props) => {
  const [closes, setCloses] = useState<number[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      loadChartData(symbol, exchange, '60m', controller.signal)
        .then(data => setCloses(data.slice(-POINTS).map(point => point.close)))
        .catch(() => {
          if (!controller.signal.aborted) setCloses([]);
        });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [symbol, exchange]);

  // 받아 오는 중이거나 실패하면 차트 아이콘을 그대로 보여 준다.
  if (!closes || closes.length < 2) return <ChartCandlestick size={16} />;

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const points = closes
    .map((close, index) => {
      const x = (index / (closes.length - 1)) * width;
      const y = height - 1 - ((close - min) / range) * (height - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const rising = closes[closes.length - 1] >= closes[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-testid="sparkline"
      aria-hidden
      className={rising ? 'text-up' : 'text-down'}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
};
