import { lazy, Suspense, useEffect, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/i18n';

// 패널(cmdk 검색 포함)은 알림 팝오버를 열 때 불러온다. 첫 화면 번들을 줄인다.
const PriceAlertPanel = lazy(() => import('@/components/PriceAlertPanel').then(m => ({ default: m.PriceAlertPanel })));
const AlertRulesPanel = lazy(() => import('@/components/AlertRulesPanel').then(m => ({ default: m.AlertRulesPanel })));
const AlertHistoryPanel = lazy(() => import('@/components/AlertHistoryPanel').then(m => ({ default: m.AlertHistoryPanel })));
import { HoverHint } from '@/components/ui/hoverHint';
import { Segmented } from '@/components/ui/segmented';

type AlertTab = 'price' | 'change' | 'kimchi' | 'flow' | 'history';

// 기록함을 마지막으로 연 뒤 새 알림이 왔는지(종 아이콘에 점으로 표시)
const useUnreadAlerts = () => {
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    const check = () =>
      chrome.storage.local.get(['alertHistory', 'alertHistorySeenAt'], result => {
        const latest = (result?.alertHistory as { time: number }[] | undefined)?.[0]?.time ?? 0;
        setUnread(latest > ((result?.alertHistorySeenAt as number | undefined) ?? 0));
      });
    check();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && (changes.alertHistory || changes.alertHistorySeenAt)) check();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);
  return unread;
};

// 알림 창: 지정가·변동률·김프·고래(대량 체결·OI) 탭. 각 탭은 열 때마다 새로 그려 이전 입력이 남지 않는다.
export const PriceNotiPopover = () => {
  const { t } = useI18n();
  const [tab, setTab] = useState<AlertTab>('price');
  const unread = useUnreadAlerts();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="relative group">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('alertTitle')}
            className="relative w-6 h-6 p-0 hover:cursor-pointer hover:bg-accent">
            <Bell strokeWidth={2} className="size-3.5 mt-[1px] p-0" />
            {unread && (
              <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-critical" data-testid="alert-unread" aria-label={t('alertHistoryUnread')} />
            )}
          </Button>
          <HoverHint>{t('alertTitle')}</HoverHint>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-2 text-cap bg-background border border-stroke-weak"
        onEscapeKeyDown={event => {
          // 종목 검색 목록이 열려 있으면 첫 Esc는 목록만 닫는다.
          if ((event.target as HTMLElement | null)?.closest?.('[data-list-open="true"]')) event.preventDefault();
        }}>
        <Segmented
          variant="tabs"
          fill
          className="mb-2"
          value={tab}
          onChange={setTab}
          options={(
            [
              ['price', 'alertTabPrice'],
              ['change', 'alertTabChange'],
              ['kimchi', 'alertTabKimchi'],
              ['flow', 'alertTabFlow'],
              ['history', 'alertTabHistory'],
            ] as const
          ).map(([value, label]) => ({ value, label: t(label) }))}
        />
        <Suspense fallback={<div className="grid h-24 place-content-center"><Loader2 className="size-4 animate-spin text-fg-subtle" /></div>}>
          {tab === 'price' ? <PriceAlertPanel /> : tab === 'history' ? <AlertHistoryPanel /> : <AlertRulesPanel kind={tab} />}
        </Suspense>
      </PopoverContent>
    </Popover>
  );
};
