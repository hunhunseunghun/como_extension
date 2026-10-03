import { Maximize, Minimize } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { HoverHint } from '@/components/ui/hoverHint';
import { useI18n } from '@/i18n';

export function SizeToggle({
  wideSize,
  setWideSize,
}: {
  wideSize: boolean;
  setWideSize: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { t } = useI18n();
  const switchSize = () => (wideSize ? setWideSize(false) : setWideSize(true));

  return (
    <Toggle
      className="relative hover:cursor-pointer hover:bg-accent size-6 min-w-6 border-1 group"
      variant="outline"
      aria-label={wideSize ? t('wideOff') : t('wideOn')}
      onClick={switchSize}>
      {wideSize ? <Minimize size={14} strokeWidth={2} /> : <Maximize size={14} strokeWidth={2} />}
      <HoverHint align="end" className="font-normal">
        {wideSize ? t('wideOff') : t('wideOn')}
      </HoverHint>
    </Toggle>
  );
}
