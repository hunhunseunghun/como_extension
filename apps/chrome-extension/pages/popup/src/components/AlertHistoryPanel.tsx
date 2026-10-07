import { useEffect, useState } from 'react';
import { BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';

// 백그라운드(recordAlert)가 남기는 형식이다.
export type AlertEntry = { id: string; title: string; message: string; time: number; muted?: boolean };
export const ALERT_HISTORY_KEY = 'alertHistory';
export const ALERT_SEEN_KEY = 'alertHistorySeenAt';

const relativeTime = (time: number, locale: string) => {
  const minutes = Math.round((time - Date.now()) / 60000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  // 1분 미만은 '지금'(0초)으로 보인다. 0분은 언어에 따라 어색하게 읽힌다.
  if (minutes === 0) return format.format(0, 'second');
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, 'hour');
  return format.format(Math.round(hours / 24), 'day');
};

// 알림 기록함: 최근 알림을 시간순으로 다시 보고, 누르면 그 종목 거래 화면이나 공지를 연다.
export const AlertHistoryPanel = () => {
  const { t } = useI18n();
  const locale = t('numberLocale');
  const [entries, setEntries] = useState<AlertEntry[]>([]);

  useEffect(() => {
    const load = () =>
      chrome.storage.local.get(ALERT_HISTORY_KEY, result => setEntries((result?.[ALERT_HISTORY_KEY] as AlertEntry[]) ?? []));
    load();
    // 열어 본 시각을 남겨 종 아이콘의 새 알림 표시를 지운다.
    chrome.storage.local.set({ [ALERT_SEEN_KEY]: Date.now() });
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[ALERT_HISTORY_KEY]) {
        load();
        chrome.storage.local.set({ [ALERT_SEEN_KEY]: Date.now() });
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  return (
    <div className="text-cap" data-testid="alert-history">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-cap-s text-fg-subtle">{t('alertHistoryHint')}</span>
        <Button
          variant="soft"
          className="h-control px-2 text-cap-s hover:cursor-pointer"
          disabled={!entries.length}
          onClick={() => chrome.storage.local.set({ [ALERT_HISTORY_KEY]: [] })}>
          {t('alertHistoryClear')}
        </Button>
      </div>
      <ul className="max-h-72 divide-y divide-stroke-weak overflow-y-auto border-t">
        {!entries.length && <li className="px-1 py-3 text-fg-faint">{t('alertHistoryEmpty')}</li>}
        {entries.map(entry => (
          <li key={`${entry.id}-${entry.time}`}>
            <button
              type="button"
              data-testid="alert-entry"
              className="flex w-full flex-col items-start gap-0.5 px-1 py-1.5 text-left hover:cursor-pointer hover:bg-neutral-weak"
              onClick={() => chrome.runtime.sendMessage({ action: 'openAlertTarget', id: entry.id })}>
              <span className="flex w-full items-center gap-1">
                <span className="min-w-0 flex-1 truncate font-medium">{entry.title}</span>
                {entry.muted && <BellOff className="size-3 shrink-0 text-fg-faint" aria-label={t('alertHistoryMuted')} />}
                <span className="shrink-0 text-cap-s text-fg-faint">{relativeTime(entry.time, locale)}</span>
              </span>
              <span className="w-full truncate text-cap-s text-fg-subtle">{entry.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
