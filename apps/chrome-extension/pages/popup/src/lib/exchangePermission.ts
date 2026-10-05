import { useEffect, useState } from 'react';
import { OPTIONAL_EXCHANGE_ORIGINS } from '@/constants/exchanges';
import type { ExchangePlatform } from '@/types';

// 선택 권한 거래소(코인원·디지털엑스)의 시세 API 권한을 받았는지. 권한이 필요 없는 거래소는 늘 true다.
export const useExchangePermission = (exchange: ExchangePlatform) => {
  const origins = OPTIONAL_EXCHANGE_ORIGINS[exchange];
  const [granted, setGranted] = useState<boolean>(!origins);

  useEffect(() => {
    if (!origins) {
      setGranted(true);
      return;
    }
    const check = () => chrome.permissions.contains({ origins }, setGranted);
    check();
    chrome.permissions.onAdded.addListener(check);
    chrome.permissions.onRemoved.addListener(check);
    return () => {
      chrome.permissions.onAdded.removeListener(check);
      chrome.permissions.onRemoved.removeListener(check);
    };
  }, [origins]);

  return granted;
};

// 권한을 묻는다. 툴바 팝업은 권한 창이 뜨면 닫힐 수 있어서, 백그라운드에 먼저 알려 허락되면 거기서 거래소를 바꾸게 한다.
export const requestExchangePermission = (exchange: ExchangePlatform) =>
  new Promise<boolean>(resolve => {
    const origins = OPTIONAL_EXCHANGE_ORIGINS[exchange];
    if (!origins) {
      resolve(true);
      return;
    }
    // 클릭 처리 안에서 바로 불러야 권한 창이 뜬다(이미 허락했으면 창 없이 true).
    chrome.runtime.sendMessage({ action: 'pendingExchange', exchange });
    chrome.permissions.request({ origins }, resolve);
  });
