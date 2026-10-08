import { useEffect, useState } from 'react';
import { Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/iconButton';
import { useI18n } from '@/i18n';
import { dismissReview, recordOpen, shouldAskReview, type UsageStats } from '@/lib/reviewPrompt';

const STORAGE_KEY = 'usageStats';

// 스토어마다 리뷰 페이지 주소가 다르다. 주소를 모르는 브라우저에서는 묻지 않는다.
const getReviewUrl = () => {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Whale')) return 'https://store.whale.naver.com/detail/gbjlmpnhijdgcobpfpgeiepdfegdhkgl';
  if (userAgent.includes('Edg/')) return 'https://microsoftedge.microsoft.com/addons/detail/nikdopfhkilmeedoblhlbbalkhiogmkd';
  // Firefox(AMO)는 신규 등록 심사 중이라 목록 주소가 정해지면 넣는다. 그 전에는 묻지 않는다(크롬 웹스토어로 보내지 않게).
  if (userAgent.includes('Firefox/')) return null;
  return 'https://chromewebstore.google.com/detail/camiahnljjgndaficdcpboimdbdphnok/reviews';
};

// 만족했을 순간(알림을 받은 뒤)이나 충분히 써 본 사용자에게 한 번씩 리뷰를 부탁한다. 조건은 lib/reviewPrompt.ts.
export const ReviewPrompt = () => {
  const { t } = useI18n();
  const [isVisible, setIsVisible] = useState(false);
  const reviewUrl = getReviewUrl();

  useEffect(() => {
    if (!reviewUrl) return;
    chrome.storage.local.get([STORAGE_KEY, 'alertFiredAt'], result => {
      const now = Date.now();
      const previous: UsageStats | undefined = result?.[STORAGE_KEY];
      const next = recordOpen(previous, now);
      chrome.storage.local.set({ [STORAGE_KEY]: next });
      if (shouldAskReview(previous, next, result?.alertFiredAt, now)) setIsVisible(true);
    });
  }, [reviewUrl]);

  const update = (change: (stats: UsageStats) => UsageStats) => {
    setIsVisible(false);
    chrome.storage.local.get(STORAGE_KEY, result => {
      chrome.storage.local.set({ [STORAGE_KEY]: change(result?.[STORAGE_KEY] ?? { firstOpenAt: Date.now(), opens: 1 }) });
    });
  };

  if (!isVisible || !reviewUrl) return null;

  return (
    <div
      className="absolute bottom-2 left-2 right-2 z-[49] flex items-center gap-2 rounded-md border bg-layer-floating px-2 py-1.5 text-cap shadow-lg"
      data-testid="review-prompt">
      <Star className="size-4 shrink-0 text-star fill-star" />
      <span className="flex-1">{t('reviewAsk')}</span>
      <Button
        className="h-control px-2 text-cap-s hover:cursor-pointer"
        onClick={() => {
          chrome.tabs.create({ url: reviewUrl });
          update(stats => ({ ...stats, reviewed: true }));
        }}>
        {t('reviewRate')}
      </Button>
      <IconButton aria-label={t('reviewLater')} onClick={() => update(stats => dismissReview(stats, Date.now()))}>
        <X />
      </IconButton>
    </div>
  );
};
