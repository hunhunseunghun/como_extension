import { ExchangePlatform } from '@/types';
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


interface MarketDropdownProps {
  exchangePlatform: ExchangePlatform;
  // 거래소 전환(시세·고정 행 초기화, 백그라운드 알림)은 App이 맡는다.
  setExchangePlatform: (platform: ExchangePlatform) => void;
}

export const MarketDropdown = ({
  exchangePlatform,
  setExchangePlatform,
}: MarketDropdownProps) => {
  const { t } = useI18n();
  const exchangeList = EXCHANGE_LIST;
  const selectedPlatform = EXCHANGES[exchangePlatform] || EXCHANGES.upbit;


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
              onClick={() => setExchangePlatform(key)}>
              <img src={logo} className="size-4" />
              <span>{t(labelKey)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
