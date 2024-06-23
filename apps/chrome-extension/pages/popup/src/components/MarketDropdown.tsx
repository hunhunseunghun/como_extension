import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import UpbitLogo from '@/assets/icons/upbit-logo.png';
// import BithumbLogo from '@/assets/icons/bithumb-logo.png';
// import CoinOneLogo from '@/assets/icons/coinone-logo.png';

import { ChevronDown } from 'lucide-react';

const platformData = {
  upbit: { key: 'upbit', label: '업비트', logo: UpbitLogo },
  // bithumb: { key: 'bithumb', logo: BithumbLogo, label: '빗썸' },
  // coinone: { key: 'coinone', label: '코인원', logo: CoinOneLogo },
  // binance: { key: 'bainance', label: '바이낸스', logo: BinanceLogo },
};

const exchangeList = Object.entries(platformData).map(([key, { label, logo }]) => ({
  key,
  label,
  logo,
}));

export function MarketDropdown({ exchangePlatform, setExchangePlatform }) {
  const selectedPlatform = platformData[exchangePlatform] || platformData.upbit;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-6 w-20 text-[10px] font-semibold gap-1 hover:cursor-pointer">
          <img src={selectedPlatform.logo} className="size-3" />
          <span>{selectedPlatform.label}</span> {/* 한글 표시 */}
          <ChevronDown className="size-2.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[100px]">
        <DropdownMenuGroup>
          {exchangeList.map(({ key, label, logo }) => (
            <DropdownMenuItem
              key={key}
              className="gap-1 px-1 py-1 items-left text-xs"
              onClick={() => setExchangePlatform(key)}>
              <img src={logo} className="size-4" />
              <span>{label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
