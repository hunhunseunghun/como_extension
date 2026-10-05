import type { Dispatch, SetStateAction } from 'react';
import type { Row } from '@tanstack/react-table';
import type { ExchangePlatform, FavoriteCoins } from '@/types';
// 즐겨찾기 켜고 끄기. 목록에 정확히 있는지로 판단한다(문자열 일부 일치면 KRW-SOLVE가 KRW-SOL을 막는다).
// 상단 고정은 App이 즐겨찾기 목록 순서대로 계산한다.
export const toggleFavoriteCoin = <T,>({
  row,
  exchange,
  market,
  favoriteCoins,
  setFavoriteCoins,
}: {
  row: Row<T>;
  exchange: ExchangePlatform;
  market: string;
  favoriteCoins: FavoriteCoins;
  setFavoriteCoins: Dispatch<SetStateAction<FavoriteCoins>>;
}) => {
  if (!row.getCanPin()) return;
  const isFavorite = (favoriteCoins?.[exchange] ?? []).includes(market);
  setFavoriteCoins(prev => ({
    ...prev,
    [exchange]: isFavorite ? (prev[exchange] ?? []).filter(coin => coin !== market) : [...(prev[exchange] ?? []), market],
  }));
};
