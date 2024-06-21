import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import UpbitLogo from '@/assets/icons/upbit-logo.png';
import Bithumb from '@/assets/icons/bithumb-logo.png';
import coinOne from '@/assets/icons/coinone-logo.png';
import { ChevronDown } from 'lucide-react';

export function MarketDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-6 w-22 text-[10px] text-semibold hover:cursor-pointer gap-1  ">
          <img src={UpbitLogo} className="size-3" />
          <span>바이낸스</span>
          <ChevronDown className="size-2.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[100px]">
        <DropdownMenuGroup>
          <DropdownMenuItem className="gap-1 px-1 py-1 items-left text-xs">
            <img src={UpbitLogo} className="size-4  " />
            <span>업비트</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-1 px-1 py-1 items-left text-xs">
            <img src={Bithumb} className="size-4" />
            <span>빗썸</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-1 px-1 py-1 items-left text-xs">
            <img src={coinOne} className="size-4" />
            <span>바이낸스</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
