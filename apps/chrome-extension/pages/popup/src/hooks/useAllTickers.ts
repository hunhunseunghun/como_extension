import { useEffect, useState } from 'react';
import { usePageVisible } from '@/hooks/usePageVisible';

export type TickerPrice = {
  exchange: string;
  market: string;
  currentPrice: number;
  changeRate?: number;
  koreanName?: string | null;
};

const REFRESH_INTERVAL = 2000;

// 백그라운드가 보관한 전 거래소 시세를 enabled 동안 주기적으로 받아온다. 키는 `${exchange}:${market}`.
export const useAllTickers = (enabled: boolean) => {
  const [prices, setPrices] = useState<Record<string, TickerPrice>>({});
  const visible = usePageVisible();

  useEffect(() => {
    if (!enabled || !visible) return;
    let isUnmounted = false;
    const load = () =>
      chrome.runtime.sendMessage({ action: 'getAllExchangesTickers' }, (tickers?: TickerPrice[]) => {
        if (isUnmounted || chrome.runtime.lastError || !Array.isArray(tickers)) return;
        setPrices(Object.fromEntries(tickers.map(ticker => [`${ticker.exchange}:${ticker.market}`, ticker])));
      });
    load();
    const intervalId = setInterval(load, REFRESH_INTERVAL);
    return () => {
      isUnmounted = true;
      clearInterval(intervalId);
    };
  }, [enabled, visible]);

  return prices;
};
