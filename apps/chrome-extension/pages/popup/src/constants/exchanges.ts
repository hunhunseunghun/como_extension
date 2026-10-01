import type { MessageKey } from '@/i18n';
import type { ExchangePlatform, GlobalExchange } from '@/types';

type ExchangeMeta = {
  key: ExchangePlatform;
  labelKey: MessageKey;
  logo: string;
};

export const EXCHANGES: Record<ExchangePlatform, ExchangeMeta> = {
  upbit: {
    key: 'upbit',
    labelKey: 'exchange_upbit',
    logo: 'https://coin-images.coingecko.com/markets/images/117/large/upbit.png?1706864294',
  },
  bithumb: {
    key: 'bithumb',
    labelKey: 'exchange_bithumb',
    logo: 'https://coin-images.coingecko.com/markets/images/6/large/bithumb_BI.png?1706864248',
  },
  binance: {
    key: 'binance',
    labelKey: 'exchange_binance',
    logo: 'https://coin-images.coingecko.com/markets/images/469/large/Binance.png?1706864454',
  },
  bybit: {
    key: 'bybit',
    labelKey: 'exchange_bybit',
    logo: 'https://coin-images.coingecko.com/markets/images/698/large/bybit_spot.png?1706864649',
  },
  okx: {
    key: 'okx',
    labelKey: 'exchange_okx',
    logo: 'https://coin-images.coingecko.com/markets/images/96/large/WeChat_Image_20220117220452.png?1706864283',
  },
};

export const EXCHANGE_LIST = Object.values(EXCHANGES);

// USDT·BTC 마켓을 쓰는 해외 거래소. 백그라운드가 바이낸스와 같은 필드 형태로 맞춰 보낸다.
export const GLOBAL_EXCHANGES: readonly GlobalExchange[] = ['binance', 'bybit', 'okx'];
export const isGlobalExchange = (exchange: string): exchange is GlobalExchange =>
  (GLOBAL_EXCHANGES as readonly string[]).includes(exchange);

export const GLOBAL_QUOTES = ['USDT', 'BTC'] as const;

export const splitGlobalSymbol = (symbol: string) => {
  const quote = GLOBAL_QUOTES.find(q => symbol.endsWith(q)) ?? '';
  return { base: quote ? symbol.slice(0, -quote.length) : symbol, quote };
};

export const getGlobalTradeUrl = (exchange: GlobalExchange, symbol: string) => {
  const { base, quote } = splitGlobalSymbol(symbol);
  switch (exchange) {
    case 'binance':
      return `https://www.binance.com/en/trade/${symbol}?type=spot`;
    case 'bybit':
      return `https://www.bybit.com/trade/spot/${base}/${quote}`;
    case 'okx':
      return `https://www.okx.com/trade-spot/${base.toLowerCase()}-${quote.toLowerCase()}`;
  }
};
