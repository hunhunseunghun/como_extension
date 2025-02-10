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
  exchange?: 'binance' | 'upbit' | 'bithumb'; // 거래소 선택
}

const useChartData = (symbol?: string, exchange: 'binance' | 'upbit' | 'bithumb' = 'binance') => {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, ChartDataPoint[]>>({});

  const fetchData = useCallback(async () => {
    if (!symbol) {
      setError('No symbol provided');
      return;
    }

    const cacheKey = `${exchange}-${symbol}`;
    if (cache[cacheKey]) {
      setChartData(cache[cacheKey]);
      return;
    }

    let hasTimedOut = false;
    const timer = setTimeout(() => {
      hasTimedOut = true;
      setLoading(true);
    }, 200);

    try {
      let response;
      let formattedData: ChartDataPoint[];

      if (exchange === 'binance') {
        response = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=30`);
        const data = response.data;
        if (!Array.isArray(data) || data.length === 0) throw new Error('Invalid Binance response');
        formattedData = data.map((item: [string, string, string, string, string]) => ({
          time: Math.floor(parseInt(item[0]) / 1000) as Time,
          open: parseFloat(item[1]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
          close: parseFloat(item[4]),
        }));
      } else if (exchange === 'upbit') {
        response = await axios.get(`https://api.upbit.com/v1/candles/days?market=${symbol}&count=30`);
        const data = response.data;
        if (!Array.isArray(data) || data.length === 0) throw new Error('Invalid Upbit response');
        formattedData = data.map((item: any) => ({
          time: Math.floor(new Date(item.candle_date_time_utc).getTime() / 1000) as Time,
          open: item.opening_price,
          high: item.high_price,
          low: item.low_price,
          close: item.trade_price,
        }));
      } else if (exchange === 'bithumb') {
        const [orderCurrency, paymentCurrency] = symbol.split('-'); // 예: BTC-KRW
        response = await axios.get(
          `https://api.bithumb.com/public/candlestick/${orderCurrency}_${paymentCurrency}/24h`,
        );
        const data = response.data.data;
        if (!Array.isArray(data) || data.length === 0) throw new Error('Invalid Bithumb response');
        formattedData = data
          .slice(-30) // 최근 30일만 가져오기
          .map((item: [number, string, string, string, string]) => ({
            time: Math.floor(item[0] / 1000) as Time,
            open: parseFloat(item[1]),
            close: parseFloat(item[2]),
            high: parseFloat(item[3]),
            low: parseFloat(item[4]),
          }));
      } else {
        throw new Error('Unsupported exchange');
      }

      setCache(prev => ({ ...prev, [cacheKey]: formattedData }));
      setChartData(formattedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setTimeout(fetchData, 2000);
    } finally {
      clearTimeout(timer);
      if (!hasTimedOut) setLoading(false);
      else setLoading(false);
    }
  }, [symbol, exchange, cache]);

  return { chartData, loading, error, fetchData };
};

const ChartToolTip: React.FC<ChartTooltipProps> = ({ children, className, symbol, exchange = 'binance' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const { chartData, loading, error, fetchData } = useChartData(symbol, exchange);

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
        fontSize: 10,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: {
        visible: true,
        borderVisible: false,
        entireTextOnly: true,
      },
      timeScale: {
        visible: true,
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 0 },
      handleScroll: false,
      handleScale: false,
    });

    seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#3b82f6',
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
            <a href="https://www.tradingview.com" className="text-gray-400" target="_blank">
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
