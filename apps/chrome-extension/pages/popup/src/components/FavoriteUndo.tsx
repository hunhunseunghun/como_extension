import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import type { FavoriteCoins } from '@/types';
import { FAVORITE_TOGGLED_EVENT, type FavoriteToggled } from '@/columns/favorites';

const VISIBLE_MS = 4000;

// 별을 잘못 눌러도 바로 되돌릴 수 있게, 즐겨찾기를 켜고 끌 때마다 아래에 4초 동안 알려 준다.
// 되돌리면 그 거래소의 즐겨찾기 목록을 누르기 전 순서 그대로 돌려놓는다.
export const FavoriteUndo = ({ setFavoriteCoins }: { setFavoriteCoins: Dispatch<SetStateAction<FavoriteCoins>> }) => {
  const { t } = useI18n();
  const [last, setLast] = useState<FavoriteToggled | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const onToggled = (event: Event) => {
      setLast((event as CustomEvent<FavoriteToggled>).detail);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setLast(null), VISIBLE_MS);
    };
    window.addEventListener(FAVORITE_TOGGLED_EVENT, onToggled);
    return () => {
      window.removeEventListener(FAVORITE_TOGGLED_EVENT, onToggled);
      clearTimeout(timer.current);
    };
  }, []);

  if (!last) return null;
  const coin = last.market.split('-').pop() ?? last.market;
  return (
    <div
      role="status"
      className="absolute bottom-2 left-2 right-2 z-[50] flex items-center gap-2 rounded-md border bg-layer-floating px-2 py-1.5 text-cap shadow-lg"
      data-testid="favorite-undo">
      <Star className={last.added ? 'size-3.5 shrink-0 text-star fill-star' : 'size-3.5 shrink-0 text-fg-faint'} />
      <span className="flex-1 truncate">{t(last.added ? 'favoriteAdded' : 'favoriteRemoved').replace('{coin}', coin)}</span>
      <Button
        variant="outline"
        className="h-control px-2 text-cap-s hover:cursor-pointer"
        onClick={() => {
          setFavoriteCoins(prev => ({ ...prev, [last.exchange]: last.previous }));
          clearTimeout(timer.current);
          setLast(null);
        }}>
        {t('undo')}
      </Button>
    </div>
  );
};
