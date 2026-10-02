import { useEffect, useState } from 'react';
import { Monitor, Moon, PanelRight, Settings, Sun } from 'lucide-react';
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


const selectClass =
  'h-6 rounded-md border bg-background px-1 text-cap-s hover:cursor-pointer';

export const CurrencySelect = () => {
  const { t, currency, setCurrency } = useI18n();
  return (
    <select
      aria-label={t('currencyLabel')}
      className={selectClass}
      value={currency}
      onChange={event => setCurrency(event.target.value as DisplayCurrency)}>
      {FIAT_CURRENCIES.map(code => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
    </select>
  );
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2 py-1">
    <span className="text-fg-subtle">{label}</span>
    {children}
  </div>
);

type SettingsPopoverProps = {
  favoriteFunc: boolean;
  setFavoriteFunc: (value: boolean) => void;
};

export const SettingsPopover = ({ favoriteFunc, setFavoriteFunc }: SettingsPopoverProps) => {
  const { t, language, setLanguage, upDownColors, setUpDownColors } = useI18n();
  const { theme, setTheme, designVersion, setDesignVersion } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const prices = useAllTickers(isOpen);
  const [badge, setBadge] = useState<BadgeSettings | null>(null);
  const [badgeMarketInput, setBadgeMarketInput] = useState('');
  const [listingAlerts, setListingAlerts] = useState<boolean | null>(null);
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
    window.close();
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
          <span className="absolute right-0 top-full mt-2 hidden w-max px-2 py-1 text-body-s text-white font-semibold bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-[50]">
            {t('settings')}
          </span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 text-cap bg-background border border-stroke-weak">
        <div className="font-semibold mb-1">{t('settings')}</div>

        <Row label={t('language')}>
          <select
            aria-label={t('language')}
            className={selectClass}
            value={language}
            onChange={event => setLanguage(event.target.value as Language)}>
            {LANGUAGES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Row>

        <Row label={t('currencyLabel')}>
          <CurrencySelect />
        </Row>

        <Row label={t('upDownColors')}>
          <div className="flex gap-1">
            {(
              [
                ['green-up', 'text-green-600', 'text-red-500'],
                ['red-up', 'text-red-500', 'text-blue-500'],
              ] as const
            ).map(([value, upClass, downClass]) => (
              <Button
                key={value}
                variant={upDownColors === value ? 'default' : 'outline'}
                aria-label={value === 'green-up' ? t('greenUp') : t('redUp')}
                aria-pressed={upDownColors === value}
                className="h-6 px-1.5 text-cap-s hover:cursor-pointer"
                onClick={() => setUpDownColors(value)}>
                <span className={upDownColors === value ? '' : upClass}>▲</span>
                <span className={upDownColors === value ? '' : downClass}>▼</span>
              </Button>
            ))}
          </div>
        </Row>

        <Row label={t('theme')}>
          <div className="flex gap-1">
            {(
              [
                ['light', Sun],
                ['dark', Moon],
                ['system', Monitor],
              ] as const
            ).map(([value, Icon]) => (
              <Button
                key={value}
                variant={theme === value ? 'default' : 'outline'}
                aria-label={t(value === 'light' ? 'themeLight' : value === 'dark' ? 'themeDark' : 'themeSystem')}
                aria-pressed={theme === value}
                className="h-6 w-7 p-0 hover:cursor-pointer"
                onClick={() => setTheme(value)}>
                <Icon className="size-3.5" />
              </Button>
            ))}
          </div>
        </Row>

        <Row label={t('designVersion')}>
          <div className="flex gap-1">
            {(['v1', 'v2'] as const).map(value => (
              <Button
                key={value}
                variant={designVersion === value ? 'default' : 'outline'}
                aria-label={t(value === 'v1' ? 'designV1' : 'designV2')}
                aria-pressed={designVersion === value}
                className="h-6 px-1.5 text-cap-s hover:cursor-pointer"
                onClick={() => setDesignVersion(value)}>
                {value}
              </Button>
            ))}
          </div>
        </Row>

        <Row label={t('favoritePin')}>
          <input
            type="checkbox"
            aria-label={t('favoritePin')}
            className="hover:cursor-pointer"
            checked={favoriteFunc}
            onChange={event => setFavoriteFunc(event.target.checked)}
          />
        </Row>

        <Row label={t('listingAlerts')}>
          <input
            type="checkbox"
            aria-label={t('listingAlerts')}
            className="hover:cursor-pointer"
            checked={listingAlerts ?? isListingAlertsDefault(language)}
            onChange={event => {
              setListingAlerts(event.target.checked);
              chrome.storage.local.set({ [LISTING_ALERTS_STORAGE_KEY]: event.target.checked });
            }}
          />
        </Row>

        <div className="border-t mt-1 pt-1">
          <Row label={t('toolbarBadge')}>
            <input
              type="checkbox"
              aria-label={t('toolbarBadge')}
              className="hover:cursor-pointer"
              checked={!!badge?.enabled}
              onChange={event => badge && saveBadge({ ...badge, enabled: event.target.checked })}
            />
          </Row>
          {badge?.enabled && (
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
          )}
        </div>

        {canOpenSidePanel && (
          <Button
            variant="outline"
            className="w-full h-7 mt-2 text-cap gap-1 hover:cursor-pointer"
            onClick={openSidePanel}>
            <PanelRight className="size-3.5" />
            {t('openSidePanel')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
};
