import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { createChart, IChartApi, ISeriesApi, CandlestickSeries, IRange, Time } from 'lightweight-charts';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

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
  wideSize: boolean;
  timeframe?: string;
  setTimeframe: (value: string) => void;
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

const formatDateToString = (timestamp: number, timeframe: string = '1d'): string => {
  const date = new Date(timestamp * 1000);

  // 분봉/시간봉의 경우 시간까지 포함
  if (timeframe.includes('m') || timeframe.includes('h')) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  // 일봉/주봉/월봉의 경우 날짜만
  return date.toISOString().split('T')[0];
};

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

const useChartData = (symbol?: string, exchange: Exchange = 'binance', timeframe: string = '1d') => {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Record<string, ChartDataPoint[]>>({});

  const fetchData = useCallback(async () => {
    if (!symbol) {
      setError('No symbol provided');
      return;
    }

    const cacheKey = `${exchange}-${symbol}-${timeframe}`;
    if (cacheRef.current[cacheKey]) {
      setChartData(cacheRef.current[cacheKey]);
      return;
    }

    setLoading(true);
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const { data } = await fetchChartData(symbol, exchange, timeframe);
      const formattedData = formatChartData(data, exchange, currentTime, timeframe);

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
  }, [symbol, exchange, timeframe]);

  return { chartData, loading, error, fetchData };
};

const fetchChartData = (symbol: string, exchange: Exchange, timeframe: string = '1d') => {
  const getUpbitInterval = (tf: string) => {
    const intervals: Record<string, string> = {
      '1m': 'minutes/1',
      '3m': 'minutes/3',
      '5m': 'minutes/5',
      '10m': 'minutes/10',
      '15m': 'minutes/15',
      '30m': 'minutes/30',
      '60m': 'minutes/60',
      '240m': 'minutes/240',
      '1d': 'days',
      '1w': 'weeks',
      '1M': 'months',
    };
    return intervals[tf] || 'days';
  };

  const getBinanceInterval = (tf: string) => {
    const intervals: Record<string, string> = {
      '1m': '1m',
      '3m': '3m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '60m': '1h',
      '240m': '4h',
      '1d': '1d',
      '1w': '1w',
      '1M': '1M',
    };
    return intervals[tf] || '1d';
  };

  const getBithumbInterval = (tf: string) => {
    const intervals: Record<string, string> = {
      '1m': '1m',
      '3m': '3m',
      '5m': '5m',
      '10m': '10m',
      '30m': '30m',
      '60m': '1h',
      '240m': '4h',
      '1d': '24h',
      '1w': '1w',
      '1M': '1M',
    };
    return intervals[tf] || '24h';
  };

  const configs: Record<
    Exchange,
    { url: string; params?: Record<string, string | number>; headers?: Record<string, string> }
  > = {
    binance: {
      url: 'https://api.binance.com/api/v3/klines',
      params: {
        symbol: symbol.replace('/', ''),
        interval: getBinanceInterval(timeframe),
        limit: 200,
      },
    },
    upbit: {
      url: `https://api.upbit.com/v1/candles/${getUpbitInterval(timeframe)}`,
      params: { market: symbol, count: 200 },
    },
    bithumb: {
      url: `https://api.bithumb.com/v1/candles/${getBithumbInterval(timeframe)}`,
      params: { market: symbol.toUpperCase(), count: 200 },
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
  timeframe: string = '1d',
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
        acc.push({ time: formatDateToString(timeNum, timeframe), open, high, low, close });
      }
      return acc;
    }, [])
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
};

const ChartToolTip: React.FC<ChartTooltipProps> = ({
  children,
  className,
  symbol,
  exchange = 'binance',
  wideSize,
  timeframe = '1d',
  setTimeframe,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isClicked, setIsClicked] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const { chartData, loading, error, fetchData } = useChartData(symbol, exchange, timeframe);

  const TOOLTIP_WIDTH = wideSize ? 500 : 290;
  const TOOLTIP_HEIGHT = wideSize ? 300 : 170;

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
        layout: {
          background: { color: 'transparent' },
          textColor: '#d1d4dc',
          fontSize: wideSize ? 9 : 8,
          attributionLogo: false,
        },
        grid: {
          vertLines: {
            visible: true,
            style: 2,
            color: 'rgba(255, 255, 255, 0.2)',
          },
          horzLines: {
            visible: true,
            style: 2,
            color: 'rgba(255, 255, 255, 0.2)',
          },
        },
        rightPriceScale: {
          visible: true,
          borderVisible: false,
          entireTextOnly: true,
        },
        localization: {
          priceFormatter: formatPrice,
        },
        timeScale: { visible: true, borderVisible: true, timeVisible: true, secondsVisible: true },
        crosshair: { mode: 0 },
        handleScroll: true,
        handleScale: true,
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

    const handleClick = () => {
      setIsClicked(prev => !prev);
      if (!isClicked) {
        fetchData();
        updatePosition();
      } else {
        chartRef.current?.remove();
        chartRef.current = null;
        seriesRef.current = null;
        setPosition(null);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest('.dropdown-menu') ||
        target.closest('.dropdown-content') ||
        target.closest('[role="menu"]') ||
        target.closest('[data-radix-popper-content-wrapper]')
      ) {
        return;
      }
      if (container && !container.contains(target)) {
        setIsClicked(false);
        chartRef.current?.remove();
        chartRef.current = null;
        seriesRef.current = null;
        setPosition(null);
      }
    };

    const handleChartClick = (event: Event) => {
      event.stopPropagation();
    };

    container.addEventListener('click', handleClick);
    document.addEventListener('click', handleClickOutside);

    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) {
      chartContainer.addEventListener('click', handleChartClick as EventListener);
    }

    return () => {
      container.removeEventListener('click', handleClick);
      document.removeEventListener('click', handleClickOutside);
      if (chartContainer) {
        chartContainer.removeEventListener('click', handleChartClick as EventListener);
      }
    };
  }, [fetchData, updatePosition, isClicked]);

  useEffect(() => {
    if (!isClicked) return;

    const handleEvents = () => updatePosition();
    window.addEventListener('scroll', handleEvents);
    window.addEventListener('resize', handleEvents);

    const handleWheel = (event: Event) => {
      if (chartRef.current) {
        const timeScale = chartRef.current.timeScale();
        const wheelEvent = event as WheelEvent;
        const delta = wheelEvent.deltaY;
        const currentRange = timeScale.getVisibleRange();
        if (currentRange) {
          const currentSpan = Number(currentRange.to) - Number(currentRange.from);
          const zoomFactor = delta > 0 ? 1.1 : 0.9;
          const newSpan = currentSpan * zoomFactor;

          const minSpan = currentSpan * 0.1;
          const maxSpan = currentSpan * 2;

          if (newSpan >= minSpan && newSpan <= maxSpan) {
            const center = (Number(currentRange.from) + Number(currentRange.to)) / 2;
            const newRange = {
              from: center - newSpan / 2,
              to: center + newSpan / 2,
            } as IRange<Time>;
            timeScale.setVisibleRange(newRange);
          }
        }
      }
    };

    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) {
      chartContainer.addEventListener('wheel', handleWheel as EventListener);
    }

    return () => {
      window.removeEventListener('scroll', handleEvents);
      window.removeEventListener('resize', handleEvents);
      if (chartContainer) {
        chartContainer.removeEventListener('wheel', handleWheel as EventListener);
      }
    };
  }, [isClicked, updatePosition]);

  useEffect(() => {
    if (isClicked && chartData.length && !loading && !error) {
      renderChart();
    }
  }, [isClicked, chartData, loading, error, renderChart]);

  const tooltipContent = useMemo(
    () =>
      isClicked && (
        <div
          className={cn(
            'tooltip absolute bg-black/80 shadow-lg rounded-lg z-[9999] p-1',
            wideSize ? 'w-[510px] h-[300px]' : 'w-[305px] h-[170px]',
          )}
          style={position ? { left: `${position.left}px`, top: `${position.top}px` } : { display: 'none' }}>
          <div className="relative w-full h-full">
            <div
              className="chart-container w-full h-full"
              style={{ display: chartData.length && !loading && !error ? 'block' : 'none' }}
            />
            {chartData.length && !loading && !error && (
              <div className="absolute top-2 left-2 z-10 flex gap-2">
                {wideSize && (
                  <>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (chartRef.current) {
                          const timeScale = chartRef.current.timeScale();
                          const currentRange = timeScale.getVisibleLogicalRange();
                          if (currentRange) {
                            const newRange = {
                              from: currentRange.from,
                              to: currentRange.from + (currentRange.to - currentRange.from) * 0.7,
                            };
                            timeScale.setVisibleLogicalRange(newRange);
                          }
                        }
                      }}
                      className="w-6 h-6 flex items-center justify-center bg-black/50 hover:bg-black/70 text-white rounded-md transition-colors text-sm">
                      +
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (chartRef.current) {
                          const timeScale = chartRef.current.timeScale();
                          const currentRange = timeScale.getVisibleLogicalRange();
                          if (currentRange) {
                            const newRange = {
                              from: currentRange.from,
                              to: currentRange.from + (currentRange.to - currentRange.from) * 1.3,
                            };
                            timeScale.setVisibleLogicalRange(newRange);
                          }
                        }
                      }}
                      className="w-6 h-6 flex items-center justify-center bg-black/50 hover:bg-black/70 text-white rounded-md transition-colors text-sm">
                      -
                    </button>
                  </>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-white bg-black/50 hover:bg-black/70 rounded-md transition-colors dropdown-menu"
                    onClick={e => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}>
                    <span>
                      {timeframe === '1d'
                        ? '일봉'
                        : timeframe === '1w'
                          ? '주봉'
                          : timeframe === '1M'
                            ? '월봉'
                            : timeframe.includes('m')
                              ? `${timeframe.replace('m', '')}분`
                              : timeframe.includes('h')
                                ? `${timeframe.replace('h', '')}시간`
                                : ''}
                    </span>
                    <ChevronDown size={12} strokeWidth={3} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="dropdown-content z-[10000] min-w-[80px] p-1"
                    onClick={e => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    onPointerDownOutside={e => {
                      e.preventDefault();
                    }}
                    onInteractOutside={e => {
                      e.preventDefault();
                    }}>
                    <DropdownMenuItem
                      className="text-[10px] py-1 px-2"
                      onSelect={e => {
                        e.preventDefault();
                        setTimeframe('1m');
                      }}>
                      1분
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[10px] py-1 px-2"
                      onSelect={e => {
                        e.preventDefault();
                        setTimeframe('3m');
                      }}>
                      3분
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[10px] py-1 px-2"
                      onSelect={e => {
                        e.preventDefault();
                        setTimeframe('5m');
                      }}>
                      5분
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[10px] py-1 px-2"
                      onSelect={e => {
                        e.preventDefault();
                        setTimeframe('10m');
                      }}>
                      10분
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[10px] py-1 px-2"
                      onSelect={e => {
                        e.preventDefault();
                        setTimeframe('15m');
                      }}>
                      15분
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[10px] py-1 px-2"
                      onSelect={e => {
                        e.preventDefault();
                        setTimeframe('30m');
                      }}>
                      30분
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[10px] py-1 px-2"
                      onSelect={e => {
                        e.preventDefault();
                        setTimeframe('60m');
                      }}>
                      1시간
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[10px] py-1 px-2"
                      onSelect={e => {
                        e.preventDefault();
                        setTimeframe('240m');
                      }}>
                      4시간
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[10px] py-1 px-2"
                      onSelect={e => {
                        e.preventDefault();
                        setTimeframe('1d');
                      }}>
                      일봉
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[10px] py-1 px-2"
                      onSelect={e => {
                        e.preventDefault();
                        setTimeframe('1w');
                      }}>
                      주봉
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[10px] py-1 px-2"
                      onSelect={e => {
                        e.preventDefault();
                        setTimeframe('1M');
                      }}>
                      월봉
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
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
    [isClicked, position, chartData, loading, error, fetchData, wideSize, timeframe, setTimeframe],
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
