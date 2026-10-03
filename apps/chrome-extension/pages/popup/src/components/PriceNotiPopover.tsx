import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/i18n';
import { AlertRulesPanel } from '@/components/AlertRulesPanel';
import { PriceAlertPanel } from '@/components/PriceAlertPanel';
import { HoverHint } from '@/components/ui/hoverHint';
import { Segmented } from '@/components/ui/segmented';

type AlertTab = 'price' | 'change' | 'kimchi';

// 알림 창: 지정가·변동률·김프 탭. 각 탭은 열 때마다 새로 그려 이전 입력이 남지 않는다.
export const PriceNotiPopover = () => {
  const { t } = useI18n();
  const [tab, setTab] = useState<AlertTab>('price');

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
            ] as const
          ).map(([value, label]) => ({ value, label: t(label) }))}
        />
        {tab === 'price' ? <PriceAlertPanel /> : <AlertRulesPanel kind={tab} />}
      </PopoverContent>
    </Popover>
  );
};
