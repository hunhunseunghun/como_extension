import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

// ✅ 올바른 타입 정의
const marketTypes = ['KRW', 'BTC', 'USDT'] as const;
type ExchangeMarketType = (typeof marketTypes)[number];

interface MarketTypeDropDownProps {
  exchangeMarketType: ExchangeMarketType;
  setExchangeMarketType: (type: ExchangeMarketType) => void;
}

export function MarketTypeDropDown({ exchangeMarketType, setExchangeMarketType }: MarketTypeDropDownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-6 w-15 text-[10px] font-semibold gap-1 hover:cursor-pointer">
          <span>{exchangeMarketType}</span>
          <ChevronDown className="size-2.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[70px]">
        <DropdownMenuGroup>
          {marketTypes.map(type => (
            <DropdownMenuItem
              key={type}
              onClick={() => setExchangeMarketType(type)}
              className="gap-1 px-1 py-1 text-xs">
              {type}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
