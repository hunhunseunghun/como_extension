import { useEffect, useState } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { EXCHANGES, isGlobalExchange } from '@/constants/exchanges';
import type { ExchangePlatform } from '@/types';

// 이만큼 기다려도 시세가 없으면 스피너 대신 다시 시도·다른 거래소를 보여 준다.
export const NO_RESPONSE_MS = 8000;

// 같은 지역(원화·해외)에서 시세가 잘 오는 거래소를 먼저 권한다.
const ALTERNATIVES: Record<'krw' | 'global', ExchangePlatform[]> = {
  krw: ['upbit', 'bithumb', 'binance'],
  global: ['binance', 'bybit', 'okx'],
};

type Props = {
  exchange: ExchangePlatform;
  onSelect: (exchange: ExchangePlatform) => void;
  className?: string;
};

// 거래소 시세를 기다리는 동안의 화면. 응답이 없으면 스피너만 계속 돌지 않게 한다.
export const ExchangeLoading = ({ exchange, onSelect, className = '' }: Props) => {
  const { t } = useI18n();
  const [isSlow, setIsSlow] = useState(false);
  // 다시 시도를 누르면 기다리는 시간을 처음부터 다시 잰다.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setIsSlow(false);
    const timer = setTimeout(() => setIsSlow(true), NO_RESPONSE_MS);
    return () => clearTimeout(timer);
  }, [exchange, attempt]);

  if (!isSlow) {
    return (
      <div className={`${className} grid place-content-center`}>
        <Loader2 className="w-5 h-5 animate-spin text-fg-subtle" />
      </div>
    );
  }

  const alternatives = ALTERNATIVES[isGlobalExchange(exchange) ? 'global' : 'krw'].filter(key => key !== exchange);
  return (
    <div className={`${className} flex flex-col items-center justify-center gap-2 text-cap`} data-testid="exchange-no-response">
      <span className="text-fg-muted">{t('exchangeNoResponse')}</span>
      <Button
        variant="soft"
        className="h-control gap-1 px-2 text-cap-s hover:cursor-pointer"
        onClick={() => {
          chrome.runtime.sendMessage({ action: 'retryExchange', exchange });
          setAttempt(count => count + 1);
        }}>
        <RotateCw className="size-3" />
        {t('retryConnect')}
      </Button>
      <span className="mt-1 text-cap-s text-fg-subtle">{t('tryOtherExchange')}</span>
      <div className="flex gap-1">
        {alternatives.map(key => (
          <Button
            key={key}
            variant="soft"
            className="h-control gap-1 px-2 text-cap-s hover:cursor-pointer"
            onClick={() => onSelect(key)}>
            <img src={EXCHANGES[key].logo} alt="" className="size-3.5 rounded-full" />
            {t(EXCHANGES[key].labelKey)}
          </Button>
        ))}
      </div>
    </div>
  );
};
