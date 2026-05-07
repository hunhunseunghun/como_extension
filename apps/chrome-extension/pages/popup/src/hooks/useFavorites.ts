import { useEffect, useRef, useState } from 'react';
import { FavoriteCoins } from '@/types';

const EMPTY: FavoriteCoins = { upbit: [], bithumb: [], binance: [] };

export const useFavorites = () => {
  const [favoriteCoins, setFavoriteCoins] = useState<FavoriteCoins>(EMPTY);
  const hasLoaded = useRef(false);

  useEffect(() => {
    chrome.storage.local.get('favoriteCoins', result => {
      setFavoriteCoins(result?.favoriteCoins || EMPTY);
      hasLoaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) return;
    chrome.storage.local.set({
      favoriteCoins: {
        upbit: [...new Set(favoriteCoins.upbit)],
        bithumb: [...new Set(favoriteCoins.bithumb)],
        binance: [...new Set(favoriteCoins.binance)],
      },
    });
  }, [favoriteCoins]);

  return [favoriteCoins, setFavoriteCoins] as const;
};
