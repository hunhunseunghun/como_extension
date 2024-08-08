export type ExchangePlatform = 'upbit';
export type MarketType = 'KRW' | 'BTC' | 'USDT';
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
  opening_price: number; //시가 00시 기준
  closing_price: number; // 종가 00시 기준
  min_price: number; //저가 00시 기준
  max_price: number; // 고가 00시 기준
  units_traded: number; // 거래량 00시 기준
  acc_trade_value: number; // 거래금액 00시 기준
  prev_closing_price: number; // 전일종가
  units_traded_24H: number; //최근 24시간 거래량
  acc_trade_value_24H: number; // 최근 24시간 거래금액
  flctate_24H: number; //최근 24시간 변동률
  date: number;
};
