import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UpbitTicker, BithumbTicker, BinanceTicker, CoinbaseTicker } from '@/types';
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
import CoinbaseLogo from '../assets/icons/coinbase.png';
const exchanges = [
  {
    value: 'upbit',
    label: '업비트',
    logo: 'https://coin-images.coingecko.com/markets/images/117/large/upbit.png?1706864294',
  },
  {
    value: 'bithumb',
    label: '빗썸',
    logo: 'https://coin-images.coingecko.com/markets/images/6/large/bithumb_BI.png?1706864248',
  },
  {
    value: 'binance',
    label: '바이낸스',
    logo: 'https://coin-images.coingecko.com/markets/images/469/large/Binance.png?1706864454',
  },
  {
    value: 'coinbase',
    label: '코인베이스',
    logo: CoinbaseLogo,
  },
] as const;

type TickerTypes = UpbitTicker | BithumbTicker | BinanceTicker | CoinbaseTicker;

interface MarketDropdownProps {
  exchangePlatform: 'upbit' | 'bithumb' | 'binance' | 'coinbase';
  setExchangePlatform: (platform: 'upbit' | 'bithumb' | 'binance' | 'coinbase') => void;
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
  const { t } = useTranslation();
  const exchangeList = exchanges;
  const selectedPlatform = exchanges.find(exchange => exchange.value === exchangePlatform) || exchanges[0];

  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'changeExchange', exchange: exchangePlatform });
    setIsLoading(true);
    setTickers({});
  }, [exchangePlatform]);

  const dropdownSeletedHandler = (platform: 'upbit' | 'bithumb' | 'binance' | 'coinbase') => {
    setIsLoading(true);
    setTickers({});
    setRowPinning({ top: [], bottom: [] });
    setExchangePlatform(platform);
    chrome.runtime.sendMessage({ action: 'changeExchange', exchange: platform });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-6 w-20 text-[10px] font-semibold gap-1 hover:cursor-pointer">
          <img src={selectedPlatform.logo} className="size-3" />
          <span>{t(selectedPlatform.value)}</span>
          <ChevronDown className="size-2.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="relative left-1 w-[90px] data-[side=bottom]:slide-in-from-top-2">
        <DropdownMenuGroup>
          {exchangeList.map(({ value, logo }) => (
            <DropdownMenuItem
              key={value}
              className="gap-1 px-1 py-1 items-left text-xs hover:cursor-pointer"
              onClick={() => dropdownSeletedHandler(value)}>
              <img src={logo} className="size-4" />
              <span>{t(value)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
