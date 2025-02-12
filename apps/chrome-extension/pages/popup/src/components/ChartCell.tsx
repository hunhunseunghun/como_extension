import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickSeries } from 'lightweight-charts';

interface ChartCellProps {
  initialData: { time: string; open: number; high: number; low: number; close: number }[];
  isVisible: boolean; // 툴팁 표시 여부
  onChartReady?: () => void; // 차트 준비 완료 시 호출
}

const ChartCell: React.FC<ChartCellProps> = ({ initialData, isVisible, onChartReady }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !isVisible) {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      return;
    }

    // 차트 생성
    const chart = createChart(chartContainerRef.current, {
      width: 200, // 툴팁 크기 고정
      height: 100,
      layout: {
        background: { color: 'transparent' },
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      timeScale: {
        visible: false,
        borderVisible: false,
      },
      rightPriceScale: {
        visible: false,
        borderVisible: false,
      },
      crosshair: {
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
        mode: 0,
      },
      handleScroll: false,
      handleScale: false,

      autoSize: false,
    });
    chartRef.current = chart;

    const candlestickSeries: ISeriesApi<'Candlestick'> = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    candlestickSeries.setData(initialData);

    if (onChartReady) onChartReady();

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [initialData, isVisible]);

  return (
    <div
      ref={chartContainerRef}
      style={{ width: '200px', height: '100px', position: 'absolute', zIndex: 10 }}
      className="hidden"
    />
  );
};

export default ChartCell;
