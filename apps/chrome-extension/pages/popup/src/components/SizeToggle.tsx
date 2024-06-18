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
      className="hover:cursor-pointer hover:bg-accent size-6 min-w-6 border-1"
      variant="outline"
      onClick={switchSize}>
      {wideSize ? <Maximize size={14} strokeWidth={2} /> : <Minimize size={14} strokeWidth={2} />}
      <span className="sr-only">toggle theme</span>
    </Toggle>
  );
}
