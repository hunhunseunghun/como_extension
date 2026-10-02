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

  const flashClass = bidAskStatus === 'ASK' ? 'text-down' : bidAskStatus === 'BID' ? 'text-up' : '';

  return (
    <div className={`${className} num transition-colors duration-300 ease-como ${flash ? flashClass : ''}`} key={`${flashKey}`}>
      {children}
    </div>
  );
}
