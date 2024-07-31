import { Maximize, Minimize } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';

export function SizeToggle({
  wideSize,
  setWideSize,
}: {
  wideSize: boolean;
  setWideSize: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const switchSize = () => (wideSize ? setWideSize(false) : setWideSize(true));

  return (
    <Toggle
      className="relative hover:cursor-pointer hover:bg-accent size-6 min-w-6 border-1 group"
      variant="outline"
      onClick={switchSize}>
      {wideSize ? <Maximize size={14} strokeWidth={2} /> : <Minimize size={14} strokeWidth={2} />}
      <span className="absolute left-1/2 -translate-x-[80%] top-full mt-2 hidden w-max px-2 py-1 text-xs text-white bg-black # rounded-md opacity-0 group-hover:block group-hover:opacity-80 transition-opacity">
        {wideSize ? 'Minimize toggle' : 'Maximize Toggle'}
      </span>
    </Toggle>
  );
}
