import { useEffect, useRef, useState } from 'react';
import { FavoriteCoins } from '@/types';

const EMPTY: FavoriteCoins = { upbit: [], bithumb: [], binance: [], bybit: [], okx: [], coinbase: [] };

export const useFavorites = () => {
  const [favoriteCoins, setFavoriteCoins] = useState<FavoriteCoins>(EMPTY);
  const hasLoaded = useRef(false);

  useEffect(() => {
    chrome.storage.local.get('favoriteCoins', result => {
      // 거래소가 추가돼도 기존 저장값에 없는 키가 비어 있지 않도록 기본값과 합친다.
      setFavoriteCoins({ ...EMPTY, ...(result?.favoriteCoins || {}) });
      hasLoaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) return;
    chrome.storage.local.set({
      favoriteCoins: Object.fromEntries(
        Object.entries(favoriteCoins).map(([exchange, coins]) => [exchange, [...new Set(coins)]]),
      ),
    });
  }, [favoriteCoins]);

  return [favoriteCoins, setFavoriteCoins] as const;
};
