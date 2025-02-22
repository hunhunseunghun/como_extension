// FlashContent.tsx
import { useEffect, useState } from 'react';

import type { UpbitTicker, BithumbTicker } from '@/types';

type FlashContentProps = {
  ticker?: UpbitTicker | BithumbTicker | BinanceTicker;
  children: React.ReactNode;
  flashKey: string;
  className: string;
};

export function FlashCell({ ticker, children, flashKey, className }: FlashContentProps) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (ticker && ticker.ask_bid) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 300);
      return () => clearTimeout(timer);
    }
  }, [ticker?.ask_bid]);

  const flashClass = ticker?.ask_bid === 'ASK' ? 'text-blue-500' : ticker?.ask_bid === 'BID' ? 'text-red-500' : '';

  return (
    <div className={`${className} transition-all duration-500 ease-out ${flash ? flashClass : ''}`} key={`${flashKey}`}>
      {children}
    </div>
  );
}
