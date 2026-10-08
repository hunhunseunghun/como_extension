import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { shareCard, type ShareCard, type ShareResult } from '@/lib/shareCard';

// 공유 카드 이미지를 만들어 클립보드에 복사한다(실패하면 내려받기).
export const ShareButton = ({ build, disabled }: { build: () => ShareCard; disabled?: boolean }) => {
  const { t } = useI18n();
  const [result, setResult] = useState<ShareResult | null>(null);

  const handleClick = async () => {
    const outcome = await shareCard({ ...build(), findText: t('shareFindText') });
    setResult(outcome);
    setTimeout(() => setResult(null), 2000);
  };

  return (
    <Button
      variant="ghost"
      aria-label={t('shareCard')}
      title={t('shareCard')}
      disabled={disabled}
      className="h-5 gap-1 px-1 text-cap-s text-fg-subtle hover:cursor-pointer"
      onClick={handleClick}
      data-testid="share-card">
      <Share2 className="size-3" />
      {result === 'copied' ? t('shareCopied') : result === 'downloaded' ? t('shareDownloaded') : t('share')}
    </Button>
  );
};
