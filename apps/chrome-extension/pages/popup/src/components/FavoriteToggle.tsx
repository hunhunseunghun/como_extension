import { Star, StarOff } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';

interface FavoriteToggleProps {
  favoriteFunc: boolean;
  setFavoriteFunc: (value: boolean) => void;
}

export const FavoriteToggle = ({ favoriteFunc, setFavoriteFunc }: FavoriteToggleProps) => {
  return (
    <Toggle
      className="relative hover:cursor-pointer hover:bg-accent size-6 min-w-6 border-1 group"
      variant="outline"
      onClick={() => {
        setFavoriteFunc(!favoriteFunc);
      }}>
      {favoriteFunc ? (
        <Star size={14} strokeWidth={2} className="size-3.5 " />
      ) : (
        <StarOff size={14} strokeWidth={2} className="absolute size-3.5" />
      )}
      <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-49">
        {!favoriteFunc ? 'Favorite On' : 'Favorite Off'}
      </span>
    </Toggle>
  );
};
