import { useEffect } from 'react';
import { UpbitTicker, BithumbTicker, BinanceTicker } from '@/types';
import { RowPinningState } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/i18n';

const exchangesData = {
  upbit: {
    key: 'upbit',
    labelKey: 'exchange_upbit',
    logo: 'https://coin-images.coingecko.com/markets/images/117/large/upbit.png?1706864294',
  },
  bithumb: {
    key: 'bithumb',
    labelKey: 'exchange_bithumb',
    logo: 'https://coin-images.coingecko.com/markets/images/6/large/bithumb_BI.png?1706864248',
  },
  // coinone: { key: 'coinone', label: '코인원', logo: CoinOneLogo },
  binance: {
    key: 'binance',
    labelKey: 'exchange_binance',
    logo: 'https://coin-images.coingecko.com/markets/images/469/large/Binance.png?1706864454',
  },
} as const;

type TickerTypes = UpbitTicker | BithumbTicker | BinanceTicker;

interface MarketDropdownProps {
  exchangePlatform: 'upbit' | 'bithumb' | 'binance';
  setExchangePlatform: (platform: keyof typeof exchangesData) => void;
  setIsLoading: (loading: boolean) => void;
  setTickers: React.Dispatch<React.SetStateAction<{ [key: string]: TickerTypes }>>;
  setRowPinning: React.Dispatch<React.SetStateAction<RowPinningState>>;
}

export const MarketDropdown = ({
  exchangePlatform,
  setExchangePlatform,
  setIsLoading,
  setRowPinning,
  setTickers,
}: MarketDropdownProps) => {
  const { t } = useI18n();
  const exchangeList = Object.values(exchangesData);
  const selectedPlatform = exchangesData[exchangePlatform] || exchangesData.upbit;
  type ExchangePlatform = keyof typeof exchangesData;

  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'changeExchange', exchange: exchangePlatform });
    setIsLoading(true);
    setTickers({});
  }, [exchangePlatform]);

  const dropdownSeletedHandler = (key: ExchangePlatform) => {
    const initRowPinning: RowPinningState = { top: [], bottom: [] };
    setExchangePlatform(key);
    setRowPinning(initRowPinning);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-6 w-20 text-[10px] font-semibold gap-1 hover:cursor-pointer">
          <img src={selectedPlatform.logo} className="size-3" />
          <span>{t(selectedPlatform.labelKey)}</span>
          <ChevronDown className="size-2.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="relative left-1 w-[90px] data-[side=bottom]:slide-in-from-top-2">
        <DropdownMenuGroup>
          {exchangeList.map(({ key, labelKey, logo }) => (
            <DropdownMenuItem
              key={key}
              className="gap-1 px-1 py-1 items-left text-xs hover:cursor-pointer"
              onClick={() => dropdownSeletedHandler(key)}>
              <img src={logo} className="size-4" />
              <span>{t(labelKey)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
