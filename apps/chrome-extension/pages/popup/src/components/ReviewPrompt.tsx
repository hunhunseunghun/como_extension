import { useEffect, useState } from 'react';
import { Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/iconButton';
import { useI18n } from '@/i18n';

const STORAGE_KEY = 'usageStats';
const DAY = 24 * 60 * 60 * 1000;

// 스토어마다 리뷰 페이지 주소가 다르다. 주소를 모르는 브라우저에서는 묻지 않는다.
const getReviewUrl = () => {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Whale')) return 'https://store.whale.naver.com/detail/gbjlmpnhijdgcobpfpgeiepdfegdhkgl';
  // Edge Add-ons에는 아직 등록하지 않았다.
  if (userAgent.includes('Edg/')) return null;
  return 'https://chromewebstore.google.com/detail/camiahnljjgndaficdcpboimdbdphnok/reviews';
};

type UsageStats = { firstOpenAt: number; opens: number; nextPromptAt?: number; reviewed?: boolean };

// 충분히 써 본 사용자(10번 이상·3일 이상, 또는 지정가 알림을 받아 본 사용자)에게만 한 번씩 리뷰를 부탁한다.
export const ReviewPrompt = () => {
  const { t } = useI18n();
  const [isVisible, setIsVisible] = useState(false);
  const reviewUrl = getReviewUrl();

  useEffect(() => {
    if (!reviewUrl) return;
    chrome.storage.local.get([STORAGE_KEY, 'alertFiredAt'], result => {
      const now = Date.now();
      const stats: UsageStats = result?.[STORAGE_KEY] ?? { firstOpenAt: now, opens: 0 };
      const next = { ...stats, opens: stats.opens + 1 };
      chrome.storage.local.set({ [STORAGE_KEY]: next });

      if (next.reviewed || (next.nextPromptAt && now < next.nextPromptAt)) return;
      const usedEnough = next.opens >= 10 && now - next.firstOpenAt >= 3 * DAY;
      const gotAlert = !!result?.alertFiredAt && next.opens >= 3;
      if (usedEnough || gotAlert) setIsVisible(true);
    });
  }, [reviewUrl]);

  const update = (patch: Partial<UsageStats>) => {
    setIsVisible(false);
    chrome.storage.local.get(STORAGE_KEY, result => {
      chrome.storage.local.set({ [STORAGE_KEY]: { ...result?.[STORAGE_KEY], ...patch } });
    });
  };

  if (!isVisible || !reviewUrl) return null;

  return (
    <div
      className="absolute bottom-2 left-2 right-2 z-[60] flex items-center gap-2 rounded-md border bg-layer-floating px-2 py-1.5 text-cap shadow-lg"
      data-testid="review-prompt">
      <Star className="size-4 shrink-0 text-star fill-star" />
      <span className="flex-1">{t('reviewAsk')}</span>
      <Button
        className="h-control px-2 text-cap-s hover:cursor-pointer"
        onClick={() => {
          chrome.tabs.create({ url: reviewUrl });
          update({ reviewed: true });
        }}>
        {t('reviewRate')}
      </Button>
      <IconButton aria-label={t('reviewLater')} onClick={() => update({ nextPromptAt: Date.now() + 30 * DAY })}>
        <X />
      </IconButton>
    </div>
  );
};
