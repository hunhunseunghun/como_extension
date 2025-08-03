import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickSeries } from 'lightweight-charts';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import React from 'react';
import { useChartData } from '@/hooks/useChartData';

interface ChartTooltipProps {
  children: React.ReactNode;
  className: string;
  symbol?: string;
  exchange?: 'binance' | 'upbit' | 'bithumb' | 'coinbase';
  wideSize: boolean;
  timeframe: string;
}

const formatPrice = (price: number): string => {
  const absPrice = Math.abs(price);

  const formatFixed = (num: number, digits: number) => num.toFixed(digits).replace(/\.?0+$/, '');

  if (absPrice >= 1_000_000_000) {
    return `${formatFixed(price / 1_000_000_000, 2)}B`;
  } else if (absPrice >= 1_000_000) {
    return `${formatFixed(price / 1_000_000, 2)}M`;
  } else if (absPrice >= 1_000) {
    return `${formatFixed(price / 1_000, 2)}K`;
  } else if (absPrice >= 1) {
    return formatFixed(price, 2);
  } else {
    return formatFixed(price, 9); // 소수일 경우 최대 9자리
  }
};

// 전역 상태 관리를 위한 Context
const ChartContext = React.createContext<{
  activeChart: string | null;
  setActiveChart: (symbol: string | null) => void;
}>({
  activeChart: null,
  setActiveChart: () => {},
});

const getTimeframeConfig = (timeframe: string) => {
  switch (timeframe) {
    case '1m':
    case '3m':
    case '5m':
    case '10m':
    case '15m':
    case '30m':
      return {
        dateFormat: 'HH:mm',
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000);
          return date.toLocaleTimeString('ko-KR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
        },
        timeVisible: true,
        secondsVisible: false,
      };
    case '60m':
    case '240m':
      return {
        dateFormat: "yyyy/MM/dd HH'H'",
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hour = String(date.getHours()).padStart(2, '0');
          return `${year}/${month}/${day} ${hour}H`;
        },
        timeVisible: true,
        secondsVisible: false,
      };
    case '1d':
      return {
        dateFormat: 'yyyy/MM/dd',
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}/${month}/${day}`;
        },
        timeVisible: false,
        secondsVisible: false,
      };
    case '1M':
      return {
        dateFormat: 'yyyy/MM',
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          return `${year}/${month}`;
        },
        timeVisible: false,
        secondsVisible: false,
      };
    default:
      return {
        dateFormat: 'yyyy/MM/dd',
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000);
          return date.toLocaleDateString('ko-KR', { timeZone: 'UTC' });
        },
        timeVisible: false,
        secondsVisible: false,
      };
  }
};

const ChartToolTip: React.FC<ChartTooltipProps> = ({
  children,
  className,
  symbol,
  exchange = 'binance',
  wideSize,
  timeframe,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { chartData, loading, error, fetchData } = useChartData(symbol, exchange, timeframe);
  const { activeChart, setActiveChart } = React.useContext(ChartContext);

  const TOOLTIP_WIDTH = wideSize ? 500 : 290;
  const TOOLTIP_HEIGHT = wideSize ? 300 : 170;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && containerRef.current) {
        const tooltipElement = document.querySelector('.tooltip');
        if (tooltipElement && !tooltipElement.contains(event.target as Node)) {
          setIsOpen(false);
          setActiveChart(null);
          chartRef.current?.remove();
          chartRef.current = null;
          seriesRef.current = null;
          setPosition(null);
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, setActiveChart]);

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
            style: 2,
            visible: true,
            color: 'rgba(255, 255, 255, 0.2)',
          },
          horzLines: {
            style: 2,
            visible: true,
            color: 'rgba(255, 255, 255, 0.2)',
          },
        },
        rightPriceScale: {
          visible: true,
          borderVisible: true,
          entireTextOnly: true,
        },
        localization: {
          priceFormatter: formatPrice,
        },
        timeScale: { visible: true, borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 20 },
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
    const config = getTimeframeConfig(timeframe);
    chartRef.current!.applyOptions({
      localization: {
        dateFormat: config.dateFormat,
        timeFormatter: config.timeFormatter,
      },
      timeScale: {
        timeVisible: config.timeVisible,
        secondsVisible: config.secondsVisible,
      },
    });
    chartRef.current.timeScale().fitContent();
  }, [chartData]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = () => {
      if (!isOpen) {
        setIsOpen(true);
        setActiveChart(symbol || null);
        fetchData();
        updatePosition();
      }
    };

    container.addEventListener('click', handleClick);
    return () => {
      container.removeEventListener('click', handleClick);
    };
  }, [fetchData, updatePosition, isOpen, symbol, setActiveChart]);

  useEffect(() => {
    if (isOpen) {
      const handleEvents = () => updatePosition();
      window.addEventListener('scroll', handleEvents);
      window.addEventListener('resize', handleEvents);
      return () => {
        window.removeEventListener('scroll', handleEvents);
        window.removeEventListener('resize', handleEvents);
      };
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (isOpen && chartData.length && !loading && !error) {
      renderChart();
    }
  }, [isOpen, chartData, loading, error, renderChart]);

  useEffect(() => {
    if (isOpen && activeChart && activeChart !== symbol) {
      setIsOpen(false);
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setPosition(null);
    }
  }, [activeChart, symbol]);

  const tooltipContent = useMemo(
    () => (
      <div
        className={cn(
          'tooltip absolute bg-black/80 shadow-lg rounded-lg z-51 p-1',
          wideSize ? 'w-[505px] h-[300px]' : 'w-[300px] h-[170px]',
        )}
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
              <a href="https://www.tradingview.com" className="text-gray-400" target="_blank" rel="noopener noreferrer">
                No data available
              </a>
            )}
          </div>
        )}
      </div>
    ),
    [position, chartData, loading, error, fetchData, wideSize],
  );

  return (
    <div ref={containerRef} className={`${className} relative transition-all duration-500 ease-out cursor-pointer`}>
      {children}
      {isOpen && createPortal(tooltipContent, document.body)}
    </div>
  );
};

// Context Provider 컴포넌트
export const ChartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeChart, setActiveChart] = useState<string | null>(null);

  return <ChartContext.Provider value={{ activeChart, setActiveChart }}>{children}</ChartContext.Provider>;
};

export default ChartToolTip;
