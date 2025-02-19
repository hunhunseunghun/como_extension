// FlashContent.tsx
import { useEffect, useState } from 'react';
import type { Ticker } from '@/types';
import { TableCell } from '@/components/ui/table';

type FlashContentProps = {
  ticker?: Ticker;
  children: React.ReactNode;
};

export default function FlashCell({ ticker, children }: FlashContentProps) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (ticker && ticker.ask_bid) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 100);
      return () => clearTimeout(timer);
    }
  }, [ticker?.ask_bid]);

  const flashClass = ticker?.ask_bid === 'ASK' ? 'border-blue-400' : ticker?.ask_bid === 'BID' ? 'border-red-400' : '';

  return (
    // <div>를 사용하여 셀 내부에 효과를 적용합니다.
    <TableCell className={`w-full h-full border-2 border-solid border-transparent ${flash ? flashClass : ''}`}>
      {children}
    </TableCell>
  );
}
