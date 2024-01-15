// import { useState, useEffect, useCallback, useMemo } from 'react';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import { Label } from '@/components/ui/label';
// import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuGroup,
//   DropdownMenuItem,
//   DropdownMenuTrigger,
// } from '@/components/ui/dropdown-menu';
// import { ChevronDown, Bell, X } from 'lucide-react';
// import { getRegExp } from 'korean-regexp';

// type ExchangeTicker = {
//   exchange: string;
//   market: string;
//   currentPrice: number;
//   changeRate: number;
//   koreanName?: string;
// };
// type AllExchangesTickers = ExchangeTicker[];

// type ExchangeData = {
//   key: string;
//   label: string;
//   logo: string;
// };
// type ExchangesData = {
//   [key: string]: ExchangeData;
// };

// const searchTicker = (ticker: ExchangeTicker, searchValue: string): boolean => {
//   const trimmedSearch = searchValue.trim();
//   const market = ticker.market.toLowerCase();
//   const koreanName = ticker.koreanName || '';

//   if (!trimmedSearch) return true;

//   if (market.includes(trimmedSearch.toLowerCase())) return true;

//   if (koreanName) {
//     if (koreanName.includes(trimmedSearch)) return true;

//     try {
//       const chosungRegex = getRegExp(trimmedSearch, { initialSearch: true });
//       if (chosungRegex.test(koreanName)) return true;
//     } catch (error) {
//       console.warn(error);
//       return koreanName.includes(trimmedSearch);
//     }
//   }

//   return false;
// };

// const exchangesData: ExchangesData = {
//   upbit: {
//     key: 'upbit',
//     label: '업비트',
//     logo: 'https://coin-images.coingecko.com/markets/images/117/large/upbit.png?1706864294',
//   },
//   bithumb: {
//     key: 'bithumb',
//     label: '빗썸',
//     logo: 'https://coin-images.coingecko.com/markets/images/6/large/bithumb_BI.png?1706864248',
//   },
//   binance: {
//     key: 'binance',
//     label: '바이낸스',
//     logo: 'https://coin-images.coingecko.com/markets/images/469/large/Binance.png?1706864454',
//   },
// } as const;

// export const PriceNotiPopover = () => {
//   const [selectedTicker, setSelectedTicker] = useState<ExchangeTicker | null>(null);
//   const [isCommandOpen, setIsCommandOpen] = useState(false);
//   const [allExchangesTickers, setAllExchangesTickers] = useState<AllExchangesTickers>([]);
//   const [isLoading, setIsLoading] = useState(false);
//   const [searchValue, setSearchValue] = useState('');
//   const [exchangePlatform, setExchangePlatform] = useState<ExchangeData>(exchangesData.upbit);
//   const [targetPrice, setTargetPrice] = useState<number>(0);
//   const [deadBand, setDeadBand] = useState<number>(1);
//   const [savedPrices, setSavedPrices] = useState<number[]>([]); // 선택된 종목의 지정가
//   const [allPriceAlerts, setAllPriceAlerts] = useState<{ [exchange: string]: { [ticker: string]: number[] } }>({}); // 전체 지정가

//   const initializeChromeConnection = useCallback(() => {
//     setIsLoading(true);
//     const port = chrome.runtime.connect({ name: 'popup' });

//     port.onMessage.addListener((message: { type: string; data: unknown }) => {
//       const { type, data } = message;

//       if (type === 'allExchangesTickers') {
//         const tickers = data as ExchangeTicker[];
//         const uniqueTickers = Array.from(
//           new Map(
//             tickers.map(ticker => [`${ticker.exchange.toLowerCase()}:${ticker.market.toLowerCase()}`, ticker]),
//           ).values(),
//         );
//         setAllExchangesTickers(uniqueTickers);
//         setIsLoading(false);

//         const defaultTicker = uniqueTickers.find(ticker => ticker.exchange === 'upbit' && ticker.market === 'KRW-BTC');
//         if (defaultTicker) {
//           setSelectedTicker(defaultTicker);
//           setTargetPrice(defaultTicker.currentPrice || 0);
//         }
//       } else if (type === 'setPriceAlertResponse') {
//         const response = data as { success: boolean; prices: number[] };
//         if (response.success) {
//           setSavedPrices(response.prices); // 선택된 종목의 지정가 업데이트
//           chrome.storage.local.get(['priceAlerts'], result => {
//             setAllPriceAlerts(result.priceAlerts || {}); // 전체 지정가 업데이트
//           });
//         }
//       } else if (type === 'deletePriceAlertResponse') {
//         const response = data as { success: boolean; prices: number[] };
//         if (response.success) {
//           setSavedPrices(response.prices); // 삭제 후 지정가 업데이트
//           chrome.storage.local.get(['priceAlerts'], result => {
//             setAllPriceAlerts(result.priceAlerts || {}); // 전체 지정가 업데이트
//           });
//         }
//       }
//     });

//     port.onDisconnect.addListener(() => {
//       setTimeout(() => initializeChromeConnection(), 500);
//     });

//     chrome.runtime.sendMessage({ action: 'getAllExchangesTickers' });

//     // 초기 로드 시 전체 지정가 가져오기
//     chrome.storage.local.get(['priceAlerts'], result => {
//       setAllPriceAlerts(result.priceAlerts || {});
//     });

//     return () => port.disconnect();
//   }, []);

//   useEffect(() => {
//     const disconnect = initializeChromeConnection();
//     return disconnect;
//   }, [initializeChromeConnection]);

//   const filteredTickers = useMemo(() => {
//     if (isLoading || allExchangesTickers.length === 0) return [];

//     const platformFilteredTickers = allExchangesTickers.filter(
//       ticker => ticker.exchange.toLowerCase() === exchangePlatform.key.toLowerCase(),
//     );

//     if (!searchValue.trim()) return platformFilteredTickers;

//     return platformFilteredTickers.filter(ticker => searchTicker(ticker, searchValue));
//   }, [allExchangesTickers, searchValue, isLoading, exchangePlatform]);

//   const renderTickerItem = useCallback(
//     (ticker: ExchangeTicker) => {
//       const handleSelect = (value: string) => {
//         const foundTicker = allExchangesTickers.find(
//           t => `${t.exchange.toLowerCase()}:${t.market.toLowerCase()}` === value.toLowerCase(),
//         );
//         if (foundTicker && foundTicker.currentPrice) {
//           setSelectedTicker(foundTicker);
//           setTargetPrice(foundTicker.currentPrice);
//           setIsCommandOpen(false);
//           setSearchValue('');
//           // 선택 시 저장된 지정가 로드
//           chrome.storage.local.get(['priceAlerts'], result => {
//             const alerts = result.priceAlerts || {};
//             setSavedPrices(alerts[foundTicker.exchange]?.[foundTicker.market] || []);
//           });
//         }
//       };

//       const uniqueValue = `${ticker.exchange}:${ticker.market}`;
//       return (
//         <CommandItem
//           className="text-[10px] hover:bg-muted"
//           key={uniqueValue}
//           value={uniqueValue}
//           onMouseDown={e => {
//             e.preventDefault();
//             handleSelect(uniqueValue);
//           }}>
//           {ticker.koreanName ? (
//             <div className="flex items-center gap-1">
//               <img
//                 src={exchangesData[ticker.exchange as keyof typeof exchangesData]?.logo}
//                 alt={`${ticker.exchange} logo`}
//                 className="size-3.5"
//               />
//               {`${ticker.koreanName} (${ticker.market})`}
//             </div>
//           ) : (
//             <div className="flex items-center gap-1">
//               <img
//                 src={exchangesData[ticker.exchange as keyof typeof exchangesData]?.logo}
//                 alt={`${ticker.exchange} logo`}
//                 className="size-3.5"
//               />
//               {ticker.market}
//             </div>
//           )}
//         </CommandItem>
//       );
//     },
//     [allExchangesTickers],
//   );

//   const handleSetPriceAlert = () => {
//     if (!selectedTicker || targetPrice <= 0) {
//       return;
//     }

//     chrome.runtime.sendMessage({
//       action: 'setPriceAlert',
//       exchange: selectedTicker.exchange,
//       ticker: selectedTicker.market,
//       prices: [targetPrice],
//       deadband: deadBand / 100,
//     });
//   };

//   const handleDeletePriceAlert = (priceToDelete: number) => {
//     if (!selectedTicker) return;

//     chrome.runtime.sendMessage({
//       action: 'deletePriceAlert',
//       exchange: selectedTicker.exchange,
//       ticker: selectedTicker.market,
//       price: priceToDelete,
//     });
//   };

//   return (
//     <div>
//       <Popover>
//         <PopoverTrigger asChild>
//           <Button variant="outline" size="icon" className="w-6 h-6 p-0 hover:cursor-pointer hover:bg-accent">
//             <Bell strokeWidth={2} className="size-3.5 mt-[1px] p-0" />
//           </Button>
//         </PopoverTrigger>
//         <PopoverContent className="w-72 p-2 bg-background dark:bg-background">
//           <div>
//             <Command shouldFilter={false} className="w-full bg-background dark:bg-background">
//               <div className="relative">
//                 <section className="flex w-full border rounded-md gap-1">
//                   <CommandInput
//                     className="w-full h-6 p-0 gap-1 text-[11px] border-none text-neutral-400 pl-4 focus-visible:ring-0"
//                     placeholder="BTC , 비트"
//                     value={searchValue}
//                     onValueChange={value => {
//                       setSearchValue(value);
//                       setIsCommandOpen(true);
//                     }}
//                     onClick={() => {
//                       setIsCommandOpen(!isCommandOpen);
//                     }}
//                   />
//                   <DropdownMenu>
//                     <DropdownMenuTrigger asChild>
//                       <Button
//                         variant="outline"
//                         className="h-6 w-10 text-[11px] font-semibold gap-1 border-transparent hover:cursor-pointer">
//                         <img src={exchangePlatform.logo} className="size-3" />
//                         <ChevronDown className="size-2.5" />
//                       </Button>
//                     </DropdownMenuTrigger>
//                     <DropdownMenuContent className="relative left-0 p-1 data-[side=bottom]:slide-in-from-top-2">
//                       <DropdownMenuGroup>
//                         {Object.values(exchangesData).map(({ key, logo }) => (
//                           <DropdownMenuItem
//                             key={key}
//                             className="w-7.5 px-1 py-1 justify-center items-center text-xs hover:cursor-pointer"
//                             onClick={() => setExchangePlatform(exchangesData[key])}>
//                             <img src={logo} className="size-3.5" />
//                           </DropdownMenuItem>
//                         ))}
//                       </DropdownMenuGroup>
//                     </DropdownMenuContent>
//                   </DropdownMenu>
//                 </section>
//                 {isCommandOpen && (
//                   <CommandList className="absolute top-6.5 left-0 w-full max-h-70 overflow-y-auto bg-background z-50 light-scrollbar dark-scrollbar text-[10px]">
//                     {isLoading ? (
//                       <CommandEmpty>Loading...</CommandEmpty>
//                     ) : filteredTickers.length === 0 ? (
//                       <CommandEmpty>No results</CommandEmpty>
//                     ) : (
//                       <CommandGroup className="text-[10px] font-semibold">
//                         {filteredTickers.map(ticker => renderTickerItem(ticker))}
//                       </CommandGroup>
//                     )}
//                   </CommandList>
//                 )}
//               </div>
//               <section className="flex flex-col p-2 gap-1">
//                 <div className="flex items-center h-7.5 text-[13px] bg-background gap-1 p-1">
//                   {selectedTicker?.market && (
//                     <div className="flex items-center font-semibold gap-1">
//                       <img
//                         src={exchangesData[selectedTicker.exchange as keyof typeof exchangesData]?.logo}
//                         alt={`${selectedTicker.exchange} logo`}
//                         className="size-3.5"
//                       />
//                       {`${selectedTicker.koreanName ?? '종목 선택'} (${selectedTicker.market})`}
//                     </div>
//                   )}
//                 </div>

//                 <div className="relative flex text-[12px] bg-muted border-none p-1">
//                   <Label className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]">지정 가격</Label>
//                   <Input
//                     type="text"
//                     value={targetPrice.toLocaleString('en-US')}
//                     onChange={e => {
//                       const value = e.target.value.replace(/,/g, '');
//                       setTargetPrice(Number(value) || 0);
//                     }}
//                     className="w-full h-7 text-right font-semibold focus:outline-none appearance-none border-none bg-transparent"
//                   />
//                 </div>

//                 <div className="relative flex text-[12px] bg-muted border-none p-1">
//                   <Label className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]">데드밴드 (%)</Label>
//                   <Input
//                     type="number"
//                     value={deadBand}
//                     onChange={e => setDeadBand(Number(e.target.value) || 0)}
//                     className="w-full h-7 text-right font-semibold focus:outline-none appearance-none border-none bg-transparent"
//                     min={0}
//                     step={0.1}
//                   />
//                 </div>

//                 <Button
//                   variant="outline"
//                   onClick={handleSetPriceAlert}
//                   className="mt-2 h-7 text-[11px] hover:cursor-pointer">
//                   알림 추가
//                 </Button>

//                 <div className="font-semibold mt-2">선택된 종목 지정가</div>
//                 {savedPrices.length > 0 ? (
//                   <ul className="text-[10px] mt-1">
//                     {savedPrices.map((price, index) => (
//                       <li key={index} className="flex items-center justify-between">
//                         <span>{price.toLocaleString('en-US')}</span>
//                         <Button
//                           variant="ghost"
//                           size="icon"
//                           className="h-4 w-4 p-0"
//                           onClick={() => handleDeletePriceAlert(price)}>
//                           <X className="h-3 w-3" />
//                         </Button>
//                       </li>
//                     ))}
//                   </ul>
//                 ) : (
//                   <div className="text-[10px] mt-1">지정가가 없습니다.</div>
//                 )}

//                 <div className="font-semibold mt-2">전체 지정가 알림</div>
//                 {Object.keys(allPriceAlerts).length > 0 ? (
//                   <ul className="text-[10px] mt-1 max-h-40 overflow-y-auto">
//                     {Object.entries(allPriceAlerts).map(([exchange, tickers]) =>
//                       Object.entries(tickers).map(([ticker, prices]) => (
//                         <li key={`${exchange}-${ticker}`} className="mb-1">
//                           <div className="flex items-center gap-1">
//                             <img
//                               src={exchangesData[exchange as keyof typeof exchangesData]?.logo}
//                               alt={`${exchange} logo`}
//                               className="size-3"
//                             />
//                             <span>{ticker}</span>
//                           </div>
//                           <ul className="ml-4">
//                             {prices.map((price, index) => (
//                               <li key={index} className="flex items-center justify-between">
//                                 <span>{price.toLocaleString('en-US')}</span>
//                                 {selectedTicker?.exchange === exchange && selectedTicker?.market === ticker && (
//                                   <Button
//                                     variant="ghost"
//                                     size="icon"
//                                     className="h-4 w-4 p-0"
//                                     onClick={() => handleDeletePriceAlert(price)}>
//                                     <X className="h-3 w-3" />
//                                   </Button>
//                                 )}
//                               </li>
//                             ))}
//                           </ul>
//                         </li>
//                       )),
//                     )}
//                   </ul>
//                 ) : (
//                   <div className="text-[10px] mt-1">전체 지정가가 없습니다.</div>
//                 )}
//               </section>
//             </Command>
//           </div>
//         </PopoverContent>
//       </Popover>
//       <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white font-semibold bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-49">
//         지정가 알림 설정
//       </span>
//     </div>
//   );
// };

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
import { ChevronDown, Bell, X } from 'lucide-react';
import { getRegExp } from 'korean-regexp';

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
      console.warn(error);
      return koreanName.includes(trimmedSearch);
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
  const [targetPrice, setTargetPrice] = useState<number>(0);
  const [deadBand, setDeadBand] = useState<number>(1);
  const [allPriceAlerts, setAllPriceAlerts] = useState<{ [exchange: string]: { [ticker: string]: number[] } }>({}); // 전체 지정가

  const initializeChromeConnection = useCallback(() => {
    setIsLoading(true);
    const port = chrome.runtime.connect({ name: 'popup' });

    port.onMessage.addListener((message: { type: string; data: unknown }) => {
      const { type, data } = message;

      if (type === 'allExchangesTickers') {
        const tickers = data as ExchangeTicker[];
        const uniqueTickers = Array.from(
          new Map(
            tickers.map(ticker => [`${ticker.exchange.toLowerCase()}:${ticker.market.toLowerCase()}`, ticker]),
          ).values(),
        );
        setAllExchangesTickers(uniqueTickers);
        setIsLoading(false);

        const defaultTicker = uniqueTickers.find(ticker => ticker.exchange === 'upbit' && ticker.market === 'KRW-BTC');
        if (defaultTicker) {
          setSelectedTicker(defaultTicker);
          setTargetPrice(defaultTicker.currentPrice || 0);
        }
      } else if (type === 'setPriceAlertResponse') {
        const response = data as { success: boolean; prices: number[] };
        if (response.success) {
          chrome.storage.local.get(['priceAlerts'], result => {
            setAllPriceAlerts(result.priceAlerts || {}); // 전체 지정가 업데이트
          });
        }
      } else if (type === 'deletePriceAlertResponse') {
        const response = data as { success: boolean; prices: number[] };
        if (response.success) {
          chrome.storage.local.get(['priceAlerts'], result => {
            setAllPriceAlerts(result.priceAlerts || {}); // 전체 지정가 업데이트
          });
        }
      }
    });

    port.onDisconnect.addListener(() => {
      setTimeout(() => initializeChromeConnection(), 500);
    });

    chrome.runtime.sendMessage({ action: 'getAllExchangesTickers' });

    // 초기 로드 시 전체 지정가 가져오기
    chrome.storage.local.get(['priceAlerts'], result => {
      setAllPriceAlerts(result.priceAlerts || {});
    });

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

    return platformFilteredTickers.filter(ticker => searchTicker(ticker, searchValue));
  }, [allExchangesTickers, searchValue, isLoading, exchangePlatform]);

  const renderTickerItem = useCallback(
    (ticker: ExchangeTicker) => {
      const handleSelect = (value: string) => {
        const foundTicker = allExchangesTickers.find(
          t => `${t.exchange.toLowerCase()}:${t.market.toLowerCase()}` === value.toLowerCase(),
        );
        if (foundTicker && foundTicker.currentPrice) {
          setSelectedTicker(foundTicker);
          setTargetPrice(foundTicker.currentPrice);
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

  const handleSetPriceAlert = () => {
    if (!selectedTicker || targetPrice <= 0) {
      return;
    }

    chrome.runtime.sendMessage({
      action: 'setPriceAlert',
      exchange: selectedTicker.exchange,
      ticker: selectedTicker.market,
      prices: [targetPrice],
      deadband: deadBand / 100,
    });
  };

  const handleDeletePriceAlert = (exchange: string, ticker: string, priceToDelete: number) => {
    chrome.runtime.sendMessage({
      action: 'deletePriceAlert',
      exchange,
      ticker,
      price: priceToDelete,
    });
  };

  return (
    <div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="w-6 h-6 p-0 hover:cursor-pointer hover:bg-accent">
            <Bell strokeWidth={2} className="size-3.5 mt-[1px] p-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2 bg-background dark:bg-background">
          <div>
            <Command shouldFilter={false} className="w-full bg-background dark:bg-background">
              <div className="relative">
                <section className="flex w-full border rounded-md gap-1">
                  <CommandInput
                    className="w-full h-6 p-0 gap-1 text-[11px] border-none text-neutral-400 pl-4 focus-visible:ring-0"
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
                  <CommandList className="absolute top-6.5 left-0 w-full max-h-70 overflow-y-auto bg-background z-50 light-scrollbar dark-scrollbar text-[10px]">
                    {isLoading ? (
                      <CommandEmpty>Loading...</CommandEmpty>
                    ) : filteredTickers.length === 0 ? (
                      <CommandEmpty>No results</CommandEmpty>
                    ) : (
                      <CommandGroup className="text-[10px] font-semibold">
                        {filteredTickers.map(ticker => renderTickerItem(ticker))}
                      </CommandGroup>
                    )}
                  </CommandList>
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

                <div className="relative flex text-[12px] bg-muted border-none p-1">
                  <Label className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]">지정 가격</Label>
                  <Input
                    type="text"
                    value={targetPrice.toLocaleString('en-US')}
                    onChange={e => {
                      const value = e.target.value.replace(/,/g, '');
                      setTargetPrice(Number(value) || 0);
                    }}
                    className="w-full h-7 text-right font-semibold focus:outline-none appearance-none border-none bg-transparent"
                  />
                </div>

                <div className="relative flex text-[12px] bg-muted border-none p-1">
                  <Label className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]">데드밴드 (%)</Label>
                  <Input
                    type="number"
                    value={deadBand}
                    onChange={e => setDeadBand(Number(e.target.value) || 0)}
                    className="w-full h-7 text-right font-semibold focus:outline-none appearance-none border-none bg-transparent"
                    min={0}
                    step={0.1}
                  />
                </div>

                <Button
                  variant="outline"
                  onClick={handleSetPriceAlert}
                  className="mt-2 h-7 text-[11px] hover:cursor-pointer">
                  알림 추가
                </Button>

                <div className="font-semibold mt-2">전체 지정가 알림</div>
                {Object.keys(allPriceAlerts).length > 0 ? (
                  <ul className="text-[10px] mt-1 max-h-40 overflow-y-auto">
                    {Object.entries(allPriceAlerts).map(([exchange, tickers]) =>
                      Object.entries(tickers).map(([ticker, prices]) => (
                        <li key={`${exchange}-${ticker}`} className="mb-1">
                          <div className="flex items-center gap-1">
                            <img
                              src={exchangesData[exchange as keyof typeof exchangesData]?.logo}
                              alt={`${exchange} logo`}
                              className="size-3"
                            />
                            <span>{ticker}</span>
                          </div>
                          <ul className="ml-4">
                            {prices.map((price, index) => (
                              <li key={index} className="flex items-center justify-between">
                                <span>{price.toLocaleString('en-US')}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-4 w-4 p-0"
                                  onClick={() => handleDeletePriceAlert(exchange, ticker, price)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </li>
                      )),
                    )}
                  </ul>
                ) : (
                  <div className="text-[10px] mt-1">전체 지정가가 없습니다.</div>
                )}
              </section>
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
