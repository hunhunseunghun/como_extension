import type { MessageKey } from '@/i18n';
import type { ExchangePlatform, GlobalExchange, KrwExchange, MarketType } from '@/types';
// 거래소 로고는 확장에 넣어 둔다(외부 이미지 서버에 요청하지 않고, 오프라인·첫 실행에도 바로 보인다).
import upbitLogo from '@/assets/exchanges/upbit.png';
import bithumbLogo from '@/assets/exchanges/bithumb.png';
import binanceLogo from '@/assets/exchanges/binance.png';
import bybitLogo from '@/assets/exchanges/bybit.png';
import coinbaseLogo from '@/assets/exchanges/coinbase.png';
import okxLogo from '@/assets/exchanges/okx.png';
import bitgetLogo from '@/assets/exchanges/bitget.png';
import krakenLogo from '@/assets/exchanges/kraken.png';
import coindcxLogo from '@/assets/exchanges/coindcx.png';
import coinoneLogo from '@/assets/exchanges/coinone.png';
import digitalxLogo from '@/assets/exchanges/digitalx.png';

type ExchangeMeta = {
  key: ExchangePlatform;
  labelKey: MessageKey;
  logo: string;
};

export const EXCHANGES: Record<ExchangePlatform, ExchangeMeta> = {
  upbit: {
    key: 'upbit',
    labelKey: 'exchange_upbit',
    logo: upbitLogo,
  },
  bithumb: {
    key: 'bithumb',
    labelKey: 'exchange_bithumb',
    logo: bithumbLogo,
  },
  binance: {
    key: 'binance',
    labelKey: 'exchange_binance',
    logo: binanceLogo,
  },
  bybit: {
    key: 'bybit',
    labelKey: 'exchange_bybit',
    logo: bybitLogo,
  },
  coinbase: {
    key: 'coinbase',
    labelKey: 'exchange_coinbase',
    logo: coinbaseLogo,
  },
  okx: {
    key: 'okx',
    labelKey: 'exchange_okx',
    logo: okxLogo,
  },
  bitget: {
    key: 'bitget',
    labelKey: 'exchange_bitget',
    logo: bitgetLogo,
  },
  kraken: {
    key: 'kraken',
    labelKey: 'exchange_kraken',
    logo: krakenLogo,
  },
  coindcx: {
    key: 'coindcx',
    labelKey: 'exchange_coindcx',
    logo: coindcxLogo,
  },
  coinone: {
    key: 'coinone',
    labelKey: 'exchange_coinone',
    logo: coinoneLogo,
  },
  digitalx: {
    key: 'digitalx',
    labelKey: 'exchange_digitalx',
    logo: digitalxLogo,
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
  coinone: ['KRW'],
  digitalx: ['KRW'],
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

export const KRW_EXCHANGES: readonly KrwExchange[] = ['upbit', 'bithumb', 'coinone', 'digitalx'];
export const isKrwExchange = (exchange: string): exchange is KrwExchange =>
  (KRW_EXCHANGES as readonly string[]).includes(exchange);

// 처음 고를 때 호스트 권한을 받는 거래소. 기존 사용자에게 업데이트 때 새 권한 확인 창이 뜨지 않게 선택 권한으로 둔다.
export const OPTIONAL_EXCHANGE_ORIGINS: Partial<Record<ExchangePlatform, string[]>> = {
  coinone: ['https://api.coinone.co.kr/*'],
  digitalx: ['https://api.digitalx.miraeasset.com/*'],
};
