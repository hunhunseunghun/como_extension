import { useEffect } from 'react';
import { UpbitTicker, BithumbTicker, BinanceTicker, ExchangePlatform } from '@/types';
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
import { EXCHANGES, EXCHANGE_LIST } from '@/constants/exchanges';


type TickerTypes = UpbitTicker | BithumbTicker | BinanceTicker;

interface MarketDropdownProps {
  exchangePlatform: ExchangePlatform;
  setExchangePlatform: (platform: ExchangePlatform) => void;
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
  const exchangeList = EXCHANGE_LIST;
  const selectedPlatform = EXCHANGES[exchangePlatform] || EXCHANGES.upbit;

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
        <Button variant="outline" className="h-6 w-20 text-cap-s font-semibold gap-1 hover:cursor-pointer">
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
              className="gap-1 px-1 py-1 items-left text-body-s hover:cursor-pointer"
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
