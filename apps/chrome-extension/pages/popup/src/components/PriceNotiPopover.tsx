import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
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

type ExchangeData = {
  key: string;
  label: string;
  logo: string;
};
type ExchangesData = {
  [key: string]: ExchangeData;
};

const MAX_ITEMS = 500;

const searchTicker = (ticker: ExchangeTicker, searchValue: string): boolean => {
  const trimmedSearch = searchValue.trim().toLowerCase();
  const market = ticker.market.toLowerCase();
  const koreanName = ticker.koreanName || '';

  if (!trimmedSearch) return true;

  if (market.includes(trimmedSearch)) return true;
  if (koreanName.toLowerCase().includes(trimmedSearch)) return true;

  if (koreanName) {
    const chosungRegex = getRegExp(trimmedSearch, { initialSearch: true });
    return chosungRegex.test(koreanName);
  }

  return false;
};

const exchangesData: ExchangesData = {
  upbit: {
    key: 'upbit',
    label: '업비트',
    logo: 'https://coin-images.coingecko.com/markets/images/117/large/upbit.png?1706864294',
  },
  bithumb: {
    key: 'bithumb',
    label: '빗썸',
    logo: 'https://coin-images.coingecko.com/markets/images/6/large/bithumb_BI.png?1706864248',
  },
  binance: {
    key: 'binance',
    label: '바이낸스',
    logo: 'https://coin-images.coingecko.com/markets/images/469/large/Binance.png?1706864454',
  },
} as const;

export const PriceNotiPopover = () => {
  const [selectedTicker, setSelectedTicker] = useState<ExchangeTicker | null>(null);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [allExchangesTickers, setAllExchangesTickers] = useState<AllExchangesTickers>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [exchangePlatform, setExchangePlatform] = useState<ExchangeData>(exchangesData.upbit);

  const initializeChromeConnection = useCallback(() => {
    setIsLoading(true);
    const port = chrome.runtime.connect({ name: 'popup' });

    port.onMessage.addListener(({ type, data }: { type: string; data: AllExchangesTickers }) => {
      if (type === 'allExchangesTickers') {
        const uniqueTickers = Array.from(
          new Map(
            data.map(ticker => [`${ticker.exchange.toLowerCase()}:${ticker.market.toLowerCase()}`, ticker]),
          ).values(),
        );
        console.log('Unique tickers:', uniqueTickers.length, uniqueTickers.slice(0, 5));
        setAllExchangesTickers(uniqueTickers);
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

  // 필터링된 결과 계산 (인덱싱 제거, 직접 필터링)
  const filteredTickers = useMemo(() => {
    if (isLoading || allExchangesTickers.length === 0) return [];

    // exchangePlatform에 따라 필터링된 티커 목록
    const platformFilteredTickers = allExchangesTickers.filter(
      ticker => ticker.exchange.toLowerCase() === exchangePlatform.key.toLowerCase(),
    );

    if (!searchValue.trim()) return platformFilteredTickers.slice(0, MAX_ITEMS);

    const filtered = platformFilteredTickers.filter(ticker => searchTicker(ticker, searchValue)).slice(0, MAX_ITEMS);

    console.log('Filtered tickers:', filtered.length, filtered);
    return filtered;
  }, [allExchangesTickers, searchValue, isLoading, exchangePlatform]);

  // CommandItem 렌더링 함수 메모이제이션
  const renderTickerItem = useCallback(
    (ticker: ExchangeTicker) => {
      const handleSelect = (value: string) => {
        const foundTicker = allExchangesTickers.find(
          t => `${t.exchange.toLowerCase()}:${t.market.toLowerCase()}` === value.toLowerCase(),
        );
        if (foundTicker) {
          setSelectedTicker(foundTicker);
          setIsCommandOpen(false);
          setSearchValue('');
        }
      };

      const uniqueValue = `${ticker.exchange}:${ticker.market}`;
      return (
        <CommandItem key={uniqueValue} value={uniqueValue} onMouseDown={() => handleSelect(uniqueValue)}>
          {ticker.koreanName ? (
            <div className="flex items-center gap-2">
              <img
                src={exchangesData[ticker.exchange as keyof typeof exchangesData]?.logo}
                alt={`${ticker.exchange} logo`}
                className="size-3.5"
              />
              {`${ticker.koreanName} (${ticker.market})`}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <img
                src={exchangesData[ticker.exchange as keyof typeof exchangesData]?.logo}
                alt={`${ticker.exchange} logo`}
                className="size-3.5"
              />
              {ticker.market}
            </div>
          )}
        </CommandItem>
      );
    },
    [allExchangesTickers],
  );

  // 엔터키로 선택 처리
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && filteredTickers.length > 0) {
        console.log('Enter pressed, selecting first ticker:', filteredTickers[0]);
        setSelectedTicker(filteredTickers[0]);
        setIsCommandOpen(false);
        setSearchValue('');
      }
    },
    [filteredTickers],
  );

  return (
    <div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="w-6 h-6 p-0 hover:cursor-pointer hover:bg-accent">
            <Bell strokeWidth={2} className="size-3.5 mt-[1px] p-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-1">
          <div>
            <Command>
              <div className="flex items-center gap-1">
                {selectedTicker?.market ?? 'Coin'}
                {selectedTicker && (
                  <div className="cursor-pointer text-sm text-muted-foreground" onClick={() => setSelectedTicker(null)}>
                    취소
                  </div>
                )}
              </div>
              <div className="relative group">
                <section className="flex">
                  <CommandInput
                    className="h-6 items-start p-0 gap-1 text-[12px]"
                    placeholder="Search"
                    value={searchValue}
                    onValueChange={setSearchValue}
                    onFocus={() => setIsCommandOpen(true)}
                    onBlur={() => setIsCommandOpen(false)}
                    onKeyDown={handleInputKeyDown}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-6 w-10 text-[10px] font-semibold gap-1 hover:cursor-pointer">
                        <img src={exchangePlatform.logo} className="size-3" />
                        <ChevronDown className="size-2.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="relative left-0 p-1 data-[side=bottom]:slide-in-from-top-2">
                      <DropdownMenuGroup>
                        {Object.values(exchangesData).map(({ key, logo }) => (
                          <DropdownMenuItem
                            key={key}
                            className="w-7.5 px-1 py-1 justify-center items-center text-xs hover:cursor-pointer"
                            onClick={() => setExchangePlatform(exchangesData[key])}>
                            <img src={logo} className="size-3.5" />
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </section>

                {isCommandOpen && (
                  <CommandList className="absolute bottom-0 ">
                    {isLoading ? (
                      <CommandEmpty>Loading...</CommandEmpty>
                    ) : filteredTickers.length === 0 ? (
                      <CommandEmpty>No results</CommandEmpty>
                    ) : (
                      <CommandGroup>{filteredTickers.map(renderTickerItem)}</CommandGroup>
                    )}
                  </CommandList>
                )}
              </div>

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
