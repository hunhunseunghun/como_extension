import { useEffect, useRef, useState } from 'react';
import { Download, Monitor, Moon, PanelRight, Settings, Sun, Upload } from 'lucide-react';
import { exportBackup, importBackup } from '@/lib/backup';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MarketPicker } from '@/components/MarketPicker';
import { useAllTickers } from '@/hooks/useAllTickers';
import { FIAT_CURRENCIES, LANGUAGES, useI18n, type DisplayCurrency, type Language } from '@/i18n';
import {
  BADGE_STORAGE_KEY,
  BadgeSettings,
  defaultBadgeSettings,
  isListingAlertsDefault,
  isSidePanelView,
  LISTING_ALERTS_STORAGE_KEY,
} from '@/lib/settings';
import { HoverHint } from '@/components/ui/hoverHint';
import { NativeSelect } from '@/components/ui/nativeSelect';
import { Section, SettingRow } from '@/components/ui/section';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';

const UPBIT_NOTICE_ORIGIN = 'https://api-manager.upbit.com/*';

export const CurrencySelect = () => {
  const { t, currency, setCurrency } = useI18n();
  return (
    <NativeSelect
      aria-label={t('currencyLabel')}
      value={currency}
      onChange={event => setCurrency(event.target.value as DisplayCurrency)}>
      {FIAT_CURRENCIES.map(code => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
    </NativeSelect>
  );
};

type SettingsPopoverProps = {
  favoriteFunc: boolean;
  setFavoriteFunc: (value: boolean) => void;
};

export const SettingsPopover = ({ favoriteFunc, setFavoriteFunc }: SettingsPopoverProps) => {
  const { t, language, setLanguage, upDownColors, setUpDownColors } = useI18n();
  const { theme, setTheme, designVersion, setDesignVersion } = useTheme();
  // 백업 복원을 위해 탭으로 열었을 때는 설정을 바로 펼친다.
  const [isOpen, setIsOpen] = useState(() => new URLSearchParams(location.search).get('settings') === 'open');
  const prices = useAllTickers(isOpen);
  const [badge, setBadge] = useState<BadgeSettings | null>(null);
  const [badgeMarketInput, setBadgeMarketInput] = useState('');
  const [listingAlerts, setListingAlerts] = useState<boolean | null>(null);
  const [backupError, setBackupError] = useState(false);
  const [noticeAlerts, setNoticeAlerts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canOpenSidePanel = typeof chrome !== 'undefined' && !!chrome.sidePanel?.open && !isSidePanelView();

  useEffect(() => {
    chrome.storage.local.get(BADGE_STORAGE_KEY, result => {
      const stored = result?.[BADGE_STORAGE_KEY] as BadgeSettings | undefined;
      const value = stored ?? defaultBadgeSettings(language);
      setBadge(value);
      setBadgeMarketInput(value.market);
    });
    chrome.storage.local.get(LISTING_ALERTS_STORAGE_KEY, result => {
      setListingAlerts((result?.[LISTING_ALERTS_STORAGE_KEY] as boolean | undefined) ?? null);
    });
    // 권한을 브라우저 설정에서 거둬 갔으면 꺼진 것으로 보여 준다.
    chrome.storage.local.get('noticeAlerts', result => {
      if (!result?.noticeAlerts) return;
      chrome.permissions.contains({ origins: [UPBIT_NOTICE_ORIGIN] }, setNoticeAlerts);
    });
    // 언어가 바뀌어도 이미 저장한 배지 설정은 유지한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveBadge = (next: BadgeSettings) => {
    setBadge(next);
    chrome.storage.local.set({ [BADGE_STORAGE_KEY]: next });
  };

  const handleBadgeMarket = (value: string) => {
    setBadgeMarketInput(value);
    const normalized = value.trim().toUpperCase();
    // 실제로 있는 마켓일 때만 저장해 입력 도중 배지가 비지 않게 한다.
    if (badge && prices[`${badge.exchange}:${normalized}`]) saveBadge({ ...badge, market: normalized });
  };

  const openSidePanel = async () => {
    const currentWindow = await chrome.windows.getCurrent();
    if (currentWindow.id === undefined) return;
    await chrome.sidePanel.open({ windowId: currentWindow.id });
    // 툴바 팝업일 때만 닫는다. 탭으로 연 화면(개발용 미리보기 등)에서 닫으면 탭이나 창이 함께 사라진다.
    if (chrome.extension.getViews({ type: 'popup' }).includes(window)) window.close();
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="relative group">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('settings')}
            className="relative w-6 h-6 p-0 hover:cursor-pointer hover:bg-accent">
            <Settings strokeWidth={2} className="size-3.5 p-0" />
          </Button>
          <HoverHint align="end">
            {t('settings')}
          </HoverHint>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 text-cap bg-background border border-stroke-weak">
        <div className="px-1 pb-1 text-title-s font-semibold">{t('settings')}</div>

        <Section title={t('settingsGroupDisplay')}>
          <SettingRow label={t('language')}>
            <NativeSelect
              aria-label={t('language')}
              value={language}
              onChange={event => setLanguage(event.target.value as Language)}>
              {LANGUAGES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </SettingRow>
          <SettingRow label={t('currencyLabel')}>
            <CurrencySelect />
          </SettingRow>
          <SettingRow label={t('upDownColors')}>
            <Segmented
              value={upDownColors}
              onChange={setUpDownColors}
              options={(
                [
                  ['green-up', 'text-palette-green', 'text-palette-red'],
                  ['red-up', 'text-palette-red', 'text-palette-blue'],
                ] as const
              ).map(([value, upClass, downClass]) => ({
                value,
                ariaLabel: value === 'green-up' ? t('greenUp') : t('redUp'),
                label: (
                  <>
                    <span className={upClass}>▲</span>
                    <span className={downClass}>▼</span>
                  </>
                ),
              }))}
            />
          </SettingRow>
        </Section>

        <Section title={t('settingsGroupAppearance')}>
          <SettingRow label={t('theme')}>
            <Segmented
              value={theme}
              onChange={setTheme}
              options={(
                [
                  ['light', Sun, 'themeLight'],
                  ['dark', Moon, 'themeDark'],
                  ['system', Monitor, 'themeSystem'],
                ] as const
              ).map(([value, Icon, label]) => ({ value, ariaLabel: t(label), label: <Icon /> }))}
            />
          </SettingRow>
          <SettingRow label={t('designVersion')}>
            <Segmented
              value={designVersion}
              onChange={setDesignVersion}
              options={(['v1', 'v2'] as const).map(value => ({
                value,
                label: value,
                ariaLabel: t(value === 'v1' ? 'designV1' : 'designV2'),
              }))}
            />
          </SettingRow>
          <SettingRow label={t('favoritePin')}>
            <Switch aria-label={t('favoritePin')} checked={favoriteFunc} onCheckedChange={setFavoriteFunc} />
          </SettingRow>
        </Section>

        <Section title={t('settingsGroupAlerts')}>
          <SettingRow label={t('listingAlerts')}>
            <Switch
              aria-label={t('listingAlerts')}
              checked={listingAlerts ?? isListingAlertsDefault(language)}
              onCheckedChange={checked => {
                setListingAlerts(checked);
                chrome.storage.local.set({ [LISTING_ALERTS_STORAGE_KEY]: checked });
              }}
            />
          </SettingRow>
          <SettingRow label={t('noticeAlerts')}>
            <Switch
              aria-label={t('noticeAlerts')}
              checked={noticeAlerts}
              onCheckedChange={checked => {
                if (!checked) {
                  setNoticeAlerts(false);
                  chrome.storage.local.set({ noticeAlerts: false });
                  return;
                }
                // 공지 API는 선택 권한이다. 켤 때 한 번 허락받는다.
                chrome.permissions.request({ origins: [UPBIT_NOTICE_ORIGIN] }, granted => {
                  setNoticeAlerts(granted);
                  chrome.storage.local.set({ noticeAlerts: granted });
                });
              }}
            />
          </SettingRow>
          <SettingRow label={t('toolbarBadge')}>
            <Switch
              aria-label={t('toolbarBadge')}
              checked={!!badge?.enabled}
              onCheckedChange={checked => badge && saveBadge({ ...badge, enabled: checked })}
            />
          </SettingRow>
          {badge?.enabled && (
            <div className="px-1 pb-1">
              <MarketPicker
                exchange={badge.exchange}
                onExchangeChange={exchange => {
                  setBadgeMarketInput('');
                  setBadge({ ...badge, exchange });
                }}
                market={badgeMarketInput}
                onMarketChange={handleBadgeMarket}
                prices={prices}
              />
            </div>
          )}
        </Section>

        <Section title={t('backupTitle')}>
          <div className="flex gap-1 px-1 pb-1">
            <Button variant="soft" className="h-control flex-1 gap-1 text-cap-s hover:cursor-pointer" onClick={exportBackup}>
              <Download className="size-3" />
              {t('backupExport')}
            </Button>
            <Button
              variant="soft"
              className="h-control flex-1 gap-1 text-cap-s hover:cursor-pointer"
              onClick={() => {
                // 툴바 팝업은 파일 선택 창이 뜨면 닫혀 버리므로, 탭으로 열어 거기서 고르게 한다.
                if (chrome.extension?.getViews?.({ type: 'popup' }).includes(window)) {
                  chrome.tabs.create({ url: chrome.runtime.getURL('popup/index.html?settings=open') });
                  window.close();
                  return;
                }
                fileInputRef.current?.click();
              }}>
              <Upload className="size-3" />
              {t('backupImport')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              data-testid="backup-file"
              onChange={async event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                if (await importBackup(file)) location.reload();
                else setBackupError(true);
              }}
            />
          </div>
          {backupError && <p className="px-1 pb-1 text-cap-s text-fg-critical">{t('backupInvalid')}</p>}
          <p className="px-1 pb-1 text-cap-s text-fg-faint">{t('backupHint')}</p>
        </Section>

        {canOpenSidePanel && (
          <Button
            variant="soft"
            className="w-full h-control-lg mt-1 text-cap gap-1 hover:cursor-pointer"
            onClick={openSidePanel}>
            <PanelRight className="size-3.5" />
            {t('openSidePanel')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
};
