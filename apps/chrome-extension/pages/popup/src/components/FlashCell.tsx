// FlashContent.tsx
import { useEffect, useState } from 'react';
import { TableCell } from '@/components/ui/table';
import type { UpbitTicker } from '@/types';

type FlashContentProps = {
  ticker?: UpbitTicker;
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
    // <div>를 사용하여 셀 내부에 효과를 적용합니다.
    <TableCell
      className={`w-full h-full border-1 border-transparent transition-all duration-500 ease-out ${flash ? flashClass : ''}`}
      key={`${flashKey}`}>
      {children}
    </TableCell>
  );
}
