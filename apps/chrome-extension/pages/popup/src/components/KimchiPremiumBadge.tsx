import { useMemo } from 'react';
import { ExchangePlatform, KimchiPremium } from '@/types';
import { useI18n } from '@/i18n';
import { HoverHint } from '@/components/ui/hoverHint';

interface Props {
  kimchiPremium: KimchiPremium;
  exchangePlatform: ExchangePlatform;
}

type Display = { coin: string; premium: number };
const TARGET_COINS: string[] = ['BTC', 'ETH'];

export const KimchiPremiumBadge = ({ kimchiPremium, exchangePlatform }: Props) => {
  const { t } = useI18n();
  const displays = useMemo<Display[]>(() => {
    const exch: 'upbit' | 'bithumb' = exchangePlatform === 'bithumb' ? 'bithumb' : 'upbit';
    const out: Display[] = [];
    for (const coin of TARGET_COINS) {
      const item = kimchiPremium.items[`${exch}:KRW-${coin}`];
      if (item) out.push({ coin, premium: item.premium });
    }
    return out;
  }, [kimchiPremium, exchangePlatform]);

  if (!displays.length) return null;

  return (
    <div className="relative flex justify-center items-center h-6 text-cap-s font-semibold gap-1 border-transparent border-1 rounded-md group hover:cursor-default">
      <span className="text-fg-subtle">{t('kimchiShort')}</span>
      {displays.map(({ coin, premium }) => (
        <span key={coin} className="flex items-center gap-0.5">
          <span className="text-fg-faint">{coin}</span>
          <span className={premium >= 0 ? 'text-up' : 'text-down'}>
            {premium >= 0 ? '+' : ''}
            {premium.toFixed(2)}%
          </span>
        </span>
      ))}
      <HoverHint>
        {t('kimchiTooltip')}
      </HoverHint>
    </div>
  );
};
