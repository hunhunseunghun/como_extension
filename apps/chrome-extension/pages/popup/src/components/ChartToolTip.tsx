import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { createChart, CandlestickSeries, ISeriesApi, IChartApi, Time } from 'lightweight-charts';
import { createPortal } from 'react-dom';

interface ChartDataPoint {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ChartTooltipProps {
  children: React.ReactNode;
  className: string;
  symbol?: string;
}

const useChartData = (symbol?: string) => {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, ChartDataPoint[]>>({});

  const fetchData = useCallback(async () => {
    if (!symbol) {
      setError('No symbol provided');
      return;
    }

    if (cache[symbol]) {
      setChartData(cache[symbol]);
      return;
    }

    let hasTimedOut = false;
    const timer = setTimeout(() => {
      hasTimedOut = true;
      setLoading(true);
    }, 200);

    try {
      const response = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=30`);
      const data = response.data;

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Invalid or empty API response');
      }

      const formattedData = data.map((item: [string, string, string, string, string]) => ({
        time: Math.floor(parseInt(item[0]) / 1000) as Time,
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
      }));

      setCache(prev => ({ ...prev, [symbol]: formattedData }));
      setChartData(formattedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setTimeout(fetchData, 2000);
    } finally {
      clearTimeout(timer);
      if (!hasTimedOut) setLoading(false);
      else setLoading(false);
    }
  }, [symbol, cache]);

  return { chartData, loading, error, fetchData };
};

const ChartToolTip: React.FC<ChartTooltipProps> = ({ children, className, symbol }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const { chartData, loading, error, fetchData } = useChartData(symbol);

  const popupWidth = window.innerWidth;
  const popupHeight = window.innerHeight;
  const tooltipWidth = 250;
  const tooltipHeight = 150;

  useEffect(() => {
    const handleMouseEnter = () => {
      setIsHovered(true);
      fetchData();
      updatePosition();
    };
    const handleMouseLeave = () => {
      setIsHovered(false);
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setPosition(null);
    };

    const container = containerRef.current;
    container?.addEventListener('mouseenter', handleMouseEnter);
    container?.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container?.removeEventListener('mouseenter', handleMouseEnter);
      container?.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [fetchData]);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    let left = rect.left + window.scrollX;
    let top = rect.top + window.scrollY + rect.height;

    if (left + tooltipWidth > popupWidth) {
      left = popupWidth - tooltipWidth;
    }
    if (left < 0) left = 0;

    if (top + tooltipHeight > popupHeight) {
      top = rect.top + window.scrollY - tooltipHeight;
    }
    if (top < 0) top = 0;

    setPosition({ left, top });
  }, [popupWidth, popupHeight, tooltipWidth, tooltipHeight]);

  useEffect(() => {
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [updatePosition]);

  const renderChart = useCallback(() => {
    const chartContainer = document.querySelector('.chart-container') as HTMLDivElement;
    if (!chartContainer || !chartData.length) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    chartRef.current = createChart(chartContainer, {
      width: 250,
      height: 150,
      layout: {
        background: { color: 'transparent' },
        textColor: '#d1d4dc',
        fontSize: 10, // X축, Y축 텍스트 크기 10px로 통합 설정
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: {
        visible: true,
        borderVisible: false,
        entireTextOnly: true, // 텍스트 잘림 방지
      },
      timeScale: {
        visible: true,
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 0 },
      handleScroll: false, // 로고 제거
      handleScale: false, // 로고 제거
    });

    seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
      upColor: '#ef4444', // 빨강 (상승)
      downColor: '#3b82f6', // 파랑 (하락)
      borderVisible: false,
      wickUpColor: '#ef4444',
      wickDownColor: '#3b82f6',
    });

    if (seriesRef.current) {
      seriesRef.current.setData(chartData);
    }

    chartRef.current.timeScale().fitContent();
  }, [chartData]);

  useEffect(() => {
    if (isHovered && chartData.length && !loading && !error) {
      renderChart();
    }
  }, [isHovered, chartData, loading, error, renderChart]);

  const tooltipContent = isHovered ? (
    <div
      className="tooltip absolute bg-black/80 shadow-lg rounded-lg z-[9999] w-[250px] h-[150px] pointer-events-none p-1"
      style={position ? { left: `${position.left}px`, top: `${position.top}px` } : { display: 'none' }}>
      <div
        className="chart-container w-full h-full hidden"
        style={{ display: chartData.length && !loading && !error ? 'block' : 'none' }}
      />
      {(loading || error || !chartData.length) && (
        <div className="w-full h-full flex items-center justify-center text-gray-300">
          {loading && (
            <div className="w-6 h-6 border-2 border-t-2 border-gray-200 border-t-gray-300 rounded-full animate-spin" />
          )}
          {error && (
            <div className="flex items-center">
              <span className="text-red-400">{error}</span>
              <button className="ml-2 text-gray-300 underline hover:text-gray-100" onClick={fetchData}>
                Retry
              </button>
            </div>
          )}
          {!loading && !error && !chartData.length && (
            <a href="https://www.tradingview.com" className="text-gray-400">
              No data available
            </a>
          )}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`${className} relative transition-all duration-500 ease-out`}>
      {children}
      {createPortal(tooltipContent, document.body)}
    </div>
  );
};

export default ChartToolTip;
