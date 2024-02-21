// FlashContent.tsx
import { useEffect, useState } from 'react';

type FlashContentProps = {
  bidAskStatus: string;
  children: React.ReactNode;
  flashKey: string;
  className: string;
};

export default function FlashCell({ bidAskStatus, children, flashKey, className }: FlashContentProps) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (bidAskStatus.length) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 300);
      return () => clearTimeout(timer);
    }
  }, [bidAskStatus]);

  const flashClass = bidAskStatus === 'ASK' ? 'text-blue-500' : bidAskStatus === 'BID' ? 'text-red-500' : '';

  return (
    <div className={`${className} transition-all duration-500 ease-out ${flash ? flashClass : ''}`} key={`${flashKey}`}>
      {children}
    </div>
  );
}
