import { useId, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { EXCHANGE_LIST, isGlobalExchange } from '@/constants/exchanges';
import { useI18n } from '@/i18n';
import type { TickerPrice } from '@/hooks/useAllTickers';
import type { ExchangePlatform } from '@/types';

type Props = {
  exchange: ExchangePlatform;
  onExchangeChange: (exchange: ExchangePlatform) => void;
  market: string;
  onMarketChange: (market: string) => void;
  prices: Record<string, TickerPrice>;
  // 보여줄 마켓 조건 (예: KRW·USDT 마켓만)
  filter?: (market: string) => boolean;
  className?: string;
};

// 거래소 로고 버튼 + 마켓 입력(자동완성). 포트폴리오·배지 설정에서 같이 쓴다.
export const MarketPicker = ({ exchange, onExchangeChange, market, onMarketChange, prices, filter, className }: Props) => {
  const { language, t } = useI18n();
  const listId = useId();

  const options = useMemo(
    () =>
      Object.values(prices)
        .filter(ticker => ticker.exchange === exchange && ticker.currentPrice > 0 && (!filter || filter(ticker.market)))
        .map(ticker => ticker.market)
        .sort(),
    [prices, exchange, filter],
  );

  return (
    <div className={className}>
      <div className="flex gap-1 mb-1">
        {EXCHANGE_LIST.map(({ key, logo, labelKey }) => (
          <button
            key={key}
            type="button"
            title={t(labelKey)}
            aria-pressed={exchange === key}
            className={`p-0.5 rounded hover:cursor-pointer ${exchange === key ? 'ring-1 ring-stroke-strong' : 'opacity-60'}`}
            onClick={() => onExchangeChange(key)}>
            <img src={logo} className="size-4" />
          </button>
        ))}
      </div>
      <Input
        list={listId}
        className="h-6 px-1 text-cap-s"
        placeholder={isGlobalExchange(exchange) ? 'BTCUSDT' : 'KRW-BTC'}
        value={market}
        onChange={event => onMarketChange(event.target.value)}
      />
      <datalist id={listId}>
        {options.map(option => (
          <option key={option} value={option}>
            {language === 'ko' ? (prices[`${exchange}:${option}`]?.koreanName ?? '') : ''}
          </option>
        ))}
      </datalist>
    </div>
  );
};
