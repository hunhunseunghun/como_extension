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
export type Ticker = UpbitTicker | BithumbTicker;
