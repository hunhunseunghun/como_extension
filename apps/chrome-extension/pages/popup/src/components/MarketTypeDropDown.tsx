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
import { ExchangePlatform, MarketType } from '@/types';
import { ChevronDown } from 'lucide-react';

const marketTypes: MarketType[] = ['KRW', 'BTC', 'USDT', 'USD', 'EUR', 'GBP'];

interface MarketTypeDropDownProps {
  exchangeMarketType: MarketType;
  exchangePlatform: ExchangePlatform;
  setExchangeMarketType: (type: MarketType) => void;
  setRowPinning: React.Dispatch<React.SetStateAction<RowPinningState>>;
}

export function MarketTypeDropDown({
  exchangePlatform,
  exchangeMarketType,
  setExchangeMarketType,
  setRowPinning,
}: MarketTypeDropDownProps) {
  const getFilteredMarketTypes = (): MarketType[] => {
    switch (exchangePlatform) {
      case 'upbit':
        return ['KRW', 'BTC', 'USDT'];
      case 'bithumb':
        return ['KRW', 'BTC'];
      case 'binance':
        return ['USDT', 'BTC'];
      case 'coinbase':
        return ['USD', 'USDT', 'EUR', 'GBP'];
      default:
        return marketTypes;
    }
  };

  const filteredMarketTypes = getFilteredMarketTypes();

  const dropdownSeletedHandler = (type: MarketType) => {
    const initRowPinning: RowPinningState = { top: [], bottom: [] };
    setExchangeMarketType(type);
    setRowPinning(initRowPinning);
  };

  useEffect(() => {
    switch (exchangePlatform) {
      case 'binance':
        setExchangeMarketType('USDT');
        break;
      case 'coinbase':
        setExchangeMarketType('USD');
        break;
      default:
        setExchangeMarketType('KRW');
    }
  }, [exchangePlatform, setExchangeMarketType]);

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
