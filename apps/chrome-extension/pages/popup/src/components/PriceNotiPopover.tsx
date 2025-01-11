import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { getRegExp } from 'korean-regexp';
import { Bell } from 'lucide-react';

type ExchangeTicker = {
  exchange: string;
  market: string;
  currentPrice: number;
  changeRate: number;
  koreanName?: string;
};
type AllExchangesTickers = ExchangeTicker[];

const searchTicker = (ticker: ExchangeTicker, searchValue: string): boolean => {
  const trimmedSearch = searchValue.trim();
  const market = ticker.market.toLowerCase();
  const koreanName = ticker.koreanName || '';

  console.log(`Filter - Search: "${trimmedSearch}", Market: "${market}", KoreanName: "${koreanName}"`);

  if (!trimmedSearch) return true; // 검색어가 없으면 모두 표시

  // 영어 검색 (market)
  if (market.includes(trimmedSearch.toLowerCase())) {
    console.log(`Matched market: ${market}`);
    return true;
  }

  // 한글 전체 텍스트 검색
  if (koreanName && koreanName.includes(trimmedSearch)) {
    console.log(`Matched full koreanName: ${koreanName}`);
    return true;
  }

  // 한글 초성 검색
  if (koreanName && trimmedSearch) {
    const chosungRegex = getRegExp(trimmedSearch, { initialSearch: true });
    const isMatch = chosungRegex.test(koreanName);
    console.log(`Chosung match for "${trimmedSearch}" on "${koreanName}": ${isMatch}`);
    return isMatch;
  }

  return false;
};

export const PriceNotiPopover = () => {
  const [selectedTicker, setSelectedTicker] = useState<ExchangeTicker | null>(null);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [allExchangesTickers, setAllExchangesTickers] = useState<AllExchangesTickers>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const initializeChromeConnection = useCallback(() => {
    setIsLoading(true);
    const port = chrome.runtime.connect({ name: 'popup' });

    port.onMessage.addListener(({ type, data }) => {
      if (type === 'allExchangesTickers') {
        console.log('Loaded tickers:', data.slice(0, 5)); // 처음 5개만 로그
        setAllExchangesTickers(data);
        setIsLoading(false);
      }
    });

    port.onDisconnect.addListener(() => {
      setTimeout(() => initializeChromeConnection(), 500);
    });

    chrome.runtime.sendMessage({ action: 'getAllExchangesTickers' });
    return () => port.disconnect();
  }, []);

  useEffect(() => {
    const disconnect = initializeChromeConnection();
    return disconnect;
  }, [initializeChromeConnection]);

  return (
    <div className="relative inline-flex group">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="w-6 h-6 p-0 hover:cursor-pointer hover:bg-accent">
            <Bell strokeWidth={2} className="size-3.5 mt-[1px] p-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-1">
          <div className="grid gap-4">
            <Command
              filter={(value, search) => {
                const ticker = allExchangesTickers.find(t => t.market === value);
                if (!ticker) return 0;
                return searchTicker(ticker, search) ? 1 : 0;
              }}>
              <div>{selectedTicker?.market ?? 'Coin'}</div>
              <CommandInput
                placeholder="코인 검색"
                value={searchValue}
                onValueChange={setSearchValue}
                onFocus={() => setIsCommandOpen(true)}
                onBlur={() => setIsCommandOpen(false)}
              />
              {isCommandOpen && (
                <CommandList>
                  {isLoading ? (
                    <CommandEmpty>로딩 중...</CommandEmpty>
                  ) : allExchangesTickers.length === 0 ? (
                    <CommandEmpty>결과 없음</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {allExchangesTickers
                        .filter(ticker => searchTicker(ticker, searchValue))
                        .map(ticker => (
                          <CommandItem
                            key={ticker.market}
                            value={ticker.market} // value는 market과 일치
                            onSelect={value => {
                              const foundTicker = allExchangesTickers.find(t => t.market === value);
                              setSelectedTicker(foundTicker ?? null);
                              setIsCommandOpen(false);
                              setSearchValue('');
                            }}>
                            {ticker.koreanName ? `${ticker.koreanName} (${ticker.market})` : ticker.market}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  )}
                </CommandList>
              )}
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Dimensions</h4>
                <p className="text-sm text-muted-foreground">Set the dimensions for the layer.</p>
              </div>
              <div className="grid gap-2">
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="width">Width</Label>
                  <Input id="width" defaultValue="100%" className="col-span-2 h-8" />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="maxWidth">Max. width</Label>
                  <Input id="maxWidth" defaultValue="300px" className="col-span-2 h-8" />
                </div>
              </div>
            </Command>
          </div>
        </PopoverContent>
      </Popover>
      <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white font-semibold bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-49">
        지정가 알림 설정
      </span>
    </div>
  );
};
