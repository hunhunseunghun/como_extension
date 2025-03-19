import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RowPinningState } from '@tanstack/react-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExchangePlatform } from '@/types';
import { ChevronDown } from 'lucide-react';

const marketTypes = ['KRW', 'BTC', 'USDT'] as const;
type ExchangeMarketType = (typeof marketTypes)[number];

interface MarketTypeDropDownProps {
  exchangeMarketType: ExchangeMarketType;
  exchangePlatform: ExchangePlatform;
  setExchangeMarketType: (type: ExchangeMarketType) => void;
  setRowPinning: React.Dispatch<React.SetStateAction<RowPinningState>>;
}

export function MarketTypeDropDown({
  exchangePlatform,
  exchangeMarketType,
  setExchangeMarketType,
  setRowPinning,
}: MarketTypeDropDownProps) {
  const filteredMarketTypes: readonly ExchangeMarketType[] =
    exchangePlatform === 'bithumb' ? ['KRW', 'BTC'] : exchangePlatform === 'binance' ? ['USDT', 'BTC'] : marketTypes;

  const dropdownSeletedHandler = (type: ExchangeMarketType) => {
    const initRowPinning: RowPinningState = { top: [], bottom: [] };
    setExchangeMarketType(type);
    setRowPinning(initRowPinning);
  };

  useEffect(() => {
    if (exchangePlatform === 'binance') {
      setExchangeMarketType('USDT');
      return;
    }
    setExchangeMarketType('KRW');
  }, [exchangePlatform]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-6 w-15 text-[10px] font-semibold gap-1 hover:cursor-pointer">
          <span>{exchangeMarketType}</span>
          <ChevronDown className="size-2.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[60px]">
        <DropdownMenuGroup>
          {filteredMarketTypes.map(type => (
            <DropdownMenuItem
              key={type}
              onClick={() => dropdownSeletedHandler(type)}
              className="gap-1 px-1 py-1 text-xs hover:cursor-pointer">
              {type}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
