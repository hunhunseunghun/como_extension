import { useEffect, useRef } from 'react';
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
type TickerMap = { [key: string]: TickerTypes };

export const usePort = (
  setTickers: React.Dispatch<React.SetStateAction<TickerMap>>,
  setExchangePlatform: React.Dispatch<React.SetStateAction<ExchangePlatform>>,
  setExchangeRateUSD: React.Dispatch<React.SetStateAction<number>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
  updatedVersionHandler: (data: string) => void,
  setMaxChangeRateCoin: React.Dispatch<React.SetStateAction<maxChagneRateCoin>>,
  setKimchiPremium: React.Dispatch<React.SetStateAction<KimchiPremium>>,
) => {
  // 핸들러가 렌더마다 바뀌어도 포트를 다시 연결하지 않도록 ref로 최신 값을 참조한다.
  const updatedVersionHandlerRef = useRef(updatedVersionHandler);
  updatedVersionHandlerRef.current = updatedVersionHandler;

  useEffect(() => {
    let port: chrome.runtime.Port | null = null;
    let isUnmounted = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    // 웹소켓 틱을 모아 프레임당 한 번만 setState 한다.
    let pending: { [key: string]: Partial<TickerTypes> } = {};
    let frameId: number | null = null;

    const flush = () => {
      frameId = null;
      const updates = pending;
      pending = {};
      setTickers(prev => {
        const next = { ...prev };
        for (const key in updates) {
          next[key] = { ...next[key], ...updates[key] } as TickerTypes;
        }
        return next;
      });
      setIsLoading(false);
    };

    const queueTicker = (key: string, data: Partial<TickerTypes>) => {
      pending[key] = { ...pending[key], ...data };
      if (frameId === null) frameId = requestAnimationFrame(flush);
    };

    const clearPending = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      pending = {};
    };

    const connect = () => {
      port = chrome.runtime.connect({ name: 'popup' });

      port.onMessage.addListener(({ type, data }) => {
        switch (type) {
          case 'upbitWebsocketTicker':
          case 'bithumbWebsocketTicker':
            if (data?.code) queueTicker(data.code, data);
            break;
          case 'binanceWebsocketTicker':
          case 'bybitWebsocketTicker':
          case 'okxWebsocketTicker':
            data.forEach((ticker: { s: string } & BinanceWebsocketTicker) => {
              if (ticker.s) queueTicker(ticker.s, ticker as Partial<TickerTypes>);
            });
            break;
          case 'upbitTickers':
          case 'bithumbTickers':
          case 'binanceTickers':
          case 'bybitTickers':
          case 'okxTickers':
            clearPending();
            setTickers(data);
            setIsLoading(false);
            break;
          case 'activeExchange':
            setExchangePlatform(data);
            setIsLoading(false);
            break;
          case 'exchangeRateUSD':
            setExchangeRateUSD(Number(data) || 0);
            break;
          case 'updatedVersion':
            updatedVersionHandlerRef.current(data);
            break;
          case 'maxChangeRate':
            setMaxChangeRateCoin(data);
            break;
          case 'kimchiPremium':
            setKimchiPremium(data);
        }
      });

      port.onDisconnect.addListener(() => {
        port = null;
        if (isUnmounted) return;
        clearPending();
        setIsLoading(true);
        setTickers({});
        reconnectTimer = setTimeout(connect, 500);
      });
    };

    connect();
    chrome.runtime.sendMessage({ action: 'getActiveExchange' });

    return () => {
      isUnmounted = true;
      clearPending();
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      port?.disconnect();
    };
  }, [setTickers, setExchangePlatform, setExchangeRateUSD, setIsLoading, setMaxChangeRateCoin, setKimchiPremium]);
};
