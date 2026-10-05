import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExchangePlatform, MarketType } from '@/types';
import { ChevronDown } from 'lucide-react';
import { MARKET_TYPES } from '@/constants/exchanges';

type ExchangeMarketType = MarketType;

interface MarketTypeDropDownProps {
  exchangeMarketType: ExchangeMarketType;
  exchangePlatform: ExchangePlatform;
  setExchangeMarketType: (type: ExchangeMarketType) => void;
}

export function MarketTypeDropDown({
  exchangePlatform,
  exchangeMarketType,
  setExchangeMarketType,
}: MarketTypeDropDownProps) {
  const filteredMarketTypes = MARKET_TYPES[exchangePlatform] ?? MARKET_TYPES.upbit;

  const dropdownSeletedHandler = (type: ExchangeMarketType) => {
    setExchangeMarketType(type);
  };

  // 거래소를 바꾸면 그 거래소의 기본 마켓으로 돌아간다.
  useEffect(() => {
    setExchangeMarketType(filteredMarketTypes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchangePlatform]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-6 w-15 text-cap-s font-semibold gap-1 hover:cursor-pointer">
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
              className="gap-1 px-1 py-1 text-body-s hover:cursor-pointer">
              {type}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
