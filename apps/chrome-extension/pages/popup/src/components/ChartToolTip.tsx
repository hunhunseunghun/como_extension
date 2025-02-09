// import { useState, useRef, useEffect, useCallback } from 'react';
// import axios from 'axios';
// import { createChart, ISeriesApi, IChartApi, CandlestickSeries } from 'lightweight-charts';
// import { createPortal } from 'react-dom';

// interface ChartDataPoint {
//   time: string;
//   open: number;
//   high: number;
//   low: number;
//   close: number;
// }

// interface ChartTooltipProps {
//   children: React.ReactNode;
//   className: string;
//   symbol?: string;
//   exchange?: 'binance' | 'upbit' | 'bithumb';
// }

// const formatDateToString = (timestamp: number): string => {
//   const date = new Date(timestamp * 1000);
//   return date.toISOString().split('T')[0]; // "YYYY-MM-DD"
// };

// const useChartData = (symbol?: string, exchange: 'binance' | 'upbit' | 'bithumb' = 'binance') => {
//   const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [cache, setCache] = useState<Record<string, ChartDataPoint[]>>({});

//   const fetchData = useCallback(async () => {
//     if (!symbol) {
//       setError('No symbol provided');
//       return;
//     }

//     const cacheKey = `${exchange}-${symbol}`;
//     if (cache[cacheKey]) {
//       setChartData(cache[cacheKey]);
//       return;
//     }

//     setLoading(true);
//     try {
//       let response;
//       let formattedData: ChartDataPoint[];
//       const currentTime = Math.floor(Date.now() / 1000);
//       console.log(`Current time (UTC seconds): ${currentTime}`);

//       if (exchange === 'binance') {
//         response = await axios.get(`https://api.binance.com/api/v3/klines`, {
//           params: {
//             symbol: symbol.replace('/', ''),
//             interval: '1d',
//             limit: 30,
//           },
//         });
//         const data = response.data;
//         console.log(`Raw Binance API response for ${symbol}:`, JSON.stringify(data, null, 2));

//         if (!Array.isArray(data) || data.length === 0) {
//           throw new Error(`Invalid Binance response for symbol: ${symbol}`);
//         }

//         formattedData = data.reduce((acc: ChartDataPoint[], item: any, index: number) => {
//           const timeNum = Math.floor(item[0] / 1000);
//           if (timeNum >= currentTime) {
//             console.warn(`Future or current timestamp detected at index ${index} for ${symbol}: ${timeNum}`);
//             return acc;
//           }

//           const time = formatDateToString(timeNum);
//           const open = parseFloat(item[1]);
//           const high = parseFloat(item[2]);
//           const low = parseFloat(item[3]);
//           const close = parseFloat(item[4]);

//           if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
//             console.error(`Invalid numeric value at index ${index} for ${symbol}:`, { open, high, low, close });
//             return acc;
//           }

//           acc.push({ time, open, high, low, close });
//           return acc;
//         }, []);

//         if (formattedData.length === 0) {
//           throw new Error(`No valid data points after filtering for ${symbol}`);
//         }
//       } else if (exchange === 'upbit') {
//         response = await axios.get(`https://api.upbit.com/v1/candles/days?market=${symbol}&count=30`);
//         const data = response.data;
//         console.log(`Raw Upbit API response for ${symbol}:`, JSON.stringify(data, null, 2));

//         if (!Array.isArray(data) || data.length === 0) {
//           throw new Error(`Invalid Upbit response for symbol: ${symbol}`);
//         }

//         formattedData = data.reduce((acc: ChartDataPoint[], item: any, index: number) => {
//           const requiredFields = ['candle_date_time_utc', 'opening_price', 'high_price', 'low_price', 'trade_price'];
//           const missingField = requiredFields.find(field => item[field] == null || item[field] === '');
//           if (missingField) {
//             console.error(`Missing or empty ${missingField} in Upbit data at index ${index} for ${symbol}:`, item);
//             return acc;
//           }

//           const date = new Date(item.candle_date_time_utc);
//           if (isNaN(date.getTime())) {
//             console.error(`Invalid date string at index ${index} for ${symbol}:`, item.candle_date_time_utc);
//             return acc;
//           }
//           const timeNum = Math.floor(date.getTime() / 1000);
//           console.log(`Index ${index} timeNum: ${timeNum}, currentTime: ${currentTime}`);
//           if (timeNum >= currentTime) {
//             console.warn(`Future or current timestamp detected at index ${index} for ${symbol}: ${timeNum}`);
//             return acc;
//           }

//           const time = formatDateToString(timeNum);
//           const open = parseFloat(String(item.opening_price));
//           const high = parseFloat(String(item.high_price));
//           const low = parseFloat(String(item.low_price));
//           const close = parseFloat(String(item.trade_price));

//           if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
//             console.error(`Invalid value in Upbit data at index ${index} for ${symbol}:`, {
//               open,
//               high,
//               low,
//               close,
//               raw: item,
//             });
//             return acc;
//           }

//           acc.push({ time, open, high, low, close });
//           return acc;
//         }, []);

//         // 시간순으로 정렬 (오름차순: 오래된 날짜 -> 최신 날짜)
//         formattedData.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

//         if (formattedData.length === 0) {
//           throw new Error(`No valid data points after filtering for ${symbol}`);
//         }
//       } else {
//         throw new Error(`Exchange ${exchange} is not implemented yet`);
//       }

//       console.log(`Formatted ${exchange} data for ${symbol}:`, formattedData);
//       setCache(prev => ({ ...prev, [cacheKey]: formattedData }));
//       setChartData(formattedData);
//     } catch (err) {
//       setError(err instanceof Error ? err.message : 'Unknown error');
//       console.error(`Error fetching ${exchange} data for ${symbol}:`, err);
//       setTimeout(fetchData, 2000);
//     } finally {
//       setLoading(false);
//     }
//   }, [symbol, exchange, cache]);

//   return { chartData, loading, error, fetchData };
// };

// const ChartToolTip: React.FC<ChartTooltipProps> = ({ children, className, symbol, exchange = 'binance' }) => {
//   const containerRef = useRef<HTMLDivElement>(null);
//   const chartRef = useRef<IChartApi | null>(null);
//   const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
//   const [isHovered, setIsHovered] = useState(false);
//   const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
//   const { chartData, loading, error, fetchData } = useChartData(symbol, exchange);

//   const popupWidth = window.innerWidth;
//   const popupHeight = window.innerHeight;
//   const tooltipWidth = 250;
//   const tooltipHeight = 150;

//   useEffect(() => {
//     const handleMouseEnter = () => {
//       console.log(`Mouse entered for ${symbol} (${exchange})`);
//       setIsHovered(true);
//       fetchData();
//       updatePosition();
//     };
//     const handleMouseLeave = () => {
//       setIsHovered(false);
//       chartRef.current?.remove();
//       chartRef.current = null;
//       seriesRef.current = null;
//       setPosition(null);
//     };

//     const container = containerRef.current;
//     container?.addEventListener('mouseenter', handleMouseEnter);
//     container?.addEventListener('mouseleave', handleMouseLeave);

//     return () => {
//       container?.removeEventListener('mouseenter', handleMouseEnter);
//       container?.removeEventListener('mouseleave', handleMouseLeave);
//     };
//   }, [fetchData, symbol, exchange]);

//   const updatePosition = useCallback(() => {
//     if (!containerRef.current) return;
//     const rect = containerRef.current.getBoundingClientRect();

//     let left = rect.left + window.scrollX;
//     let top = rect.top + window.scrollY + rect.height;

//     if (left + tooltipWidth > popupWidth) left = popupWidth - tooltipWidth;
//     if (left < 0) left = 0;
//     if (top + tooltipHeight > popupHeight) top = rect.top + window.scrollY - tooltipHeight;
//     if (top < 0) top = 0;

//     setPosition({ left, top });
//   }, [popupWidth, popupHeight]);

//   useEffect(() => {
//     window.addEventListener('scroll', updatePosition);
//     window.addEventListener('resize', updatePosition);
//     return () => {
//       window.removeEventListener('scroll', updatePosition);
//       window.removeEventListener('resize', updatePosition);
//     };
//   }, [updatePosition]);

//   const renderChart = useCallback(() => {
//     const chartContainer = document.querySelector('.chart-container') as HTMLDivElement;
//     if (!chartContainer) {
//       console.error('Chart container not found');
//       return;
//     }
//     if (!chartData || chartData.length === 0) {
//       console.warn(`No valid chart data for ${symbol} (${exchange})`);
//       return;
//     }

//     if (chartRef.current) {
//       chartRef.current.remove();
//       chartRef.current = null;
//       seriesRef.current = null;
//     }

//     chartRef.current = createChart(chartContainer, {
//       width: 250,
//       height: 150,
//       layout: { background: { color: 'transparent' }, textColor: '#d1d4dc', fontSize: 10 },
//       grid: { vertLines: { visible: false }, horzLines: { visible: false } },
//       rightPriceScale: { visible: true, borderVisible: false, entireTextOnly: true },
//       timeScale: { visible: true, borderVisible: false, timeVisible: true, secondsVisible: false },
//       crosshair: { mode: 0 },
//       handleScroll: false,
//       handleScale: false,
//     });

//     seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
//       upColor: '#ef4444',
//       downColor: '#3b82f6',
//       borderVisible: false,
//       wickUpColor: '#ef4444',
//       wickDownColor: '#3b82f6',
//     });

//     if (seriesRef.current) {
//       try {
//         console.log(`Setting chart data for ${symbol} (${exchange}):`, chartData);
//         console.log(
//           'Detailed chart data:',
//           JSON.stringify(
//             chartData.map((d, i) => ({
//               index: i,
//               time: d.time,
//               open: d.open,
//               high: d.high,
//               low: d.low,
//               close: d.close,
//             })),
//             null,
//             2,
//           ),
//         );

//         const isValidData = chartData.every(
//           d =>
//             typeof d.time === 'string' &&
//             d.time.length === 10 &&
//             Number.isFinite(d.open) &&
//             Number.isFinite(d.high) &&
//             Number.isFinite(d.low) &&
//             Number.isFinite(d.close),
//         );
//         if (!isValidData) {
//           console.error(`Invalid chart data detected for ${symbol} (${exchange}):`, chartData);
//           throw new Error('Invalid chart data');
//         }

//         // 중복 시간 체크
//         const timeSet = new Set(chartData.map(d => d.time));
//         if (timeSet.size !== chartData.length) {
//           console.error(`Duplicate time values detected in chart data for ${symbol} (${exchange}):`, chartData);
//           throw new Error('Duplicate time values');
//         }

//         seriesRef.current.setData(chartData);
//         chartRef.current.timeScale().fitContent();
//       } catch (e) {
//         console.error(`Failed to set chart data for ${symbol} (${exchange}):`, e, chartData);
//       }
//     } else {
//       console.error('Series is null, cannot set data');
//     }
//   }, [chartData, symbol, exchange]);

//   useEffect(() => {
//     if (isHovered && chartData.length && !loading && !error) {
//       renderChart();
//     }
//   }, [isHovered, chartData, loading, error, renderChart]);

//   const tooltipContent = isHovered ? (
//     <div
//       className="tooltip absolute bg-black/80 shadow-lg rounded-lg z-[9999] w-[250px] h-[150px] pointer-events-none p-1"
//       style={position ? { left: `${position.left}px`, top: `${position.top}px` } : { display: 'none' }}>
//       <div
//         className="chart-container w-full h-full hidden"
//         style={{ display: chartData.length && !loading && !error ? 'block' : 'none' }}
//       />
//       {(loading || error || !chartData.length) && (
//         <div className="w-full h-full flex items-center justify-center text-gray-300">
//           {loading && (
//             <div className="w-6 h-6 border-2 border-t-2 border-gray-200 border-t-gray-300 rounded-full animate-spin" />
//           )}
//           {error && (
//             <div className="flex items-center">
//               <span className="text-red-400">{error}</span>
//               <button className="ml-2 text-gray-300 underline hover:text-gray-100" onClick={fetchData}>
//                 Retry
//               </button>
//             </div>
//           )}
//           {!loading && !error && !chartData.length && (
//             <a href="https://www.tradingview.com" className="text-gray-400" target="_blank" rel="noopener noreferrer">
//               No data available
//             </a>
//           )}
//         </div>
//       )}
//     </div>
//   ) : null;

//   return (
//     <div ref={containerRef} className={`${className} relative transition-all duration-500 ease-out`}>
//       {children}
//       {createPortal(tooltipContent, document.body)}
//     </div>
//   );
// };

// export default ChartToolTip;
import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { createChart, ISeriesApi, IChartApi, CandlestickSeries } from 'lightweight-charts';
import { createPortal } from 'react-dom';
import { ColumnDef } from '@tanstack/react-table';
import { BithumbTicker } from '@/types';
import { Star, ArrowRightLeft, ChevronsUpDown } from 'lucide-react';
import { WarningIcon } from '@/components/ui/warningIcon';
import { getRegExp } from 'korean-regexp';
import FlashCell from '@/components/FlashCell';
import ChartToolTip from '@/components/ChartToolTip';

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

const formatDateToString = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toISOString().split('T')[0]; // "YYYY-MM-DD"
};

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

    setLoading(true);
    try {
      let response;
      let formattedData: ChartDataPoint[];
      const currentTime = Math.floor(Date.now() / 1000);

      if (exchange === 'binance') {
        response = await axios.get(`https://api.binance.com/api/v3/klines`, {
          params: {
            symbol: symbol.replace('/', ''),
            interval: '1d',
            limit: 30,
          },
        });
        const data = response.data;

        if (!Array.isArray(data) || data.length === 0) {
          throw new Error(`Invalid Binance response for symbol: ${symbol}`);
        }

        formattedData = data.reduce((acc: ChartDataPoint[], item: any, index: number) => {
          const timeNum = Math.floor(item[0] / 1000);
          if (timeNum >= currentTime) return acc;

          const time = formatDateToString(timeNum);
          const open = parseFloat(item[1]);
          const high = parseFloat(item[2]);
          const low = parseFloat(item[3]);
          const close = parseFloat(item[4]);

          if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
            return acc;
          }

          acc.push({ time, open, high, low, close });
          return acc;
        }, []);

        if (formattedData.length === 0) {
          throw new Error(`No valid data points after filtering for ${symbol}`);
        }
      } else if (exchange === 'upbit') {
        response = await axios.get(`https://api.upbit.com/v1/candles/days?market=${symbol}&count=30`);
        const data = response.data;

        if (!Array.isArray(data) || data.length === 0) {
          throw new Error(`Invalid Upbit response for symbol: ${symbol}`);
        }

        formattedData = data.reduce((acc: ChartDataPoint[], item: any, index: number) => {
          const requiredFields = ['candle_date_time_utc', 'opening_price', 'high_price', 'low_price', 'trade_price'];
          const missingField = requiredFields.find(field => item[field] == null || item[field] === '');
          if (missingField) return acc;

          const date = new Date(item.candle_date_time_utc);
          if (isNaN(date.getTime())) return acc;
          const timeNum = Math.floor(date.getTime() / 1000);
          if (timeNum >= currentTime) return acc;

          const time = formatDateToString(timeNum);
          const open = parseFloat(String(item.opening_price));
          const high = parseFloat(String(item.high_price));
          const low = parseFloat(String(item.low_price));
          const close = parseFloat(String(item.trade_price));

          if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
            return acc;
          }

          acc.push({ time, open, high, low, close });
          return acc;
        }, []);

        formattedData.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        if (formattedData.length === 0) {
          throw new Error(`No valid data points after filtering for ${symbol}`);
        }
      } else if (exchange === 'bithumb') {
        const formattedSymbol = symbol.replace('/', '_'); // 예: BTC/KRW -> BTC_KRW
        response = await axios.get(`https://api.bithumb.com/v1/candlestick/${formattedSymbol}/1d`);
        const data = response.data.data;

        if (!Array.isArray(data) || data.length === 0) {
          throw new Error(`Invalid Bithumb response for symbol: ${symbol}`);
        }

        formattedData = data.reduce((acc: ChartDataPoint[], item: any, index: number) => {
          const timeNum = Math.floor(item[0] / 1000); // 밀리초를 초로 변환
          if (timeNum >= currentTime) return acc;

          const time = formatDateToString(timeNum);
          const open = parseFloat(item[1]);
          const high = parseFloat(item[2]);
          const low = parseFloat(item[3]);
          const close = parseFloat(item[4]);

          if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
            return acc;
          }

          acc.push({ time, open, high, low, close });
          return acc;
        }, []);

        formattedData.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        if (formattedData.length === 0) {
          throw new Error(`No valid data points after filtering for ${symbol}`);
        }
      } else {
        throw new Error(`Exchange ${exchange} is not implemented yet`);
      }

      setCache(prev => ({ ...prev, [cacheKey]: formattedData }));
      setChartData(formattedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setTimeout(fetchData, 2000);
    } finally {
      setLoading(false);
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
  }, [fetchData, symbol, exchange]);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    let left = rect.left + window.scrollX;
    let top = rect.top + window.scrollY + rect.height;

    if (left + tooltipWidth > popupWidth) left = popupWidth - tooltipWidth;
    if (left < 0) left = 0;
    if (top + tooltipHeight > popupHeight) top = rect.top + window.scrollY - tooltipHeight;
    if (top < 0) top = 0;

    setPosition({ left, top });
  }, [popupWidth, popupHeight]);

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
    if (!chartContainer || !chartData || chartData.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    chartRef.current = createChart(chartContainer, {
      width: 250,
      height: 150,
      layout: { background: { color: 'transparent' }, textColor: '#d1d4dc', fontSize: 10 },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: true, borderVisible: false, entireTextOnly: true },
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

    if (seriesRef.current) {
      try {
        const isValidData = chartData.every(
          d =>
            typeof d.time === 'string' &&
            d.time.length === 10 &&
            Number.isFinite(d.open) &&
            Number.isFinite(d.high) &&
            Number.isFinite(d.low) &&
            Number.isFinite(d.close),
        );
        if (!isValidData) throw new Error('Invalid chart data');

        const timeSet = new Set(chartData.map(d => d.time));
        if (timeSet.size !== chartData.length) throw new Error('Duplicate time values');

        seriesRef.current.setData(chartData);
        chartRef.current.timeScale().fitContent();
      } catch (e) {
        console.error(`Failed to set chart data for ${symbol} (${exchange}):`, e);
      }
    }
  }, [chartData, symbol, exchange]);

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
            <a href="https://www.tradingview.com" className="text-gray-400" target="_blank" rel="noopener noreferrer">
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
