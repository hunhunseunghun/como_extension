import { useState, useCallback, useRef, useEffect } from 'react';
import type { Time } from 'lightweight-charts';
import { splitGlobalSymbol } from '@/constants/exchanges';
import type { ExchangePlatform } from '@/types';

export interface ChartDataPoint {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

type Exchange = ExchangePlatform;

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

// axios 대신 fetch로 받는다(번들 크기). params는 쿼리 문자열로 붙인다.
const getJson = async <T = unknown>(
  url: string,
  { params, headers, signal }: { params?: Record<string, string | number>; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<T> => {
  const query = params ? `?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}` : '';
  const response = await fetch(`${url}${query}`, { headers, signal });
  if (!response.ok) throw new Error(`Request failed with status code ${response.status}`);
  return response.json() as Promise<T>;
};

// 차트 캐시: 모든 행이 함께 쓰고(가상 스크롤로 행이 사라져도 유지), 봉 길이에 맞춰 오래된 데이터는 다시 받는다.
const CACHE_LIMIT = 30;
const chartCache = new Map<string, { data: ChartDataPoint[]; at: number }>();
const cacheTtl = (timeframe: string) =>
  timeframe === '1m' ? 30_000 : /^(3|5|10|15)m$/.test(timeframe) ? 60_000 : /m$/.test(timeframe) ? 120_000 : 600_000;
const readCache = (key: string, timeframe: string) => {
  const entry = chartCache.get(key);
  if (!entry || Date.now() - entry.at > cacheTtl(timeframe)) return null;
  // 최근에 쓴 항목을 뒤로 보내 오래 안 쓴 것부터 지운다.
  chartCache.delete(key);
  chartCache.set(key, entry);
  return entry.data;
};
const writeCache = (key: string, data: ChartDataPoint[]) => {
  chartCache.delete(key);
  chartCache.set(key, { data, at: Date.now() });
  if (chartCache.size > CACHE_LIMIT) chartCache.delete(chartCache.keys().next().value as string);
};

export const useChartData = (symbol?: string, exchange: Exchange = 'binance', timeframe: string = '1d') => {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // 새 요청·닫기 때 이전 재시도와 진행 중인 요청을 정리한다. 남겨 두면 닫은 차트가 계속 다시 요청한다.
  const cancelPending = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelPending();
    };
  }, [cancelPending]);

  const fetchData = useCallback(
    async (attempt: number = 0) => {
      if (!symbol) {
        setError('No symbol provided');
        return;
      }

      cancelPending();
      const cacheKey = `${exchange}-${symbol}-${timeframe}`;
      const cached = readCache(cacheKey, timeframe);
      if (cached) {
        setChartData(cached);
        setError(null);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const currentTime = Math.floor(Date.now());
        const { data } = await fetchChartData(symbol, exchange, timeframe, controller.signal);
        const formattedData = formatChartData(data, exchange, currentTime);

        if (!formattedData.length) {
          throw new Error(`No valid data points for ${symbol}`);
        }

        writeCache(cacheKey, formattedData);
        if (!isMountedRef.current || controller.signal.aborted) return;
        setChartData(formattedData);
        setError(null);
      } catch (err) {
        if (!isMountedRef.current || controller.signal.aborted) return;
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
    [symbol, exchange, timeframe, cancelPending],
  );

  return { chartData, loading, error, fetchData, cancel: cancelPending };
};

// CoinDCX 캔들 API는 BTCINR 대신 I-BTC_INR 같은 페어 코드를 쓴다. 마켓 목록은 한 번만 받는다.
let coindcxPairsPromise: Promise<Record<string, string>> | null = null;
const getCoindcxPair = async (symbol: string) => {
  coindcxPairsPromise ??= getJson<{ coindcx_name: string; pair: string }[]>('https://api.coindcx.com/exchange/v1/markets_details')
    .then(data => Object.fromEntries(data.map(market => [market.coindcx_name, market.pair])))
    .catch(error => {
      coindcxPairsPromise = null;
      throw error;
    });
  return (await coindcxPairsPromise)[symbol];
};

type Kline = [number, string, string, string, string];

// 거래소마다 다른 캔들 응답을 바이낸스 형식 [ms, 시가, 고가, 저가, 종가]로 맞춘다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toKlines = (exchange: Exchange, data: any): BinanceKline[] | UpbitCandle[] | BithumbCandle[] => {
  const asKline = (time: number, open: unknown, high: unknown, low: unknown, close: unknown): Kline => [
    time,
    String(open),
    String(high),
    String(low),
    String(close),
  ];
  switch (exchange) {
    case 'bybit':
      return data?.result?.list;
    case 'okx':
    case 'bitget':
      return data?.data;
    case 'coinbase': // [초, 저가, 고가, 시가, 종가]
      return (data as number[][])?.map(([time, low, high, open, close]) =>
        asKline(time * 1000, open, high, low, close),
      ) as unknown as BinanceKline[];
    case 'kraken': {
      // { result: { XXBTZUSD: [[초, 시가, 고가, 저가, 종가, ...]], last } }
      const rows = Object.entries(data?.result ?? {}).find(([key]) => key !== 'last')?.[1] as unknown[][] | undefined;
      return rows?.map(([time, open, high, low, close]) =>
        asKline(Number(time) * 1000, open, high, low, close),
      ) as unknown as BinanceKline[];
    }
    case 'coindcx':
      return (data as { time: number; open: number; high: number; low: number; close: number }[])?.map(candle =>
        asKline(candle.time, candle.open, candle.high, candle.low, candle.close),
      ) as unknown as BinanceKline[];
    default:
      return data;
  }
};

const fetchChartData = async (symbol: string, exchange: Exchange, timeframe: string = '1d', signal?: AbortSignal) => {
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

  const getBitgetGranularity = (tf: string) => {
    const intervals: Record<string, string> = {
      '1m': '1min',
      '3m': '3min',
      '5m': '5min',
      '15m': '15min',
      '30m': '30min',
      '60m': '1h',
      '240m': '4h',
      '1d': '1day',
      '1w': '1week',
      '1M': '1M',
    };
    return intervals[tf] || '1day';
  };

  const getKrakenInterval = (tf: string) => {
    const intervals: Record<string, number> = {
      '1m': 1,
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '60m': 60,
      '240m': 240,
      '1d': 1440,
      '1w': 10080,
    };
    return intervals[tf] || 1440;
  };

  const getCoindcxInterval = (tf: string) => {
    const intervals: Record<string, string> = {
      '1m': '1m',
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

  const coindcxPair = exchange === 'coindcx' ? await getCoindcxPair(symbol) : '';

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
    bitget: {
      url: 'https://api.bitget.com/api/v2/spot/market/candles',
      params: { symbol, granularity: getBitgetGranularity(timeframe), limit: 200 },
    },
    kraken: {
      url: 'https://api.kraken.com/0/public/OHLC',
      params: { pair: symbol, interval: getKrakenInterval(timeframe) },
    },
    coindcx: {
      url: 'https://public.coindcx.com/market_data/candles',
      params: { pair: coindcxPair, interval: getCoindcxInterval(timeframe), limit: 200 },
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
  const data = await getJson(config.url, { params: config.params, headers: config.headers, signal });
  return { data: toKlines(exchange, data) };
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
