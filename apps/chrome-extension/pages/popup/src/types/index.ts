export type ExchangePlatform = 'upbit' | 'bithumb' | 'binance' | 'coinbase';
export type MarketType = 'KRW' | 'BTC' | 'USDT' | 'USD' | 'EUR' | 'GBP';
export type FavoriteCoins = { upbit: string[]; bithumb: string[]; binance: string[]; coinbase: string[] };
export type maxChagneRateCoin = { exchange: string; market: string; changeRate: number };
export type UpbitTicker = {
  market: string;
  trade_date: string;
  trade_time: string;
  trade_timestamp: number;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  prev_closing_price: number;
  change: 'RISE' | 'EVEN' | 'FALL';
  change_price: number;
  change_rate: number;
  signed_change_price: number;
  signed_change_rate: number;
  trade_volume: number;
  acc_trade_price: number;
  acc_trade_price_24h: number;
  acc_trade_volume: number;
  acc_trade_volume_24h: number;
  highest_52_week_price: number;
  highest_52_week_date: string;
  lowest_52_week_price: number;
  lowest_52_week_date: string;
  timestamp: number;
  trade_date_kst: string;
  trade_time_kst: string;
  type?: string;
  code?: string;
  ask_bid?: 'ASK' | 'BID';
  acc_ask_volume?: number;
  acc_bid_volume?: number;
  market_state?: 'PREVIEW' | 'ACTIVE' | 'DELISTED';
  is_trading_suspended?: boolean;
  delisting_date?: string | null;
  market_warning?: 'NONE' | 'CAUTION';
  stream_type?: 'SNAPSHOT' | 'REALTIME';
  korean_name?: string;
  english_name?: string;
  market_event: {
    warning: boolean;
    caution: boolean;
  };
};
export type BithumbTicker = {
  market: string; // 종목 구분 코드
  trade_date: string; // 최근 거래 일자 (UTC, yyyyMMdd)
  trade_time: string; // 최근 거래 시각 (UTC, HHmmss)
  trade_date_kst: string; // 최근 거래 일자 (KST, yyyyMMdd)
  trade_time_kst: string; // 최근 거래 시각 (KST, HHmmss)
  trade_timestamp: number; // 최근 거래 일시 (UTC, Unix Timestamp)
  opening_price: number; // 시가
  high_price: number; // 고가
  low_price: number; // 저가
  trade_price: number; // 종가 (현재가)
  prev_closing_price: number; // 전일 종가 (KST 0시 기준)
  change: 'EVEN' | 'RISE' | 'FALL'; // 변화 상태 (보합, 상승, 하락)
  change_price: number; // 변화액의 절대값
  change_rate: number; // 변화율의 절대값
  signed_change_price: number; // 부호가 있는 변화액
  signed_change_rate: number; // 부호가 있는 변화율
  trade_volume: number; // 가장 최근 거래량
  acc_trade_price: number; // 누적 거래대금 (KST 0시 기준)
  acc_trade_price_24h: number; // 24시간 누적 거래대금
  acc_trade_volume: number; // 누적 거래량 (KST 0시 기준)
  acc_trade_volume_24h: number; // 24시간 누적 거래량
  highest_52_week_price: number; // 52주 신고가
  highest_52_week_date: string; // 52주 신고가 달성일 (yyyy-MM-dd)
  lowest_52_week_price: number; // 52주 신저가
  lowest_52_week_date: string; // 52주 신저가 달성일 (yyyy-MM-dd)
  timestamp: number; // 타임스탬프
  type?: string; // ticker: 현재가
  code?: string; // 마켓 코드 (ex. KRW-BTC)
  ask_bid?: 'ASK' | 'BID'; // 매수/매도 구분
  acc_ask_volume?: number; // 누적 매도량
  acc_bid_volume?: number; // 누적 매수량
  market_state?: string; // 거래 상태
  is_trading_suspended?: boolean; // 거래 정지 여부
  delisting_date?: string; // 거래지원 종료일 (Date)
  market_warning?: 'NONE' | 'CAUTION'; // 유의 종목 여부
  stream_type?: 'SNAPSHOT' | 'REALTIME'; // 스트림 타입
  korean_name?: string;
  english_name?: string;
};

export type BinanceTicker = {
  market: string;
  symbol: string; // 업비트: "market": "KRW-BTC"
  priceChange: string; // 업비트: "change_price": -50000.0
  priceChangePercent: string; // 업비트: "change_rate": -0.00077
  weightedAvgPrice: string; // 업비트: 없음 (24시간 가중평균가 제공 안 함)
  openPrice: string; // 업비트: "opening_price": 64500000.0
  highPrice: string; // 업비트: "high_price": 65000000.0
  lowPrice: string; // 업비트: "low_price": 64000000.0
  lastPrice: string; // 업비트: "trade_price": 64750000.0
  volume: string; // 업비트: "acc_trade_volume_24h": 34.5678 (24시간 거래량)
  quoteVolume: string; // 업비트: "acc_trade_price_24h": 1234567890.0 (24시간 거래 대금)
  openTime: number; // 업비트: 없음 (시작 시간 제공 안 함)
  closeTime: number; // 업비트: "timestamp": 1710410096000
  firstId: number; // 업비트: 없음 (거래 ID 제공 안 함)
  lastId: number; // 업비트: 없음 (거래 ID 제공 안 함)
  e?: string; // 이벤트 유형 (업비트에는 해당 필드 없음)
  E?: number; // 이벤트 발생 시간 (업비트에는 해당 필드 없음)
  s?: string; // 심볼 → 업비트: "market"
  p?: string; // 24시간 가격 변동 → 업비트: "change_price"
  P?: string; // 24시간 변동률 (%) → 업비트: "change_rate"
  w?: string; // 가중 평균 가격 → 업비트: "average_price"
  x?: string; // 24시간 전 가격 → 업비트: "opening_price"
  c?: string; // 현재 가격 (lastPrice) → 업비트: "trade_price"
  Q?: string; // 현재 가격에서의 거래량 (업비트에는 해당 필드 없음)
  b?: string; // 매수 호가 → 업비트: "bid_price"
  B?: string; // 매수 호가 수량 → 업비트: "bid_size"
  a?: string; // 매도 호가 → 업비트: "ask_price"
  A?: string; // 매도 호가 수량 → 업비트: "ask_size"
  o?: string; // 24시간 전 가격 (openPrice) → 업비트: "opening_price"
  h?: string; // 최고가 (highPrice) → 업비트: "high_price"
  l?: string; // 최저가 (lowPrice) → 업비트: "low_price"
  v?: string; // 거래량 (base asset) → 업비트: "acc_trade_volume"
  q?: string; // 거래대금 (quote asset) → 업비트: "acc_trade_price"
  O?: number; // 24시간 기준 시간 (openTime) → 업비트: "timestamp"
  C?: number; // 현재 시간 (closeTime) (업비트에는 해당 필드 없음)
  F?: number; // 첫 번째 거래 ID (업비트에는 해당 필드 없음)
  L?: number; // 마지막 거래 ID (업비트에는 해당 필드 없음)
  n?: number; // 거래 횟수 → 업비트: "trade_count"
  ask_bid?: 'ASK' | 'BID';
};

export type BinanceWebsocketTicker = {
  A: string; // Best ask price
  B: string; // Best bid price
  C: number; // Close time
  E: number; // Event time
  F: number; // First trade ID
  L: number; // Last trade ID
  O: number; // Open time
  P: string; // Price change percentage
  Q: string; // Last quantity
  a: string; // Best ask quantity
  b: string; // Best bid quantity
  c: string; // Last price
  e: string; // Event type (always "24hrTicker")
  h: string; // High price
  l: string; // Low price
  n: number; // Total number of trades
  o: string; // Open price
  p: string; // Price change
  q: string; // Total traded quote asset volume
  s: string; // Symbol (trading pair)
  v: string; // Total traded base asset volume
  w: string; // Weighted average price
  x: string; // Last price 24 hours ago
};

export type CoinbaseTicker = {
  market: string;
  symbol: string;
  product_id: string;
  price: string;
  open_24h: string;
  volume_24h: string;
  low_24h: string;
  high_24h: string;
  volume_30d: string;
  best_bid: string;
  best_ask: string;
  side: string;
  time: string;
  trade_id: number;
  last_size: string;
};

export type CoinbaseWebsocketTicker = {
  type: string;
  sequence: number;
  product_id: string;
  price: string;
  open_24h: string;
  volume_24h: string;
  low_24h: string;
  high_24h: string;
  volume_30d: string;
  best_bid: string;
  best_ask: string;
  side: string;
  time: string;
  trade_id: number;
  last_size: string;
};
