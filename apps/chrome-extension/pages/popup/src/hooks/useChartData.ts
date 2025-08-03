import { useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { Time } from 'lightweight-charts';

export interface ChartDataPoint {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

type Exchange = 'binance' | 'upbit' | 'bithumb' | 'coinbase';

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
  market: string;
  candle_date_time_utc: string;
  candle_date_time_kst: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  timestamp: number;
  candle_acc_trade_price: number;
  candle_acc_trade_volume: number;
  unit?: number;
}

interface BithumbCandle {
  market: string;
  candle_date_time_utc: string;
  candle_date_time_kst: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  timestamp: number;
  candle_acc_trade_price: number;
  candle_acc_trade_volume: number;
  unit?: number;
}

interface CoinbaseCandle {
  0: number; // Start time (timestamp in seconds)
  1: number; // Low price
  2: number; // High price
  3: number; // Open price
  4: number; // Close price
  5: number; // Volume
}

const isValidNumeric = (value: number) => Number.isFinite(value);

export const useChartData = (symbol?: string, exchange: Exchange = 'binance', timeframe: string = '1d') => {
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
      const currentTime = Math.floor(Date.now());
      const { data } = await fetchChartData(symbol, exchange, timeframe);
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
    return intervals[tf] || '24h';
  };

  const getCoinbaseInterval = (tf: string) => {
    const intervals: Record<string, number> = {
      '1m': 60,
      '3m': 180,
      '5m': 300,
      '10m': 600,
      '15m': 900,
      '30m': 1800,
      '60m': 3600,
      '240m': 14400,
      '1d': 86400,
      '1w': 604800,
      '1M': 2592000,
    };
    return intervals[tf] || 86400;
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
    coinbase: {
      url: `https://api.exchange.coinbase.com/products/${symbol}/candles`,
      params: { granularity: getCoinbaseInterval(timeframe) },
    },
  };

  const config = configs[exchange];
  return axios.get<
    Exchange extends 'binance'
      ? BinanceKline[]
      : Exchange extends 'upbit'
        ? UpbitCandle[]
        : Exchange extends 'bithumb'
          ? BithumbCandle[]
          : CoinbaseCandle[]
  >(config.url, { params: config.params, headers: config.headers });
};

const formatChartData = (
  data: BinanceKline[] | UpbitCandle[] | BithumbCandle[] | CoinbaseCandle[],
  exchange: Exchange,
  currentTime: number,
): ChartDataPoint[] => {
  if (!Array.isArray(data) || !data.length) {
    throw new Error(`Invalid response from ${exchange}`);
  }

  const formatters: Record<
    Exchange,
    (item: BinanceKline | UpbitCandle | BithumbCandle | CoinbaseCandle) => {
      timeNum: number;
      open: number;
      high: number;
      low: number;
      close: number;
    }
  > = {
    binance: item => ({
      timeNum: Math.floor(Number((item as BinanceKline)[0] + 9 * 60 * 60 * 1000) / 1000),
      open: parseFloat((item as BinanceKline)[1]),
      high: parseFloat((item as BinanceKline)[2]),
      low: parseFloat((item as BinanceKline)[3]),
      close: parseFloat((item as BinanceKline)[4]),
    }),
    upbit: item => ({
      timeNum: Math.floor(Number((item as UpbitCandle).timestamp + 9 * 60 * 60 * 1000) / 1000),
      open: (item as UpbitCandle).opening_price,
      high: (item as UpbitCandle).high_price,
      low: (item as UpbitCandle).low_price,
      close: (item as UpbitCandle).trade_price,
    }),
    bithumb: item => ({
      timeNum: Math.floor(Number((item as BithumbCandle).timestamp + 9 * 60 * 60 * 1000) / 1000),
      open: (item as BithumbCandle).opening_price,
      high: (item as BithumbCandle).high_price,
      low: (item as BithumbCandle).low_price,
      close: (item as BithumbCandle).trade_price,
    }),
    coinbase: item => ({
      timeNum: (item as CoinbaseCandle)[0],
      open: (item as CoinbaseCandle)[3],
      high: (item as CoinbaseCandle)[2],
      low: (item as CoinbaseCandle)[1],
      close: (item as CoinbaseCandle)[4],
    }),
  } as const;

  const formatter = formatters[exchange];
  return data
    .reduce((acc: ChartDataPoint[], item: BinanceKline | UpbitCandle | BithumbCandle | CoinbaseCandle) => {
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
        acc.push({ time: timeNum as Time, open, high, low, close });
      }
      return acc;
    }, [])
    .sort((a, b) => Number(a.time) - Number(b.time));
};
