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

const searchTicker = (ticker: ExchangeTicker, searchValue: string): boolean => {
  const trimmedSearch = searchValue.trim();
  const market = ticker.market.toLowerCase();
  const koreanName = ticker.koreanName || '';

  if (!trimmedSearch) return true;

  if (market.includes(trimmedSearch.toLowerCase())) return true;

  if (koreanName) {
    if (koreanName.includes(trimmedSearch)) return true;

    try {
      const chosungRegex = getRegExp(trimmedSearch, { initialSearch: true });
      if (chosungRegex.test(koreanName)) return true;
    } catch (error) {
      return koreanName.includes(trimmedSearch);
      throw error;
    }
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
  const [currentPrice, setCurrentPrice] = useState(0);

  const initializeChromeConnection = useCallback(() => {
    setIsLoading(true);
    const port = chrome.runtime.connect({ name: 'popup' });

    port.onMessage.addListener(({ type, data }: { type: string; data: AllExchangesTickers }) => {
      if (type === 'allExchangesTickers') {
        const uniqueTickers = Array.from(
          new Map(
            data.map(ticker => {
              if (ticker.market && ticker.exchange === 'upbit' && ticker.market === 'KRW-BTC' && ticker.currentPrice) {
                setSelectedTicker(ticker);
                setCurrentPrice(ticker.currentPrice);
              }
              return [`${ticker.exchange.toLowerCase()}:${ticker.market.toLowerCase()}`, ticker];
            }),
          ).values(),
        );
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

  const filteredTickers = useMemo(() => {
    if (isLoading || allExchangesTickers.length === 0) return [];

    const platformFilteredTickers = allExchangesTickers.filter(
      ticker => ticker.exchange.toLowerCase() === exchangePlatform.key.toLowerCase(),
    );

    if (!searchValue.trim()) return platformFilteredTickers;

    const filtered = platformFilteredTickers.filter(ticker => searchTicker(ticker, searchValue));
    return filtered;
  }, [allExchangesTickers, searchValue, isLoading, exchangePlatform]);

  const renderTickerItem = useCallback(
    (ticker: ExchangeTicker) => {
      const handleSelect = (value: string) => {
        const foundTicker = allExchangesTickers.find(
          t => `${t.exchange.toLowerCase()}:${t.market.toLowerCase()}` === value.toLowerCase(),
        );
        if (foundTicker && foundTicker.currentPrice) {
          setSelectedTicker(foundTicker);
          setCurrentPrice(foundTicker.currentPrice);
          setIsCommandOpen(false);
          setSearchValue('');
        }
      };

      const uniqueValue = `${ticker.exchange}:${ticker.market}`;
      return (
        <CommandItem
          className="text-[10px] hover:bg-muted"
          key={uniqueValue}
          value={uniqueValue}
          onMouseDown={e => {
            e.preventDefault();
            handleSelect(uniqueValue);
          }}>
          {ticker.koreanName ? (
            <div className="flex items-center gap-1">
              <img
                src={exchangesData[ticker.exchange as keyof typeof exchangesData]?.logo}
                alt={`${ticker.exchange} logo`}
                className="size-3.5"
              />
              {`${ticker.koreanName} (${ticker.market})`}
            </div>
          ) : (
            <div className="flex items-center gap-1">
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

  return (
    <div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="w-6 h-6 p-0 hover:cursor-pointer hover:bg-accent">
            <Bell strokeWidth={2} className="size-3.5 mt-[1px] p-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 h-90 p-2 bg-background dark:bg-background">
          <div>
            <Command shouldFilter={false} className="w-full h-full bg-background dark:bg-background">
              <div className="relative">
                <section className="flex w-full border rounded-md gap-1">
                  <CommandInput
                    className="w-full h-6 p-0 gap-1 text-[11px] border-none text-neutral-400 pl-4 focus-visible:ring-0 "
                    placeholder="BTC , 비트"
                    value={searchValue}
                    onValueChange={value => {
                      setSearchValue(value);
                      setIsCommandOpen(true);
                    }}
                    onClick={() => {
                      setIsCommandOpen(!isCommandOpen);
                    }}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-6 w-10 text-[11px] font-semibold gap-1 border-transparent hover:cursor-pointer">
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
                  <>
                    <CommandList className="absolute top-6.5 left-0 w-full max-h-70 overflow-y-auto bg-background z-50 light-scrollbar dark-scrollbar text-[10px]">
                      {isLoading ? (
                        <CommandEmpty>Loading...</CommandEmpty>
                      ) : filteredTickers.length === 0 ? (
                        <CommandEmpty>No results</CommandEmpty>
                      ) : (
                        <CommandGroup className="text-[10px] font-semibold">
                          {filteredTickers.map(ticker => {
                            return renderTickerItem(ticker);
                          })}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </>
                )}
              </div>
              <section className="flex flex-col p-2 gap-1">
                <div className="flex items-center h-7.5 text-[13px] bg-background gap-1 p-1">
                  {selectedTicker?.market && (
                    <div className="flex items-center font-semibold gap-1">
                      <img
                        src={exchangesData[selectedTicker.exchange as keyof typeof exchangesData]?.logo}
                        alt={`${selectedTicker.exchange} logo`}
                        className="size-3.5"
                      />
                      {`${selectedTicker.koreanName ?? '종목 선택'} (${selectedTicker.market})`}
                    </div>
                  )}
                </div>

                <div className="relatvie flex text-[12px] font-semibold bg-background border-none p-1">
                  <input
                    type="number"
                    min="0"
                    type="text"
                    value={currentPrice.toLocaleString('en-US')}
                    onChange={e => {
                      const value = e.target.value.replace(/,/g, '');
                      setCurrentPrice(Number(value) || 0);
                    }}
                    className="w-full text-right focus:outline-none appearance-none"
                  />
                  <span className="absolute">지정 가격</span>
                </div>
              </section>

              <div className="font-semibold">지정가 알림 목록</div>

              <div className="space-y-2 mt-2"></div>
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
