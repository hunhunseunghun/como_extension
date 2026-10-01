import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import type { Time } from 'lightweight-charts';
import { splitGlobalSymbol } from '@/constants/exchanges';

export interface ChartDataPoint {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

type Exchange = 'binance' | 'upbit' | 'bithumb' | 'bybit' | 'okx' | 'coinbase';

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

const isValidNumeric = (value: number) => Number.isFinite(value);

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export const useChartData = (symbol?: string, exchange: Exchange = 'binance', timeframe: string = '1d') => {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Record<string, ChartDataPoint[]>>({});
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const fetchData = useCallback(
    async (attempt: number = 0) => {
      if (!symbol) {
        setError('No symbol provided');
        return;
      }

      const cacheKey = `${exchange}-${symbol}-${timeframe}`;
      if (cacheRef.current[cacheKey]) {
        setChartData(cacheRef.current[cacheKey]);
        setError(null);
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
        if (!isMountedRef.current) return;
        setChartData(formattedData);
        setError(null);
      } catch (err) {
        if (!isMountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
        if (attempt < MAX_RETRIES - 1) {
          retryTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) fetchData(attempt + 1);
          }, RETRY_DELAY_MS);
        }
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    },
    [symbol, exchange, timeframe],
  );

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

  const getBybitInterval = (tf: string) => {
    const intervals: Record<string, string> = {
      '1m': '1',
      '3m': '3',
      '5m': '5',
      '15m': '15',
      '30m': '30',
      '60m': '60',
      '240m': '240',
      '1d': 'D',
      '1w': 'W',
      '1M': 'M',
    };
    return intervals[tf] || 'D';
  };

  // OKX 일·주·월봉 기본값은 UTC+8 기준이라 다른 거래소와 맞추기 위해 UTC 봉을 쓴다.
  const getOkxInterval = (tf: string) => {
    const intervals: Record<string, string> = {
      '1m': '1m',
      '3m': '3m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '60m': '1H',
      '240m': '4H',
      '1d': '1Dutc',
      '1w': '1Wutc',
      '1M': '1Mutc',
    };
    return intervals[tf] || '1Dutc';
  };

  // Coinbase는 1·5·15분, 1·6시간, 1일 봉만 지원한다. 없는 봉은 일봉으로 보여준다.
  const getCoinbaseGranularity = (tf: string) => {
    const granularities: Record<string, number> = { '1m': 60, '5m': 300, '15m': 900, '60m': 3600, '1d': 86400 };
    return granularities[tf] || 86400;
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
    bybit: {
      url: 'https://api.bybit.com/v5/market/kline',
      params: { category: 'spot', symbol, interval: getBybitInterval(timeframe), limit: 200 },
    },
    coinbase: {
      url: `https://api.exchange.coinbase.com/products/${splitGlobalSymbol(symbol).base}-${splitGlobalSymbol(symbol).quote}/candles`,
      params: { granularity: getCoinbaseGranularity(timeframe) },
    },
    okx: {
      url: 'https://www.okx.com/api/v5/market/candles',
      params: {
        instId: `${splitGlobalSymbol(symbol).base}-${splitGlobalSymbol(symbol).quote}`,
        bar: getOkxInterval(timeframe),
        limit: 200,
      },
    },
  };

  const config = configs[exchange];
  // Bybit·OKX·Coinbase는 [시각, 시가, 고가, 저가, 종가, ...] 배열을 감싸서 보내므로 꺼내서 바이낸스 형식으로 맞춘다.
  return axios.get(config.url, { params: config.params, headers: config.headers }).then(response => ({
    data: (exchange === 'bybit'
      ? response.data?.result?.list
      : exchange === 'okx'
        ? response.data?.data
        : exchange === 'coinbase'
          ? // [초, 저가, 고가, 시가, 종가] → 바이낸스 [ms, 시가, 고가, 저가, 종가]
            (response.data as number[][])?.map(([time, low, high, open, close]) => [
              time * 1000,
              String(open),
              String(high),
              String(low),
              String(close),
            ])
          : response.data) as BinanceKline[] | UpbitCandle[] | BithumbCandle[],
  }));
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
    'binance' | 'upbit' | 'bithumb',
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
      timeNum: Math.floor((item as UpbitCandle).timestamp / 1000),
      open: (item as UpbitCandle).opening_price,
      high: (item as UpbitCandle).high_price,
      low: (item as UpbitCandle).low_price,
      close: (item as UpbitCandle).trade_price,
    }),
    bithumb: item => ({
      timeNum: Math.floor((item as BithumbCandle).timestamp / 1000),
      open: (item as BithumbCandle).opening_price,
      high: (item as BithumbCandle).high_price,
      low: (item as BithumbCandle).low_price,
      close: (item as BithumbCandle).trade_price,
    }),
  } as const;

  const formatter = formatters[exchange === 'upbit' || exchange === 'bithumb' ? exchange : 'binance'];
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
        acc.push({ time: timeNum as Time, open, high, low, close });
      }
      return acc;
    }, [])
    .sort((a, b) => Number(a.time) - Number(b.time));
};
