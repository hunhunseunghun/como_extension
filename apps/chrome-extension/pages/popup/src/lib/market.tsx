import { createContext, useContext } from 'react';
import type { DisplayCurrency } from '@/i18n';
import type { CoinMarket } from '@/types';

export type FiatRates = Record<string, number>; // 1 USD 당 각 통화
export type MarketStats = {
  fearGreed: { value: number; classification: string } | null;
  btcDominance: number | null;
  fundingRate: number | null;
};

type MarketContextValue = {
  // 한국수출입은행·네이버 USD/KRW 환율 (원화 환산은 이 값을 우선한다)
  exchangeRateUSD: number;
  fiatRates: FiatRates;
  marketStats: MarketStats | null;
  coinMarket?: CoinMarket | null;
};

export const MarketContext = createContext<MarketContextValue>({ exchangeRateUSD: 0, fiatRates: {}, marketStats: null });
export const useMarket = () => useContext(MarketContext);

// 금액을 다른 통화로 바꾼다. USDT는 USD로 본다. 환율이 없으면 null.
export const convertFiat = (
  amount: number,
  from: string,
  to: string,
  { exchangeRateUSD, fiatRates }: Pick<MarketContextValue, 'exchangeRateUSD' | 'fiatRates'>,
): number | null => {
  const normalize = (code: string) => (code === 'USDT' ? 'USD' : code);
  const source = normalize(from);
  const target = normalize(to);
  if (source === target) return amount;
  const perUsd = (code: string) => (code === 'USD' ? 1 : code === 'KRW' && exchangeRateUSD ? exchangeRateUSD : fiatRates[code]);
  const sourceRate = perUsd(source);
  const targetRate = perUsd(target);
  if (!sourceRate || !targetRate) return null;
  return (amount / sourceRate) * targetRate;
};

const ZERO_DECIMAL = new Set(['KRW', 'JPY', 'VND', 'IDR', 'NGN', 'PKR']);

// 1 미만 소액은 유효숫자로 보여 0으로 뭉개지지 않게 한다.
export const formatFiat = (value: number, currency: DisplayCurrency | 'USD', locale: string) => {
  const abs = Math.abs(value);
  const options: Intl.NumberFormatOptions =
    abs > 0 && abs < 1
      ? { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumSignificantDigits: 3 }
      : {
          style: 'currency',
          currency,
          currencyDisplay: 'narrowSymbol',
          maximumFractionDigits: ZERO_DECIMAL.has(currency) || abs >= 100_000 ? 0 : 2,
        };
  return value.toLocaleString(locale, options);
};
