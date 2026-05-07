import { useEffect } from 'react';
import {
  BinanceWebsocketTicker,
  ExchangePlatform,
  maxChagneRateCoin,
  UpbitTicker,
  BithumbTicker,
  BinanceTicker,
  KimchiPremium,
} from '@/types';

type TickerTypes = UpbitTicker | BithumbTicker | BinanceTicker;

export const usePort = (
  setTickers: React.Dispatch<React.SetStateAction<{ [key: string]: TickerTypes }>>,
  setExchangePlatform: React.Dispatch<React.SetStateAction<ExchangePlatform>>,
  setExchangeRateUSD: React.Dispatch<React.SetStateAction<number>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
  updatedVersionHandler: (data: string) => void,
  setMaxChangeRateCoin: React.Dispatch<React.SetStateAction<maxChagneRateCoin>>,
  setKimchiPremium: React.Dispatch<React.SetStateAction<KimchiPremium>>,
) => {
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'popup' });
    let isInitialLoad = true;

    port.onMessage.addListener(({ type, data }) => {
      switch (type) {
        case 'upbitWebsocketTicker':
        case 'bithumbWebsocketTicker':
          setTickers(prev => ({ ...prev, [data?.code]: { ...prev[data?.code], ...data } }));
          setIsLoading(false);
          break;
        case 'binanceWebsocketTicker':
          setTickers(prev => {
            const updateTickers = { ...prev };
            data.forEach((ticker: { s: string } & BinanceWebsocketTicker) => {
              if (ticker.s) {
                updateTickers[ticker.s] = { ...updateTickers[ticker.s], ...ticker };
              }
            });
            return updateTickers;
          });
          setIsLoading(false);
          break;
        case 'upbitTickers':
        case 'bithumbTickers':
        case 'binanceTickers':
          setTickers(data);
          setIsLoading(false);
          break;
        case 'activeExchange':
          setExchangePlatform(data);
          setIsLoading(false);
          break;
        case 'exchangeRateUSD':
          if (isInitialLoad) {
            setExchangeRateUSD(data);
            isInitialLoad = false;
          }
          break;
        case 'updatedVersion':
          updatedVersionHandler(data);
          break;
        case 'maxChangeRate':
          setMaxChangeRateCoin(data);
          break;
        case 'kimchiPremium':
          setKimchiPremium(data);
      }
    });

    port.onDisconnect.addListener(() => {
      setIsLoading(true);
      setTickers({});
      setTimeout(() => chrome.runtime.connect({ name: 'popup' }), 500);
    });

    chrome.runtime.sendMessage({ action: 'getActiveExchange' });

    return () => port.disconnect();
  }, [
    setTickers,
    setExchangePlatform,
    setExchangeRateUSD,
    setIsLoading,
    updatedVersionHandler,
    setMaxChangeRateCoin,
    setKimchiPremium,
  ]);
};
