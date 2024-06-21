import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

export function MarketTypeDropDown({ upbitMarketType, setUpbitMarketType }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-6 w-15 text-[10px] text-semibold hover:cursor-pointer gap-1  ">
          <span>{upbitMarketType}</span>
          <ChevronDown className="size-2.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[70px]">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => setUpbitMarketType('KRW')} className="gap-1 px-1 py-1 items-left text-xs">
            KRW
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setUpbitMarketType('BTC')} className="gap-1 px-1 py-1 items-left text-xs">
            <span>BTC</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setUpbitMarketType('USDT')} className="gap-1 px-1 py-1 items-left text-xs">
            <span>USDT</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
