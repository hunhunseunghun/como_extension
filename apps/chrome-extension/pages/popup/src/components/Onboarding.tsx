import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EXCHANGE_LIST, MARKET_TYPES } from '@/constants/exchanges';
import { useAllTickers } from '@/hooks/useAllTickers';
import { useI18n } from '@/i18n';
import { BADGE_STORAGE_KEY } from '@/lib/settings';
import type { ExchangePlatform, FavoriteCoins } from '@/types';

const PENDING_KEY = 'onboardingPending';
const COINS = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'TRX', 'LINK'];

// 거래소마다 기본 호가 통화로 마켓 이름을 만든다: 업비트·빗썸 KRW-BTC, 그 외 BTCUSDT·BTCUSD·BTCINR.
const marketFor = (exchange: ExchangePlatform, coin: string) => {
  const quote = MARKET_TYPES[exchange][0];
  return exchange === 'upbit' || exchange === 'bithumb' ? `${quote}-${coin}` : `${coin}${quote}`;
};

type Props = {
  exchangePlatform: ExchangePlatform;
  setExchangePlatform: (exchange: ExchangePlatform) => void;
  setFavoriteCoins: React.Dispatch<React.SetStateAction<FavoriteCoins>>;
};

// 새로 설치한 사용자에게 한 번만: ① 주 거래소 ② 관심 코인(상단 고정) ③ 툴바 배지 코인.
export const Onboarding = ({ exchangePlatform, setExchangePlatform, setFavoriteCoins }: Props) => {
  const { t } = useI18n();
  const [isVisible, setIsVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [coins, setCoins] = useState<string[]>(['BTC', 'ETH']);
  const [badgeCoin, setBadgeCoin] = useState<string | null>('BTC');
  const prices = useAllTickers(isVisible);

  useEffect(() => {
    chrome.storage.local.get(PENDING_KEY, result => setIsVisible(result?.[PENDING_KEY] === true));
  }, []);

  if (!isVisible) return null;

  const available = COINS.filter(coin => prices[`${exchangePlatform}:${marketFor(exchangePlatform, coin)}`]);
  const shownCoins = available.length ? available : COINS;

  const finish = (apply: boolean) => {
    if (apply) {
      const markets = coins.filter(coin => shownCoins.includes(coin)).map(coin => marketFor(exchangePlatform, coin));
      setFavoriteCoins(prev => ({
        ...prev,
        [exchangePlatform]: [...new Set([...prev[exchangePlatform], ...markets])],
      }));
      chrome.storage.local.set({
        [BADGE_STORAGE_KEY]: {
          enabled: !!badgeCoin,
          exchange: exchangePlatform,
          market: marketFor(exchangePlatform, badgeCoin ?? 'BTC'),
        },
      });
    }
    chrome.storage.local.set({ [PENDING_KEY]: false });
    setIsVisible(false);
  };

  const chip = (selected: boolean) => `h-6 px-2 text-cap-s hover:cursor-pointer ${selected ? '' : 'text-fg-subtle'}`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4" data-testid="onboarding">
      <div className="w-full max-w-[360px] rounded-lg border bg-layer-floating p-3 text-cap shadow-lg">
        <div className="flex items-center justify-between mb-1">
          <span className="text-title-s font-semibold">{t('onboardingTitle')}</span>
          <span className="text-fg-subtle num">{step + 1}/3</span>
        </div>
        <p className="mb-2 text-fg-muted">
          {t(['onboardingStep1', 'onboardingStep2', 'onboardingStep3'][step] as 'onboardingStep1')}
        </p>

        {step === 0 && (
          <div className="grid grid-cols-3 gap-1">
            {EXCHANGE_LIST.map(({ key, logo, labelKey }) => (
              <Button
                key={key}
                variant={exchangePlatform === key ? 'default' : 'outline'}
                aria-pressed={exchangePlatform === key}
                className="h-7 justify-start gap-1 px-1.5 text-cap-s hover:cursor-pointer"
                onClick={() => setExchangePlatform(key)}>
                <img src={logo} className="size-3.5 rounded-full" />
                <span className="truncate">{t(labelKey)}</span>
              </Button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-wrap gap-1">
            {shownCoins.map(coin => {
              const selected = coins.includes(coin);
              return (
                <Button
                  key={coin}
                  variant={selected ? 'default' : 'outline'}
                  aria-pressed={selected}
                  className={chip(selected)}
                  onClick={() => setCoins(prev => (selected ? prev.filter(c => c !== coin) : [...prev, coin]))}>
                  {coin}
                </Button>
              );
            })}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-wrap gap-1">
            {[...shownCoins, null].map(coin => {
              const selected = badgeCoin === coin;
              return (
                <Button
                  key={coin ?? 'none'}
                  variant={selected ? 'default' : 'outline'}
                  aria-pressed={selected}
                  className={chip(selected)}
                  onClick={() => setBadgeCoin(coin)}>
                  {coin ?? t('onboardingNoBadge')}
                </Button>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex justify-between">
          <Button
            variant="ghost"
            className="h-7 px-2 text-cap-s text-fg-subtle hover:cursor-pointer"
            onClick={() => finish(false)}>
            {t('onboardingSkip')}
          </Button>
          <Button
            className="h-7 px-3 text-cap-s hover:cursor-pointer"
            onClick={() => (step < 2 ? setStep(step + 1) : finish(true))}>
            {step < 2 ? t('onboardingNext') : t('onboardingDone')}
          </Button>
        </div>
      </div>
    </div>
  );
};
