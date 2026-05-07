import { useMemo } from 'react';
import { ExchangePlatform, KimchiPremium } from '@/types';

interface Props {
  kimchiPremium: KimchiPremium;
  exchangePlatform: ExchangePlatform;
}

type Display = { coin: string; premium: number };
const TARGET_COINS: string[] = ['BTC', 'ETH'];

export const KimchiPremiumBadge = ({ kimchiPremium, exchangePlatform }: Props) => {
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
    <div className="relative flex justify-center items-center h-6 text-[10px] font-semibold gap-1 border-transparent border-1 rounded-md group hover:cursor-default">
      <span className="text-neutral-500">김프</span>
      {displays.map(({ coin, premium }) => (
        <span key={coin} className="flex items-center gap-0.5">
          <span className="text-neutral-400">{coin}</span>
          <span className={premium >= 0 ? 'text-red-500' : 'text-blue-500'}>
            {premium >= 0 ? '+' : ''}
            {premium.toFixed(2)}%
          </span>
        </span>
      ))}
      <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white font-semibold bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-[9999]">
        {'김치 프리미엄 (vs Binance USDT)'}
      </span>
    </div>
  );
};
