// FlashContent.tsx
import { useEffect, useState } from 'react';
import { TableCell } from '@/components/ui/table';
import type { UpbitTicker, BithumbTicker } from '@/types';

type FlashContentProps = {
  ticker?: UpbitTicker | BithumbTicker;
  children: React.ReactNode;
  flashKey: string;
};

export default function FlashCell({ ticker, children, flashKey }: FlashContentProps) {
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
    <TableCell
      className={`w-full h-full transition-all duration-500 ease-out ${flash ? flashClass : ''}`}
      key={`${flashKey}`}>
      {children}
    </TableCell>
  );
}
