import type { Dispatch, SetStateAction } from 'react';
import type { Row } from '@tanstack/react-table';
import type { ExchangePlatform, FavoriteCoins } from '@/types';
// 즐겨찾기를 켜고 끌 때 알리는 이벤트(FavoriteUndo가 받아 '되돌리기'를 보여 준다).
export const FAVORITE_TOGGLED_EVENT = 'como:favorite-toggled';
export type FavoriteToggled = { exchange: ExchangePlatform; market: string; added: boolean; previous: string[] };

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
  const previous = favoriteCoins?.[exchange] ?? [];
  const isFavorite = previous.includes(market);
  window.dispatchEvent(
    new CustomEvent<FavoriteToggled>(FAVORITE_TOGGLED_EVENT, { detail: { exchange, market, added: !isFavorite, previous } }),
  );
  setFavoriteCoins(prev => ({
    ...prev,
    [exchange]: isFavorite ? (prev[exchange] ?? []).filter(coin => coin !== market) : [...(prev[exchange] ?? []), market],
  }));
};
