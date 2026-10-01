import type { MessageKey } from '@/i18n';
import type { ExchangePlatform, GlobalExchange, MarketType } from '@/types';

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
  coinbase: {
    key: 'coinbase',
    labelKey: 'exchange_coinbase',
    logo: 'https://coin-images.coingecko.com/markets/images/23/large/Coinbase_Coin_Primary.png?1706864258',
  },
  okx: {
    key: 'okx',
    labelKey: 'exchange_okx',
    logo: 'https://coin-images.coingecko.com/markets/images/96/large/WeChat_Image_20220117220452.png?1706864283',
  },
  bitget: {
    key: 'bitget',
    labelKey: 'exchange_bitget',
    logo: 'https://coin-images.coingecko.com/markets/images/540/large/2023-07-25_21.47.43.jpg?1706864507',
  },
  kraken: {
    key: 'kraken',
    labelKey: 'exchange_kraken',
    logo: 'https://coin-images.coingecko.com/markets/images/29/large/kraken.jpg?1706864265',
  },
  coindcx: {
    key: 'coindcx',
    labelKey: 'exchange_coindcx',
    logo: 'https://coin-images.coingecko.com/markets/images/520/large/coindcx.png?1706864493',
  },
};

export const EXCHANGE_LIST = Object.values(EXCHANGES);

// USDT·BTC 마켓을 쓰는 해외 거래소. 백그라운드가 바이낸스와 같은 필드 형태로 맞춰 보낸다.
export const GLOBAL_EXCHANGES: readonly GlobalExchange[] = [
  'binance',
  'bybit',
  'okx',
  'coinbase',
  'bitget',
  'kraken',
  'coindcx',
];
export const isGlobalExchange = (exchange: string): exchange is GlobalExchange =>
  (GLOBAL_EXCHANGES as readonly string[]).includes(exchange);

// USDT를 USD보다 먼저 확인해야 BTCUSDT가 BTCU + SDT처럼 잘못 나뉘지 않는다.
// 거래소별로 고를 수 있는 마켓(호가 통화). 첫 번째가 기본값이다.
export const MARKET_TYPES: Record<ExchangePlatform, readonly MarketType[]> = {
  upbit: ['KRW', 'BTC', 'USDT'],
  bithumb: ['KRW', 'BTC'],
  binance: ['USDT', 'BTC'],
  bybit: ['USDT', 'BTC'],
  okx: ['USDT', 'BTC'],
  bitget: ['USDT', 'BTC'],
  coinbase: ['USD'],
  kraken: ['USD'],
  coindcx: ['INR', 'USDT'],
};

export const GLOBAL_QUOTES = ['USDT', 'USD', 'INR', 'BTC'] as const;

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
    case 'coinbase':
      return `https://www.coinbase.com/advanced-trade/spot/${base}-${quote}`;
    case 'bitget':
      return `https://www.bitget.com/spot/${base}${quote}`;
    case 'kraken':
      return `https://pro.kraken.com/app/trade/${base.toLowerCase()}-${quote.toLowerCase()}`;
    case 'coindcx':
      return `https://coindcx.com/trade/${symbol}`;
  }
};
