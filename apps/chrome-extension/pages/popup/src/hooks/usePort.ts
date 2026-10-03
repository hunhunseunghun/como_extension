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

// 업비트·빗썸은 체결마다 틱을 보내 프레임마다 표 전체를 다시 그리게 된다. 이 간격으로 모아서 반영한다.
const FLUSH_INTERVAL = 250;

export const usePort = (
  setTickers: React.Dispatch<React.SetStateAction<TickerMap>>,
  setExchangePlatform: (exchange: ExchangePlatform) => void,
  setExchangeRateUSD: React.Dispatch<React.SetStateAction<number>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
  updatedVersionHandler: (data: string) => void,
  setMaxChangeRateCoin: React.Dispatch<React.SetStateAction<maxChagneRateCoin>>,
  setKimchiPremium: React.Dispatch<React.SetStateAction<KimchiPremium>>,
  // 위에서 처리하지 않는 부가 데이터(fiatRates, marketStats, spreads 등)
  onMessage?: (type: string, data: unknown) => void,
) => {
  // 핸들러가 렌더마다 바뀌어도 포트를 다시 연결하지 않도록 ref로 최신 값을 참조한다.
  const updatedVersionHandlerRef = useRef(updatedVersionHandler);
  updatedVersionHandlerRef.current = updatedVersionHandler;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let port: chrome.runtime.Port | null = null;
    let isUnmounted = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    // 웹소켓 틱을 모아 FLUSH_INTERVAL마다 한 번만 setState 한다. 화면이 가려져 있으면 보일 때 한 번에 반영한다.
    let pending: { [key: string]: Partial<TickerTypes> } = {};
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      flushTimer = null;
      if (document.hidden) return;
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
      if (flushTimer === null && !document.hidden) flushTimer = setTimeout(flush, FLUSH_INTERVAL);
    };

    const clearPending = () => {
      if (flushTimer !== null) clearTimeout(flushTimer);
      flushTimer = null;
      pending = {};
    };

    const onVisibilityChange = () => {
      if (!document.hidden && flushTimer === null && Object.keys(pending).length) flush();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    let reconnectDelay = 500;

    const connect = () => {
      try {
        port = chrome.runtime.connect({ name: 'popup' });
      } catch {
        // 확장 프로그램이 업데이트·재시작돼 이 페이지의 연결 컨텍스트가 사라졌다. 새 페이지로 다시 연다.
        location.reload();
        return;
      }

      port.onMessage.addListener(({ type, data }) => {
        reconnectDelay = 500;
        switch (type) {
          case 'upbitWebsocketTicker':
          case 'bithumbWebsocketTicker':
            if (data?.code) queueTicker(data.code, data);
            break;
          case 'binanceWebsocketTicker':
          case 'bybitWebsocketTicker':
          case 'okxWebsocketTicker':
          case 'coinbaseWebsocketTicker':
          case 'bitgetWebsocketTicker':
          case 'krakenWebsocketTicker':
          case 'coindcxWebsocketTicker':
            data.forEach((ticker: { s: string } & BinanceWebsocketTicker) => {
              if (ticker.s) queueTicker(ticker.s, ticker as Partial<TickerTypes>);
            });
            break;
          case 'upbitTickers':
          case 'bithumbTickers':
          case 'binanceTickers':
          case 'bybitTickers':
          case 'okxTickers':
          case 'coinbaseTickers':
          case 'bitgetTickers':
          case 'krakenTickers':
          case 'coindcxTickers':
            clearPending();
            setTickers(data);
            setIsLoading(false);
            break;
          case 'activeExchange':
            if (!data) break;
            // 거래소가 바뀌면 이전 거래소의 쌓인 틱을 버린다.
            clearPending();
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
            break;
          default:
            onMessageRef.current?.(type, data);
        }
      });

      port.onDisconnect.addListener(() => {
        port = null;
        if (isUnmounted) return;
        clearPending();
        setIsLoading(true);
        setTickers({});
        // 서비스 워커가 바로 뜨지 못하면 간격을 늘려 가며(최대 5초) 다시 붙는다.
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 5000);
      });
    };

    connect();
    chrome.runtime.sendMessage({ action: 'getActiveExchange' });

    return () => {
      isUnmounted = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearPending();
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      port?.disconnect();
    };
  }, [setTickers, setExchangePlatform, setExchangeRateUSD, setIsLoading, setMaxChangeRateCoin, setKimchiPremium]);
};
