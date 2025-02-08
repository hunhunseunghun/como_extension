import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { createChart, IChartApi, ISeriesApi, CandlestickSeries } from 'lightweight-charts';
import { createPortal } from 'react-dom';

interface ChartDataPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ChartTooltipProps {
  children: React.ReactNode;
  className: string;
  symbol?: string;
  exchange?: 'binance' | 'upbit' | 'bithumb';
}

type Exchange = 'binance' | 'upbit' | 'bithumb';

interface BinanceKline {
  0: number; // Kline open time (timestamp in milliseconds)
  1: string; // Open price
  2: string; // High price
  3: string; // Low price
  4: string; // Close price
  5: string; // Volume
  6: number; // Kline close time (timestamp in milliseconds)
  7: string; // Quote asset volume
  8: number; // Number of trades
  9: string; // Taker buy base asset volume
  10: string; // Taker buy quote asset volume
  11: string; // Unused field (ignore)
}

interface UpbitCandle {
  candle_date_time_utc: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
}

interface BithumbCandle {
  timestamp: string;
  opening_price: string;
  high_price: string;
  low_price: string;
  trade_price: string;
}

const formatDateToString = (timestamp: number): string => new Date(timestamp * 1000).toISOString().split('T')[0];

const isValidNumeric = (value: number) => Number.isFinite(value);

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const formatPrice = (price: number): string => {
  const absPrice = Math.abs(price);
  if (absPrice >= 1_000_000_000) {
    return `${numberFormatter.format(price / 1_000_000_000)}B`;
  } else if (absPrice >= 1_000_000) {
    return `${numberFormatter.format(price / 1_000_000)}M`;
  } else if (absPrice >= 1_000) {
    return `${numberFormatter.format(price / 1_000)}K`;
  }
  return numberFormatter.format(price);
};

const useChartData = (symbol?: string, exchange: Exchange = 'binance') => {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Record<string, ChartDataPoint[]>>({});

  const fetchData = useCallback(async () => {
    if (!symbol) {
      setError('No symbol provided');
      return;
    }

    const cacheKey = `${exchange}-${symbol}`;
    if (cacheRef.current[cacheKey]) {
      setChartData(cacheRef.current[cacheKey]);
      return;
    }

    setLoading(true);
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const { data } = await fetchChartData(symbol, exchange);
      const formattedData = formatChartData(data, exchange, currentTime);

      if (!formattedData.length) {
        throw new Error(`No valid data points for ${symbol}`);
      }

      if (Object.keys(cacheRef.current).length >= 10) {
        delete cacheRef.current[Object.keys(cacheRef.current)[0]];
      }
      cacheRef.current[cacheKey] = formattedData;
      setChartData(formattedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setTimeout(fetchData, 2000);
    } finally {
      setLoading(false);
    }
  }, [symbol, exchange]);

  return { chartData, loading, error, fetchData };
};

const fetchChartData = (symbol: string, exchange: Exchange) => {
  const configs: Record<
    Exchange,
    { url: string; params?: Record<string, string | number>; headers?: Record<string, string> }
  > = {
    binance: {
      url: 'https://api.binance.com/api/v3/klines',
      params: { symbol: symbol.replace('/', ''), interval: '1d', limit: 30 },
    },
    upbit: {
      url: `https://api.upbit.com/v1/candles/days?market=${symbol}&count=30`,
    },
    bithumb: {
      url: `https://api.bithumb.com/v1/candles/days?market=${symbol.toUpperCase()}&count=30`,
      headers: { accept: 'application/json' },
    },
  };

  const config = configs[exchange];
  return axios.get<
    Exchange extends 'binance' ? BinanceKline[] : Exchange extends 'upbit' ? UpbitCandle[] : BithumbCandle[]
  >(config.url, { params: config.params, headers: config.headers });
};

const formatChartData = (
  data: BinanceKline[] | UpbitCandle[] | BithumbCandle[],
  exchange: Exchange,
  currentTime: number,
): ChartDataPoint[] => {
  if (!Array.isArray(data) || !data.length) {
    throw new Error(`Invalid response from ${exchange}`);
  }

  const formatters: Record<
    Exchange,
    (item: BinanceKline | UpbitCandle | BithumbCandle) => {
      timeNum: number;
      open: number;
      high: number;
      low: number;
      close: number;
    }
  > = {
    binance: item => ({
      timeNum: Math.floor((item as BinanceKline)[0] / 1000),
      open: parseFloat((item as BinanceKline)[1]),
      high: parseFloat((item as BinanceKline)[2]),
      low: parseFloat((item as BinanceKline)[3]),
      close: parseFloat((item as BinanceKline)[4]),
    }),
    upbit: item => ({
      timeNum: Math.floor(new Date((item as UpbitCandle).candle_date_time_utc).getTime() / 1000),
      open: (item as UpbitCandle).opening_price,
      high: (item as UpbitCandle).high_price,
      low: (item as UpbitCandle).low_price,
      close: (item as UpbitCandle).trade_price,
    }),
    bithumb: item => ({
      timeNum: Math.floor(Number((item as BithumbCandle).timestamp) / 1000),
      open: parseFloat((item as BithumbCandle).opening_price),
      high: parseFloat((item as BithumbCandle).high_price),
      low: parseFloat((item as BithumbCandle).low_price),
      close: parseFloat((item as BithumbCandle).trade_price),
    }),
  } as const;

  const formatter = formatters[exchange];
  return data
    .reduce((acc: ChartDataPoint[], item: BinanceKline | UpbitCandle | BithumbCandle) => {
      const { timeNum, open, high, low, close } = formatter(item);
      if (
        isValidNumeric(timeNum) &&
        timeNum > 0 &&
        timeNum <= currentTime &&
        isValidNumeric(open) &&
        isValidNumeric(high) &&
        isValidNumeric(low) &&
        isValidNumeric(close)
      ) {
        acc.push({ time: formatDateToString(timeNum), open, high, low, close });
      }
      return acc;
    }, [])
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
};

const ChartToolTip: React.FC<ChartTooltipProps> = ({ children, className, symbol, exchange = 'binance' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const { chartData, loading, error, fetchData } = useChartData(symbol, exchange);

  const TOOLTIP_WIDTH = 250;
  const TOOLTIP_HEIGHT = 150;

  const updatePosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const newLeft = Math.max(0, Math.min(rect.left + window.scrollX, window.innerWidth - TOOLTIP_WIDTH));
    const newTop =
      rect.top + window.scrollY + TOOLTIP_HEIGHT > window.innerHeight
        ? rect.top + window.scrollY - TOOLTIP_HEIGHT
        : rect.top + window.scrollY + rect.height;

    const adjustedTop = Math.max(0, newTop);
    setPosition(prev =>
      prev && prev.left === newLeft && prev.top === adjustedTop ? prev : { left: newLeft, top: adjustedTop },
    );
  }, []);

  const renderChart = useCallback(() => {
    const chartContainer = document.querySelector('.chart-container') as HTMLDivElement;
    if (!chartContainer || !chartData.length) return;

    if (!chartRef.current) {
      chartRef.current = createChart(chartContainer, {
        width: TOOLTIP_WIDTH,
        height: TOOLTIP_HEIGHT,
        layout: { background: { color: 'transparent' }, textColor: '#d1d4dc', fontSize: 8, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: {
          visible: true,
          borderVisible: false,
          entireTextOnly: true,
        },
        localization: {
          priceFormatter: formatPrice,
        },
        timeScale: { visible: true, borderVisible: false, timeVisible: true, secondsVisible: false },
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
    }

    seriesRef.current!.setData(chartData);
    chartRef.current.timeScale().fitContent();
  }, [chartData]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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

    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [fetchData, updatePosition]);

  useEffect(() => {
    if (!isHovered) return;

    const handleEvents = () => updatePosition();
    window.addEventListener('scroll', handleEvents);
    window.addEventListener('resize', handleEvents);
    return () => {
      window.removeEventListener('scroll', handleEvents);
      window.removeEventListener('resize', handleEvents);
    };
  }, [isHovered, updatePosition]);

  useEffect(() => {
    if (isHovered && chartData.length && !loading && !error) {
      renderChart();
    }
  }, [isHovered, chartData, loading, error, renderChart]);

  const tooltipContent = useMemo(
    () =>
      isHovered && (
        <div
          className="tooltip absolute bg-black/80 shadow-lg rounded-lg z-[9999] w-[250px] h-[150px] pointer-events-none p-1"
          style={position ? { left: `${position.left}px`, top: `${position.top}px` } : { display: 'none' }}>
          <div
            className="chart-container w-full h-full"
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
                <a
                  href="https://www.tradingview.com"
                  className="text-gray-400"
                  target="_blank"
                  rel="noopener noreferrer">
                  No data available
                </a>
              )}
            </div>
          )}
        </div>
      ),
    [isHovered, position, chartData, loading, error, fetchData],
  );

  return (
    <div
      ref={containerRef}
      className={`${className} relative transition-all duration-500 ease-out hover:cursor-pointer`}>
      {children}
      {createPortal(tooltipContent, document.body)}
    </div>
  );
};

export default ChartToolTip;
